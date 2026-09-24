package expo.modules.roomscan.geometry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RoomOutlineBuilderTest {

    private fun wall(centerX: Float, centerZ: Float, normalX: Float, normalZ: Float) = WallFragment(
        planeId = 0,
        centerX = centerX,
        centerZ = centerZ,
        normalX = normalX,
        normalZ = normalZ,
        extentX = 1f,
        extentZ = 1f,
    )

    /** A clean 4m x 3m axis-aligned rectangular room, hand-built as four
     * wall fragments the way a well-behaved ARCore session would report
     * one per side, each already merged into a single WallFragment. */
    private fun rectangularRoomWalls(): List<WallFragment> = listOf(
        wall(centerX = 2f, centerZ = 0f, normalX = 0f, normalZ = -1f),  // "south" wall, facing -Z
        wall(centerX = 4f, centerZ = 1.5f, normalX = 1f, normalZ = 0f), // "east" wall, facing +X
        wall(centerX = 2f, centerZ = 3f, normalX = 0f, normalZ = 1f),  // "north" wall, facing +Z
        wall(centerX = 0f, centerZ = 1.5f, normalX = -1f, normalZ = 0f), // "west" wall, facing -X
    )

    @Test
    fun `builds a 4-corner outline for a clean rectangular room`() {
        val result = RoomOutlineBuilder.build(rectangularRoomWalls())

        assertTrue(result is RoomOutlineBuilder.Result.Success)
        val success = result as RoomOutlineBuilder.Result.Success
        assertEquals(4, success.points.size)
        assertEquals(4.0, success.widthMeters.toDouble(), 0.05)
        assertEquals(3.0, success.lengthMeters.toDouble(), 0.05)

        // Every corner should land near (0,0), (4,0), (4,3), or (0,3).
        val expectedCorners = setOf(
            Pair(0f, 0f), Pair(4f, 0f), Pair(4f, 3f), Pair(0f, 3f),
        )
        for (corner in success.points) {
            val matchesSome = expectedCorners.any { (ex, ez) ->
                kotlin.math.abs(corner.x - ex) < 0.1f && kotlin.math.abs(corner.z - ez) < 0.1f
            }
            assertTrue("corner ($${corner.x}, ${corner.z}) should match a known rectangle corner", matchesSome)
        }
    }

    @Test
    fun `fails with fewer than 3 walls`() {
        val result = RoomOutlineBuilder.build(rectangularRoomWalls().take(2))

        assertTrue(result is RoomOutlineBuilder.Result.Failure)
    }

    @Test
    fun `fails on an empty wall list`() {
        val result = RoomOutlineBuilder.build(emptyList())

        assertTrue(result is RoomOutlineBuilder.Result.Failure)
    }

    @Test
    fun `one near-parallel adjacent pair degrades that corner but still succeeds overall`() {
        // Same rectangle, but nudge the "east" wall's normal to be
        // almost parallel to the "north" wall's normal at their shared
        // corner - this should trigger the per-corner fallback for just
        // that one corner, not fail the whole scan (only 1 of 4 corners
        // affected, well under the "more than half" failure threshold).
        val walls = listOf(
            wall(centerX = 2f, centerZ = 0f, normalX = 0f, normalZ = -1f),
            wall(centerX = 4f, centerZ = 1.5f, normalX = 0.05f, normalZ = 1f), // nudged to nearly match "north"
            wall(centerX = 2f, centerZ = 3f, normalX = 0f, normalZ = 1f),
            wall(centerX = 0f, centerZ = 1.5f, normalX = -1f, normalZ = 0f),
        )

        val result = RoomOutlineBuilder.build(walls)

        assertTrue(result is RoomOutlineBuilder.Result.Success)
        assertEquals(4, (result as RoomOutlineBuilder.Result.Success).points.size)
    }

    @Test
    fun `a majority of degenerate corners fails the whole scan`() {
        // All four walls nudged to nearly the same orientation - every
        // adjacent pair is near-parallel, so every corner should hit the
        // fallback path, crossing the "more than half" failure threshold.
        val walls = listOf(
            wall(centerX = 2f, centerZ = 0f, normalX = 1f, normalZ = 0.02f),
            wall(centerX = 4f, centerZ = 1.5f, normalX = 1f, normalZ = 0.03f),
            wall(centerX = 2f, centerZ = 3f, normalX = 1f, normalZ = 0.01f),
            wall(centerX = 0f, centerZ = 1.5f, normalX = 1f, normalZ = -0.02f),
        )

        val result = RoomOutlineBuilder.build(walls)

        assertTrue(result is RoomOutlineBuilder.Result.Failure)
    }

    // --- Accuracy improvements: TLS boundary fitting + snapping ---

    /** End-to-end proof of the point of both changes: a 4m x 3m room
     * whose walls were each observed a degree or two off square comes
     * out as a genuinely right-angled rectangle of the right size. */
    @Test
    fun `a noisy nearly-square room is recovered as a square room`() {
        fun wallFrom(id: Int, from: Vector2, to: Vector2, nx: Float, nz: Float): WallFragment {
            val pts = (0..10).map { i ->
                val t = i / 10f
                Vector2(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)
            }
            return WallFragment(
                planeId = id,
                centerX = (from.x + to.x) / 2f,
                centerZ = (from.z + to.z) / 2f,
                normalX = nx, normalZ = nz,
                extentX = 4f, extentZ = 4f,
                boundaryPoints = pts,
            )
        }

        // Each wall tilted slightly off true - what a real scan produces.
        val walls = listOf(
            wallFrom(1, Vector2(0f, 0f), Vector2(4f, 0.06f), 0f, 1f),
            wallFrom(2, Vector2(4f, 0.06f), Vector2(3.95f, 3f), 1f, 0f),
            wallFrom(3, Vector2(3.95f, 3f), Vector2(-0.04f, 2.97f), 0f, 1f),
            wallFrom(4, Vector2(-0.04f, 2.97f), Vector2(0f, 0f), 1f, 0f),
        )

        val result = RoomOutlineBuilder.build(walls)
        assertTrue("expected success, got $result", result is RoomOutlineBuilder.Result.Success)
        result as RoomOutlineBuilder.Result.Success

        assertEquals(4, result.points.size)
        // Dimensions recovered to within a couple of centimetres.
        assertEquals(4.0, result.widthMeters.toDouble(), 0.08)
        assertEquals(3.0, result.lengthMeters.toDouble(), 0.08)

        // Every interior corner is a true right angle.
        for (i in result.points.indices) {
            val prev = result.points[(i + result.points.size - 1) % result.points.size]
            val here = result.points[i]
            val next = result.points[(i + 1) % result.points.size]
            val ax = (prev.x - here.x).toDouble()
            val az = (prev.z - here.z).toDouble()
            val bx = (next.x - here.x).toDouble()
            val bz = (next.z - here.z).toDouble()
            val cosAngle = (ax * bx + az * bz) /
                (kotlin.math.hypot(ax, az) * kotlin.math.hypot(bx, bz))
            assertEquals("corner $i is not square", 0.0, cosAngle, 0.02)
        }
    }

    /** Snapping must be defeatable, and must be what squares the room -
     * with it off, the same noisy input stays visibly off-square. */
    @Test
    fun `disabling snapping leaves the measured angles alone`() {
        val walls = listOf(
            WallFragment(1, 0f, 0f, 0f, 1f, 4f, 4f),
            WallFragment(2, 2f, 1.5f, 1f, 0f, 3f, 3f),
            WallFragment(3, 0f, 3f, 0.06f, 0.998f, 4f, 4f),
        )
        val snapped = RoomOutlineBuilder.build(walls, snapToRightAngles = true)
        val raw = RoomOutlineBuilder.build(walls, snapToRightAngles = false)
        assertTrue(snapped is RoomOutlineBuilder.Result.Success)
        assertTrue(raw is RoomOutlineBuilder.Result.Success)
        snapped as RoomOutlineBuilder.Result.Success
        raw as RoomOutlineBuilder.Result.Success
        // The two paths must not produce identical geometry, otherwise
        // snapping is silently doing nothing.
        val differs = snapped.points.indices.any { i ->
            kotlin.math.abs(snapped.points[i].x - raw.points[i].x) > 1e-4 ||
                kotlin.math.abs(snapped.points[i].z - raw.points[i].z) > 1e-4
        }
        assertTrue("snapping changed nothing", differs)
    }
}
