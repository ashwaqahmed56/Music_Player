package com.ashs.ytbgr;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;

/**
 * Full-screen host for the WebView that the foreground service owns.
 *
 * On resume it re-parents the WebView into this Activity and points the
 * MutableContextWrapper at the Activity so the page can use native dialogs.
 * On pause it detaches the WebView and resets the base context to the
 * application. It NEVER calls WebView.onPause() - that is what lets the
 * official player's audio continue in the background with the screen off.
 */
public class YtPlayerActivity extends Activity {

    private FrameLayout container;
    private boolean attached = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_yt_player);

        container = findViewById(R.id.ytContainer);
        Button close = findViewById(R.id.ytClose);

        if (close != null) {
            close.setOnClickListener(v -> {
                // Only leaves the UI. The service keeps playing so audio
                // continues; the notification's Stop action ends playback.
                finish();
            });
        }

        // The service owns the WebView. Make sure it exists.
        if (YtWebViewService.sWebView == null) {
            String url = getIntent() != null ? getIntent().getStringExtra("url") : null;
            if (url == null) url = YtWebViewService.sLastUrl;
            YtWebViewService.open(getApplicationContext(),
                url != null ? url : YtWebViewService.DEFAULT_URL, false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        attachWebView();
    }

    @Override
    protected void onPause() {
        detachWebView();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        detachWebView();
        super.onDestroy();
    }

    private void attachWebView() {
        if (attached) return;
        WebView wv = YtWebViewService.sWebView;
        if (wv == null || container == null) return;
        try {
            YtWebViewService.attach(wv, YtWebViewService.sContextWrapper, container);
            attached = true;
        } catch (Exception e) {
            attached = false;
        }
    }

    private void detachWebView() {
        if (!attached) return;
        try {
            YtWebViewService.detach(YtWebViewService.sWebView,
                YtWebViewService.sContextWrapper, getApplicationContext());
        } catch (Exception ignored) {}
        attached = false;
    }

    @Override
    public void onBackPressed() {
        WebView wv = YtWebViewService.sWebView;
        try {
            if (wv != null && wv.canGoBack()) {
                wv.goBack();
                return;
            }
        } catch (Exception ignored) {}
        super.onBackPressed();
    }
}
