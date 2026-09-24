package expo.modules.roomscan.geometry

import kotlin.math.abs
import kotlin.math.acos

/**
 * Accumulates vertical-plane fragments across an ARCore session and
 * merges the ones that represent the same physical wall into one
 * WallFragment per wall. Deliberately takes plain WallFragment values,
 * not ARCore's Plane type, so the merge/dedup logic itself is
 * unit-testable without a device or a real ARCore session - see
 * src/test/.../WallAccumulatorTest.kt. The ARCore-specific glue (reading
 * a Plane's pose/extent, filtering to VERTICAL/TRACKING planes, skipping
 * subsumed ones) lives in RoomScanView.kt, which calls ingest() with
 * already-extracted WallFragment values.
 *
 * Two distinct merge passes happen, only the second of which is this
 * class's own responsibility:
 * 1. ARCore's OWN merge signal (Plane.subsumedBy) - handled by the
 *    caller before ingest() is even called: a subsumed plane is never
 *    passed in at all, so it never appears here.
 * 2. This class's OWN dedup pass, for fragments ARCore still tracks as
 *    separate trackables but that clearly represent the same physical
 *    wall (common when ARCore detects a large wall, or one split by a
 *    doorway, across two or more separate Plane instances before its own
 *    tracking stabilizes/merges them) - see finalizeWalls().
 */
class WallAccumulator {
    private val fragments = LinkedHashMap<Int, WallFragment>()

    /** Set when the fragment set changes, so a cached clustering result
     * can be reused until it actually goes stale. */
    private var clusterCacheDirty = true
    private var cachedWallCount = 0

    /** Records (or overwrites) one plane's latest state, keyed by
     * [WallFragment.planeId]. Called once per updated VERTICAL,
     * TRACKING, not-yet-subsumed plane per frame - see RoomScanView. */
    fun ingest(fragment: WallFragment) {
        val previous = fragments.put(fragment.planeId, fragment)
        // ARCore re-reports the same plane every frame with a pose that
        // is usually identical or barely changed. Only a genuine change
        // invalidates the cached cluster count; without this check the
        // cache would be dirty on literally every frame and buy nothing.
        if (previous != fragment) clusterCacheDirty = true
    }

    /** Clears accumulated state - call before a new scan session starts,
     * so a second scan on the same RoomScanView instance doesn't mix
     * fragments from a previous, already-finalized scan into the new
     * one. */
    fun reset() {
        fragments.clear()
        clusterCacheDirty = true
        cachedWallCount = 0
    }

    /**
     * Live, mid-scan count of DISTINCT walls seen so far, for progress
     * feedback while the session is still running. Runs the same
     * clustering finalizeWalls() does, so the number a user sees climbing
     * matches the number of walls the finished outline will actually be
     * built from - a raw fragments.size would over-report badly, since
     * ARCore routinely tracks one physical wall as several separate
     * planes before its own tracking stabilizes.
     *
     * Result is CACHED and only recomputed when ingest() actually
     * changes a fragment: the union-find is O(n^2), and recomputing it
     * on every emit while ARCore re-reported unchanged planes each frame
     * was a real contributor to the camera preview going choppy during
     * longer scans.
     */
    fun distinctWallCount(): Int {
        if (!clusterCacheDirty) return cachedWallCount
        cachedWallCount = finalizeWalls().size
        clusterCacheDirty = false
        return cachedWallCount
    }

