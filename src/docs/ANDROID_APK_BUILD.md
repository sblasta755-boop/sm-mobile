# Building the Android APK on GitHub (no Expo account)
 
`.github/workflows/build-apk-local.yml` builds a signed release APK on every push to
`main` or `subscription` (or manually: Actions → *Build signed Android APK* → Run workflow).
Download it from the run's **Artifacts** section (kept 30 days).

The workflow runs `expo prebuild` and Gradle on GitHub's runner. No Expo/EAS account or
token is used, and nothing large runs on your PC. (The older `build-apk.yml` EAS workflow is
separate; disable it in the Actions tab if you no longer want it.)

## 1. Generate a release keystore (once)

Needs a JDK (`keytool`). Run anywhere, **outside the repo**:

```bash
keytool -genkeypair -v \
  -keystore soma360-release.jks \
  -alias soma360 \
  -keyalg RSA -keysize 2048 -validity 10000
```

You will be asked for a keystore password, a key password, and your name/organisation.
Remember the **alias** (`soma360` above) and both passwords.

> **Back this file up somewhere safe (password manager, private drive).** Every future
> update of the app must be signed with the same key. If you lose it, users must uninstall
> and reinstall (and a Play Store listing can't be updated). `*.jks` is git-ignored; never
> commit it.

## 2. Add the GitHub secrets

Repo → Settings → Secrets and variables → Actions.

Encode the keystore as one line:

```bash
base64 -w0 soma360-release.jks        # Linux
base64 -i soma360-release.jks | tr -d '\n'   # macOS
```

| Type | Name | Value |
|---|---|---|
| Secret | `ANDROID_KEYSTORE_BASE64` | output of the command above |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| Secret | `ANDROID_KEY_ALIAS` | `soma360` (your alias) |
| Secret | `ANDROID_KEY_PASSWORD` | key password (same as the keystore one if you let keytool reuse it) |
| Variable | `EXPO_PUBLIC_API_BASE_URL` | e.g. `https://api.example.com/api/v1` (baked into the app) |

The build fails early with a clear message if a secret is missing.

## 3. Push

Pushing to `main`/`subscription` starts the build (~10–15 min). The APK's `versionCode` is
the workflow run number, so each build can be installed over the previous one.

## Notes

- Only `arm64-v8a` and `armeabi-v7a` are built (virtually all phones; smaller and faster).
  Add `x86_64` in the workflow's `-PreactNativeArchitectures` for emulators.
- Android push notifications need Firebase (`google-services.json`); the app config has none
  today, so FCM push isn't set up by this build.
- iOS can't be built this way (needs macOS + Apple signing).
