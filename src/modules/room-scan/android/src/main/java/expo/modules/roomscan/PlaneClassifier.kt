package expo.modules.roomscan

import com.google.ar.core.Plane

/**
 * The single definition of "is this plane a wall we will actually use".
 *
 * Deliberately shared between the ingest path (RoomScanView, which
 * decides what goes into the room outline) and the overlay renderer
 * (PlaneOverlayRenderer, which decides what to paint as a wall). These
 * two answering differently is a user-visible bug: a surface highlighted
 * as a wall that never increments the wall count reads as the feature
 * being broken.
 *
 * Both thresholds are tuned by eye against ARCore's documented
 * behaviour, NOT against real scan data - they are the first things to
 * revisit if real walls are missed or furniture still leaks in.
 */
object PlaneClassifier {
  /** Max |world Y| of a plane's own up-axis for it to count as a wall -
   * about 20 degrees off true vertical. ARCore types a surface VERTICAL
   * from its own orientation, but a large flat object caught at an angle
   * (a desk edge, a chair back, a partition) is routinely typed VERTICAL
   * while sitting well off upright; those dragged the fitted outline
   * badly off true. */
  const val VERTICALITY_MAX_Y = 0.34f

  /** Smallest side length, in metres, for a vertical plane to be treated
   * as architecture rather than furniture. A genuinely narrow wall
   * between two doorways could be excluded by this. */
  const val MIN_WALL_EXTENT_METERS = 0.8f

  fun isUsableWall(plane: Plane): Boolean {
    if (plane.type != Plane.Type.VERTICAL) return false
    if (maxOf(plane.extentX, plane.extentZ) < MIN_WALL_EXTENT_METERS) return false
    val up = plane.centerPose.rotateVector(floatArrayOf(0f, 1f, 0f))
    return kotlin.math.abs(up[1]) < VERTICALITY_MAX_Y
  }
}
