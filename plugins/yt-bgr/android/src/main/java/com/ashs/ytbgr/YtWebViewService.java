package com.ashs.ytbgr;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.view.MutableContextWrapper;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Owns the WebView for its whole lifetime and keeps it in a
 * mediaPlayback foreground service, so the official YouTube page keeps
 * playing with the app backgrounded or the screen off.
 *
 * The WebView is created ONCE with a MutableContextWrapper over the
 * application context. YtPlayerActivity flips the wrapper's base context
 * between the Activity (visible) and the application (detached) - it never
 * calls WebView.onPause(), which is what keeps the media pipeline alive.
 */
public class YtWebViewService extends Service {

    private static final String TAG = "YtBgr";
    private static final String CHANNEL_ID = "ytbgr_media";
    // Deliberately different from the music-controls plugin's 7824.
    private static final int NOTIF_ID = 5731;

    static final String DEFAULT_URL = "https://www.youtube.com";

    private static final String EXTRA_URL = "url";
    private static final String EXTRA_DESKTOP_UA = "desktopUa";

    // --- shared singletons, reachable from the plugin and the activity ---
    static WebView sWebView;
    static MutableContextWrapper sContextWrapper;
    static String sLastUrl = DEFAULT_URL;
    static boolean sDesktopUa = false;
    static boolean sRunning = false;
    static WeakReference<YtBgrPlugin> sPlugin = new WeakReference<>(null);

    private final Handler main = new Handler(Looper.getMainLooper());

    private MediaSession session;
    private NotificationManager nm;
    private AudioManager audio;

    private AudioFocusRequest focusRequest;      // API 26+
    private AudioManager.OnAudioFocusChangeListener focusListener;
    private boolean resumeOnFocusGain = false;
    private boolean noisyRegistered = false;

