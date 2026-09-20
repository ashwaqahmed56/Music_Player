# 🎧 Nova Music Player

Full-featured music player that runs on **PC (browser)** today and installs on **mobile as an APK** tomorrow — no rewrite needed.

## ✨ All options included
- ▶ Play / pause / next / previous, seek bar, time display
- 🔊 Volume, mute
- 🔀 Shuffle, 🔁 Repeat off / all / one
- 📃 Queue (play next, add to queue, reorder-ish, clear, shuffle queue)
- ❤️ Favorites, 🕘 Recently played, 🔥 Most played, 📊 Stats
- 🎶 Playlists (create / rename / delete / add songs)
- 🔍 Search, filter (demo / local / liked), sort (title, artist, duration, plays, recent)
- 📁 Local files: upload button + drag & drop, MP3/WAV/OGG/M4A/FLAC/WEBM, saved in IndexedDB (persists after reload)
- 🎚️ 5-band Equalizer + presets + preamp + balance (Web Audio API)
- ⏩ Speed 0.5×–2×, crossfade 0–8s, gapless toggle
- 😴 Sleep timer (5/10/15/30/60 min with fade-out)
- 📝 Per-song lyrics editor
- 🎨 Dark / light theme, 8 accent colors
- 📊 Live visualizer (mini bar + fullscreen)
- ⛶ Fullscreen Now-Playing (swipe left/right = next/prev)
- ⌨️ Keyboard shortcuts, headset / lock-screen controls (Media Session API)
- 📲 PWA installable, offline via service worker
- ⬇ Export / ⬆ Import library backup (JSON)

## 🖥️ Test on PC (2 options)

**Option A — double click (quickest):**
1. Open folder `Music_Player`
2. Double-click `index.html` (or `start-pc.bat`)

**Option B — local server (recommended, enables PWA + service worker):**
```bat
start-pc.bat
```
or manually:
```powershell
python -m http.server 8000
# then open http://localhost:8000
```

Demo songs (10 SoundHelix tracks) play instantly. Click **＋ Add Music** to add your own files.

## 📲 Install as APK on mobile

Full step-by-step in **[BUILD-APK.md](BUILD-APK.md)**. Fastest path:

1. Host this folder free (GitHub Pages / Netlify / Vercel) — must be **HTTPS**
2. Go to **https://www.pwabuilder.com** → paste your HTTPS URL → **Package for Android** → download `.apk`
3. Copy APK to phone → install (allow unknown sources)

No code change needed — `manifest.json` + `sw.js` + icons are already included.

## 📁 Files
| File | What |
|---|---|
| `index.html` | UI shell |
| `styles.css` | Dark/light responsive theme |
| `app.js` | Full player engine |
| `manifest.json` | PWA install config |
| `sw.js` | Offline cache |
| `icon.svg` / `icon-*.png` | App icons |
| `BUILD-APK.md` | APK guide (3 methods) |
| `start-pc.bat` | 1-click PC launch |

## 🔒 Privacy
Everything stays on-device (localStorage + IndexedDB). Only demo MP3s stream from soundhelix.com. No tracking.