    /** Call once, after the capture session has stopped. Clusters
     * remaining fragments into one WallFragment per physical wall and
     * returns them - NOT yet ordered into a room loop or corner-fitted;
     * that's RoomOutlineBuilder's job, which takes this method's output
     * as its input. */
    fun finalizeWalls(
        normalToleranceDeg: Double = 8.0,
        centerDistanceToleranceMeters: Float = 0.35f,
    ): List<WallFragment> {
        val all = fragments.values.toList()
        if (all.isEmpty()) return all

        // Plain union-find over pairs the tolerance check says are
        // fragments of the same wall.
        val parent = IntArray(all.size) { it }
        fun find(i: Int): Int {
            var x = i
            while (parent[x] != x) x = parent[x]
            return x
        }
        fun union(a: Int, b: Int) {
            parent[find(a)] = find(b)
        }

        for (i in all.indices) {
            for (j in (i + 1) until all.size) {
                if (isSameWall(all[i], all[j], normalToleranceDeg, centerDistanceToleranceMeters)) {
                    union(i, j)
                }
            }
        }

        return all.indices.groupBy { find(it) }.values.map { groupIndices ->
            mergeCluster(groupIndices.map { all[it] })
        }
    }

    /**
     * Two fragments are the same physical wall when they share
     * (approximately) the same orientation AND lie (approximately) on
     * the same plane along that orientation's normal.
     *
     * Checking PERPENDICULAR distance specifically - not raw
     * center-to-center distance - is the whole point: two OPPOSITE walls
     * of a room (say, north and south walls of a rectangular room) can
     * easily share a near-identical normal direction (parallel, facing
     * opposite ways) while being meters apart along that normal. Raw
     * distance would risk merging them; perpendicular-distance-from-
     * one-wall's-own-plane correctly keeps them separate while still
     * merging true fragments of one wall, which lie close to zero
     * distance from each other along their shared normal.
     */
    private fun isSameWall(
        a: WallFragment,
        b: WallFragment,
        normalToleranceDeg: Double,
        distanceToleranceMeters: Float,
    ): Boolean {
        val dot = (a.normalX * b.normalX + a.normalZ * b.normalZ).coerceIn(-1f, 1f)
        val angleDeg = Math.toDegrees(acos(dot.toDouble()))
        // Normals can point either face of the same physical wall
        // depending on which side ARCore observed it from - both
        // "nearly identical" and "nearly opposite" count as the same
        // orientation.
        val orientationMatches = angleDeg < normalToleranceDeg || angleDeg > (180.0 - normalToleranceDeg)
        if (!orientationMatches) return false

        val dx = b.centerX - a.centerX
        val dz = b.centerZ - a.centerZ
        val perpendicularDistance = abs(dx * a.normalX + dz * a.normalZ)
        return perpendicularDistance < distanceToleranceMeters
    }

    /** Extent-weighted average of a cluster's fragments - a fragment
     * ARCore reported with a larger observed extent is treated as a
     * slightly more confident estimate of the wall's true center/normal
     * than a small, likely-partial fragment. A simple, pragmatic
     * weighting, not a physically rigorous one. */
    private fun mergeCluster(cluster: List<WallFragment>): WallFragment {
        val totalWeight = cluster.sumOf { (it.extentX + it.extentZ).toDouble() }
            .toFloat()
            .coerceAtLeast(0.001f)

        fun weightedAverage(select: (WallFragment) -> Float): Float =
            cluster.sumOf { (select(it) * (it.extentX + it.extentZ)).toDouble() }.toFloat() / totalWeight

        return WallFragment(
            planeId = cluster.first().planeId,
            centerX = weightedAverage { it.centerX },
            centerZ = weightedAverage { it.centerZ },
            normalX = weightedAverage { it.normalX },
            normalZ = weightedAverage { it.normalZ },
            extentX = cluster.sumOf { it.extentX.toDouble() }.toFloat(),
            extentZ = cluster.sumOf { it.extentZ.toDouble() }.toFloat(),
            // Pooled, NOT averaged. Every fragment of one physical wall
            // observed the same surface, so their boundary samples are
            // all evidence for the same line and the fit should see all
            // of them. Dropping them here would silently send every
            // merged wall back to the centre+normal fallback and undo
            // the boundary fit entirely - the merged wall is exactly the
            // one the outline is built from.
            boundaryPoints = cluster.flatMap { it.boundaryPoints },
        )
    }
}
