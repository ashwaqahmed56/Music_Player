# Ash's Player APK — standalone (Capacitor)

## Recommended: standalone offline APK (free cloud build, no installs)

Your app is packaged with **Capacitor**: HTML/CSS/JS bundled *inside* a native
Android app (`com.ashs.player`). Opens instantly, works fully offline.

1. **Push to GitHub** — all files including `.github/workflows/android.yml`,
   `package.json`, `capacitor.config.json`. Do NOT upload `node_modules`,
   `www`, `android`, APKs, or `signing.keystore` (gitignore already blocks them).
2. **Actions tab** → enable workflows if asked → select **Build Ash's Player APK** →
   **Run workflow** (also auto-runs on every push to master/main). Takes ~3–5 min.
   Workflow uses pinned `actions/*@v4` (v6/v7 do not exist and will fail).
3. Open the finished run → **Artifacts** → download **Ashs-Player-apk**.
4. Copy the APK to your phone → tap → Install (allow unknown apps once).
5. **Uninstall the old PWABuilder (TWA) version first** — the app id changed from
   `io.github.ashwaqahmed56.twa` to `com.ashs.player` and debug builds use a
   different signature, so Android won't install over it.

### Make it a signed release with YOUR key (optional, later)
So updates install seamlessly + Play Store accepts it:
1. Repo → Settings → Secrets and variables → Actions → New secret:
   - `KEYSTORE_B64` = base64 of your `signing.keystore`
     (`certutil -encode signing.keystore tmp.txt` on Windows, paste content)
   - `KEY_ALIAS` = `my-key-alias`, `KEYSTORE_PASS` and `KEY_PASS` = the passwords you chose when creating the keystore
     (from your `signing-key-info.txt` — or your own values)
2. In `.github/workflows/android.yml`, change `assembleDebug` → `assembleRelease`
   and add a signing step using those secrets (standard `gradle` signing config),
   artifact path becomes `android/app/build/outputs/apk/release/app-release.apk`.

