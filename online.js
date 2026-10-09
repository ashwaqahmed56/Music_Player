/*
 * online.js — UI entry for the online streaming layer.
 *
 * Loaded as an ES module (the app has no build step). It owns the Online tab:
 * search box -> merged provider results -> UnifiedPlayer.
 */

import { searchAll, cancelSearches, providerLabel } from './providers/index.js';
import { hasJamendoKey } from './providers/config.js';
import { AudiusProvider } from './providers/audius.js';
import { ArchiveProvider } from './providers/archive.js';
import { RADIO_CHANNELS, radioTrack, nowPlaying } from './providers/radio.js';
import { UnifiedPlayer } from './providers/player.js';
import { CONFIG } from './providers/config.js';
import { debounce } from './providers/searchCache.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let tracks = [];
let inflightSeq = 0;

// Hooks the player needs from the host app.
window.ASHS_ONLINE_PIN = (t) => { try { return onlinePin(t); } catch (e) { return t; } };
window.ASHS_ONLINE_RESOLVE = async (t) => {
  if (t.provider === 'jamendo') {
    const { JamendoProvider } = await import('./providers/jamendo.js');
    return JamendoProvider.resolve(t);
  }
  return AudiusProvider.resolve(t);
};
window.ASHS_APP_NEXT = () => { try { return next(); } catch (e) {} };
window.ASHS_ONLINE_UI = (s) => { try { paintNow(s); } catch (e) {} };

// ------------------------------------------------------------------ paint ---

function setStatus(msg) {
  const el = $('#onlineStatus');
  if (el) el.textContent = msg || '';
}

function paintResults() {
  const el = $('#onlineList');
  if (!el) return;
  el.innerHTML = '';
  if (!tracks.length) {
    el.innerHTML = '<p class="muted center">No matches. Try another spelling, or hit Trending.</p>';
    return;
  }
  const meta = $('#onlineMeta');
  if (meta) meta.textContent = tracks.length + ' result' + (tracks.length === 1 ? '' : 's');

  tracks.forEach(t => {
    const row = document.createElement('div');
    row.className = 'track';
    const art = t.artworkUrl
      ? '<div class="t-art"><img src="' + esc(t.artworkUrl) + '" alt="" loading="lazy"/></div>'
      : '<div class="t-art">' + esc((t.title || '?').trim().charAt(0).toUpperCase()) + '</div>';

    const dur = t.durationSec ? fmtDur(t.durationSec) : (t._noAudio ? 'no audio file' : '');
    row.innerHTML = art
      + '<div class="t-meta"><b>' + esc(t.title) + '</b><span>' + esc(t.artist)
      + (dur ? ' · ' + dur : '') + '</span>'
      + '<span class="on-badge">' + esc(providerLabel(t.provider)) + ' · audio</span></div>';

    row.onclick = () => {
      UnifiedPlayer.play(t, tracks).catch(() => toast('Could not play that'));
    };
    el.appendChild(row);
  });
}

function paintNow(s) {
  // Cosmetic mirror while the IFrame player owns the session.
  const title = document.getElementById('plTitle');
  const artist = document.getElementById('plArtist');
  if (s && s.current) {
    if (title) title.textContent = s.current.title;
    if (artist) artist.textContent = s.current.artist;
  }
}

const fmtDur = sec => {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
};

// ----------------------------------------------------------------- search ---

async function runSearch(q) {
  q = String(q || '').trim();
  if (q.length < CONFIG.MIN_QUERY_CHARS) {
    cancelSearches();
    tracks = [];
    paintResults();
    setStatus(q ? 'Keep typing…' : 'Search any song, artist or album');
    return;
  }
  if (navigator.onLine === false) {
    setStatus('You are offline — online search needs a connection');
    return;
  }

  const seq = ++inflightSeq;
  cancelSearches();                       // cancel whatever the last keystroke started
  setStatus('Searching…');

  const res = await searchAll(q);

  if (seq !== inflightSeq) return;        // a newer keystroke won
  tracks = res.tracks;
  paintResults();

  const w = res.warnings || [];
  setStatus(w.length ? w[0] : (tracks.length ? '' : 'No matches for "' + q + '"'));

  enrichArchiveTimes(seq);
}

/**
 * Internet Archive search results carry no duration, and the per-item metadata
 * payload is large - so fill times in quietly, a few at a time, instead of
 * blocking the list. Times also self-correct from <audio> loadedmetadata.
 */
async function enrichArchiveTimes(seq) {
  const pending = tracks.filter(t => t._needsMeta && !t.durationSec).slice(0, 8);
  let touched = false;
  for (const t of pending) {
    if (seq !== inflightSeq) return;
    try {
      await ArchiveProvider.hydrate(t);
      touched = true;
      if (seq === inflightSeq) paintResults();
    } catch (e) {
      t._noAudio = true;
    }
    // Be gentle: these are large JSON payloads.
    await new Promise(r => setTimeout(r, 250));
  }
  if (touched && seq === inflightSeq) paintResults();
}

