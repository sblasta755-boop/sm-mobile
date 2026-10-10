// Static settings live in app.json; this only adds what depends on the build
// machine. The Firebase client file is not committed (it is a per-project
// credential): CI decodes it from a secret into ./google-services.json before
// `expo prebuild`, and when it is there Android push (FCM) is wired in. Without
// it the app still builds - it just cannot receive push notifications.
const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const hasFirebase = fs.existsSync(path.join(__dirname, "google-services.json"));
  return {
    ...config,
    android: {
      ...config.android,
      ...(hasFirebase ? { googleServicesFile: "./google-services.json" } : {}),
    },
  };
};
