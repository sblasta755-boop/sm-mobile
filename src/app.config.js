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

module.exports = ({ config }) => {
  const hasFirebase = fs.existsSync(path.join(__dirname, "google-services.json"));
  return {
    ...config,
    version: appVersion(config.version),
    android: {
      ...config.android,
      ...(hasFirebase ? { googleServicesFile: "./google-services.json" } : {}),
    },
  };
};
