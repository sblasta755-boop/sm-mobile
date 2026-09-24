import ExpoModulesCore
import RoomPlan

// Wraps Apple's RoomPlan framework (iOS 16+, A12-chip-or-later - see
// RoomCaptureSession.isSupported below) for the site_layout feature.
// Android has no first-party equivalent to RoomPlan; this module is
// iOS-only by design, see expo-module.config.json's platforms list.
//
// UNVERIFIED ON A REAL DEVICE. RoomCaptureSession depends on live ARKit
// camera/motion tracking and does not run in the iOS Simulator - there is
// no way to exercise this module's actual scanning behavior without a
// physical A12+ device walking a real room. This file is written against
// Apple's public RoomPlan API surface as documented, but has not been
// built or run. Treat the whole module as a first draft that needs real
// device verification before shipping - see the plan doc's Phase 4 notes.
public class RoomScanModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RoomScan")

    // Backs isRoomPlanSupported() in index.ts - the device/OS capability
    // gate. RoomCaptureSession.isSupported is false on the Simulator, on
    // iOS < 16, and on pre-A12 devices.
    AsyncFunction("isSupported") { () -> Bool in
      RoomCaptureSession.isSupported
    }

    View(RoomScanView.self) {
      // onScanProgress is declared but never fired on iOS: RoomCaptureView
      // draws Apple's own live wall overlay and coaching UI, so there is
      // nothing for a JS-side progress panel to add here. It stays in this
      // list because the shared JS contract (index.ts) always passes the
      // prop, and Expo's view manager rejects an event prop it has no
      // registered name for - omitting it would make an Android-only
      // feature break the iOS view.
      Events("onCaptureFinished", "onCaptureError", "onCaptureCancelled", "onScanProgress")

      // Imperative "stop and finish" trigger from JS - see RoomScanView's
      // stopSession(). Exposed as a prop rather than a method because
      // Expo Modules' View component wiring is prop-driven; the JS side
      // toggles a boolean to signal "the user tapped Done/Cancel".
      Prop("isActive") { (view: RoomScanView, isActive: Bool) in
        if isActive {
          view.startSession()
        } else {
          view.stopSession()
        }
      }
    }
  }
}
