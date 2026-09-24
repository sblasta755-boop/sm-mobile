import ExpoModulesCore
import RoomPlan
import simd

// Hosts Apple's own RoomCaptureView - a fully-rendered AR session UI with
// its own live camera feed, real-time wall/door/window overlays, and
// built-in "Done"/"Cancel" chrome drawn directly by RoomPlan. This class's
// job is narrow: start/stop the session, and on a successful capture,
// convert CapturedRoom's wall geometry into a flat, JS-serializable
// top-down polygon (meters, arbitrary local origin) for the Expo screen
// to place on the site_layout canvas - see scan.tsx's conversion math
// (meters -> normalized 0-1 canvas coordinates, per the plan's metric-
// scale-anchor design).
//
// UNVERIFIED ON A REAL DEVICE - see RoomScanModule.swift's header
// comment. The CapturedRoom -> polygon projection below (in particular,
// which of CapturedRoom.Surface's transform components map to a
// top-down X/Z floor plane) is written against Apple's documented
// RoomPlan API shape but has not been exercised against a real capture
// result. Treat it as needing verification, not as proven-correct.
class RoomScanView: ExpoView {
  private var captureView: RoomCaptureView?
  private var captureSession: RoomCaptureSession?
  private var isSessionRunning = false

  let onCaptureFinished = EventDispatcher()
  let onCaptureError = EventDispatcher()
  let onCaptureCancelled = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setUpCaptureView()
  }

  private func setUpCaptureView() {
    guard RoomCaptureSession.isSupported else { return }
    let view = RoomCaptureView(frame: bounds)
    view.captureSession.delegate = self
    view.delegate = self
    view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(view)
    NSLayoutConstraint.activate([
      view.topAnchor.constraint(equalTo: topAnchor),
      view.bottomAnchor.constraint(equalTo: bottomAnchor),
      view.leadingAnchor.constraint(equalTo: leadingAnchor),
      view.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
    captureView = view
    captureSession = view.captureSession
  }

  func startSession() {
    guard !isSessionRunning, let captureView else {
      if RoomCaptureSession.isSupported == false {
        onCaptureError(["message": "RoomPlan is not supported on this device."])
      }
      return
    }
    let configuration = RoomCaptureSession.Configuration()
    captureView.captureSession.run(configuration: configuration)
    isSessionRunning = true
  }

  func stopSession() {
    guard isSessionRunning else { return }
    captureView?.captureSession.stop()
    isSessionRunning = false
  }
}

extension RoomScanView: RoomCaptureViewDelegate {
  // Apple's own "should we keep the result" hook, fired when the user
  // taps RoomCaptureView's built-in Done button. Returning true accepts
  // the capture and lets RoomCaptureSessionDelegate below fire with the
  // final CapturedRoom.
  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
    if let error {
      onCaptureError(["message": error.localizedDescription])
      isSessionRunning = false
      return false
    }
    return true
  }

  func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
    isSessionRunning = false
    if let error {
      onCaptureError(["message": error.localizedDescription])
      return
    }
    emitCapturedRoom(processedResult)
  }
}

extension RoomScanView: RoomCaptureSessionDelegate {
  func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
    isSessionRunning = false
    if let error {
      onCaptureError(["message": error.localizedDescription])
    }
    // The final, human-approved result arrives via
    // RoomCaptureViewDelegate.captureView(didPresent:error:) above, not
    // here - this delegate method fires on raw session end (including a
    // user-initiated stop before confirming), so it's used only for the
    // error/cancellation path, not for emitting a result.
  }
}

private extension RoomScanView {
  /// Projects CapturedRoom's wall surfaces to a single, ordered top-down
  /// polygon in meters (arbitrary local origin - RoomPlan has no
  /// absolute in-building reference frame). RoomPlan's walls are not
  /// inherently ordered into one loop, so this builds one from each
  /// wall's own transform + width - a lower-fidelity approximation of
  /// the room's true perimeter, sufficient for the site_layout canvas's
  /// "draw the room shape roughly to scale" use, not a CAD-accurate
  /// trace. A future pass could instead walk CapturedRoom.walls'
  /// confidence-weighted corner points directly.
  func emitCapturedRoom(_ room: CapturedRoom) {
    let corners = perimeterCorners(from: room)
    guard corners.count >= 3 else {
      onCaptureError(["message": "Could not determine this room's shape from the scan."])
      return
    }
    let xs = corners.map { $0.x }
    let zs = corners.map { $0.z }
    let widthMeters = Double((xs.max() ?? 0) - (xs.min() ?? 0))
    let lengthMeters = Double((zs.max() ?? 0) - (zs.min() ?? 0))
    let points = corners.map { ["x": Double($0.x), "y": Double($0.z)] }

    onCaptureFinished([
      "points": points,
      "widthMeters": widthMeters,
      "lengthMeters": lengthMeters,
    ])
  }

  /// Each wall's transform column 3 (translation) gives its center in
  /// room-local meters; walls are ordered by their position around the
  /// room's centroid to approximate a perimeter loop. RoomPlan's
  /// coordinate space is right-handed with Y up, so a top-down floor
  /// outline uses each wall's (X, Z).
  func perimeterCorners(from room: CapturedRoom) -> [SIMD3<Float>] {
    let centers = room.walls.map { wall -> SIMD3<Float> in
      let t = wall.transform.columns.3
      return SIMD3<Float>(t.x, t.y, t.z)
    }
    guard centers.count >= 3 else { return centers }
    let centroid = centers.reduce(SIMD3<Float>(0, 0, 0), +) / Float(centers.count)
    return centers.sorted { a, b in
      let angleA = atan2(a.z - centroid.z, a.x - centroid.x)
      let angleB = atan2(b.z - centroid.z, b.x - centroid.x)
      return angleA < angleB
    }
  }
}
