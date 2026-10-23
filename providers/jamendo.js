/**
 * JamendoProvider — free, legal, full-length music. Requires a free client_id.
 *
 * Get one at https://devportal.jamendo.com/ (create an app -> client_id).
 * Until you paste it into providers/config.js this provider stays disabled and
 * the app simply runs with Archive + Audius.
 *
 * Jamendo is strongest on electronic/indie, with a smaller but real Indian
 * catalogue (desi EDM, indie, lo-fi). Streams are plain mp3 over https.
 */

import { CONFIG, hasJamendoKey } from './config.js';
import { run, getJSON } from './searchCache.js';
import { makeId } from './types.js';

const API = 'https://api.jamendo.com/v3.0';

function art(a) {
  if (!a) return undefined;
  if (typeof a === 'string') return a;
  return a['1000x1000'] || a['500x500'] || a['300x300'] || undefined;
}

function mapTrack(d) {
  const name = (d.artist && (d.artist.name || d.name)) || d.artist_name || 'Jamendo';
  const t = {
    provider: 'jamendo',
    id: String(d.id),
    title: d.name || d.title || 'Unknown',
    artist: name,
    album: (d.album && d.album.name) || 'Jamendo',
    artworkUrl: art(d.album_image || d.image || d.images),
    durationSec: Math.max(0, Math.round(d.duration || 0)),
    playableVia: 'url',
    downloadable: !!d.download_url,
    pageUrl: d.shareurl || ('https://www.jamendo.com/track/' + d.id),
    // Freshly built from search: the signed URL can expire.
    playUrl: d.audio || d.audio_url || null
  };
  t._appId = makeId(t);
  return t;
}

async function doSearch(q, signal) {
  const key = CONFIG.JAMENDO_CLIENT_ID.trim();
  const u = new URL(API + '/tracks/');
  u.searchParams.set('client_id', key);
  u.searchParams.set('format', 'json');
  u.searchParams.set('limit', String(CONFIG.RESULT_LIMIT));
  u.searchParams.set('search', q);
  u.searchParams.set('audioformat', 'mp31');     // ask for a playable mp3
  u.searchParams.set('include', 'musicinfo');
  u.searchParams.set('groupby', 'artist_id');

  const data = await getJSON(u.toString(), signal);
  if (data && data.error) throw new Error(data.error);
  const rows = (data && data.results) || [];
  return rows.map(mapTrack).filter(t => t.playUrl);
}

export const JamendoProvider = {
  id: 'jamendo',
  label: CONFIG.BADGES.jamendo,
  enabled: () => CONFIG.ENABLE_JAMENDO && hasJamendoKey(),

  search: (q) => run('jamendo', q, doSearch),

  /** Resolve a fresh URL at play time (Jamendo URLs are signed and expire). */
  async resolve(t) {
    if (t.playUrl) return t.playUrl;
    const key = CONFIG.JAMENDO_CLIENT_ID.trim();
    const u = new URL(API + '/tracks/');
    u.searchParams.set('client_id', key);
    u.searchParams.set('format', 'json');
    u.searchParams.set('id', t.id);
    u.searchParams.set('audioformat', 'mp31');
    const data = await getJSON(u.toString());
    const row = data && data.results && data.results[0];
    if (!row || !(row.audio || row.audio_url)) throw new Error('no stream');
    t.playUrl = row.audio || row.audio_url;
    return t.playUrl;
  }
};
