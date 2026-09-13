package expo.modules.roomscan.geometry

/**
 * Top-down (X, Z) projection of one ARCore VERTICAL Plane's centroid +
 * extent, captured once per distinct Plane the accumulator has seen
 * (WallAccumulator.ingest overwrites the entry for a given key with the
 * plane's latest state on every frame it's updated, rather than
 * averaging across frames - ARCore itself keeps refining a Plane's own
 * pose/extent as tracking improves, so "latest" is already ARCore's own
 * best estimate).
 *
 * planeId has no real ARCore-level meaning outside this package - it's
 * whatever stable per-plane key WallAccumulator chose (see that class's
 * own comment on why System.identityHashCode is used pragmatically
 * rather than a true ARCore-provided id, which doesn't exist).
 */
data class WallFragment(
    val planeId: Int,
    val centerX: Float,
    val centerZ: Float,
    /** The wall's outward-facing horizontal direction, normalized. Not
     * literally the Plane's 3D normal (that points straight up/down off
     * the vertical surface's face) - see WallAccumulator's
     * extractHorizontalNormal for the actual derivation from the plane's
     * pose. */
    val normalX: Float,
    val normalZ: Float,
    /** Approximate wall extent along its own local axes (ARCore's
     * Plane.extentX/extentZ) - used only as a confidence weight when
     * merging fragments (WallAccumulator.mergeCluster), not as an exact
     * physical wall length. */
    val extentX: Float,
    val extentZ: Float,
    /**
     * The wall's observed boundary points, projected to top-down world
     * (X, Z) - ARCore's Plane.polygon lifted out of plane-local space.
     *
     * This is what lets LineFit fit a wall line to the FULL observed
     * surface (total least squares over every point) instead of to a
     * single centre point plus the plane's normal. The normal is the
     * noisiest quantity ARCore reports, so deriving a wall's orientation
     * from it alone was the dominant error term in the fitted outline.
     *
     * Empty is valid and must stay supported: merged fragments built by
     * hand in tests, and any future source without a polygon, fall back
     * to the centre+normal fit. See LineFit.fromWallFragment.
     */
    val boundaryPoints: List<Vector2> = emptyList(),
)
