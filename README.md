# 🎧 Ash's Player (v2.1 — standalone offline app)

Simple, mobile-first music player. Now a **real standalone APK**: app files live
*inside* the app — it opens instantly with **zero internet**.

## ✨ What's inside
- 🏠 **Home** — greeting, search, Popular Songs, playlists, recently played
- ✨ **New** — latest additions + Add Music
- 📻 **Radio** — endless shuffle mix
- 🎶 **Library** — Songs / 📁 Folders / Playlists / ♥ Liked
- 📁 **Folder import** — pick a whole folder, its songs stay grouped separately
  with counts + total time, play-all/shuffle per folder, remove folder anytime
- ▶ Full player — big art, progress, shuffle/repeat, volume, lyrics, EQ, sleep, queue
- 🎚️ Equalizer, 📝 lyrics, 😴 sleep timer, ☆ favorites
- 📴 **Fully offline** — your songs play without internet (📶 badge = demo songs
  that need internet; everything you add works offline)
- 🔒 Everything stays on your device

## 🖥️ Test on PC
Double-click `start-pc.bat` → `http://localhost:8000` (phone-size column is normal).

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
