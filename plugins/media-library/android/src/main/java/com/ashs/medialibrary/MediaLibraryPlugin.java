package com.ashs.medialibrary;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;

/**
 * Lists on-device music via MediaStore — no file copying, no manual picking.
 * Stable track keys (MediaStore row ids) keep likes/playlists working.
 */
@CapacitorPlugin(
    name = "MediaLibrary",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_MEDIA_AUDIO }, alias = MediaLibraryPlugin.ALIAS_AUDIO),
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = MediaLibraryPlugin.ALIAS_STORAGE)
    }
)
public class MediaLibraryPlugin extends Plugin {

    static final String ALIAS_AUDIO = "mediaAudio";
    static final String ALIAS_STORAGE = "mediaStorage";

    private String audioAlias() {
        return Build.VERSION.SDK_INT >= 33 ? ALIAS_AUDIO : ALIAS_STORAGE;
    }

    @PluginMethod
    public void listAudio(PluginCall call) {
        try {
            // If already granted this resolves straight to the callback with no dialog.
            requestPermissionForAlias(audioAlias(), call, "audioPermsCallback");
        } catch (Exception e) {
            call.reject("Scan failed: " + e.getMessage());
        }
    }

    @PermissionCallback
    private void audioPermsCallback(PluginCall call) {
        try {
            sendAudio(call);
        } catch (SecurityException se) {
            call.reject("Permission denied");
        } catch (Exception e) {
            call.reject("Scan failed: " + e.getMessage());
        }
    }

    private void sendAudio(PluginCall call) {
        Integer optLimit = call.getInt("limit");
        int limit = (optLimit == null || optLimit <= 0) ? 3000 : Math.min(optLimit, 5000);
        Context ctx = getContext();
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        boolean modern = Build.VERSION.SDK_INT >= 29;
        String pathCol = modern
            ? MediaStore.Audio.Media.RELATIVE_PATH
            : MediaStore.Audio.Media.DATA;
        String[] projection = new String[] {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DISPLAY_NAME,
            pathCol
        };
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        JSArray out = new JSArray();
        Cursor cursor = null;
        try {
            cursor = ctx.getContentResolver().query(
                collection, projection, selection, null,
                MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC");
            if (cursor == null) {
                call.reject("Media query failed");
                return;
            }
            int cId = cursor.getColumnIndex(MediaStore.Audio.Media._ID);
            int cTitle = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
            int cArtist = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
            int cAlbum = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
            int cDur = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
            int cName = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
            int cPath = cursor.getColumnIndex(pathCol);
            while (cursor.moveToNext() && out.length() < limit) {
                long id = cId >= 0 ? cursor.getLong(cId) : -1;
                if (id < 0) continue;
                String name = str(cursor, cName, "");
                String title = str(cursor, cTitle, "");
                if (title.isEmpty() && !name.isEmpty()) {
                    int dot = name.lastIndexOf('.');
                    title = dot > 0 ? name.substring(0, dot) : name;
                }
                Uri uri = ContentUris.withAppendedId(collection, id);
                JSObject o = new JSObject();
                o.put("mid", String.valueOf(id));
                o.put("title", title);
                o.put("artist", str(cursor, cArtist, ""));
                o.put("album", str(cursor, cAlbum, ""));
                long durMs = 0;
                try { durMs = cDur >= 0 ? cursor.getLong(cDur) : 0; } catch (Exception ignored) {}
                o.put("duration", durMs > 0 ? (int) (durMs / 1000) : 0);
                o.put("name", name);
                o.put("folder", folderOf(cursor, cPath, modern));
                o.put("uri", uri.toString());
                out.put(o);
            }
        } catch (Exception e) {
            call.reject("Scan failed: " + e.getMessage());
            return;
        } finally {
            if (cursor != null) {
                try { cursor.close(); } catch (Exception ignored) {}
            }
        }
        JSObject ret = new JSObject();
        ret.put("tracks", out);
        call.resolve(ret);
    }

    private String str(Cursor c, int col, String fb) {
        try {
            if (col < 0) return fb;
            String v = c.getString(col);
            if (v == null || v.trim().isEmpty()) return fb;
            return v.trim();
        } catch (Exception e) {
            return fb;
        }
    }

    private String folderOf(Cursor c, int col, boolean modern) {
        try {
            String p = col >= 0 ? c.getString(col) : null;
            if (p == null || p.isEmpty()) return "Device Music";
            if (modern) {
                // RELATIVE_PATH looks like "Music/My Folder/"
                String[] parts = p.split("/");
                for (int i = parts.length - 1; i >= 0; i--) {
                    if (!parts[i].trim().isEmpty()) return parts[i].trim();
                }
                return "Device Music";
            }
            // Pre-29: full file path in DATA column
            File f = new File(p).getParentFile();
            if (f != null && f.getName() != null && !f.getName().isEmpty()) return f.getName();
            return "Device Music";
        } catch (Exception e) {
            return "Device Music";
        }
    }
}
