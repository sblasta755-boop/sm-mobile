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

- The APK's version text (Android Settings, release title, email, profile footer) is `git describe --tags --always`, e.g. `build-19-27-g08e33b9`: the last `build-N` release tag, commits since, and the commit. `src/app.config.js` sets it; without git it falls back to the number in `app.json`. Install order still comes from the build number (`versionCode`).

- Only `arm64-v8a` and `armeabi-v7a` are built (virtually all phones; smaller and faster).
  Add `x86_64` in the workflow's `-PreactNativeArchitectures` for emulators.
- iOS can't be built this way (needs macOS + Apple signing).

## 4. Push notifications (Firebase) - one-time setup

Push has two halves. The build handles one automatically; the other is a one-time upload.

**A. In the APK (automatic):** the app needs Firebase's *client* file `google-services.json`.

1. Firebase console → your project → Project settings → *Your apps* → add an **Android** app
   with package name `za.co.smartclean.mobile` (if not already there).
2. Download its `google-services.json`, then `base64 -w0 google-services.json`.
3. Add it as repository secret **`GOOGLE_SERVICES_JSON_BASE64`**.

The workflow decodes it, checks it is the right kind of file for the right package, and wires it
into the build. Without the secret the APK still builds, with a warning, but gets no push.

**B. Sending (once, outside the pipeline):** the backend sends through Expo's push service, which
needs the Firebase *service-account* key for the same project:

1. Firebase console → Project settings → Service accounts → *Generate new private key*
   (this is the `...firebase-adminsdk...json` file - **never commit it or put it in a secret that
   reaches the app**; it is a different file from `google-services.json`).
2. expo.dev → your project → Credentials → Android → *FCM V1 service account key* → upload it.

This is stored in your Expo account, not the repo, so it does not repeat per build.

## 5. Download email

After a successful build the workflow publishes the APK as a GitHub release (`build-<run number>`)
and emails the link with the version, branch, commit and whether push is enabled.
Add repository **variables** (Settings → Secrets and variables → Actions → Variables) and secrets:

| Type | Name | Notes |
|---|---|---|
| Variable | `MAIL_TO` | recipient(s), comma-separated. **Unset = no email** (warning only) |
| Variable | `EMAIL_PROVIDER` | `smtp` (default) or `brevo` |
| Variable | `MAIL_FROM` | SMTP only, e.g. `Šoma360 <builds@yourdomain>` |
| Secret / Variable | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` / `SMTP_PORT`, `SMTP_SECURE` | SMTP only |
| Secret / Variable | `BREVO_API_KEY` / `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME` | Brevo only |

These are the same names the EAS workflow and the backend use, so existing values work as-is.

If the repository is **private**, the link asks the recipient to sign in to GitHub (they need
access to the repo). For a link that opens for anyone, the APK would have to be hosted elsewhere
(e.g. an S3/R2 bucket) - not done here.
