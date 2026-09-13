package expo.modules.roomscan.geometry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import kotlin.math.sqrt

class LineFitTest {

    private fun wall(centerX: Float, centerZ: Float, normalX: Float, normalZ: Float): WallFragment {
        // Normalize the given normal so callers can pass convenient
        // non-unit vectors (e.g. (1, 0)) without doing the math by hand.
        val len = sqrt((normalX * normalX + normalZ * normalZ).toDouble()).toFloat().coerceAtLeast(0.0001f)
        return WallFragment(
            planeId = 0,
            centerX = centerX,
            centerZ = centerZ,
            normalX = normalX / len,
            normalZ = normalZ / len,
            extentX = 1f,
            extentZ = 1f,
        )
    }

    @Test
    fun `fromWallFragment produces a unit-length direction perpendicular to the normal`() {
        val line = LineFit.fromWallFragment(wall(0f, 0f, 1f, 0f))
        val len = sqrt((line.direction.x * line.direction.x + line.direction.z * line.direction.z).toDouble())
        assertEquals(1.0, len, 1e-4)
        // direction dot normal should be ~0 (perpendicular)
        val dot = line.direction.x * 1f + line.direction.z * 0f
        assertEquals(0.0, dot.toDouble(), 1e-4)
    }

    @Test
    fun `intersect finds a clean 90-degree corner between two perpendicular walls`() {
        // Wall A: runs along Z, facing +X, centered at (2, 0) -> its own
        // line is the vertical line x = 2.
        val lineA = LineFit.fromWallFragment(wall(2f, 0f, 1f, 0f))
        // Wall B: runs along X, facing +Z, centered at (0, 3) -> its own
        // line is the horizontal line z = 3.
        val lineB = LineFit.fromWallFragment(wall(0f, 3f, 0f, 1f))

        val corner = LineFit.intersect(lineA, lineB)

        assertNotNull(corner)
        assertEquals(2.0, corner!!.x.toDouble(), 1e-3)
        assertEquals(3.0, corner.z.toDouble(), 1e-3)
    }

    @Test
    fun `intersect finds a corner between two walls at an oblique angle`() {
        // Wall A: vertical line x = 1.
        val lineA = LineFit.fromWallFragment(wall(1f, 0f, 1f, 0f))
        // Wall B: a wall whose normal points diagonally (not axis-aligned).
        val lineB = LineFit.fromWallFragment(wall(0f, 0f, 1f, 1f))

        val corner = LineFit.intersect(lineA, lineB)

        assertNotNull(corner)
        // Wall B's line passes through (0,0) with direction (-1,1)/sqrt(2)
        // (perpendicular to normal (1,1)) - at x=1, z must be -1.
        assertEquals(1.0, corner!!.x.toDouble(), 1e-3)
        assertEquals(-1.0, corner.z.toDouble(), 1e-3)
    }

    @Test
    fun `intersect returns null for parallel walls`() {
        val lineA = LineFit.fromWallFragment(wall(0f, 0f, 1f, 0f))
        val lineB = LineFit.fromWallFragment(wall(5f, 0f, 1f, 0f)) // same normal, offset

        assertNull(LineFit.intersect(lineA, lineB))
    }

    @Test
    fun `intersect returns null for near-parallel walls within tolerance`() {
        val lineA = LineFit.fromWallFragment(wall(0f, 0f, 1f, 0f))
        // A normal just barely off-axis (~1 degree) should still count as
        // "parallel enough" given the default 3-degree tolerance.
        val nearlyParallelNormal = wall(5f, 0f, 1f, 0.017f) // atan(0.017) ~ 1 degree
        val lineB = LineFit.fromWallFragment(nearlyParallelNormal)

        assertNull(LineFit.intersect(lineA, lineB))
    }

