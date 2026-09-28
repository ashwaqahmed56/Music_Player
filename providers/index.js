/**
 * Provider fan-out. Runs every enabled provider, merges in the configured
 * order, de-duplicates by normalised title+artist, and reports per-provider
 * status so the UI can explain a partial result.
 */

import { CONFIG } from './config.js';
import { YouTubeProvider } from './youtube.js';
import { AudiusProvider } from './audius.js';
import { ArchiveProvider } from './archive.js';
import { dedupeKey } from './types.js';
import { cancelAll } from './searchCache.js';

const REGISTRY = {
  youtube: YouTubeProvider,
  audius: AudiusProvider,
  archive: ArchiveProvider
};

export { YouTubeProvider, AudiusProvider, ArchiveProvider };
export { CONFIG } from './config.js';

let quotaWarned = false;

/** @param {string} id */
export function providerLabel(id) {
  return CONFIG.BADGES[id] || id;
}

/**
 * @param {string} query
 * @param {{signal?:AbortSignal}} [opts]
 * @returns {Promise<import('./types.js').SearchResult>}
 */
export async function searchAll(query, opts) {
  const signal = (opts && opts.signal) || undefined;
  const order = CONFIG.ORDER.filter(id => REGISTRY[id] && REGISTRY[id].enabled());
  if (!order.length) {
    return { tracks: [], providerStatus: {}, warnings: ['No providers enabled'] };
  }

  const settled = await Promise.all(
    order.map(async id => {
      try {
        const r = await REGISTRY[id].search(query);
        if (r && r.ok) return { id, status: 'ok', tracks: r.data || [], cached: !!r.cached };
        return { id, status: r?.status || 'error', tracks: [], error: r?.error };
      } catch (e) {
        return { id, status: 'error', tracks: [], error: String((e && e.message) || e) };
      }
    })
  );

  const status = {};
  const warnings = [];
  const seen = new Set();
  const tracks = [];

  for (const s of settled) {
    status[s.id] = s.status;
    if (s.status === 'quota') {
      if (s.id === 'youtube' && !quotaWarned) {
        quotaWarned = true;
        warnings.push('YouTube daily quota reached — showing Audius and Archive results instead.');
      }
    } else if (s.status === 'offline') {
      warnings.push('You appear to be offline — online search needs a connection.');
    } else if (s.status === 'error' && s.id === 'youtube') {
      warnings.push('YouTube search unavailable (no key or rate limited).');
    }
    for (const t of s.tracks) {
      const k = dedupeKey(t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      tracks.push({ ...t, badge: providerLabel(s.id), _provider: s.id });
    }
  }

  return { tracks, providerStatus: status, warnings };
}

/** Cancel anything still running from a previous keystroke. */
export function cancelSearches() {
  cancelAll();
}