const debouncedSearch = debounce(v => runSearch(v), CONFIG.DEBOUNCE_MS);

function clearSearch() {
  cancelSearches();
  tracks = [];
  paintResults();
  setStatus('Search any song, artist or album');
}

async function loadTrending() {
  if (navigator.onLine === false) { setStatus('You are offline'); return; }
  cancelSearches();
  setStatus('Loading trending (Audius)…');
  try {
    tracks = await AudiusProvider.trending();
    paintResults();
    setStatus('');
  } catch (e) {
    setStatus('Trending unavailable right now');
  }
}

// ---------------------------------------------------------------- radio ---

let radioTimer = null;

function paintRadioRow() {
  const row = $('#radioRow');
  if (!row) return;
  if (!CONFIG.ENABLE_RADIO) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  row.innerHTML = '';
  RADIO_CHANNELS.forEach(ch => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = ch.name;
    b.title = ch.desc;
    b.onclick = () => {
      const t = radioTrack(ch.id);
      UnifiedPlayer.play(t, [t]).then(() => startRadioMeta(ch.id)).catch(() => {});
    };
    row.appendChild(b);
  });
}

/** Radio Paradise reports what is on air, so poll it and put the real
 *  artist/title on the lock screen instead of just the station name. */
async function startRadioMeta(channelId) {
  if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
  const tick = async () => {
    const t = UnifiedPlayer.current;
    // Stop polling once the user moved on (different track, local song, or stopped).
    const curApp = (typeof currentId !== 'undefined' && typeof getT === 'function') ? getT(currentId) : null;
    if (!t || t.provider !== 'radio' || t.channelId !== channelId ||
        !curApp || curApp.provider !== 'radio') {
      stopRadioMeta();
      return;
    }
    const np = await nowPlaying(channelId);
    if (!np) return;
    t.title = np.title;
    t.artist = np.artist || t.artist;
    t.artworkUrl = np.artworkUrl || t.artworkUrl;
    if (curApp) {
      curApp.title = np.title;
      curApp.artist = np.artist || curApp.artist;
      curApp.coverUrl = np.artworkUrl || curApp.coverUrl;
    }
    try { paintNow({ current: t }); } catch (e) {}
    try { bumpLib(); render(); } catch (e) {}
  };
  tick();
  radioTimer = setInterval(tick, 20000);
}

function stopRadioMeta() {
  if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
}

// ------------------------------------------------------------------- bind ---

function bind() {
  const input = $('#onlineSearch');
  if (input) {
    input.addEventListener('input', e => {
      const v = e.target.value || '';
      const clr = $('#clearOnlineSearch');
      if (clr) clr.classList.toggle('hidden', !v);
      debouncedSearch(v);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { debouncedSearch.cancel(); runSearch(e.target.value); }
    });
  }
  const clr = $('#clearOnlineSearch');
  if (clr) clr.onclick = () => { if (input) input.value = ''; clr.classList.add('hidden'); clearSearch(); };

  const go = $('#onlineGo');
  if (go) go.onclick = () => { if (input) { debouncedSearch.cancel(); runSearch(input.value); } };
  const tr = $('#onlineTrend');
  if (tr) tr.onclick = loadTrending;

  // Source chips mirror the enabled providers (audio-only: no YouTube video).
  const chips = $('#onlineSrcRow');
  if (chips) {
    const enabled = [
      CONFIG.ENABLE_ARCHIVE ? 'archive' : null,
      (CONFIG.ENABLE_JAMENDO && hasJamendoKey()) ? 'jamendo' : null,
      CONFIG.ENABLE_CCMIXTER ? 'ccmixter' : null,
      CONFIG.ENABLE_AUDIUS ? 'audius' : null
    ].filter(Boolean);
    chips.innerHTML = enabled.map(p =>
      '<button class="active" type="button">' + esc(CONFIG.BADGES[p]) + '</button>'
    ).join('') +
      '<p class="muted" style="width:100%;font-size:12px;margin:2px 0 0">' +
      ((CONFIG.ENABLE_JAMENDO && !hasJamendoKey())
        ? 'Add a free Jamendo client_id in providers/config.js to include Jamendo.'
        : '') + '</p>';
  }

  setStatus('Search any song, artist or album');
  paintResults();
  paintRadioRow();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();

window.ASHS_SEARCH = { runSearch, clearSearch, loadTrending, UnifiedPlayer };
window.UnifiedPlayer = UnifiedPlayer;
