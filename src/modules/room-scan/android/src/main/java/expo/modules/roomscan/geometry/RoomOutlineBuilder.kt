package expo.modules.roomscan.geometry

import kotlin.math.atan2

/**
 * Turns a set of merged wall fragments (WallAccumulator.finalizeWalls's
 * output) into a single closed room polygon, in two explicit, separate
 * steps - unlike the iOS RoomPlan module, where a wall's center IS the
 * corner in one step (see RoomScanView.swift's perimeterCorners):
 *
 * 1. ORDERING - decide the sequence/adjacency of walls around the loop,
 *    by angle-sorting wall centers around their centroid (the same
 *    centroid/atan2 trick perimeterCorners uses, but here it ONLY
 *    decides order, not the corner geometry itself).
 * 2. LINE-FITTING - fit a line per wall, by total least squares over the
 *    wall's full observed boundary where available
 *    (LineFit.fromWallFragment), falling back to centre+normal only when
 *    no boundary was captured.
 * 3. RECTILINEAR SNAPPING - pull walls that are nearly square onto exact
 *    right angles about the room's own estimated dominant axis (see
 *    Rectilinear); genuinely angled walls are left untouched.
 * 4. CORNER-DERIVING - for each adjacent pair in that order, intersect
 *    the two fitted lines (LineFit.intersect) for the true shared corner
 *    - materially sharper than "the wall's center is the corner."
 *
 * Free of ARCore types, unit-testable with synthetic WallFragment values
 * built by hand - see src/test/.../RoomOutlineBuilderTest.kt.
 */
object RoomOutlineBuilder {
    sealed class Result {
        data class Success(
            val points: List<Vector2>,
            val widthMeters: Float,
            val lengthMeters: Float,
        ) : Result()

        data class Failure(val message: String) : Result()
    }

    private const val MIN_WALLS = 3

    /**
     * @param snapToRightAngles regularise nearly-square rooms to exactly
     *   square (see Rectilinear). On by default because real rooms are
     *   overwhelmingly rectilinear; exposed so tests can exercise the
     *   raw fitted geometry directly.
     */
    fun build(walls: List<WallFragment>, snapToRightAngles: Boolean = true): Result {
        if (walls.size < MIN_WALLS) {
            return Result.Failure(
                "Could not detect enough walls - keep scanning slowly around the whole room.",
            )
        }

        // STEP 1: ordering only - this does not touch corner geometry.
        val centroidX = walls.map { it.centerX }.average().toFloat()
        val centroidZ = walls.map { it.centerZ }.average().toFloat()
        val ordered = walls.sortedBy { wall ->
            atan2((wall.centerZ - centroidZ).toDouble(), (wall.centerX - centroidX).toDouble())
        }

        // STEP 2: fit each wall's line, preferring a total-least-squares
        // fit over its full observed boundary (LineFit.fromWallFragment)
        // rather than deriving orientation from the noisy plane normal.
        val fitted = ordered.map { LineFit.fromWallFragment(it) }

        // STEP 3: regularise to right angles. Real buildings are
        // overwhelmingly rectilinear, and a wall fitted at 88.7 degrees
        // reads as wrong even when it is within sensor tolerance - the
        // error also compounds once two such lines are intersected.
        // Conservative by construction: only walls already close to a
        // right angle move, so genuinely angled walls survive intact.
        val lines = if (snapToRightAngles) Rectilinear.snapAll(ordered, fitted) else fitted

        // STEP 4: corner-deriving via true line intersection, with a
        // documented, deliberate per-corner fallback - see the class
        // doc below for the justification.
        val corners = mutableListOf<Vector2>()
        var fallbackCount = 0
        for (i in ordered.indices) {
            val wallA = ordered[i]
            val wallB = ordered[(i + 1) % ordered.size]
            val lineA = lines[i]
            val lineB = lines[(i + 1) % lines.size]
            val intersection = LineFit.intersect(lineA, lineB)
            if (intersection != null) {
                corners.add(intersection)
            } else {
                // Fallback DESIGN (see rationale below): degrade this ONE
                // corner to the midpoint between the two wall centers,
                // rather than failing the entire scan over one bad
                // corner in an otherwise-good outline.
                corners.add(Vector2((wallA.centerX + wallB.centerX) / 2f, (wallA.centerZ + wallB.centerZ) / 2f))
                fallbackCount++
            }
        }

        // If MOST corners needed the fallback, the scan itself is too
        // degenerate to trust as a room outline at all - fail loudly
        // here rather than emit a near-meaningless polygon. This
        // threshold (more than half) is a pragmatic starting point that
        // needs real-scan calibration, not a validated constant.
        if (fallbackCount > corners.size / 2) {
            return Result.Failure(
                "Could not confidently determine this room's corners. Try scanning again, moving slowly along each wall.",
            )
        }

        val xs = corners.map { it.x }
        val zs = corners.map { it.z }
        val width = xs.max() - xs.min()
        val length = zs.max() - zs.min()
        return Result.Success(corners, width, length)
    }
}

/*
 * Fallback design justification (why per-corner degrade, not whole-scan
 * failure, on a single bad intersection):
 *
 * - Matches the philosophy the iOS module already establishes:
 *   perimeterCorners itself is an approximation (centroid-sorted wall
 *   centers), explicitly not CAD-accurate - see that function's own doc
 *   comment. One degenerate corner in an otherwise-good scan shouldn't
 *   discard real, useful data for the other resolved corners.
 * - The shared TS conversion math (roomScanPlacement.ts's
 *   convertRoomScanToLayout) only needs a plausible closed polygon with
 *   sane width/length - it does not require every corner to be
 *   geometrically perfect.
 * - Total-scan failure is reserved for when the whole result would be
 *   meaningless: fewer than MIN_WALLS resolved at all, or a MAJORITY of
 *   corners needed the fallback - mirroring iOS's own
 *   `corners.count >= 3` all-or-nothing gate, but extended with a
 *   severity threshold since this pipeline can partially degrade in a
 *   way iOS's simpler approach cannot.
 */
