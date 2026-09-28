/**
 * Shared types for the online streaming layer.
 * JSDoc only - the app has no build step, so these are documentation plus
 * editor hints rather than compiled interfaces.
 *
 * @typedef {'youtube'|'audius'|'archive'|'invidious'} ProviderId
 *
 * @typedef {Object} Track
 * @property {ProviderId} provider
 * @property {string} id            provider-native id (videoId / audius id / archive identifier+file)
 * @property {string} title
 * @property {string} artist
 * @property {string} [album]
 * @property {string} [artworkUrl]
 * @property {number} [durationSec]
 * @property {'iframe'|'url'} playableVia
 * @property {string} [playUrl]     direct stream URL, only for playableVia==='url'
 * @property {boolean} [downloadable]
 * @property {string} [license]
 * @property {string} [pageUrl]     canonical human page (used for "open on provider")
 * @property {number} [bitrateKbps]
 *
 * @typedef {Object} SearchResult
 * @property {Track[]} tracks
 * @property {Object}  providerStatus  provider -> 'ok' | 'error' | 'unavailable' | 'quota'
 * @property {string[]} warnings
 */

export const PROVIDERS = /** @type {const} */ ({
  YOUTUBE: 'youtube',
  AUDIUS: 'audius',
  ARCHIVE: 'archive',
  INVIDIOUS: 'invidious'
});

/** @param {Track} t */
export function trackKey(t) {
  return `${t.provider}:${t.id}`;
}

/** Normalised "title artist" used for cross-provider de-duplication. */
export function dedupeKey(t) {
  return norm(t.title + ' ' + (t.artist || ''));
}

/** @param {string} s */
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\((official|lyric[s]?|lyrics video|audio|video|hd|remaster(ed)?|4k|1080p)[^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/official|lyrics?|video|audio|mv|visualizer|full\s*hd|remaster/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Stable pseudo-track id so existing likes/playlists/queue can reference it. */
export function makeId(t) {
  return 'on_' + t.provider + '_' + String(t.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}
