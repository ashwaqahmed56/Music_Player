/**
 * Session-scoped LRU result cache + in-flight request cancellation.
 *
 * This is what makes the YouTube quota bearable: a repeated query costs zero
 * units because the cached result is served instead of a search.list call.
 */

import { CONFIG } from './config.js';

/** @type {Map<string, {at:number, data:any}>} */
const cache = new Map();

/** In-flight requests per cache key, so identical concurrent queries share one call. */
const inflight = new Map();

/** AbortControllers for the currently-executing search, used to cancel stale ones. */
let activeGroup = [];

/** @param {string} s */
export function normQuery(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function get(provider, query) {
  const k = provider + '::' + normQuery(query);
  const hit = cache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > CONFIG.CACHE_TTL_MS) {
    cache.delete(k);
    return null;
  }
  // LRU: re-insert to mark as recently used.
  cache.delete(k);
  cache.set(k, hit);
  return hit.data;
}

export function put(provider, query, data) {
  const k = provider + '::' + normQuery(query);
  cache.set(k, { at: Date.now(), data });
  while (cache.size > CONFIG.CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/**
 * Run a provider search with timeout, shared in-flight dedupe, caching and
 * quota awareness. Never throws - returns { ok, data, status, error }.
 *
 * @param {string} provider
 * @param {string} query
 * @param {(q:string, signal:AbortSignal)=>Promise<any>} fn
 */
export async function run(provider, query, fn) {
  const q = normQuery(query);
  if (!q || q.length < CONFIG.MIN_QUERY_CHARS) {
    return { ok: false, status: 'error', data: null, error: 'query too short' };
  }

  const cached = get(provider, q);
  if (cached) return { ok: true, status: 'ok', data: cached, cached: true };

  if (inflight.has(provider + '::' + q)) {
    try { return await inflight.get(provider + '::' + q); }
    catch (e) { return { ok: false, status: 'error', data: null, error: String(e) }; }
  }

  const task = (async () => {
    const ctrl = new AbortController();
    activeGroup.push(ctrl);
    const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const data = await fn(q, ctrl.signal);
      put(provider, q, data);
      return { ok: true, status: 'ok', data, cached: false };
    } catch (e) {
      const status = classify(e);
      return { ok: false, status, data: null, error: String((e && e.message) || e) };
    } finally {
      clearTimeout(timer);
      activeGroup = activeGroup.filter(c => c !== ctrl);
      inflight.delete(provider + '::' + q);
    }
  })();

  inflight.set(provider + '::' + q, task);
  return task;
}

/** Abort every in-flight request belonging to the previous search. */
export function cancelAll() {
  activeGroup.forEach(c => { try { c.abort(); } catch (e) {} });
  activeGroup = [];
}

/** @param {any} e */
function classify(e) {
  const msg = String((e && e.message) || e || '').toLowerCase();
  if (e && (e.name === 'AbortError' || /abort/.test(msg))) return 'aborted';
  if (/quota|rateLimitExceeded|403|429/.test(msg)) return 'quota';
  if (/offline|network|failed to fetch|load failed/.test(msg)) return 'offline';
  return 'error';
}

/** Debounce helper. @param {Function} fn @param {number} ms */
export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapped.cancel = () => { if (t) { clearTimeout(t); t = null; } };
  return wrapped;
}

/** fetch + JSON with timeout and a useful error message. */
export async function getJSON(url, signal) {
  const r = await fetch(url, { signal, headers: { 'Accept': 'application/json' } });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
  if (!r.ok) {
    const apiMsg = (j && j.error && (j.error.message || j.error.errors?.[0]?.reason)) || '';
    const err = new Error('HTTP ' + r.status + (apiMsg ? ': ' + apiMsg : ''));
    err.status = r.status;
    err.body = j;
    throw err;
  }
  return j;
}
