package com.ashs.ytbgr;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Capacitor surface for the YouTube background playback module.
 *
 * IMPORTANT: this module only hosts the official YouTube website in a WebView.
 * It performs no stream-URL extraction, calls no private endpoints, and
 * downloads nothing.
 */
@CapacitorPlugin(
    name = "YtBgr",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = YtBgrPlugin.ALIAS_NOTIF)
    }
)
public class YtBgrPlugin extends Plugin {

    static final String ALIAS_NOTIF = "ytNotif";

    @Override
    public void load() {
        // The service needs a way to push page events back into JS.
        YtWebViewService.sPlugin = new java.lang.ref.WeakReference<>(this);
    }

    // ------------------------------------------------------------------
    // lifecycle
    // ------------------------------------------------------------------

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        Boolean desktop = call.getBoolean("desktopUa", false);
        final String u = (url == null || url.isEmpty()) ? YtWebViewService.DEFAULT_URL : url;
        final boolean du = desktop != null && desktop;

        // Android 13+ needs an explicit POST_NOTIFICATIONS grant, but playback
        // should start either way - the notification is just how you control it.
        if (Build.VERSION.SDK_INT >= 33 && !hasNotifPermission()) {
            try {
                requestPermissionForAlias(ALIAS_NOTIF, call, "notifPermsCallback");
                return;
            } catch (Exception ignored) {
                // fall through and start anyway
            }
        }
        start(call, u, du);
    }

    @PermissionCallback
    private void notifPermsCallback(PluginCall call) {
        String url = call.getString("url");
        Boolean desktop = call.getBoolean("desktopUa", false);
        String u = (url == null || url.isEmpty()) ? YtWebViewService.DEFAULT_URL : url;
        start(call, u, desktop != null && desktop);
    }

    private void start(PluginCall call, String url, boolean desktopUa) {
        try {
            YtWebViewService.sPlugin = new java.lang.ref.WeakReference<>(this);
            YtWebViewService.open(getContext(), url, desktopUa);

            Intent i = new Intent(getContext(), YtPlayerActivity.class);
            i.putExtra("url", url);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);

            call.resolve(new JSObject().put("opened", true).put("url", url));
        } catch (Exception e) {
            call.reject("Could not start: " + e.getMessage());
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        try {
            YtWebViewService.stop(getContext());
            call.resolve(new JSObject().put("closed", true));
        } catch (Exception e) {
            call.reject("Close failed: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // transport
    // ------------------------------------------------------------------

    @PluginMethod
    public void play(PluginCall call) {
        YtWebViewService.cmd("play", 0);
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        YtWebViewService.cmd("pause", 0);
        call.resolve();
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        Integer sec = call.getInt("sec");
        if (sec == null || sec < 0) { call.reject("sec required"); return; }
        YtWebViewService.cmd("seek", sec);
        call.resolve();
    }

    @PluginMethod
    public void loadUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("url required"); return; }
        YtWebViewService.load(url);
        call.resolve();
    }

    @PluginMethod
    public void isActive(PluginCall call) {
        call.resolve(new JSObject().put("active", YtWebViewService.sRunning));
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private boolean hasNotifPermission() {
        try {
            if (Build.VERSION.SDK_INT < 33) return true;
            return getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            return true;
        }
    }
}
