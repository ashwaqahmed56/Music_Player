# 📲 Convert Nova Player to APK — 3 methods

## Method 1 — PWABuilder (easiest, recommended, no Android Studio)

1. **Push this repo to GitHub** (already linked: `https://github.com/ashwaqahmed56/Music_Player`)
2. **Host with HTTPS** (pick one, free):
   - GitHub Pages: repo → Settings → Pages → Deploy from branch → `master`/`main` → `/ (root)` → Save. URL = `https://ashwaqahmed56.github.io/Music_Player/`
   - Or drag this folder to https://app.netlify.com/drop → get `https://xxx.netlify.app`
3. Go to **https://www.pwabuilder.com** → paste your HTTPS URL → **Start** → fix any warnings (icons/manifest already OK) → **Package For Android** → **Download APK / AAB**
4. Transfer APK to phone → tap → **Install** (allow “Install unknown apps” once)
5. For Play Store: upload the `.aab` from the same download.

Requirements: site must be HTTPS + manifest + service worker + icons — all included ✅

## Method 2 — Capacitor (native shell, needs Android Studio + Java)

```powershell
npm.cmd install -g @capacitor/cli
npm.cmd init -y
npm.cmd install @capacitor/core @capacitor/android
npx cap init NovaPlayer com.nova.player --web-dir=.
npx cap add android
npx cap copy
# open in Android Studio:
npx cap open android
# then Build > Build APK(s)
```

## Method 3 — Online wrapper (no hosting needed)
- https://median.co / https://appsgeyser.com / https://gonative.io
- Upload ZIP of this folder or paste hosted URL → Generate APK.

## ✅ Pre-APK checklist
- [ ] Test on PC: play, queue, EQ, sleep, lyrics, upload local MP3, light/dark
- [ ] Test on phone browser first (same URL) — audio + lock-screen controls
- [ ] App name/icon correct (edit `manifest.json` if needed)
- [ ] HTTPS works (PWABuilder score ≥ green)

## 📝 Notes
- Local files added on phone stay on that phone (IndexedDB) — APK behaves the same as browser.
- Demo tracks need internet (stream). Your own uploaded files play offline.
- Signed APK for Play Store: PWABuilder signs it, or use Android Studio → Generate Signed Bundle.
