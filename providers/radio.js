/**
 * RadioProvider — endless free internet radio, no API key, no quota.
 *
 * Radio Paradise streams Creative-Commons / directly-licensed music and plays
 * whatever is on air, so there is no catalogue to miss and no preview to hit.
 * The "world" channel regularly carries Indian, Sufi and Asian material, which
 * is the closest thing to a free endless Indian station.
 *
 * Streams verified live: mp3-32 and world-32 return 200 audio/*.
 * The now_playing endpoint gives artist / title / cover for the lock screen.
 *
 * Verified: https://stream.radioparadise.com/mp3-32   -> 200 audio/mpeg
 *           https://stream.radioparadise.com/world-32 -> 200 audio/aac
 *           https://stream.radioparadise.com/mellow-32-> 200 audio/aac
 */

import { CONFIG } from './config.js';
import { makeId } from './types.js';

const API = 'https://api.radioparadise.com/api/now_playing';

export const RADIO_CHANNELS = [
  { id: 'main',   name: 'Radio Paradise', desc: 'Eclectic CC mix',   stream: 'https://stream.radioparadise.com/mp3-32' },
  { id: 'world',  name: 'RP World',       desc: 'World · Asian · Indian', stream: 'https://stream.radioparadise.com/world-32' },
  { id: 'mellow', name: 'RP Mellow',      desc: 'Easy listening',   stream: 'https://stream.radioparadise.com/mellow-32' }
];

/**
 * Build a Track for a channel. Radio is a live stream, so there is no duration
 * and no search — it is a "press play and never stop" source.
 * @param {string} channelId
 */
export function radioTrack(channelId) {
  const ch = RADIO_CHANNELS.find(c => c.id === channelId) || RADIO_CHANNELS[0];
  const t = {
    provider: 'radio',
    id: ch.id,
    title: ch.name,
    artist: ch.desc,
    album: 'Live radio',
    playableVia: 'url',
    playUrl: ch.stream,
    isLive: true,
    durationSec: 0,
    pageUrl: 'https://radioparadise.com/',
    channelId: ch.id
  };
  t._appId = makeId(t);
  return t;
}

/** Current track metadata for the lock screen / mini player. */
export async function nowPlaying(channelId) {
  try {
    // The API expects the numeric channel id, not the string id.
    const chanNum = Math.max(0, RADIO_CHANNELS.findIndex(c => c.id === channelId));
    const r = await fetch(API + '?chan=' + chanNum, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.title) return null;
    return {
      title: j.title || '',
      artist: j.artist || '',
      album: j.album || 'Radio Paradise',
      artworkUrl: j.cover_med || j.cover || '',
      year: j.year || ''
    };
  } catch (e) {
    return null;
  }
}

export const RadioProvider = {
  id: 'radio',
  label: CONFIG.BADGES.radio,
  enabled: () => CONFIG.ENABLE_RADIO,
  search: async () => ({ ok: true, status: 'ok', data: [], cached: false }),
  nowPlaying
};
