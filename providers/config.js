/**
 * Configuration for the online streaming layer. Zero paid services.
 *
 * ── Getting a free YouTube Data API v3 key (no card required) ──────────────
 * 1. Open https://console.cloud.google.com/ and create/select a project.
 * 2. "APIs & Services" → "Library" → search "YouTube Data API v3" → Enable.
 * 3. "APIs & Services" → "Credentials" → "Create credentials" → "API key".
 * 4. Paste it into YOUTUBE_API_KEY below.
 * Free default quota is 10,000 units/day. search.list costs 100 units, so that
 * is ~100 searches/day. Results are cached (see searchCache.js) so repeats are
 * free. Quota can be raised in the console if you need more.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ── Getting a free Jamendo client_id (optional, extra indie catalogue) ─────
 * 1. https://devportal.jamendo.com/ → create an app → copy the client_id.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const CONFIG = {
  YOUTUBE_API_KEY: '',        // ← paste your free YouTube Data API v3 key here
  JAMENDO_CLIENT_ID: '',      // ← optional free Jamendo client_id

  // Feature flags
  ENABLE_YOUTUBE: true,
  ENABLE_AUDIUS: true,
  ENABLE_ARCHIVE: true,

  // Keyless YouTube search fallback. Unreliable and NOT Play Store safe -
  // never a hard dependency, used only when no API key is configured.
  ENABLE_INVIDIOUS_FALLBACK: true,
  INVIDIOUS_INSTANCES: [
    'https://yewtu.be',
    'https://invidious.nerdvpn.de',
    'https://invidious.f5.si',
    'https://yt.chocolatemoo53.com'
  ],

  // Audius: bootstrap host list, rotated on failure.
  AUDIUS_BOOTSTRAP: 'https://api.audius.co',
  AUDIUS_APP_NAME: 'ashsplayer',

  // Search UX
  DEBOUNCE_MS: 400,
  MIN_QUERY_CHARS: 3,
  RESULT_LIMIT: 15,
  CACHE_MAX_ENTRIES: 60,
  CACHE_TTL_MS: 6 * 60 * 60 * 1000,   // 6h
  REQUEST_TIMEOUT_MS: 12000,

  // Provider order in merged results
  ORDER: ['youtube', 'audius', 'archive'],

  // Labels shown on each row
  BADGES: {
    youtube: 'YouTube',
    audius: 'Audius',
    archive: 'Archive',
    invidious: 'YouTube'
  }
};

export function hasYouTubeKey() {
  return typeof CONFIG.YOUTUBE_API_KEY === 'string' && CONFIG.YOUTUBE_API_KEY.trim().length > 20;
}
