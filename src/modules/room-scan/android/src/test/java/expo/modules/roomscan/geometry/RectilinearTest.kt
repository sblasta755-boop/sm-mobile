package expo.modules.roomscan.geometry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

class RectilinearTest {
    private fun lineAtDegrees(deg: Double, point: Vector2 = Vector2(0f, 0f)): Line2 {
        val rad = Math.toRadians(deg)
        return Line2(point, Vector2(cos(rad).toFloat(), sin(rad).toFloat()))
    }

    private fun wall(extent: Float) = WallFragment(
        planeId = 0, centerX = 0f, centerZ = 0f,
        normalX = 1f, normalZ = 0f, extentX = extent, extentZ = extent,
    )

    /** Angle of a line, folded to [0, 90) - the sign of a direction and
     * a 180-degree flip both describe the same line. */
    private fun foldedDegrees(line: Line2): Double {
        var d = Math.toDegrees(atan2(line.direction.z.toDouble(), line.direction.x.toDouble()))
        while (d < 0.0) d += 90.0
        while (d >= 90.0) d -= 90.0
        return d
    }

    @Test
    fun `a nearly-square room snaps to exactly square`() {
        val lines = listOf(
            lineAtDegrees(1.4),
            lineAtDegrees(88.7),
            lineAtDegrees(180.9),
            lineAtDegrees(271.2),
        )
        val walls = List(4) { wall(3f) }
        val snapped = Rectilinear.snapAll(walls, lines)

        // Every wall must land on the same axis, modulo 90 degrees.
        val folded = snapped.map { foldedDegrees(it) }
        val first = folded.first()
        for (f in folded) {
            val delta = minOf(abs(f - first), 90.0 - abs(f - first))
            assertTrue("wall off-axis by $delta deg", delta < 0.05)
        }
    }

    /** The safeguard that stops this from falsifying real geometry: a
     * deliberately angled wall is well outside tolerance and must be
     * left exactly as measured. */
    @Test
    fun `a genuinely angled wall is left untouched`() {
        val axis = 0.0
        val angled = lineAtDegrees(45.0)
        val result = Rectilinear.snapLine(angled, axis)
        assertEquals(foldedDegrees(angled), foldedDegrees(result), 1e-9)
    }

    @Test
    fun `snapping preserves a line's position and only changes orientation`() {
        val line = lineAtDegrees(3.0, point = Vector2(7f, -4f))
        val result = Rectilinear.snapLine(line, 0.0)
        assertEquals(7.0, result.point.x.toDouble(), 1e-6)
        assertEquals(-4.0, result.point.z.toDouble(), 1e-6)
        assertEquals(0.0, foldedDegrees(result), 1e-6)
    }

    /** A room genuinely built on a diagonal must snap to ITS OWN axis,
     * not to the world axes - the axis is estimated, not assumed. */
    @Test
    fun `dominant axis follows a rotated room rather than the world axes`() {
        val lines = listOf(
            lineAtDegrees(30.2),
            lineAtDegrees(119.6),
            lineAtDegrees(210.4),
            lineAtDegrees(299.8),
        )
        val walls = List(4) { wall(3f) }
        val axisDeg = Math.toDegrees(Rectilinear.dominantAxisRadians(walls, lines))
        assertEquals(30.0, axisDeg, 1.0)
    }

    /** Long walls are better evidence of the true axis than short
     * fragments, so the estimate must be extent-weighted. */
    @Test
    fun `long walls dominate the axis estimate over short noisy ones`() {
        val lines = listOf(
            lineAtDegrees(0.0),
            lineAtDegrees(0.0),
            lineAtDegrees(20.0),
        )
        val walls = listOf(wall(6f), wall(6f), wall(0.3f))
        val axisDeg = Math.toDegrees(Rectilinear.dominantAxisRadians(walls, lines))
        assertTrue("axis pulled too far by the short wall: $axisDeg", axisDeg < 3.0 || axisDeg > 87.0)
    }

    /** The circular-mean property: angles near 0 and near 90 describe the
     * same axis and must not average to 45. */
    @Test
    fun `angles near zero and ninety do not average to forty-five`() {
        val lines = listOf(lineAtDegrees(1.0), lineAtDegrees(89.0))
        val walls = List(2) { wall(3f) }
        val axisDeg = Math.toDegrees(Rectilinear.dominantAxisRadians(walls, lines))
        assertTrue("circular mean failed: $axisDeg", axisDeg < 5.0 || axisDeg > 85.0)
    }

    @Test
    fun `empty input is handled without error`() {
        assertEquals(emptyList<Line2>(), Rectilinear.snapAll(emptyList(), emptyList()))
        assertEquals(0.0, Rectilinear.dominantAxisRadians(emptyList(), emptyList()), 1e-9)
    }
}
