"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("expo/config-plugins");

// Hand-compiled from ../src/withRoomScan.ts - see that file for the full
// comment/rationale. This repo has no expo-module-scripts build step
// wired up to compile it automatically (no ios/ or android/ dir,
// nothing runs `expo-module build` today), so the two files are kept in
// sync by hand. If a real build pipeline for local modules is added
// later, regenerate this file from the TS source instead of hand-editing
// both.
const MINIMUM_IOS_DEPLOYMENT_TARGET = "16.0";

const withRoomScan = (config) => {
  config = (0, config_plugins_1.withPodfileProperties)(config, (podConfig) => {
    const current = podConfig.modResults["ios.deploymentTarget"];
    if (!current || parseFloat(current) < parseFloat(MINIMUM_IOS_DEPLOYMENT_TARGET)) {
      podConfig.modResults["ios.deploymentTarget"] = MINIMUM_IOS_DEPLOYMENT_TARGET;
    }
    return podConfig;
  });

  config = (0, config_plugins_1.withAndroidManifest)(config, (manifestConfig) => {
    const androidManifest = manifestConfig.modResults;
    const mainApplication = config_plugins_1.AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    config_plugins_1.AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      "com.google.ar.core",
      "optional",
    );

    const manifestRoot = androidManifest.manifest;
    manifestRoot["uses-feature"] = manifestRoot["uses-feature"] ?? [];
    const hasArFeature = manifestRoot["uses-feature"].some(
      (item) => item && item.$ && item.$["android:name"] === "android.hardware.camera.ar",
    );
    if (!hasArFeature) {
      manifestRoot["uses-feature"].push({
        $: { "android:name": "android.hardware.camera.ar", "android:required": "false" },
      });
    }

    return manifestConfig;
  });

  return config;
};

exports.default = withRoomScan;
