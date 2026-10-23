package com.ingageco.capacitormusiccontrols;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;

import java.io.BufferedInputStream;
import java.io.Closeable;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Loads a cover image once per URL and hands the same Bitmap out to every caller
 *  (the notification and the media session need it at the same time). All network
 *  reads are time-boxed so a dead host can never hang the JS thread indefinitely. */
final class CoverCache {
  private static volatile String lastUrl = null;
  private static volatile Bitmap lastBitmap = null;

  static synchronized Bitmap load(Context context, String coverURL) {
    if (coverURL == null || coverURL.isEmpty()) return null;
    if (coverURL.equals(lastUrl) && lastBitmap != null) return lastBitmap;
    Bitmap b;
    try {
      if (coverURL.matches("^(https?|ftp)://.*$")) b = fromUrl(coverURL);
      else b = fromLocal(context, coverURL);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
    if (b != null) { lastUrl = coverURL; lastBitmap = b; }
    return b;
  }

  private static Bitmap fromUrl(String url) throws Exception {
    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
    c.setDoInput(true);
    c.setConnectTimeout(8000);
    c.setReadTimeout(15000);
    c.connect();
    InputStream in = null;
    try {
      in = c.getInputStream();
      return BitmapFactory.decodeStream(in);
    } finally {
      close(in);
      c.disconnect();
    }
  }

  private static Bitmap fromLocal(Context context, String localURL) throws Exception {
    try {
      InputStream in = new BufferedInputStream(new FileInputStream(Uri.parse(localURL).getPath()));
      try { return BitmapFactory.decodeStream(in); } finally { close(in); }
    } catch (Exception ex) {
      InputStream in = new BufferedInputStream(context.getAssets().open("public/" + localURL));
      try { return BitmapFactory.decodeStream(in); } finally { close(in); }
    }
  }

  private static void close(Closeable c) { try { if (c != null) c.close(); } catch (Exception ignored) {} }
}
