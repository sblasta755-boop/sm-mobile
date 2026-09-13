package expo.modules.roomscan.geometry

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Snaps nearly-square rooms to actually square, by estimating the room's
 * dominant axis and pulling each wall onto the nearest multiple of 90
 * degrees from it.
 *
 * Rationale: real buildings are overwhelmingly built at right angles,
 * but a fitted scan produces walls at 87.3 and 91.8 degrees. Those are
 * within sensor tolerance yet read as obviously wrong to anyone looking
 * at the result, and the error compounds when two such lines are
 * intersected into a corner. Snapping removes that visible wrongness
 * without pretending to more precision than the scan has.
 *
 * Deliberately conservative in two ways:
 * - Only walls within [SNAP_TOLERANCE_DEG] of a right angle move. A
 *   genuinely angled wall (a bay, a diagonal partition) is further off
 *   than that and is left exactly as measured, rather than being
 *   falsified into a box.
 * - Snapping rotates each wall's direction about its own fitted point,
 *   so a wall's measured POSITION is preserved; only its orientation is
 *   regularised.
 *
 * Pure geometry, no ARCore types - unit-tested in RectilinearTest.kt.
 */
object Rectilinear {
    /** Max angular error, in degrees, that is treated as "this was meant
     * to be a right angle". Walls further off are left alone. Tuned by
     * eye, not against real scan data - the first constant to revisit if
     * genuinely angled walls get falsified (lower it) or wonky rooms
     * fail to square up (raise it). */
    const val SNAP_TOLERANCE_DEG = 12.0

    private const val HALF_PI = PI / 2.0

    /**
     * Estimates the room's dominant axis angle, in radians, within
     * [0, pi/2). Walls vote weighted by their observed extent, since a
     * long wall is a far better estimate of the building's true axis
     * than a short fragment.
     *
     * Angles are folded into a single quadrant first: under a
     * rectilinear assumption a wall at 0, 90, 180 and 270 degrees all
     * describe the SAME axis, so they must reinforce each other rather
     * than cancel out.
     *
     * Averaged as unit vectors at double angle rather than as raw
     * numbers - the standard circular-mean trick, which avoids the
     * wraparound bug where 1 degree and 89 degrees average to 45 instead
     * of the correct 0.
     */
    fun dominantAxisRadians(walls: List<WallFragment>, lines: List<Line2>): Double {
        var sumSin = 0.0
        var sumCos = 0.0
        for (i in lines.indices) {
            val line = lines[i]
            val weight = walls.getOrNull(i)?.let { maxOf(it.extentX, it.extentZ).toDouble() } ?: 1.0
            val angle = atan2(line.direction.z.toDouble(), line.direction.x.toDouble())
            // Fold to a quadrant by quadrupling: angles pi/2 apart map to
            // the same point on the circle.
            sumSin += weight * sin(4.0 * angle)
            sumCos += weight * cos(4.0 * angle)
        }
        if (abs(sumSin) < 1e-12 && abs(sumCos) < 1e-12) return 0.0
        val quadrupled = atan2(sumSin, sumCos)
        var axis = quadrupled / 4.0
        // Normalise into [0, pi/2).
        while (axis < 0.0) axis += HALF_PI
        while (axis >= HALF_PI) axis -= HALF_PI
        return axis
    }

    /**
     * Returns [line] rotated onto the nearest multiple of 90 degrees from
     * [axisRadians], or unchanged when it is further than
     * [SNAP_TOLERANCE_DEG] from any of them.
     *
     * The line's point is preserved, so this changes orientation only.
     */
    fun snapLine(line: Line2, axisRadians: Double, toleranceDeg: Double = SNAP_TOLERANCE_DEG): Line2 {
        val angle = atan2(line.direction.z.toDouble(), line.direction.x.toDouble())
        val relative = angle - axisRadians
        val steps = (relative / HALF_PI).roundToInt()
        val snapped = axisRadians + steps * HALF_PI

        var error = Math.toDegrees(abs(relative - steps * HALF_PI))
        // Fold into [0, 90] - the direction's sign is irrelevant to which
        // line it describes.
        if (error > 90.0) error = 180.0 - error
        if (error > toleranceDeg) return line

        return Line2(line.point, Vector2(cos(snapped).toFloat(), sin(snapped).toFloat()))
    }

    /** Convenience: estimate the axis from the whole wall set, then snap
     * every line against it. */
    fun snapAll(walls: List<WallFragment>, lines: List<Line2>): List<Line2> {
        if (lines.isEmpty()) return lines
        val axis = dominantAxisRadians(walls, lines)
        return lines.map { snapLine(it, axis) }
    }
}
