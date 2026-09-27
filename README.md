# Ash's Player (v3 Terra — offline-first music app)

Warm, simple offline music player. Flat paper/espresso surfaces, one clay accent
(plus moss/ochre/slate/plum), serif headlines — zero glow, zero gradients,
zero AI-slop. Device library inspired by [Lotus](https://github.com/dn0ne/lotus):
your whole phone library, no ticking files one by one. A **real standalone APK**:
app files live *inside* the app — opens instantly with **zero internet**.

## What's inside
- **Home** — greeting, search, Popular Songs, playlists, recently played
- **New** — latest additions + Add Music (newest/oldest)
- **Radio** — endless shuffle mix (proper on/off state, no longer stuck on)
- **Library** — Songs / Albums / Artists / Folders / Playlists / Liked (Lotus-style
  browse), A–Z sorting, long lists load in pages (no more freezes with 700+ songs)
- **Scan device music (Android)** — one tap finds every song on the phone via
  the system media library, grouped by folder. Nothing is copied or deleted;
  likes/playlists just work. Needs the fresh APK build + music permission.
- **Manual import** — pick files or a folder (PC/PWA); big picks import with
  live progress, durations fill in quietly afterwards, duplicates skipped
- Full player — big art, seek + volume, shuffle/repeat, plain + synced lyrics,
  EQ, sleep, reorderable queue
- **Synced lyrics** (Lotus-style via free LRCLIB) — Lyrics → Fetch synced lyrics,
  lines highlight live as the song plays, cached offline forever after one fetch
- Reorder queue + playlist songs with ↑ ↓; edit title/artist/album tags per song
- Equalizer (applies from next song, so it can never mute playback), lyrics,
  sleep timer with volume fade restore, favorites, backup export/import
- Theme: Dark / Light / System + earthy accent colors
- Lock-screen + background controls (Android notification)
- **Fully offline** — everything stays on your device (IndexedDB + localStorage)

## 🖥️ Test on PC
Double-click `start-pc.bat` → `http://localhost:8000` (phone-size column is normal).

## Android notes
- **Adding music:** Add → **Scan device music** finds everything at once
  (allow music access when asked). Manual pick still works for anything missed.
- **Lock-screen / background controls:** on by default (Settings → Notifications).
  On Android 13+ tap **Allow** when it asks for notification permission, otherwise
  nothing can show on the lock screen. Settings → Diagnostics shows song counts,
  plugin status and the last error if anything misbehaves.

## 📲 Get the standalone APK (free, no Android Studio)
1. Upload **all** files to GitHub (including the `.github` folder — see note below).
   **Never** upload `node_modules`, `www`, APKs or `signing.keystore`.
  2. Repo → **Actions** tab → enable workflows → run **"Build Ash's Player APK"**
   (also auto-runs on every push). ~3–5 min.
  3. Download the **Ashs-Player-apk** artifact → copy to phone → install.
   - Uninstall the old PWABuilder version first (different signature).
   - To keep the Play-Store key later: add your `signing.keystore` as repo
     secrets and switch the workflow to `assembleRelease` (see BUILD-APK.md).

> **Uploading dot-folders:** GitHub's web upload sometimes hides `.github` /
> `.well-known`. If they don't appear after drag-drop: repo → Add file →
> Create new file → type `.github/workflows/android.yml` → paste the file
> content → Commit. Same trick for `.well-known/assetlinks.json` and `.nojekyll`.

## 📁 Files
`index.html` · `styles.css` · `app.js` · `package.json` · `capacitor.config.json` ·
`.github/workflows/android.yml` · `manifest.json` · `sw.js` · icons ·
`.well-known/assetlinks.json` · `.nojekyll` · `BUILD-APK.md` · `start-pc.bat`
