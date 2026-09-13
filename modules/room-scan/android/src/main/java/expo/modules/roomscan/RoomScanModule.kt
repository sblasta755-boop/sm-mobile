package expo.modules.roomscan

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * UNVERIFIED ON A REAL DEVICE - see RoomScanView.kt's own header comment
 * for the full caveat. Written against ARCore's and Expo Modules'
 * documented Kotlin API surface; never built or run against a real
 * Android project (this repo has no committed android/ directory - it's
 * generated on demand via `expo prebuild`, which has not been run here).
 *
 * Mirrors ios/RoomScanModule.swift's shape exactly - Name("RoomScan"),
 * an isSupported() async function, and a View with the same three
 * events and one prop - so the JS side (index.ts) needs no per-platform
 * branching beyond Platform.OS itself.
 */
class RoomScanModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RoomScan")

    // Collapses ArCoreApk's richer availability states into the same
    // simple boolean iOS's RoomCaptureSession.isSupported already is -
    // see ArCoreAvailability's own doc comment for the product-decision
    // rationale (no install-prompt state machine in v1).
    AsyncFunction("isSupported") {
      appContext.reactContext?.let { ArCoreAvailability.isSupportedAndInstalled(it) } ?: false
    }

    View(RoomScanView::class) {
      // onScanProgress is Android-only in practice - iOS's RoomCaptureView
      // renders Apple's own live overlay and never emits it - but the JS
      // prop is optional, so the shared contract stays identical.
      Events("onCaptureFinished", "onCaptureError", "onCaptureCancelled", "onScanProgress")

      Prop("isActive") { view: RoomScanView, isActive: Boolean ->
        if (isActive) view.startSession() else view.stopSession()
      }
    }
  }
}
