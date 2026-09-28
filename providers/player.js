/**
 * Unified player + queue.
 *
 * - 'url' tracks (Audius / Internet Archive) play through the app's EXISTING
 *   <audio> pipeline, so its MediaSession, notification, queue, likes and
 *   playlists all keep working untouched.
 * - 'iframe' tracks (YouTube) play in the official IFrame player, whose chrome
 *   stays visible. Nothing is hidden and no stream URL is ever touched.
 * - The queue crosses provider boundaries freely.
 * - Exactly one MediaSession owner at a time: the app while an <audio> track
 *   plays, this module while the IFrame player does.
 */

import { ArchiveProvider } from './archive.js';
import { CONFIG } from './config.js';

/** @type {import('./types.js').Track[]} */
let queue = [];
let index = -1;
let current = null;

let ytPlayer = null;
let ytReady = false;
let pendingVideoId = null;
let ytState = 'idle';
let owner = 'none';           // 'none' | 'app' | 'iframe'
let lastPosition = 0;
let lastDuration = 0;
let skipGuard = 0;

// ---------------------------------------------------------------- iframe ---

function loadIframeApi() {
  return new Promise(resolve => {
    if (window.YT && window.YT.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { if (prev) prev(); } catch (e) {} resolve(); };
    if (!document.querySelector('script[data-yt-api]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.setAttribute('data-yt-api', '1');
      document.head.appendChild(s);
    }
    setTimeout(resolve, 8000);
  });
}

async function ensurePlayer() {
  await loadIframeApi();
  if (ytPlayer) return ytPlayer;
  const host = document.getElementById('ytStage');
  if (!host || !window.YT || !window.YT.Player) return null;

  // The target div (#ytFrame) lives inside #ytStage; YT replaces it in place
  // with its own <iframe>, so nothing is cleared here.
  ytPlayer = new window.YT.Player('ytFrame', {
    width: '100%',
    height: '100%',
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
    events: {
      onReady(e) {
        ytReady = true;
        if (pendingVideoId) {
          const v = pendingVideoId; pendingVideoId = null;
          try { e.target.loadVideoById(v); } catch (_) {}
        }
      },
      onStateChange(e) {
        if (!window.YT) return;
        const P = window.YT.PlayerState;
        if (e.data === P.PLAYING) { ytState = 'playing'; showStage(true); syncSession(); emit(); }
        else if (e.data === P.PAUSED) { ytState = 'paused'; syncSession(); emit(); }
        else if (e.data === P.BUFFERING) { ytState = 'buffering'; emit(); }
        else if (e.data === P.ENDED) { ytState = 'ended'; emit(); onEnded(); }
      },
      onError(e) {
        // 100 = removed/private, 101/150 = owner disabled embedding.
        handleFatal(Number(e && e.data));
      }
    }
  });
  return ytPlayer;
}

function showStage(on) {
  const st = document.getElementById('onlineStage');
  if (st) st.classList.toggle('hidden', !on);
}

function handleFatal(code) {
  if (skipGuard > 0) { skipGuard--; return; }
  if (current) {
    current._unplayable = true;
    if (typeof emitError === 'function') emitError('youtube-' + code);
  }
  // 100 = gone, 101/150 = embedding disabled. Either way: skip, never leave
  // a dead player on screen.
  if (code === 100 || code === 101 || code === 150 || code === 2) {
    toast('Skipping — this video cannot be played here');
    skipGuard = 0;
    next();
  }
}

// -------------------------------------------------------------- ownership ---

function claimForIframe() {
  if (owner === 'iframe') return;
  releaseApp();
  owner = 'iframe';
  window.ASH_EXTERNAL_PLAYER = true;      // suppresses app.js syncNotif
  // Stop the <audio> element so the two never overlap.
  try { const a = document.getElementById('audio'); if (a) a.pause(); } catch (e) {}
}

function releaseIframe() {
  if (owner !== 'iframe') return;
  try { if (ytPlayer && ytReady) ytPlayer.pauseVideo(); } catch (e) {}
  showStage(false);
  owner = 'app';
  window.ASH_EXTERNAL_PLAYER = false;
  try { if (typeof notifReset === 'function') notifReset(); } catch (e) {}
  try { if (typeof render === 'function') render(); } catch (e) {}
}

function releaseApp() {
  try { if (typeof notifReset === 'function') notifReset(); } catch (e) {}
}

// Mirror the IFrame player into the OS MediaSession (lock screen, headset keys).
function syncSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    if (!current) return;
    const art = current.artworkUrl || '';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title || '',
      artist: current.artist || 'YouTube',
      album: 'YouTube',
      artwork: art ? [{ src: art, sizes: '480x480' }] : []
    });
    navigator.mediaSession.playbackState = ytState === 'playing' ? 'playing' : 'paused';
  } catch (e) {}
}

