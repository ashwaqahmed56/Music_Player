/**
 * YouTubeProvider — mainstream catalogue.
 *
 * Search : YouTube Data API v3 (official, free key). search.list = 100 units.
 * Play   : the official IFrame player. We never touch stream URLs.
 *
 * Also provides a keyless (and clearly marked unreliable) Invidious search
 * fallback for when no API key is configured. It is feature-flagged and never
 * a hard dependency, because public instances go down and rate-limit often.
 */

import { CONFIG, hasYouTubeKey } from './config.js';
import { run, getJSON } from './searchCache.js';
import { makeId } from './types.js';

const API = 'https://www.googleapis.com/youtube/v3';

/** ISO-8601 duration -> seconds */
function isoDur(s) {
  if (!s) return 0;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

function bestThumb(thumbs) {
  if (!thumbs) return undefined;
  return (thumbs.high || thumbs.medium || thumbs.standard || thumbs.default)?.url;
}

/**
 * Search YouTube. Uses the API when a key exists, otherwise tries the
 * keyless Invidious fallback (feature-flagged).
 * @param {string} q
 * @param {AbortSignal} signal
 * @returns {Promise<import('./types.js').Track[]>}
 */
async function doSearch(q, signal) {
  if (hasYouTubeKey()) {
    try {
      return await apiSearch(q, signal);
    } catch (e) {
      // Quota exhausted or transient failure: fall through to the keyless path
      // so the user still gets results instead of an error.
      if (!CONFIG.ENABLE_INVIDIOUS_FALLBACK) throw e;
      try { return await invidiousSearch(q, signal); }
      catch (_) { throw e; }
    }
  }
  if (CONFIG.ENABLE_INVIDIOUS_FALLBACK) return invidiousSearch(q, signal);
  throw new Error('No YouTube API key configured');
}

async function apiSearch(q, signal) {
  const key = CONFIG.YOUTUBE_API_KEY.trim();
  const u = new URL(API + '/search');
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('type', 'video');
  // Only surface videos that are actually embeddable - this is the cheapest
  // way to avoid the error-101 dead ends.
  u.searchParams.set('videoEmbeddable', 'true');
  u.searchParams.set('maxResults', String(CONFIG.RESULT_LIMIT));
  u.searchParams.set('relevanceLanguage', 'en');
  u.searchParams.set('q', q);
  u.searchParams.set('key', key);

  const data = await getJSON(u.toString(), signal);
  const items = (data && data.items) || [];
  if (!items.length) return [];

  const ids = [];
  const base = new Map();
  for (const it of items) {
    const vid = it?.id?.videoId;
    if (!vid) continue;
    ids.push(vid);
    base.set(vid, {
      provider: 'youtube',
      id: vid,
      title: (it.snippet?.title || 'Unknown').replace(/\s+/g, ' ').trim(),
      artist: (it.snippet?.channelTitle || 'YouTube').trim(),
      album: 'YouTube',
      artworkUrl: bestThumb(it.snippet?.thumbnails),
      playableVia: 'iframe',
      pageUrl: 'https://www.youtube.com/watch?v=' + vid
    });
  }

  // One videos.list call (1 unit) fills in real durations. Optional: a failure
  // here must not lose the results.
  if (ids.length) {
    try {
      const v = new URL(API + '/videos');
      v.searchParams.set('part', 'contentDetails');
      v.searchParams.set('id', ids.join(','));
      v.searchParams.set('maxResults', String(ids.length));
      v.searchParams.set('key', key);
      const vd = await getJSON(v.toString(), signal);
      for (const it of (vd.items || [])) {
        const t = base.get(it.id);
        if (t) t.durationSec = isoDur(it.contentDetails?.duration);
      }
    } catch (e) { /* durations stay unknown; the player reports them later */ }
  }

  return [...base.values()].map(t => ({ ...t, _appId: makeId(t) }));
}

async function invidiousSearch(q, signal) {
  let lastErr = null;
  for (const host of CONFIG.INVIDIOUS_INSTANCES) {
    try {
      const u = host + '/api/v1/search?q=' + encodeURIComponent(q) + '&type=video';
      const data = await getJSON(u, signal);
      const items = Array.isArray(data) ? data : (data && data.items) || [];
      const out = items
        .filter(x => x && (x.videoId || x.type === 'video'))
        .slice(0, CONFIG.RESULT_LIMIT)
        .map(x => {
          const vid = x.videoId || (/[?&]v=([\w-]+)/.exec(x.url || '') || [])[1];
          if (!vid) return null;
          return {
            provider: 'invidious',
            id: vid,
            title: (x.title || 'Unknown').replace(/\s+/g, ' ').trim(),
            artist: (x.author || x.authorName || 'YouTube').trim(),
            album: 'YouTube',
            artworkUrl: (Array.isArray(x.videoThumbnails) ? (x.videoThumbnails[x.videoThumbnails.length - 1]?.url) : undefined)
              || (vid ? 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg' : undefined),
            durationSec: Math.max(0, Math.round(x.lengthSeconds || 0)),
            playableVia: 'iframe',
            pageUrl: 'https://www.youtube.com/watch?v=' + vid,
            _appId: 'on_invidious_' + vid
          };
        })
        .filter(Boolean);
      if (out.length) return out;
      lastErr = new Error('empty result set');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All Invidious instances failed');
}

export const YouTubeProvider = {
  id: 'youtube',
  label: CONFIG.BADGES.youtube,
  enabled: () => CONFIG.ENABLE_YOUTUBE,
  search: (q) => run('youtube', q, doSearch)
};
