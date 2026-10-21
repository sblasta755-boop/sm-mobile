// Static settings live in app.json; this only adds what depends on the build
// machine. The Firebase client file is not committed (it is a per-project
// credential): CI decodes it from a secret into ./google-services.json before
// `expo prebuild`, and when it is there Android push (FCM) is wired in. Without
// it the app still builds - it just cannot receive push notifications.
//
// It also sets the app's version from git, so the installed APK reports which
// build it is (Android's versionName) instead of the fixed number in app.json.
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// CI passes APP_VERSION_NAME so the APK, release and email agree; otherwise ask git;
// with no git (a Docker build without .git) keep the number in app.json.
function appVersion(fallback) {
  if (process.env.APP_VERSION_NAME) return process.env.APP_VERSION_NAME;
  try {
    return execSync("git describe --tags --always", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

// Which environment this build is for: dev, qa or prod (the default, so a build
// with no APP_ENV is the normal production app). Non-production builds get their
// own app id and name, so dev, qa and production install side by side on one
// phone and never overwrite each other, and each is a separate app to Android.
// The Firebase file used for a non-production build must be registered under
// the matching id (see docs/ENVIRONMENTS.md).
const APP_ENV = (process.env.APP_ENV || "prod").toLowerCase();
const NON_PROD = APP_ENV !== "prod";
const ID_SUFFIX = NON_PROD ? `.${APP_ENV}` : "";
const NAME_LABEL = NON_PROD ? ` ${APP_ENV.toUpperCase()}` : "";

module.exports = ({ config }) => {
  const hasFirebase = fs.existsSync(path.join(__dirname, "google-services.json"));
  return {
    ...config,
    name: `${config.name}${NAME_LABEL}`,
    // The link scheme is per app too, so two installs never fight over one link.
    scheme: NON_PROD ? `${config.scheme}-${APP_ENV}` : config.scheme,
    version: appVersion(config.version),
    ios: {
      ...config.ios,
      ...(config.ios?.bundleIdentifier ? { bundleIdentifier: `${config.ios.bundleIdentifier}${ID_SUFFIX}` } : {}),
    },
    android: {
      ...config.android,
      package: `${config.android.package}${ID_SUFFIX}`,
      ...(hasFirebase ? { googleServicesFile: "./google-services.json" } : {}),
    },
    extra: { ...config.extra, appEnv: APP_ENV },
  };
};