let msHandlersBound = false;
function bindMediaSession() {
  if (msHandlersBound || !('mediaSession' in navigator)) return;
  msHandlersBound = true;
  const set = (h, fn) => { try { navigator.mediaSession.setActionHandler(h, fn); } catch (e) {} };
  set('play', () => { if (ytPlayer) { try { ytPlayer.playVideo(); } catch (e) {} } });
  set('pause', () => { if (ytPlayer) { try { ytPlayer.pauseVideo(); } catch (e) {} } });
  set('nexttrack', () => next());
  set('previoustrack', () => prev());
  set('seekto', (d) => { if (ytPlayer && d && d.seekTime != null) { try { ytPlayer.seekTo(d.seekTime, true); } catch (e) {} } });
}

// ------------------------------------------------------------------ queue ---

function emit() {
  try {
    if (typeof window.ASHS_ONLINE_UI === 'function') {
      window.ASHS_ONLINE_UI({ current, ytState, position: lastPosition, duration: lastDuration });
    }
  } catch (e) {}
}
function emitError(reason) {
  try { toast('Playback problem: ' + reason); } catch (e) {}
}

/** Convert a provider Track into the app's track shape and pin it. */
function toAppTrack(t) {
  const id = t._appId || ('on_' + t.provider + '_' + t.id);
  return {
    id,
    title: t.title,
    artist: t.artist,
    album: t.album || t.provider,
    folder: 'Online',
    src: t.playUrl || '',
    coverUrl: t.artworkUrl,
    source: 'online',
    provider: t.provider,
    duration: t.durationSec || 0,
    hue: (String(t.title + t.artist).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0))
  };
}

async function play(track, list) {
  if (list && list.length) { queue = list.slice(); index = queue.indexOf(track); }
  else {
    queue = [track];
    index = 0;
  }
  return playAt(index);
}

async function playAt(i) {
  if (i < 0 || i >= queue.length) {
    stop();
    return;
  }
  index = i;
  const t = queue[i];
  current = t;

  if (t.playableVia === 'iframe') {
    claimForIframe();
    bindMediaSession();
    const p = await ensurePlayer();
    if (!p) { toast('YouTube player failed to load'); return; }
    showStage(true);
    if (ytReady) { try { p.loadVideoById(t.id); } catch (e) {} }
    else pendingVideoId = t.id;
    return;
  }

  // 'url' provider
  releaseIframe();
  if (t._needsMeta && !t.playUrl) {
    try {
      toast('Preparing track…');
      await ArchiveProvider.hydrate(t);
    } catch (e) {
      toast('That archive item has no playable audio — skipping');
      return next();
    }
  }
  if (!t.playUrl) {
    if (t.provider === 'audius' && typeof window.ASHS_ONLINE_RESOLVE === 'function') {
      try { t.playUrl = await window.ASHS_ONLINE_RESOLVE(t); }
      catch (e) { toast('Audius is unreachable right now'); return next(); }
    }
  }
  if (!t.playUrl) { toast('No playable stream for this track'); return next(); }

  const app = toAppTrack(t);
  try {
    if (typeof window.ASHS_ONLINE_PIN === 'function') window.ASHS_ONLINE_PIN(app);
    if (typeof playTrack === 'function') playTrack(app.id, { open: true, keepRadio: true });
  } catch (e) {
    toast('Could not start playback');
  }
  emit();
}

function next() {
  if (index < 0) return;
  if (index + 1 < queue.length) return playAt(index + 1);
  // End of queue: hand control back to the app's own next() when there is a
  // library, otherwise just tear the iframe player down.
  if (owner === 'iframe' && typeof window.ASHS_APP_NEXT === 'function') {
    const hasLib = (typeof all === 'function') ? all().length > 0 : false;
    if (hasLib) { stop(); return window.ASHS_APP_NEXT(); }
  }
  stop();
}

function prev() {
  if (index > 0) return playAt(index - 1);
  return playAt(0);
}

function stop() {
  try { if (ytPlayer && ytReady) ytPlayer.stopVideo(); } catch (e) {}
  showStage(false);
  current = null;
  owner = 'none';
  window.ASH_EXTERNAL_PLAYER = false;
  emit();
}

/** Poll the IFrame player's clock for progress (the app's timeupdate only fires
 *  for <audio> elements). */
setInterval(() => {
  if (owner !== 'iframe' || !ytPlayer || !ytReady) return;
  try {
    const d = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
    const c = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    if (d > 0) {
      lastDuration = Math.round(d * 1000);
      lastPosition = Math.round(c * 1000);
      emit();
    }
  } catch (e) {}
}, 500);

export const UnifiedPlayer = {
  play, next, prev, stop, playAt,
  get current() { return current; },
  get queue() { return queue.slice(); },
  get owner() { return owner; },
  playIframeById(videoId, title, artist, artwork) {
    return play({
      provider: 'youtube', id: videoId, title: title || 'YouTube',
      artist: artist || 'YouTube', artworkUrl: artwork, playableVia: 'iframe'
    }, []);
  },
  clearQueue() { queue = []; index = -1; }
};

export { CONFIG };
