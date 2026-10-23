# Ash's Player (offline-first music app)

A standalone Android APK (Capacitor) — your music lives **inside** the app,
so it opens instantly and works with **zero internet**. Aurora dark-glass UI
whose colors shift to match each song.

## Features
- **Offline library** — scan your phone's music in one tap (or import files/folders
  on PC). Nothing is copied or deleted; everything stays on your device.
- **Per-track color plates** — the accent, gradients and glow re-tint to match
  the album art of whatever is playing.
- **Liked Music** — a ready-made collection in Songs that gathers every song
  you ♥, always up to date.
- **Player** — big art with ambient glow, seek + volume, shuffle/repeat,
  synced lyrics (fetched Hindi lyrics are shown in Hinglish automatically),
  equalizer, sleep timer, reorderable queue.
- **Mini player** — persistent now-playing bar with live progress; controls stay
  in sync everywhere (notification, lock screen, mini bar, full player).
- **Mix** — an endless shuffle mix of your own library.
- **Playlists & folders** in Library, favorites, recents, backup export/import.
- **Gestures** — swipe the player for next/previous, swipe the mini player to skip.
- Dark / Light / System theme.

## Test on PC
Double-click `start-pc.bat` → `http://localhost:8000`. Syntax check: `npm run check`.

## Build the APK
1. Upload the whole project to GitHub — **everything except** `node_modules/`,
   `www/`, `android/`, `refrence/`, APKs and keystores.
2. Actions → **"Build Ash's Player APK"** (runs on every push; ~3–5 min).
3. Download the `Ashs-Player-apk` artifact → copy to phone → install.

Details, signing and troubleshooting: see `BUILD-APK.md`.
