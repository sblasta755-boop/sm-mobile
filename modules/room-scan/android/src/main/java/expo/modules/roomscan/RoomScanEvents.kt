package expo.modules.roomscan

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Wire shape for onCaptureFinished - confirmed via CommonEvents.kt
 * (expo-camera's own Android event classes) that Expo Modules events are
 * typed Record subclasses with @Field-annotated properties, not raw
 * Map<String, Any> - this corrects an earlier planning-stage assumption
 * before it was ever written as real code. */
class RoomScanCapturedPointRecord(
  @Field val x: Float,
  @Field val y: Float,
) : Record

class RoomScanCaptureFinishedEvent(
  @Field val points: List<RoomScanCapturedPointRecord>,
  @Field val widthMeters: Float,
  @Field val lengthMeters: Float,
) : Record

class RoomScanCaptureErrorEvent(
  @Field val message: String,
) : Record

/**
 * Live mid-scan feedback, emitted while the session runs so the UI can
 * show that something is actually happening and what has been found so
 * far. Android-only by nature: iOS's RoomCaptureView draws Apple's own
 * live wall overlay and never emits this (see index.ts, where the prop
 * is optional for exactly that reason).
 *
 * [tracking] mirrors ARCore's own camera TrackingState/failure reason,
 * collapsed to a small closed set of strings the JS side switches on:
 * "tracking"      - everything is working, planes are being found
 * "initializing"  - session started, ARCore has not localized yet
 * "excessive_motion" - user is moving the phone too fast
 * "insufficient_light" - too dark to track
 * "insufficient_features" - blank/featureless surfaces, nothing to lock onto
 * "paused"        - tracking stopped for some other/unknown reason
 */
class RoomScanProgressEvent(
  @Field val wallCount: Int,
  @Field val tracking: String,
  /** Surfaces ARCore is currently tracking that are NOT walls (floors,
   * desks). Reported so the UI can tell the difference between "the
   * session sees nothing at all" (point somewhere with more detail) and
   * "the session is working, it just has not resolved a wall yet" (keep
   * aiming at the wall) - two states that otherwise look identical to a
   * user watching a wall count stuck at zero. */
  @Field val otherSurfaceCount: Int,
) : Record
