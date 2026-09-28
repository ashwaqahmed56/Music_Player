# Ash's Player (offline-first music app)

Simple offline music player with an aqua glacier look — ice blue, deep teal
and black, sliding screens, chart ranks, a spinning-vinyl player and an
animated brand mark. A **real standalone APK**: app files live *inside* the
app — opens instantly with **zero internet**.

## What's inside
- **Home** — greeting, search with results overlay, popular tracks, playlists,
  recently played
- **Search that stays out of the way** — Home search opens its own results
  (songs, albums, artists); Songs and Library have their own independent search.
  Typing in one place never rearranges another.
- **Songs** — full list loads at once, latest additions + Add Music
  (newest/oldest), multi-select for bulk delete and playlist building
- **Mix** — endless shuffle mix with live queue
- **Library** — Playlists / Folders with counts and total time
- Battery-friendly: lists repaint only when the library changes, animations
  rest while paused, background work trickles in quietly
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
- Motion everywhere: rows slide out on delete, fresh imports slide in, jump
  targets flash, tabs slide by direction, play button pops on like
- **Multi-select in Songs** — Select button, tick songs, then Delete them all
  at once or drop them straight into a playlist
- Equalizer (applies from next song), sleep timer with volume fade restore,
  favorites, backup export/import
- Theme follows the system by default (Dark / Light / System), accent tuned per theme
- Lock-screen + background controls (Android notification with custom icons,
  album art, working seek bar and progress — notification updates in place,
  never flickers)
- **Fully offline** — everything stays on your device

## 🖥️ Test on PC
Double-click `start-pc.bat` → `http://localhost:8000` (phone-size column is normal).

## 🌐 Online tab — free full-length streaming
Three free providers are queried at once and merged, with a provider badge per row.

| Provider | Key | Plays | Notes |
|---|---|---|---|
| **YouTube** | free Data API v3 key | official IFrame player | Mainstream catalogue, full length. ~100 searches/day |
| **Audius** | none | direct stream | Unlimited, no quota, can be saved offline |
| **Internet Archive** | none | direct stream | Public-domain / CC, unlimited |

- **Set your key** → `providers/config.js` → `YOUTUBE_API_KEY`
  (Google Cloud Console → enable *YouTube Data API v3* → Credentials → API key;
  no card needed, 10,000 units/day, `search.list` = 100 units).
- Results are cached for 6h, so repeating a search costs **zero** quota.
- If no key is set, a feature-flagged keyless Invidious search is used as a
  fallback — unreliable by nature, never a hard dependency.
- YouTube tracks play in Google's own player (chrome stays visible). Nothing is
  hidden, no ads are blocked and no stream URL is ever extracted.
- `••• → Save offline` works for Audius tracks (goes to *Online Saves*).

### ▶️ Play in the background (Android)
`plugins/yt-bgr` embeds the **official** YouTube site in a WebView owned by a
`mediaPlayback` foreground service, so audio keeps playing with the app
backgrounded or the screen off — with lock-screen controls.

- **Open YouTube** button on the Online tab, or **Play in background** while an
  IFrame track is playing (hands the video off to the WebView module).
- While it is active your app's own notification stands down, so the lock screen
  never shows two players. Closing it restores your normal controls.
- Requires notification permission on Android 13+.

> The WebView module and the IFrame player must never run at the same time —
> the app enforces this by taking over the MediaSession in only one direction at
> a time.

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

> **Uploading dot-folders:** GitHub's web upload sometimes hides `.github` and
> `.nojekyll`. If they don't appear after drag-drop: repo → Add file →
> Create new file → type `.github/workflows/android.yml` → paste the file
> content → Commit. Same trick for `.nojekyll` if needed.

## Files (upload them all)
`index.html` · `styles.css` · `app.js` · `ytbgr.js` · `online.js` · `providers/` ·
`package.json` · `capacitor.config.json` ·
`.github/workflows/android.yml` · `manifest.json` · `sw.js` · icons ·
`.nojekyll` · `.gitignore` · `plugins/` · `assets/icon.png` · `README.md` · `BUILD-APK.md` · `start-pc.bat`

Never upload: `node_modules/` · `www/` · `android/` · `*.apk` · `*.keystore`
