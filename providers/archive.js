/**
 * ArchiveProvider — Internet Archive audio: public domain, Creative Commons and
 * community uploads. No API key, no quota, full-length files, CORS-enabled.
 *
 * Search strategy: the catalogue is organised into collections, and a single
 * broad `mediatype:audio` query both under- and over-shoots. So we fan out over
 * the collections that actually hold music, run them in parallel, and merge:
 *
 *   opensource_audio -> curated music/recordings, the richest collection
 *   audio_music      -> music specifically tagged
 *   mediatype:audio  -> broad net, catches things not filed in a collection
 *
 * This is why "bollywood" finds ~1300 items instead of a handful.
 *
 * The per-item /metadata/{id} payload can be very large, so it is fetched
 * lazily — only for rows actually shown or played.
 */

import { CONFIG } from './config.js';
import { run, getJSON } from './searchCache.js';
import { makeId } from './types.js';

const BASE = 'https://archive.org';
const AUDIO_EXT = /\.(mp3|ogg|oga|m4a|flac|wav)$/i;

/** Run in parallel; never let one bad query kill the whole search. */
const COLLECTIONS = [
  'collection:(opensource_audio)',
  'collection:(audio_music)',
  'mediatype:(audio)'
];

const metaCache = new Map();   // identifier -> { url, duration, license }

function mapItem(d) {
  const t = {
    provider: 'archive',
    id: d.identifier,
    title: (d.title || d.identifier || 'Unknown').replace(/\s+/g, ' ').trim(),
    artist: (Array.isArray(d.creator) ? d.creator[0] : d.creator) || 'Unknown',
    album: 'Internet Archive',
    playableVia: 'url',
    pageUrl: BASE + '/details/' + encodeURIComponent(d.identifier),
    _needsMeta: true
  };
  t._appId = makeId(t);
  return t;
}

async function oneQuery(q, facet, signal) {
  const u = new URL(BASE + '/advancedsearch.php');
  const safeQ = String(q || '').replace(/["\\(){}^~*?[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  u.searchParams.set('q', `(${safeQ}) AND ${facet}`);
  u.searchParams.append('fl[]', 'identifier');
  u.searchParams.append('fl[]', 'title');
  u.searchParams.append('fl[]', 'creator');
  u.searchParams.append('fl[]', 'licenseurl');
  u.searchParams.append('sort[]', 'downloads desc');
  u.searchParams.set('rows', '20');
  u.searchParams.set('output', 'json');
  const data = await getJSON(u.toString(), signal);
  return ((data && data.response && data.response.docs) || [])
    .filter(d => d && d.identifier)
    .map(mapItem);
}

async function doSearch(q, signal) {
  const settled = await Promise.all(
    COLLECTIONS.map(async facet => {
      try { return { ok: true, items: await oneQuery(q, facet, signal) }; }
      catch (e) { return { ok: false, items: [], facet }; }
    })
  );

  const seen = new Set();
  const out = [];
  for (const s of settled) {
    for (const t of s.items) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= CONFIG.RESULT_LIMIT) return out;
    }
  }
  if (!out.length) {
    const any = settled.find(s => !s.ok);
    if (any) throw new Error('archive search failed');
  }
  return out;
}

/** Fetch the item metadata and pick the best playable audio file. */
async function hydrate(t, signal) {
  if (t.playUrl) return t;
  if (metaCache.has(t.id)) {
    const c = metaCache.get(t.id);
    if (c && c.url) return Object.assign(t, { playUrl: c.url, durationSec: c.duration || t.durationSec });
  }
  const data = await getJSON(BASE + '/metadata/' + encodeURIComponent(t.id), signal);
  const files = (data && data.files) || [];
  const md = (data && data.metadata) || {};

  const candidates = files
    .filter(f => f && typeof f.name === 'string' && AUDIO_EXT.test(f.name))
    .map(f => ({ f, score: pickScore(f) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) throw new Error('no audio file');

  const best = candidates[0].f;
  const namePath = best.name.split('/').map(s => encodeURIComponent(s)).join('/');
  const url = BASE + '/download/' + encodeURIComponent(t.id) + '/' + namePath;
  const size = parseInt(best.size || '0', 10) || 0;
  // ~16 KB/s is a fair estimate for a 128 kbps mp3; the real duration replaces
  // it as soon as <audio> reports loadedmetadata.
  const dur = size > 0 ? Math.round(size / 16000) : 0;

  const license = md.licenseurl || md.rights || (Array.isArray(md.license) ? md.license[0] : md.license) || '';
  metaCache.set(t.id, { url, duration: dur, license });

  t.playUrl = url;
  t.downloadable = true;
  t.license = license ? String(license) : 'see item page';
  if (dur) t.durationSec = dur;
  if (!t.artworkUrl) t.artworkUrl = 'https://archive.org/services/img/' + encodeURIComponent(t.id);
  if (md.creator && t.artist === 'Unknown') {
    t.artist = Array.isArray(md.creator) ? md.creator[0] : md.creator;
  }
  return t;
}

/** Prefer real audio over derivatives, and 64k+/VBR MP3 over low-bitrate noise. */
function pickScore(f) {
  const n = String(f.name);
  const fmt = String(f.format || '');
  let s = 0;
  if (/64kb|128kb|256kb|VBR MP3/i.test(fmt)) s += 5;
  if (/MP3/i.test(fmt)) s += 3;
  else if (/Ogg Vorbis/i.test(fmt)) s += 2;
  else if (/FLAC/i.test(fmt)) s += 1;
  if (/64kb/i.test(fmt)) s -= 4;
  if (/(preview|thumb|__ia_thumb|meta|xml|\.gif$|\.jpg$|\.pdf$)/i.test(n)) s -= 100;
  if (/64kb/i.test(n)) s -= 3;
  if (f.source === 'original') s += 2;
  return s;
}

export const ArchiveProvider = {
  id: 'archive',
  label: CONFIG.BADGES.archive,
  enabled: () => CONFIG.ENABLE_ARCHIVE,

  search: (q) => run('archive', q, doSearch),

  /** Lazily attach playUrl / duration / license for a single row. */
  hydrate(t, signal) {
    return hydrate(t, signal);
  }
};
