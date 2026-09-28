import { registerPlugin } from '@capacitor/core';

/**
 * YouTube background playback (official site in a WebView, owned by a
 * mediaPlayback foreground service). No stream extraction, no downloads.
 */
export const YtBgr = registerPlugin('YtBgr');