    @Test
    fun `intersect returns null for coincident lines without dividing by zero`() {
        val lineA = LineFit.fromWallFragment(wall(0f, 0f, 1f, 0f))
        val lineB = LineFit.fromWallFragment(wall(0f, 0f, 1f, 0f))

        assertNull(LineFit.intersect(lineA, lineB))
    }

    // --- Total-least-squares boundary fitting ---

    /** Direction is sign-agnostic: a line along +X is the same line as
     * one along -X, so compare the absolute dot product against 1. */
    private fun assertParallel(expectedX: Float, expectedZ: Float, actual: Vector2, tolerance: Double = 1e-3) {
        val dot = (expectedX * actual.x + expectedZ * actual.z).toDouble()
        assertEquals(1.0, kotlin.math.abs(dot), tolerance)
    }

    @Test
    fun `fitBoundary recovers a clean axis-aligned line`() {
        val points = (0..10).map { Vector2(it * 0.5f, 3f) }
        val line = LineFit.fitBoundary(points)!!
        assertParallel(1f, 0f, line.direction)
        // Passes through the centroid, so z stays on the line.
        assertEquals(3.0, line.point.z.toDouble(), 1e-4)
    }

    /** The case ordinary least squares cannot represent at all: a line
     * parallel to the Z axis has infinite slope. TLS handles it because
     * it minimises perpendicular, not vertical, distance. */
    @Test
    fun `fitBoundary handles a vertical line that slope-intercept cannot`() {
        val points = (0..10).map { Vector2(-2f, it * 0.4f) }
        val line = LineFit.fitBoundary(points)!!
        assertParallel(0f, 1f, line.direction)
        assertEquals(-2.0, line.point.x.toDouble(), 1e-4)
    }

    @Test
    fun `fitBoundary recovers a diagonal line`() {
        val points = (0..10).map { Vector2(it.toFloat(), it.toFloat()) }
        val line = LineFit.fitBoundary(points)!!
        val inv = (1.0 / kotlin.math.sqrt(2.0)).toFloat()
        assertParallel(inv, inv, line.direction)
    }

    /** The actual point of the change: symmetric noise must average out,
     * leaving the fit far closer to truth than any single sample. */
    @Test
    fun `fitBoundary averages out symmetric noise`() {
        val points = (0..20).map { i ->
            val jitter = if (i % 2 == 0) 0.02f else -0.02f
            Vector2(i * 0.25f, 5f + jitter)
        }
        val line = LineFit.fitBoundary(points)!!
        assertParallel(1f, 0f, line.direction, tolerance = 1e-2)
        assertEquals(5.0, line.point.z.toDouble(), 1e-3)
    }

    @Test
    fun `fitBoundary returns null for too few points`() {
        assertNull(LineFit.fitBoundary(emptyList()))
        assertNull(LineFit.fitBoundary(listOf(Vector2(0f, 0f))))
        assertNull(LineFit.fitBoundary(listOf(Vector2(0f, 0f), Vector2(1f, 1f))))
    }

    @Test
    fun `fitBoundary returns null for coincident points with no direction`() {
        assertNull(LineFit.fitBoundary(List(8) { Vector2(2f, 2f) }))
    }

    /** A fragment carrying a boundary must use it; one without must
     * still work via the centre+normal fallback. */
    @Test
    fun `fromWallFragment prefers the boundary fit and falls back cleanly`() {
        val withoutBoundary = WallFragment(
            planeId = 1,
            centerX = 0f, centerZ = 0f,
            normalX = 0f, normalZ = 1f,
            extentX = 2f, extentZ = 2f,
        )
        assertParallel(1f, 0f, LineFit.fromWallFragment(withoutBoundary).direction)

        // Boundary runs along Z while the (deliberately wrong) normal
        // implies a line along X - proving the boundary wins.
        val withBoundary = withoutBoundary.copy(
            boundaryPoints = (0..8).map { Vector2(4f, it * 0.3f) },
        )
        assertParallel(0f, 1f, LineFit.fromWallFragment(withBoundary).direction)
    }
}
