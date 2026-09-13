package expo.modules.roomscan.geometry

/**
 * A plain top-down (X, Z) point/vector, kept deliberately free of any
 * ARCore types so this whole geometry package is unit-testable with
 * plain JVM tests (see src/test/) and doesn't need a device or an
 * ARCore session to exercise - mirrors how the shared TS conversion math
 * (mobile/src/features/roomScanPlacement.ts) is tested the same way on
 * the JS side.
 */
data class Vector2(val x: Float, val z: Float)
