# 🎧 Nova Music Player (v2 — neon mobile edition)

Simple, mobile-first music player. Dark neon design, 4 tabs, nothing confusing.

## ✨ What's inside
- 🏠 **Home** — greeting, search, Popular Songs cards, playlists, recently played
- ✨ **New** — latest additions + Add Music button
- 📻 **Radio** — endless shuffle mix, tap once and it keeps playing
- 🎶 **Library** — Songs / Playlists / ♥ Liked + Add Music
- ▶ Full player — big art, progress, shuffle/repeat, volume, lyrics, EQ, sleep timer, queue
- 🎚️ Equalizer with presets, 📝 lyrics, 😴 sleep timer, ☆ favorites, 🎶 playlists
- 📁 Your own MP3/WAV/OGG/M4A files (saved on-device, play offline)
- 📲 PWA + APK ready, 🔒 everything stays on your device

## 🖥️ Test on PC
Double-click `start-pc.bat`, open `http://localhost:8000` (page shows a phone-size column — that's normal).

## 📲 Build / update the APK
1. Upload all files to GitHub (drag-drop), including `.well-known/assetlinks.json` and `.nojekyll`
2. Enable Pages (`master` / root) → `https://ashwaqahmed56.github.io/Music_Player/`
3. **Important:** host `assetlinks.json` so the app opens fullscreen with no browser bar (the `.well-known` folder + `.nojekyll` do this)
4. PWABuilder → paste URL → **Package for Android** → reuse your existing `signing.keystore` (passwords in `signing-key-info.txt`) so the new version installs as an **update** instead of a separate app
5. Install the new APK on your phone (keep the keystore backed up forever)

## 📁 Files
`index.html` · `styles.css` · `app.js` · `manifest.json` · `sw.js` · `icon.svg` · `icon-192.png` · `icon-512.png` · `.well-known/assetlinks.json` · `.nojekyll` · `BUILD-APK.md` · `start-pc.bat`
