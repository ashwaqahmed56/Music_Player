/*
 * ytbridge.js — injected into the official YouTube page.
 *
 * It only OBSERVES the page's own <video> element and reports state up to the
 * host app. It does not touch playback URLs, does not call private endpoints
 * and does not modify the site. The official player runs untouched.
 */
(function () {
  if (window.__ytBgrInstalled) return;
  window.__ytBgrInstalled = true;

  var BRIDGE = window.AndroidYt;
  var video = null;
  var lastSecond = -1;
  var navTimer = null;
  var missingSince = 0;
  var metaSig = '';

  function send(type, data) {
    try {
      if (BRIDGE && BRIDGE.post) BRIDGE.post(JSON.stringify({ type: type, data: data }));
    } catch (e) { /* bridge gone (teardown) - ignore */ }
  }

  function findVideo() {
    try { return document.querySelector('video'); } catch (e) { return null; }
  }

  function thumbFor(id) {
    return id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '';
  }

  /* ---- metadata: prefers the player's own data object, falls back to DOM ---- */
  function readMeta() {
    var out = {};
    try {
      var mp = document.getElementById('movie_player');
      if (mp && typeof mp.getVideoData === 'function') {
        var d = mp.getVideoData() || {};
        out.title = d.title || '';
        out.artist = d.author || '';
        out.videoId = d.video_id || '';
        if (d.duration) out.duration = Math.round(Number(d.duration) * 1000);
        out.artwork = thumbFor(d.video_id);
      }
    } catch (e) { /* undocumented internals - fall through to DOM */ }

    if (!out.title) {
      var h = document.querySelector('h1 yt-formatted-string, h1.title, h1');
      out.title = (h && h.textContent || document.title || '').trim();
    }
    if (!out.artist) {
      var a = document.querySelector('#owner-name a, ytd-channel-name a, #upload-info a, .ytd-channel-name');
      out.artist = (a && a.textContent || '').trim();
    }
    if (!out.artwork) {
      var og = document.querySelector('meta[property="og:image"]');
      if (og && og.content) out.artwork = og.content;
      else if (out.videoId) out.artwork = thumbFor(out.videoId);
    }
    if (!out.duration && video && isFinite(video.duration)) {
      out.duration = Math.round(video.duration * 1000);
    }
    if (!out.title) return null;
    return out;
  }

  function pushMeta(force) {
    var m = readMeta();
    if (!m) return;
    var sig = (m.title || '') + '|' + (m.artist || '') + '|' + (m.videoId || '');
    if (!force && sig === metaSig) return;
    metaSig = sig;
    send('meta', m);
  }

  function readState() {
    var v = video;
    if (!v) return { state: 'idle', position: 0, duration: 0 };
    var s = 'paused';
    if (v.ended) s = 'ended';
    else if (!v.paused) s = (v.seeking || v.readyState < 3) ? 'buffering' : 'playing';
    return {
      state: s,
      position: Math.floor((v.currentTime || 0) * 1000),
      duration: Math.floor((v.duration || 0) * 1000)
    };
  }

  function pushState() { send('state', readState()); }

  function bind() {
    var v = findVideo();
    if (!v) return false;
    if (v.__ytBgrBound) { video = v; return true; }
    v.__ytBgrBound = true;
    video = v;

    ['play', 'pause', 'ended', 'waiting', 'playing', 'loadedmetadata',
     'seeked', 'ratechange', 'stalled', 'canplay'].forEach(function (ev) {
      v.addEventListener(ev, function () {
        pushState();
        pushMeta(ev === 'loadedmetadata' || ev === 'playing');
      });
    });

    v.addEventListener('timeupdate', function () {
      var s = Math.floor(v.currentTime || 0);
      if (s !== lastSecond) { lastSecond = s; pushState(); }
    });

    pushMeta(true);
    return true;
  }

  /*
   * "Video paused. Continue watching?" blocks background playback, and the
   * EU consent wall shows on first load. Both are ordinary page dialogs.
   */
  function clearDialogs() {
    try {
      var nodes = document.querySelectorAll(
        '.ytp-dialog-button, .ytp-confirm-dialog-rollup button, ' +
        'tp-yt-paper-dialog #button, ytd-consent-bump-v2-lightbox button, ' +
        'form[action*="consent"] button'
      );
      for (var i = 0; i < nodes.length; i++) {
        var b = nodes[i];
        if (b.disabled) continue;
        var t = (b.textContent || '').trim();
        if (!t) continue;
        if (/^(no thanks|decline|reject|only necessary)$/i.test(t)) continue;
        if (/continue|ok|got it|accept|agree|i agree|allow all|rejected|understand/i.test(t)) {
          try { b.click(); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function scan() {
    if (bind()) {
      missingSince = 0;
    } else {
      var now = Date.now();
      if (!missingSince) missingSince = now;
      else if (now - missingSince > 10000) {
        send('error', { reason: 'no-video-element' });
        missingSince = now + 30000; // throttle repeats
      }
    }
    clearDialogs();
  }

  /* ---- commands coming back down from native (lock screen / notification) ---- */
  window.__ytBgrCmd = function (name, arg) {
    var v = video || findVideo();
    try {
      if (name === 'play') { if (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
      else if (name === 'pause') { if (v) v.pause(); }
      else if (name === 'seek') { if (v && isFinite(arg)) v.currentTime = arg; }
      else if (name === 'next') { var n = document.querySelector('.ytp-next-button'); if (n) n.click(); }
      else if (name === 'prev') { var p2 = document.querySelector('.ytp-prev-button'); if (p2) p2.click(); }
      return true;
    } catch (e) { return false; }
  };

  /* ---- hooks ---- */
  window.addEventListener('yt-navigate-finish', function () {
    metaSig = ''; lastSecond = -1;
    setTimeout(scan, 400);
  });
  window.addEventListener('yt-page-data-updated', function () { setTimeout(scan, 300); });

  try {
    new MutationObserver(function () {
      if (navTimer) clearTimeout(navTimer);
      navTimer = setTimeout(scan, 250);
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  document.addEventListener('visibilitychange', function () {
    // Re-assert bindings when the WebView comes back into view; the page may
    // have replaced its <video> while we were detached.
    if (!document.hidden) scan();
  });

  setInterval(scan, 1000);
  scan();
})();
