/**
 * AudiusProvider — independent / free-label catalogue. No API key, no quota.
 *
 * Bootstraps an API host from https://api.audius.co, rotates to the next host
 * when one fails, and returns direct stream URLs (playableVia: 'url') so these
 * tracks play through the app's existing <audio> pipeline and MediaSession.
 */

import { CONFIG } from './config.js';
import { run, getJSON } from './searchCache.js';
import { makeId } from './types.js';

let hosts = [];          // rotated working hosts
let bootPromise = null;

async function bootstrap() {
  if (hosts.length) return hosts;
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    try {
      const data = await getJSON(CONFIG.AUDIUS_BOOTSTRAP, undefined);
      const list = (data && data.data) || [];
      const parsed = list
        .map(h => (typeof h === 'string' ? h : h?.apiUrl || h?.api_url))
        .filter(u => typeof u === 'string' && /^https?:\/\//.test(u))
        .map(u => u.replace(/\/+$/, ''));
      if (parsed.length) { hosts = parsed; return hosts; }
    } catch (e) { /* fall through to the well-known default */ }
    hosts = ['https://discoveryprovider.audius.co'];
    return hosts;
  })();
  try { return await bootPromise; } finally { bootPromise = null; }
}

function rotate(failed) {
  hosts = hosts.filter(h => h !== failed);
}

function art(a) {
  if (!a) return undefined;
  if (typeof a === 'string') return a;
  return a['1000x1000'] || a['480x480'] || a['150x150'] || undefined;
}

function userName(u) {
  if (!u) return 'Audius';
  if (typeof u === 'string') return u;
  return u.handle || u.name || 'Audius';
}

function mapTrack(d) {
  const t = {
    provider: 'audius',
    id: String(d.id),
    title: d.title || 'Unknown',
    artist: userName(d.user),
    album: 'Audius',
    artworkUrl: art(d.artwork),
    durationSec: Math.max(0, Math.round(d.duration || 0)),
    playableVia: 'url',
    pageUrl: d.permalink ? 'https://audius.co' + d.permalink : 'https://audius.co',
    downloadable: true
  };
  // Built lazily by resolve() so a host rotation does not bake in a dead URL.
  t._appId = makeId(t);
  return t;
}

async function doSearch(q, signal) {
  await bootstrap();
  const list = [...hosts];
  let lastErr = null;

  for (const host of list) {
    try {
      const u = host + '/v1/tracks/search?query=' + encodeURIComponent(q)
        + '&app_name=' + CONFIG.AUDIUS_APP_NAME + '&limit=' + CONFIG.RESULT_LIMIT;
      const data = await getJSON(u, signal);
      const rows = ((data && data.data) || []).filter(x => x && x.is_streamable !== false);
      return rows.map(mapTrack);
    } catch (e) {
      lastErr = e;
      if (signal && signal.aborted) throw e;
      rotate(host);           // this host is not working right now
    }
  }
  throw lastErr || new Error('No Audius host available');
}

export const AudiusProvider = {
  id: 'audius',
  label: CONFIG.BADGES.audius,
  enabled: () => CONFIG.ENABLE_AUDIUS,

  search: (q) => run('audius', q, doSearch),

  async trending(signal) {
    await bootstrap();
    for (const host of [...hosts]) {
      try {
        const u = host + '/v1/tracks/trending?app_name=' + CONFIG.AUDIUS_APP_NAME
          + '&limit=' + CONFIG.RESULT_LIMIT + '&genre=all';
        const data = await getJSON(u, signal);
        return (((data && data.data) || []).filter(x => x && x.is_streamable !== false)).map(mapTrack);
      } catch (e) {
        rotate(host);
        if (signal && signal.aborted) throw e;
      }
    }
    return [];
  },

  /**
   * Fresh direct stream URL. Audius 302-redirects to a CDN file; resolving at
   * play time (rather than caching the URL) survives CDN rotation.
   * @param {import('./types.js').Track} t
   */
  async resolve(t) {
    await bootstrap();
    for (const host of [...hosts]) {
      try {
        const u = host + '/v1/tracks/' + encodeURIComponent(t.id) + '/stream?app_name=' + CONFIG.AUDIUS_APP_NAME;
        return u;   // the <audio> element follows the 302 itself
      } catch (e) { rotate(host); }
    }
    throw new Error('No Audius host available');
  }
};