    private boolean playing = false;
    private int position = 0;
    private int duration = 0;
    private String title = "";
    private String artist = "";
    private String artwork = "";
    private String videoId = "";
    private Bitmap artBitmap;

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (i != null && AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) {
                pause();
            }
        }
    };

    // =====================================================================
    // lifecycle
    // =====================================================================

    @Override
    public void onCreate() {
        super.onCreate();
        nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createChannel();
        createSession();
        buildWebView();
        registerNoisy();
        sRunning = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Must call startForeground quickly, otherwise the system kills us.
        goForeground();
        if (intent != null) {
            if (intent.getBooleanExtra(EXTRA_DESKTOP_UA, false)) sDesktopUa = true;
            String url = intent.getStringExtra(EXTRA_URL);
            if (url != null && !url.isEmpty()) {
                sLastUrl = url;
                load(url);
            }
        }
        // START_STICKY: survive a low-memory kill of the process. Never stop on
        // task swipe - that is handled by stopWithTask="false" in the manifest.
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        unregisterNoisy();
        abandonFocus();
        if (session != null) {
            try { session.setActive(false); } catch (Exception ignored) {}
            try { session.release(); } catch (Exception ignored) {}
            session = null;
        }
        if (nm != null) {
            try { nm.cancel(NOTIF_ID); } catch (Exception ignored) {}
        }
        destroyWebView();
        sRunning = false;
        emitState("idle", 0, 0);
        super.onDestroy();
    }

    // =====================================================================
    // public static control surface (used by the plugin)
    // =====================================================================

    public static void open(Context ctx, String url, boolean desktopUa) {
        sDesktopUa = desktopUa;
        if (url != null && !url.isEmpty()) sLastUrl = url;
        Intent i = new Intent(ctx, YtWebViewService.class);
        i.putExtra(EXTRA_URL, sLastUrl);
        i.putExtra(EXTRA_DESKTOP_UA, desktopUa);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    public static void stop(Context ctx) {
        try {
            Intent i = new Intent(ctx, YtWebViewService.class);
            ctx.stopService(i);
        } catch (Exception ignored) {}
    }

    public static void cmd(String name, double arg) {
        YtWebViewService s = INSTANCE;
        if (s == null) return;
        s.runOnUiThread(() -> s.sendCmd(name, arg));
    }

    public static void load(String url) {
        YtWebViewService s = INSTANCE;
        if (s == null) return;
        s.runOnUiThread(() -> {
            sLastUrl = url;
            s.sendCmd("navigate", 0);
        });
    }

    static YtWebViewService INSTANCE;

    // =====================================================================
    // WebView
    // =====================================================================

    private void buildWebView() {
        INSTANCE = this;
        if (sContextWrapper == null) sContextWrapper = new MutableContextWrapper(getApplicationContext());
        sContextWrapper.setBaseContext(getApplicationContext());
        if (sWebView != null) return;

        WebView wv = new WebView(sContextWrapper);
        sWebView = wv;

        WebSettings st = wv.getSettings();
        st.setJavaScriptEnabled(true);
        st.setDomStorageEnabled(true);
        st.setDatabaseEnabled(true);
        // Required so the page can start playback without a fresh user gesture
        // (e.g. resuming after the Activity detaches).
        st.setMediaPlaybackRequiresUserGesture(false);
        st.setLoadWithOverviewMode(true);
        st.setUseWideViewPort(true);
        st.setSupportZoom(false);
        st.setBuiltInZoomControls(false);
        st.setDomStorageEnabled(true);
        try { st.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); } catch (Exception ignored) {}

        // Cookies persist so the user's YouTube sign-in carries over.
        try {
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
        } catch (Exception ignored) {}

        if (sDesktopUa) {
            try {
                st.setUserAgentString(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/124.0.0.0 Safari/537.36");
            } catch (Exception ignored) {}
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true); }
            catch (Exception ignored) {}
        }

        wv.setBackgroundColor(0xFF000000);
        wv.setWebChromeClient(new WebChromeClient());
        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Keep navigation inside our WebView - a real browser.
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith("http")) sLastUrl = url;
                injectBridge();
            }

            @Override
            @android.annotation.TargetApi(Build.VERSION_CODES.O)
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Renderer crashed: the WebView is unusable. Rebuild and restore
                // the last URL rather than dying silently.
                Log.w(TAG, "renderer gone, recreating WebView");
                rebuildWebView();
                return true;
            }
        });

        wv.addJavascriptInterface(new JsBridge(), "AndroidYt");

        String u = (sLastUrl == null || sLastUrl.isEmpty()) ? DEFAULT_URL : sLastUrl;
        wv.loadUrl(u);
    }

    private void injectBridge() {
        try {
            String js = loadAsset("ytbridge.js");
            if (js != null && !js.isEmpty()) sWebView.evaluateJavascript(js, null);
        } catch (Exception e) {
            Log.w(TAG, "bridge inject failed: " + e);
        }
    }

    private String loadAsset(String name) {
        try {
            InputStream in = getAssets().open(name);
            byte[] buf = new byte[8192];
            StringBuilder sb = new StringBuilder();
            int n;
            while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n));
            in.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void rebuildWebView() {
        try {
            if (sWebView != null) {
                if (sWebView.getParent() instanceof android.view.ViewGroup) {
                    ((android.view.ViewGroup) sWebView.getParent()).removeView(sWebView);
                }
                sWebView.destroy();
            }
        } catch (Exception ignored) {}
        sWebView = null;
        buildWebView();
    }

    private void destroyWebView() {
        try {
            if (sWebView != null) {
                sWebView.loadUrl("about:blank");
                if (sWebView.getParent() instanceof android.view.ViewGroup) {
                    ((android.view.ViewGroup) sWebView.getParent()).removeView(sWebView);
                }
                sWebView.destroy();
            }
        } catch (Exception ignored) {}
        sWebView = null;
        INSTANCE = null;
    }

    private void sendCmd(String name, double arg) {
        if (sWebView == null) return;
        String js;
        if ("navigate".equals(name)) {
            String u = (sLastUrl == null || sLastUrl.isEmpty()) ? DEFAULT_URL : sLastUrl;
            sWebView.loadUrl(u);
            return;
        } else if ("seek".equals(name)) {
            js = "window.__ytbgrCmd && window.__ytbgrCmd('seek'," + arg + ");";
        } else {
            js = "window.__ytbgrCmd && window.__ytbgrCmd('" + name + "',0);";
        }
        try { sWebView.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }

    // =====================================================================
    // JS bridge
    // =====================================================================

    public class JsBridge {
        @JavascriptInterface
        public void post(String json) {
            // Called on a background thread - hop to main before touching state.
            try {
                final JSONObject o = new JSONObject(json);
                final String type = o.optString("type");
                final JSONObject d = o.optJSONObject("data");
                main.post(() -> handle(type, d));
            } catch (Exception e) {
                Log.w(TAG, "bridge parse: " + e);
            }
        }
    }

    private void handle(String type, JSONObject d) {
        if (d == null) d = new JSONObject();
        if ("state".equals(type)) {
            String st = d.optString("state", "idle");
            int pos = d.optInt("position", 0);
            int dur = d.optInt("duration", 0);
            boolean wasPlaying = playing;
            playing = "playing".equals(st);
            if (pos > 0) position = pos;
            if (dur > 0) duration = dur;
            if (playing && !wasPlaying) {
                requestFocus();
            } else if (!playing && wasPlaying) {
                position = 0;
            }
            pushSession();
            updateNotification();
            emitState(st, position, duration);
        } else if ("meta".equals(type)) {
            title = d.optString("title", title);
            artist = d.optString("artist", artist);
            String v = d.optString("videoId", "");
            String art = d.optString("artwork", "");
            if (d.has("duration") && d.optInt("duration", 0) > 0) duration = d.optInt("duration", 0);
            if (!v.isEmpty()) videoId = v;
            if (!art.isEmpty() && !art.equals(artwork)) {
                artwork = art;
                fetchArt(art);
            }
            pushSession();
            updateNotification();
            emitMeta();
        } else if ("error".equals(type)) {
            emitError(d.optString("reason", "unknown"));
        }
    }

    // =====================================================================
    // events -> JS
    // =====================================================================

    private void emitState(String st, int pos, int dur) {
        YtBgrPlugin p = sPlugin.get();
        if (p == null) return;
        com.getcapacitor.JSObject o = new com.getcapacitor.JSObject();
        o.put("state", st);
        o.put("position", pos);
        o.put("duration", dur);
        p.notifyListeners("ytState", o);
    }

    private void emitMeta() {
        YtBgrPlugin p = sPlugin.get();
        if (p == null) return;
        com.getcapacitor.JSObject o = new com.getcapacitor.JSObject();
        o.put("title", title);
        o.put("artist", artist);
        o.put("artwork", artwork);
        o.put("videoId", videoId);
        p.notifyListeners("ytMeta", o);
    }

    private void emitError(String reason) {
        YtBgrPlugin p = sPlugin.get();
        if (p == null) return;
        com.getcapacitor.JSObject o = new com.getcapacitor.JSObject();
        o.put("reason", reason);
        p.notifyListeners("ytError", o);
    }

    // =====================================================================
    // audio focus
    // =====================================================================

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "YouTube background playback", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Controls for the in-app YouTube player");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        } catch (Exception ignored) {}
    }

    private void registerNoisy() {
        if (noisyRegistered) return;
        try {
            IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            // Android 13+ requires an explicit export flag when registering a
            // receiver at runtime. This one only ever comes from the platform.
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(noisy, f, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(noisy, f);
            }
            noisyRegistered = true;
        } catch (Exception ignored) {}
    }

    private void unregisterNoisy() {
        if (!noisyRegistered) return;
        try { unregisterReceiver(noisy); } catch (Exception ignored) {}
        noisyRegistered = false;
    }

    private void requestFocus() {
        if (audio == null) return;
        if (focusListener == null) {
            focusListener = focusChange -> {
                try {
                    int t = focusChange;
                    if (t == AudioManager.AUDIOFOCUS_LOSS) {
                        resumeOnFocusGain = false;
                        pause();
                    } else if (t == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                        resumeOnFocusGain = true;
                        pause();
                    } else if (t == AudioManager.AUDIOFOCUS_GAIN) {
                        if (resumeOnFocusGain) { resumeOnFocusGain = false; play(); }
                    }
                    // LOSS_TRANSIENT_CAN_DUCK is a no-op: the WebView renders
                    // through the normal media volume stream, so it already
                    // follows whatever ducking level the platform applied.
                } catch (Exception ignored) {}
            };
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest == null) {
                    AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build();
                    focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(attrs)
                        .setOnAudioFocusChangeListener(focusListener)
                        .setWillPauseWhenDucked(false)
                        .build();
                }
                audio.requestAudioFocus(focusRequest);
            } else {
                audio.requestAudioFocus(focusListener,
                    AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            }
        } catch (Exception ignored) {}
    }

    private void abandonFocus() {
        if (audio == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audio.abandonAudioFocusRequest(focusRequest);
                focusRequest = null;
            } else if (focusListener != null) {
                audio.abandonAudioFocus(focusListener);
            }
        } catch (Exception ignored) {}
    }

    // =====================================================================
    // MediaSession + notification
    // =====================================================================

    private void createSession() {
        try {
            session = new MediaSession(this, "AshYouTubeBg");
            session.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { play(); }
                @Override public void onPause() { pause(); }
                @Override public void onStop() { stop(YtWebViewService.this); }
                @Override public void onSkipToNext() { sendCmd("next", 0); }
                @Override public void onSkipToPrevious() { sendCmd("prev", 0); }
                @Override public void onSeekTo(long pos) { sendCmd("seek", pos / 1000.0); }
            });
            session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
                | MediaSession.FLAG_HANDLES_SEEK);
            session.setActive(true);
        } catch (Exception e) {
            Log.w(TAG, "session: " + e);
        }
    }

    private void pushSession() {
        if (session == null) return;
        try {
            int st = playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;

            PlaybackState.Builder b = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SEEK_TO
                    | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackState.ACTION_STOP)
                .setState(st, position, 1.0f);
            session.setPlaybackState(b.build());

            if (title != null && !title.isEmpty()) {
                android.media.MediaMetadata.Builder mb = new android.media.MediaMetadata.Builder()
                    .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, title);
                if (artist != null && !artist.isEmpty()) {
                    mb.putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, artist);
                    mb.putString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ARTIST, artist);
                }
                if (duration > 0) mb.putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, duration);
                if (artwork != null && !artwork.isEmpty()) {
                    mb.putString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART_URI, artwork);
                }
                session.setMetadata(mb.build());
            }
        } catch (Exception e) {
            Log.w(TAG, "pushSession: " + e);
        }
    }

    private int piFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    private void goForeground() {
        try {
            Notification n = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            Log.w(TAG, "goForeground: " + e);
        }
    }

    private void updateNotification() {
        if (nm == null) return;
        try { nm.notify(NOTIF_ID, buildNotification()); } catch (Exception ignored) {}
    }

    private Notification buildNotification() {
        Context c = getApplicationContext();
        String t = (title == null || title.isEmpty()) ? "YouTube" : title;
        String a = (artist == null || artist.isEmpty()) ? "Loading…" : artist;

        Notification.Builder b = new Notification.Builder(c);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setChannelId(CHANNEL_ID);
        b.setContentTitle(t);
        b.setContentText(a);
        b.setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause);
        b.setOngoing(true);
        b.setVisibility(Notification.VISIBILITY_PUBLIC);
        b.setWhen(0);
        b.setPriority(Notification.PRIORITY_MAX);
        if (artBitmap != null) b.setLargeIcon(artBitmap);
        b.setDeleteIntent(null);

        Intent open = new Intent(c, YtPlayerActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        b.setContentIntent(PendingIntent.getActivity(c, 0, open, piFlags()));

        b.addAction(android.R.drawable.ic_media_previous, "Previous", null);
        b.addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            playing ? "Pause" : "Play", null);
        b.addAction(android.R.drawable.ic_media_next, "Next", null);
        b.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", null);

        // Transport actions are delivered through the MediaSession token
        // (set below), so no PendingIntents are needed - which also avoids
        // background-service start restrictions on Android 8+.
        b.setStyle(new Notification.MediaStyle()
            .setMediaSession(session == null ? null : session.getSessionToken())
            .setShowActionsInCompactView(0, 1, 2));

        return b.build();
    }

    private void fetchArt(String url) {
        new Thread(() -> {
            Bitmap bmp = null;
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setInstanceFollowRedirects(true);
                InputStream in = conn.getInputStream();
                bmp = BitmapFactory.decodeStream(in);
                in.close();
            } catch (Exception ignored) {
            } finally {
                if (conn != null) try { conn.disconnect(); } catch (Exception ignored) {}
            }
            if (bmp == null) return;
            main.post(() -> {
                artBitmap = bmp;
                updateNotification();
                pushSession();
            });
        }).start();
    }

    // =====================================================================
    // transport
    // =====================================================================

    public void play() {
        runOnUiThread(() -> {
            requestFocus();
            sendCmd("play", 0);
        });
    }

    public void pause() {
        runOnUiThread(() -> sendCmd("pause", 0));
    }

    public void seekTo(long sec) {
        runOnUiThread(() -> sendCmd("seek", (double) sec));
    }

    // =====================================================================
    // activity <-> WebView plumbing
    // =====================================================================

    static void attach(WebView wv, MutableContextWrapper ctx, android.view.ViewGroup target) {
        if (ctx != null) ctx.setBaseContext(target.getContext());
        if (wv != null && wv.getParent() != null) {
            ((android.view.ViewGroup) wv.getParent()).removeView(wv);
        }
        if (wv != null && target != null) {
            target.addView(wv, new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));
        }
    }

    /**
     * Detach only. Deliberately NOT calling WebView.onPause() - pausing the
     * WebView is exactly what would kill background audio. The base context is
     * reset to the application so the WebView no longer holds an Activity.
     */
    static void detach(WebView wv, MutableContextWrapper ctx, Context appContext) {
        try {
            if (wv != null && wv.getParent() instanceof android.view.ViewGroup) {
                ((android.view.ViewGroup) wv.getParent()).removeView(wv);
            }
        } catch (Exception ignored) {}
        if (ctx != null && appContext != null) {
            try { ctx.setBaseContext(appContext); } catch (Exception ignored) {}
        }
    }
}
