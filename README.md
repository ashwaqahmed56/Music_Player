# Ash's Player (offline-first music app)

Simple offline music player with a warm paper/espresso look, earthy accents and
serif headlines. A **real standalone APK**: app files live *inside* the app —
opens instantly with **zero internet**.

## What's inside
- **Home** — greeting, search with results overlay, popular tracks, playlists,
  recently played
- **Search that stays out of the way** — Home search opens its own results
  (songs, albums, artists); Songs and Library have their own independent search.
  Typing in one place never rearranges another.
- **Songs** — latest additions + Add Music (newest/oldest)
- **Mix** — endless shuffle mix with live queue
- **Library** — Songs / Albums / Artists / Folders / Playlists / Liked,
  A–Z sorting, long lists load in pages (no freezes with 700+ songs)
- **Scan device music (Android)** — one tap finds every song on the phone,
  grouped by folder, with album art filled in afterwards. Nothing is copied or
  deleted; likes/playlists just work. Needs music permission.
- **Manual import** — pick files or a folder (PC/PWA); big picks import with
  live progress, durations fill in quietly afterwards, duplicates skipped
- Full player — big art with ambient glow, seek + volume, shuffle/repeat,
  plain + synced lyrics, EQ, sleep, reorderable queue
- **Gestures** — swipe sideways for next/previous song, swipe down to close,
  swipe the mini player to skip. Sliders and buttons never trigger them.
- **Synced lyrics** — Lyrics → Fetch synced lyrics, lines highlight live as the
  song plays, cached offline forever after one fetch
- Reorder queue + playlist songs with ↑ ↓; edit title/artist/album tags per song
- Equalizer (applies from next song), sleep timer with volume fade restore,
  favorites, backup export/import
- Theme follows the system by default (Dark / Light / System) + accent colors
- Lock-screen + background controls (Android notification)
- **Fully offline** — everything stays on your device

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
