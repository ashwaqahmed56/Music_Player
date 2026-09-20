# 📲 Nova APK — standalone (Capacitor) + old PWA method

## Recommended: standalone offline APK (free cloud build, no installs)

Your app is now packaged with **Capacitor**: HTML/CSS/JS bundled *inside* a
native Android app. Opens instantly, works fully offline, no browser, no URL.

1. **Upload to GitHub** — all files including `.github/workflows/android.yml`,
   `package.json`, `capacitor.config.json`. Do NOT upload `node_modules`,
   `www`, APKs, or `signing.keystore` (gitignore already blocks them).
2. **Actions tab** → enable workflows if asked → select **Build Nova APK** →
   **Run workflow** (it also runs automatically on every push). Takes ~3–5 min.
3. Open the finished run → **Artifacts** → download **Nova-debug-apk**.
4. Copy the APK to your phone → tap → Install (allow unknown apps once).
5. **Uninstall the old PWABuilder (TWA) version first** — debug builds use a
   different signature, Android won't install over it.

### Make it a signed release with YOUR key (optional, later)
So updates install seamlessly + Play Store accepts it:
1. Repo → Settings → Secrets and variables → Actions → New secret:
   - `KEYSTORE_B64` = base64 of your `signing.keystore`
     (`certutil -encode signing.keystore tmp.txt` on Windows, paste content)
   - `KEY_ALIAS` = `my-key-alias`, `KEYSTORE_PASS` and `KEY_PASS` = `Ngy1Wts7Z6Ml`
     (from your `signing-key-info.txt` — or your own values)
2. In `.github/workflows/android.yml`, change `assembleDebug` → `assembleRelease`
   and add a signing step using those secrets (standard `gradle` signing config),
   artifact path becomes `android/app/build/outputs/apk/release/app-release.apk`.

## Old method: PWABuilder TWA (website wrapper — needs internet)
Only if you want the URL-based version: host on Pages → pwabuilder.com →
paste URL → Package for Android reusing `signing.keystore`. Note: first launch
needs internet and it behaves like a browser tab without `assetlinks.json`
hosted (`.well-known/assetlinks.json` + `.nojekyll` in this repo fix that).
