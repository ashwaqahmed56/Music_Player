/**
 * CcMixterProvider — Creative Commons music, no API key, no quota.
 *
 * Every track comes with an explicit CC licence, so it is safe to play and the
 * licence is surfaced on the row. The catalogue is small and leans towards
 * ambient / instrumental, but it is genuinely free and the Indian-tagged items
 * are real (verified live).
 */

import { CONFIG } from './config.js';
import { run, getJSON } from './searchCache.js';
import { makeId } from './types.js';

const API = 'https://ccmixter.org/api/query';
const AUDIO_EXT = /\.(mp3|flac|ogg|m4a)$/i;

function pickFile(files) {
  if (!Array.isArray(files)) return null;
  const audio = files
    .filter(f => f && f.download_url && AUDIO_EXT.test(String(f.file_name || '')))
    .map(f => ({ f, s: /\.mp3$/i.test(f.file_name) ? 2 : 1 }));
  if (!audio.length) return null;
  return audio.sort((a, b) => b.s - a.s)[0].f;
}

function mapTrack(d) {
  const file = pickFile(d.files);
  if (!file) return null;
  const t = {
    provider: 'ccmixter',
    id: String(d.upload_id),
    title: d.upload_name || 'Unknown',
    artist: d.user_name || d.user_real_name || 'ccMixter',
    album: 'ccMixter',
    playableVia: 'url',
    playUrl: file.download_url,
    license: d.license_name || 'Creative Commons',
    downloadable: true,
    pageUrl: d.file_page_url || undefined
  };
  t._appId = makeId(t);
  return t;
}

async function doSearch(q, signal) {
  const u = new URL(API);
  u.searchParams.set('f', 'json');
  u.searchParams.set('limit', String(CONFIG.RESULT_LIMIT));
  u.searchParams.set('tags', q);          // ccMixter's own search is tag-based
  u.searchParams.set('sinced', '2005-01-01');
  const data = await getJSON(u.toString(), signal);
  const rows = Array.isArray(data) ? data : [];
  return rows.map(mapTrack).filter(Boolean);
}

export const CcMixterProvider = {
  id: 'ccmixter',
  label: CONFIG.BADGES.ccmixter,
  enabled: () => CONFIG.ENABLE_CCMIXTER,

  search: (q) => run('ccmixter', q, doSearch)
};
