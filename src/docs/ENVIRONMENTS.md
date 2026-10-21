# Mobile environments: dev, qa and production

One push builds one environment's app, chosen by the branch. See `.github/workflows/build-apk-local.yml`.

| Branch | Environment | Installs as | App id |
|---|---|---|---|
| `dev` (or `develop`) | dev | Šoma360 DEV | `za.co.smartclean.mobile.dev` |
| `qa` | qa | Šoma360 QA | `za.co.smartclean.mobile.qa` |
| `subscription` or `main` | production | Šoma360 | `za.co.smartclean.mobile` (unchanged) |

Because the ids differ, all three can be installed on one phone at once. Each talks to its own backend and has its own data, sign-in and update releases. A build cannot be switched to another environment afterwards: the server address is fixed when it is built, so promoting qa to production means building from the production branch.

Non-production builds also carry the environment in their version name (for example `dev-build-19-...`), in their release name (`dev-build-42`) and in their link scheme (`smartclean-dev`).

## How the app is told which environment it is
The workflow sets `APP_ENV` (`dev`, `qa` or `prod`). `src/app.config.js` reads it to set the name, id and scheme. With no `APP_ENV` the result is the normal production app, so local builds are unaffected.

## One-time setup

### 1. GitHub Environments
In the mobile repository: Settings, Environments. Create `dev`, `qa` and `production`.

Give each environment the same names with its own values:

| Name | Type | Value for that environment |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | variable | The environment's backend address, ending in `/api/v1` |
| `RELEASES_REPO` | variable | The public releases repository for that environment (use a separate repository per environment, or the same one, since release names differ) |
| `APP_RELEASE_TOKEN` | secret | Must equal that environment's backend `APP_RELEASE_TOKEN` |
| `GOOGLE_SERVICES_JSON_BASE64` | secret | The Firebase client file that includes that environment's app id (see below) |
| `MAIL_TO` | variable | Optional: who gets the download email |

Shared across all three (repository level is fine): the signing keystore secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), `RELEASES_REPO_TOKEN` and the mail settings.

### 2. Firebase (push notifications)
In the Firebase project, add the extra Android apps `za.co.smartclean.mobile.dev` and `za.co.smartclean.mobile.qa`. Download a `google-services.json` for each. The file for a build must include that build's id; the workflow fails with a clear message if it does not. A single file that contains all three apps also works.

If you skip this, the build still succeeds but cannot receive push notifications.

### 3. Backends
Each environment's backend needs its own `APP_RELEASE_TOKEN`. See `backend/src/docs/ENVIRONMENTS.md`.

## What the pipeline does
1. Picks the environment from the branch (or from the manual "Run workflow" choice).
2. Builds and signs the APK with the same keystore for every environment.
3. Publishes it as a release named `build-<number>` for production, or `dev-build-<number>` and `qa-build-<number>` for the others.
4. Registers the build with that environment's backend, so the in-app update prompt only offers a build to people on the same environment.

## Limits
- Android only.
- Dev and qa builds are installed from the release link, like production.
