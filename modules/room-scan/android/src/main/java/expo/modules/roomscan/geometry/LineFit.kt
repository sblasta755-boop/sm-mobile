package expo.modules.roomscan.geometry

import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sqrt

/** An infinite 2D line: a point on the line plus a unit direction
 * vector. Chosen over slope-intercept specifically because a wall can
 * run at any orientation, including exactly vertical in the (X, Z)
 * plane, which slope-intercept can't represent without a special case -
 * point+direction handles every orientation uniformly. */
data class Line2(val point: Vector2, val direction: Vector2)

/**
 * Fits a line per wall and intersects adjacent walls' lines for true
 * corner points - the "true corner intersection" design (vs. the
 * cheaper wall-center-as-corner approximation the iOS RoomPlan module
 * uses, see RoomScanView.swift's perimeterCorners). Kept free of ARCore
 * types so it's unit-testable in plain JVM tests - see
 * src/test/.../LineFitTest.kt.
 */
object LineFit {
    /**
     * Fits the line a wall runs along, preferring a total-least-squares
     * fit over the wall's full observed boundary
     * ([WallFragment.boundaryPoints]) and falling back to the
     * centre+normal construction when no boundary is available.
     *
     * Why the boundary fit matters: the fallback derives the wall's
     * entire orientation from ARCore's reported plane normal, which is
     * the noisiest quantity in the pipeline - a couple of degrees of
     * normal error swings the fitted corner position by tens of
     * centimetres once two such lines are intersected. Fitting to every
     * observed boundary point averages that noise down instead of
     * trusting a single sample of it.
     *
     * Fewer than [MIN_FIT_POINTS] points cannot outperform the normal
     * (two points define a line exactly, noise included), so those also
     * take the fallback.
     */
    fun fromWallFragment(wall: WallFragment): Line2 {
        fitBoundary(wall.boundaryPoints)?.let { return it }
        return fromCenterAndNormal(wall)
    }

    /** The original v1 construction, kept as the documented fallback for
     * fragments with no usable boundary (hand-built test fixtures, and
     * any plane ARCore reports without a polygon). */
    fun fromCenterAndNormal(wall: WallFragment): Line2 {
        // The wall's direction (the line it actually runs along) is
        // perpendicular to its outward normal, in the same (X, Z) plane.
        val dirX = -wall.normalZ
        val dirZ = wall.normalX
        val len = hypot(dirX.toDouble(), dirZ.toDouble()).toFloat().coerceAtLeast(0.0001f)
        return Line2(Vector2(wall.centerX, wall.centerZ), Vector2(dirX / len, dirZ / len))
    }

    /**
     * Total least squares (orthogonal regression) over a point set, via
     * the principal eigenvector of its 2x2 covariance matrix.
     *
     * Ordinary least squares minimises vertical residuals and therefore
     * cannot represent a wall running parallel to the Z axis; TLS
     * minimises PERPENDICULAR distance and is orientation-independent,
     * which is required here because walls run at arbitrary angles.
     *
     * The 2x2 symmetric eigenvector is solved in closed form rather than
     * iteratively - for a symmetric [[a, b], [b, c]] the principal
     * direction follows directly from the larger eigenvalue.
     *
     * Returns null when the points cannot define a direction: too few
     * points, or a degenerate cloud with no dominant axis (all points
     * effectively coincident).
     */
    fun fitBoundary(points: List<Vector2>): Line2? {
        if (points.size < MIN_FIT_POINTS) return null

        val n = points.size.toDouble()
        val meanX = points.sumOf { it.x.toDouble() } / n
        val meanZ = points.sumOf { it.z.toDouble() } / n

        // Covariance matrix [[sxx, sxz], [sxz, szz]].
        var sxx = 0.0
        var szz = 0.0
        var sxz = 0.0
        for (p in points) {
            val dx = p.x - meanX
            val dz = p.z - meanZ
            sxx += dx * dx
            szz += dz * dz
            sxz += dx * dz
        }
        sxx /= n
        szz /= n
        sxz /= n

        // A cloud with no spread at all has no meaningful direction.
        if (sxx + szz < DEGENERATE_VARIANCE) return null

        // Larger eigenvalue of the symmetric 2x2, in closed form.
        val trace = sxx + szz
        val diff = sxx - szz
        val discriminant = sqrt(diff * diff + 4.0 * sxz * sxz)
        val majorEigenvalue = (trace + discriminant) / 2.0

        // Principal eigenvector. Both rows of (C - lambda*I) are
        // proportional to the normal, so either yields the direction;
        // pick whichever row is numerically larger to avoid cancellation
        // when one is near zero.
        val rowA = Pair(majorEigenvalue - szz, sxz)
        val rowB = Pair(sxz, majorEigenvalue - sxx)
        val (dirX, dirZ) = if (hypot(rowA.first, rowA.second) >= hypot(rowB.first, rowB.second)) {
            rowA
        } else {
            rowB
        }

        val len = hypot(dirX, dirZ)
        if (len < DEGENERATE_DIRECTION) return null

        return Line2(
            Vector2(meanX.toFloat(), meanZ.toFloat()),
            Vector2((dirX / len).toFloat(), (dirZ / len).toFloat()),
        )
    }

    /** Two points define a line exactly - including any noise in them -
     * so a boundary fit only beats the normal-derived line with more. */
    private const val MIN_FIT_POINTS = 3
    private const val DEGENERATE_VARIANCE = 1e-10
    private const val DEGENERATE_DIRECTION = 1e-9

    /**
     * True 2D line-line intersection (infinite lines, not line
     * segments - matching the "true corner intersection" decision).
     * Returns null for parallel or near-parallel lines, which callers
     * MUST handle - see RoomOutlineBuilder's per-corner fallback.
     *
     * parallelToleranceDeg guards against a numerically "solvable" but
     * practically meaningless intersection far outside the room when two
     * walls are nearly, but not exactly, parallel (a common real-scan
     * situation from tracking noise, not just genuinely parallel walls).
     */
    fun intersect(a: Line2, b: Line2, parallelToleranceDeg: Double = 3.0): Vector2? {
        val cross = a.direction.x * b.direction.z - a.direction.z * b.direction.x
        if (abs(cross) < 1e-4f) return null // exactly (or almost exactly) parallel

        val dot = (a.direction.x * b.direction.x + a.direction.z * b.direction.z).coerceIn(-1f, 1f)
        val angleBetweenDeg = Math.toDegrees(acos(dot.toDouble()))
        // Two direction vectors pointing "the same way" vs. "opposite
        // ways" along the same line both count as parallel for our
        // purposes - fold the angle into [0, 90].
        val normalizedAngleDeg = min(angleBetweenDeg, 180.0 - angleBetweenDeg)
        if (normalizedAngleDeg < parallelToleranceDeg) return null

        // Solve a.point + t*a.direction == b.point + s*b.direction for t,
        // via Cramer's rule on the 2x2 system.
        val dx = b.point.x - a.point.x
        val dz = b.point.z - a.point.z
        val t = (dx * b.direction.z - dz * b.direction.x) / cross
        return Vector2(a.point.x + t * a.direction.x, a.point.z + t * a.direction.z)
    }
}
