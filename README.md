# Ash's Player (v3 Terra — standalone offline app)

Warm, simple offline music player. Flat paper/espresso surfaces, one clay accent
(plus moss/ochre/slate/plum), serif headlines — rebuilt layout, zero glow,
zero gradients, zero AI-slop. A **real standalone APK**: app files live *inside*
the app — opens instantly with **zero internet**.

## What's inside
- **Home** — greeting, search, Popular Songs, playlists, recently played
- **New** — latest additions + Add Music (newest/oldest)
- **Radio** — endless shuffle mix (proper on/off state, no longer stuck on)
- **Library** — Songs / Folders / Playlists / Liked, A–Z sorting
- **Folder import** — pick files, a folder, or scan a whole folder; songs stay
  grouped with counts + total time, play-all/shuffle queues the rest, remove
  folder anytime; duplicate imports are skipped
- Full player — big art, seek + volume, shuffle/repeat, lyrics, EQ, sleep, queue
- Equalizer (applies from next song, so it can never mute playback), lyrics,
  sleep timer with volume fade restore, favorites, backup export/import
- Theme: Dark / Light / System + 6 accent colors (Oto-style)
- **Online song search** (needs internet) — Home search → Online tab searches the
  iTunes catalog, plays 30s previews in-app, saves previews offline via ⋮ menu
- **Web lyrics** — open Lyrics on any song → Fetch from web (lyrics.ovh, free)
- **Fully offline** — your songs play without internet (demo songs need internet;
  everything you add works offline)
- Everything stays on your device (IndexedDB + localStorage)

## 🖥️ Test on PC
Double-click `start-pc.bat` → `http://localhost:8000` (phone-size column is normal).

## Android notes
- **Adding a whole folder:** Android has no direct folder-scan API, so Add →
  first option opens the system picker — navigate into your music folder and tap
  **Select all** (or tick songs). Imports group by folder automatically.
- **Lock-screen / background controls:** on by default (Settings → Notifications).
  On Android 13+ tap **Allow** when it asks for notification permission, otherwise
  nothing can appear on the lock screen. If controls show MISSING in Settings,
  rebuild + reinstall the APK so the plugin syncs.

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
