/**
 * ArchiveProvider — Internet Archive audio: public domain and Creative Commons.
 * No API key, no quota, full-length files, CORS-enabled (verified).
 *
 * Search hits advancedsearch.php (cheap, metadata-only). The per-item
 * /metadata/{id} payload can be very large, so it is fetched lazily - only for
 * the rows actually shown - and the audio file is picked server-side here.
 */

import { CONFIG } from './config.js';
import { run, getJSON } from './searchCache.js';
import { makeId } from './types.js';

const BASE = 'https://archive.org';
const AUDIO_EXT = /\.(mp3|ogg|oga|m4a|flac|wav)$/i;

const metaCache = new Map();  // identifier -> { files:[{name,url,size}], license, title }

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

async function doSearch(q, signal) {
  const u = new URL(BASE + '/advancedsearch.php');
  u.searchParams.set('q', '(' + q + ') AND mediatype:(audio)');
  u.searchParams.set('fl[]', 'identifier');
  u.searchParams.set('fl[]', 'title');
  u.searchParams.set('fl[]', 'creator');
  u.searchParams.set('fl[]', 'licenseurl');
  u.searchParams.set('rows', String(CONFIG.RESULT_LIMIT));
  u.searchParams.set('page', '1');
  u.searchParams.set('output', 'json');

  const data = await getJSON(u.toString(), signal);
  const docs = (data && data.response && data.response.docs) || [];
  return docs.filter(d => d && d.identifier).map(mapItem);
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
  const url = BASE + '/download/' + encodeURIComponent(t.id) + '/' + encodeURIComponent(best.name);
  const size = parseInt(best.size || '0', 10) || 0;
  const dur = size > 0 ? Math.round(size / 16000) : 0;   // ~128kbps mp3 estimate

  const license = md.licenseurl || md.rights || (Array.isArray(md.license) ? md.license[0] : md.license) || '';
  metaCache.set(t.id, { url, duration: dur, license });

  t.playUrl = url;
  t.downloadable = true;                 // Archive items permit download
  t.license = license ? String(license) : 'see item page';
  if (dur) t.durationSec = dur;
  if (!t.artworkUrl) t.artworkUrl = 'https://archive.org/services/img/' + encodeURIComponent(t.id);
  return t;
}

/** Prefer real audio over derivatives, and 64k+/VBR MP3 over low-bitrate noise. */
function pickScore(f) {
  const n = String(f.name);
  let s = 0;
  if (/64kb|128kb|256kb|VBR MP3/i.test(String(f.format || ''))) s += 5;
  if (/MP3/i.test(String(f.format || ''))) s += 3;
  else if (/Ogg Vorbis/i.test(String(f.format || ''))) s += 2;
  else if (/FLAC/i.test(String(f.format || ''))) s += 1;
  if (/64kb/i.test(String(f.format || ''))) s -= 4;
  if (/(preview|thumb|spectrogram|_files\.xml|\.gif$|\.jpg$)/i.test(n)) s -= 100;
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
