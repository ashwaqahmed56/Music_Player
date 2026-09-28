/*
 * online.js — UI entry for the online streaming layer.
 *
 * Loaded as an ES module (the app has no build step). It owns the Online tab:
 * search box -> merged provider results -> UnifiedPlayer.
 */

import { searchAll, cancelSearches, providerLabel } from './providers/index.js';
import { AudiusProvider } from './providers/audius.js';
import { ArchiveProvider } from './providers/archive.js';
import { UnifiedPlayer } from './providers/player.js';
import { CONFIG } from './providers/config.js';
import { debounce } from './providers/searchCache.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let tracks = [];
let inflightSeq = 0;

// Hooks the player needs from the host app.
window.ASHS_ONLINE_PIN = (t) => { try { return onlinePin(t); } catch (e) { return t; } };
window.ASHS_ONLINE_RESOLVE = (t) => AudiusProvider.resolve(t);
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

    const dur = t.durationSec ? fmtDur(t.durationSec) : '';
    row.innerHTML = art
      + '<div class="t-meta"><b>' + esc(t.title) + '</b><span>' + esc(t.artist)
      + (dur ? ' · ' + dur : '') + '</span>'
      + '<span class="on-badge">' + esc(providerLabel(t.provider)) + (t.playableVia === 'url' ? ' · direct' : '') + '</span></div>';

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
}

const debouncedSearch = debounce(v => runSearch(v), CONFIG.DEBUNCE_MS);

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

  // Source chips are informational: every provider is queried at once.
  const chips = $('#onlineSrcRow');
  if (chips) {
    chips.innerHTML = ['youtube', 'audius', 'archive'].map(p =>
      '<button class="active" type="button">' + esc(CONFIG.BADGES[p]) + '</button>'
    ).join('');
  }

  setStatus('Search any song, artist or album');
  paintResults();

  // IFrame-stage transport controls.
  const p = $('#ytPrev'); if (p) p.onclick = () => UnifiedPlayer.prev();
  const n = $('#ytNext'); if (n) n.onclick = () => UnifiedPlayer.next();
  const bg = $('#ytBg');
  if (bg) {
    bg.onclick = () => {
      const cur = UnifiedPlayer.current;
      if (!cur || cur.playableVia !== 'iframe') return toast('Nothing to hand off');
      const url = 'https://www.youtube.com/watch?v=' + cur.id;
      if (window.ASHS_YT && window.ASHS_YT.isAvailable()) {
        window.ASHS_YT.open({ url });
      } else {
        window.open(url, '_blank', 'noopener');
        toast('Background mode needs the Android app');
      }
    };
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();

window.ASHS_SEARCH = { runSearch, clearSearch, loadTrending, UnifiedPlayer };
