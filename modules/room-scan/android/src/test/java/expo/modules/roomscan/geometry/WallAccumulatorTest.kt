package expo.modules.roomscan.geometry

import org.junit.Assert.assertEquals
import org.junit.Test

class WallAccumulatorTest {
    /** distinctWallCount() must report CLUSTERED walls, not raw ingested
     * fragments - the whole point of showing it to a user mid-scan is
     * that it matches what the finished outline will be built from. */
    @Test
    fun `distinctWallCount counts clustered walls not raw fragments`() {
        val accumulator = WallAccumulator()
        assertEquals(0, accumulator.distinctWallCount())

        // Two fragments of the SAME wall (same normal, tiny offset).
        accumulator.ingest(
            WallFragment(1, centerX = 0f, centerZ = 0f, normalX = 1f, normalZ = 0f, extentX = 1f, extentZ = 1f),
        )
        accumulator.ingest(
            WallFragment(2, centerX = 0.05f, centerZ = 1.2f, normalX = 1f, normalZ = 0f, extentX = 1f, extentZ = 1f),
        )
        assertEquals(1, accumulator.distinctWallCount())

        // A genuinely different wall (perpendicular normal).
        accumulator.ingest(
            WallFragment(3, centerX = 2f, centerZ = 2f, normalX = 0f, normalZ = 1f, extentX = 1f, extentZ = 1f),
        )
        assertEquals(2, accumulator.distinctWallCount())
    }

    /** The cache must not go stale: re-ingesting an UNCHANGED fragment
     * keeps the cached value, but a CHANGED one must recompute. This is
     * the invariant the per-frame optimisation depends on. */
    @Test
    fun `distinctWallCount stays correct across repeated and changed ingests`() {
        val accumulator = WallAccumulator()
        val wall = WallFragment(1, centerX = 0f, centerZ = 0f, normalX = 1f, normalZ = 0f, extentX = 1f, extentZ = 1f)
        accumulator.ingest(wall)
        assertEquals(1, accumulator.distinctWallCount())

        // Same values again - cached path, same answer.
        accumulator.ingest(wall.copy())
        assertEquals(1, accumulator.distinctWallCount())

        // A genuinely new, differently-oriented wall must be picked up
        // rather than served from the cache.
        accumulator.ingest(
            WallFragment(2, centerX = 3f, centerZ = 3f, normalX = 0f, normalZ = 1f, extentX = 1f, extentZ = 1f),
        )
        assertEquals(2, accumulator.distinctWallCount())
    }

    @Test
    fun `distinctWallCount returns to zero after reset`() {
        val accumulator = WallAccumulator()
        accumulator.ingest(
            WallFragment(1, centerX = 0f, centerZ = 0f, normalX = 1f, normalZ = 0f, extentX = 1f, extentZ = 1f),
        )
        assertEquals(1, accumulator.distinctWallCount())
        accumulator.reset()
        assertEquals(0, accumulator.distinctWallCount())
    }


    private fun fragment(
        id: Int,
        centerX: Float,
        centerZ: Float,
        normalX: Float,
        normalZ: Float,
        extent: Float = 1f,
    ) = WallFragment(
        planeId = id,
        centerX = centerX,
        centerZ = centerZ,
        normalX = normalX,
        normalZ = normalZ,
        extentX = extent,
        extentZ = extent,
    )

    @Test
    fun `two near-identical fragments of the same wall merge into one`() {
        val accumulator = WallAccumulator()
        // Same orientation, small perpendicular offset (0.1m < the 0.35m
        // default tolerance) - simulates ARCore reporting one physical
        // wall as two separate Plane fragments before its tracking
        // stabilizes.
        accumulator.ingest(fragment(1, centerX = 0f, centerZ = 0f, normalX = 1f, normalZ = 0f))
        accumulator.ingest(fragment(2, centerX = 0.1f, centerZ = 2f, normalX = 1f, normalZ = 0f))

        val walls = accumulator.finalizeWalls()

        assertEquals(1, walls.size)
    }

    @Test
    fun `two opposite walls of a room with the same normal direction do not merge`() {
        val accumulator = WallAccumulator()
        // Same orientation (parallel), but far apart along the normal
        // (5m >> the 0.35m tolerance) - these are two DIFFERENT walls
        // (e.g. north and south walls of a rectangular room), not
        // fragments of the same one.
        accumulator.ingest(fragment(1, centerX = 0f, centerZ = 0f, normalX = 1f, normalZ = 0f))
        accumulator.ingest(fragment(2, centerX = 5f, centerZ = 0f, normalX = 1f, normalZ = 0f))

        val walls = accumulator.finalizeWalls()

        assertEquals(2, walls.size)
    }

    @Test
    fun `fragments with clearly different orientations never merge`() {
        val accumulator = WallAccumulator()
        accumulator.ingest(fragment(1, centerX = 0f, centerZ = 0f, normalX = 1f, normalZ = 0f))
        accumulator.ingest(fragment(2, centerX = 0f, centerZ = 0f, normalX = 0f, normalZ = 1f))

        val walls = accumulator.finalizeWalls()

        assertEquals(2, walls.size)
    }

    @Test
    fun `ingest overwrites a previously seen plane's fragment rather than duplicating it`() {
        val accumulator = WallAccumulator()
        accumulator.ingest(fragment(1, centerX = 0f, centerZ = 0f, normalX = 1f, normalZ = 0f))
        accumulator.ingest(fragment(1, centerX = 0.5f, centerZ = 0.5f, normalX = 1f, normalZ = 0f))

        val walls = accumulator.finalizeWalls()

        assertEquals(1, walls.size)
        assertEquals(0.5, walls[0].centerX.toDouble(), 1e-4)
    }

    @Test
    fun `finalizeWalls on no fragments returns an empty list, not an error`() {
        val walls = WallAccumulator().finalizeWalls()
        assertEquals(0, walls.size)
    }

    /** Merged walls are what the outline is actually built from, so a
     * merge that discarded boundary samples would silently defeat the
     * total-least-squares fit. */
    @Test
    fun `merging pools the boundary points of every fragment`() {
        val accumulator = WallAccumulator()
        accumulator.ingest(
            fragment(1, centerX = 0f, centerZ = 0f, normalX = 1f, normalZ = 0f)
                .copy(boundaryPoints = listOf(Vector2(0f, 0f), Vector2(0f, 1f))),
        )
        accumulator.ingest(
            fragment(2, centerX = 0.1f, centerZ = 2f, normalX = 1f, normalZ = 0f)
                .copy(boundaryPoints = listOf(Vector2(0.1f, 2f), Vector2(0.1f, 3f))),
        )

        val walls = accumulator.finalizeWalls()

        assertEquals(1, walls.size)
        assertEquals(4, walls[0].boundaryPoints.size)
    }
}
