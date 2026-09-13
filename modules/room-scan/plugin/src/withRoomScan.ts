import { AndroidConfig, withAndroidManifest, withPodfileProperties, type ConfigPlugin } from "expo/config-plugins";

// RoomPlan needs iOS 16+ (see RoomScan.podspec's s.platforms). This
// bumps the Podfile's deployment target the same way expo-build-
// properties' ios.deploymentTarget option would, without adding that
// whole package as a dependency for one field - RoomScan.podspec's own
// per-pod `s.platforms.ios = '16.0'` already enforces the minimum for
// this pod specifically; this plugin raises the app-wide target too, so
// Xcode doesn't end up building the rest of the app against an older
// target than the one pod it contains actually needs.
//
// NSCameraUsageDescription is already set by the existing expo-camera
// plugin entry in app.json - both RoomPlan and ARCore use that same
// camera permission, nothing new is needed there on either platform.
//
// UNVERIFIED: "ios.deploymentTarget" as the Podfile.properties.json key
// withPodfileProperties writes/reads matches Expo's documented
// convention (the same key expo-build-properties' ios.deploymentTarget
// option sets), but this repo has no committed ios/ directory to confirm
// the Podfile template actually reads this exact key at this Expo SDK
// version - verify with a real `expo prebuild` (or the first real EAS
// dev-client build) before relying on this alone; RoomScan.podspec's own
// per-pod `s.platforms.ios = '16.0'` is the fallback enforcement either
// way, since CocoaPods applies a per-pod platform floor independent of
// the Podfile-wide deployment target.
const MINIMUM_IOS_DEPLOYMENT_TARGET = "16.0";

// The Android module's own AndroidManifest.xml (android/src/main/
// AndroidManifest.xml) already declares both the uses-feature and
// meta-data entries below, and standard Gradle manifest merging pulls
// module manifests into the final app manifest automatically. This
// plugin mod is deliberately REDUNDANT with that - belt-and-suspenders,
// matching the same double-enforcement already established on the iOS
// side (the podspec's per-pod platform floor AND this plugin's Podfile
// bump both exist on purpose, per the comment above). Keep both.
const withRoomScan: ConfigPlugin = (config) => {
  config = withPodfileProperties(config, (podConfig) => {
    const current = podConfig.modResults["ios.deploymentTarget"];
    if (!current || parseFloat(current) < parseFloat(MINIMUM_IOS_DEPLOYMENT_TARGET)) {
      podConfig.modResults["ios.deploymentTarget"] = MINIMUM_IOS_DEPLOYMENT_TARGET;
    }
    return podConfig;
  });

  config = withAndroidManifest(config, (manifestConfig) => {
    const androidManifest = manifestConfig.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    // Real, tested library helper (confirmed via
    // @expo/config-plugins/build/android/Manifest.js) - idempotent, it
    // updates an existing com.google.ar.core meta-data entry rather than
    // duplicating it on a second prebuild.
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      "com.google.ar.core",
      "optional",
    );

    // No equivalent library helper exists for <uses-feature> (checked
    // directly - Manifest.js has no UsesFeature export), so this is
    // hand-written, deduped the same way addMetaDataItemToMainApplication
    // dedupes meta-data, keyed on android:name.
    const manifestRoot = androidManifest.manifest;
    manifestRoot["uses-feature"] = manifestRoot["uses-feature"] ?? [];
    const hasArFeature = manifestRoot["uses-feature"].some(
      (item: any) => item?.$?.["android:name"] === "android.hardware.camera.ar",
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

export default withRoomScan;
