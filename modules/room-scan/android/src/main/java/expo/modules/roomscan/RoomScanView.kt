package expo.modules.roomscan

import android.content.Context
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Build
import android.view.Surface
import android.view.WindowManager
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingFailureReason
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableException
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import expo.modules.roomscan.geometry.RoomOutlineBuilder
import expo.modules.roomscan.geometry.Vector2
import expo.modules.roomscan.geometry.WallAccumulator
import expo.modules.roomscan.geometry.WallFragment
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * UNVERIFIED ON A REAL DEVICE. ArCore's Session depends on live camera
 * and motion tracking and there is no ARCore emulator path that
 * exercises real plane detection - there is no way to exercise this
 * class's actual scanning behavior without a physical Android device
 * doing a real AR session. Written against ARCore's documented Kotlin
 * API surface (Session, Frame, Plane, GLSurfaceView) but never built or
 * run - same honesty standard as the iOS RoomScanView/Module pair. The
 * geometry this class feeds (WallAccumulator, RoomOutlineBuilder) IS
 * unit-tested and verified (see android/src/test/) - what's unverified
 * here specifically is the ARCore session/rendering plumbing around it.
 *
 * UX NOTE: unlike iOS's RoomCaptureView (Apple's own polished live
 * wall-overlay chrome, free), ARCore gives no equivalent renderer out of
 * the box - there is no first-party "draw the detected walls as an
 * overlay" helper. This is a deliberate v1 scope cut, not a missing
 * feature: a plain camera background (this class's GLSurfaceView +
 * ARCore's own background camera texture) with a static on-screen "walk
 * slowly around the room" instruction (drawn by scan.tsx's own JS UI,
 * layered above this native view - not by this class) is enough to scan
 * a room even without a live plane-outline overlay.
 *
 * Session/rendering lifecycle: unlike expo-camera's ExpoCameraView
 * (which is driven purely by explicit prop transitions with no
 * onAttachedToWindow/onDetachedFromWindow override - confirmed by
 * reading that file directly), this class ALSO tears down defensively
 * on detach, because an abandoned ARCore Session left running (e.g. the
 * user navigates away mid-scan without the isActive prop transitioning
 * to false first) holds the camera open indefinitely, which is a worse
 * failure mode here than it would be for a plain camera preview.
 */
class RoomScanView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    /** ~4 emits/second at most - see lastProgressEmitMs. */
    private const val PROGRESS_EMIT_INTERVAL_MS = 250L

    /** Upper bound on boundary samples kept per plane for line fitting -
     * see extractBoundaryPoints. */
    private const val MAX_BOUNDARY_POINTS = 48

  }

  private var session: Session? = null
  private var glSurfaceView: GLSurfaceView? = null
  private var isSessionRunning = false
  private val accumulator = WallAccumulator()

  private val onCaptureFinished by EventDispatcher<RoomScanCaptureFinishedEvent>()
  private val onCaptureError by EventDispatcher<RoomScanCaptureErrorEvent>()
  private val onCaptureCancelled by EventDispatcher<Unit>()
  private val onScanProgress by EventDispatcher<RoomScanProgressEvent>()

  /** onDrawFrame runs at display rate (~60fps); bridging an event that
   * often would flood JS for no benefit, and distinctWallCount() re-runs
   * the O(n^2) clustering each call. Emitting a few times a second is
   * well past the threshold where a progress readout feels live. */
  private var lastProgressEmitMs = 0L
  private var lastProgressPayload: Triple<Int, String, Int>? = null

  fun startSession() {
    if (isSessionRunning) return
    if (!ArCoreAvailability.isSupportedAndInstalled(context)) {
      onCaptureError(RoomScanCaptureErrorEvent("ARCore is not supported on this device."))
      return
    }
    try {
      val newSession = Session(context)
      val config = Config(newSession).apply {
        // HORIZONTAL_AND_VERTICAL, not VERTICAL alone. ARCore derives
        // planes from tracked visual feature points, and it locks onto
        // horizontal surfaces (floors, desks) far more readily than
        // blank vertical ones. Those horizontal planes are never
        // ingested as walls (ingestUpdatedPlanes filters them out), but
        // detecting them materially improves the tracking quality that
        // vertical plane detection itself depends on. Restricting to
        // VERTICAL made a plain painted wall effectively undetectable:
        // the session reported healthy tracking while finding no walls
        // at all.
        planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
        // Keep the camera continuously focused - a blurry feed yields
        // far fewer usable feature points, which is the single most
        // common cause of "tracking fine, no planes found" on close-up
        // wall scanning.
        focusMode = Config.FocusMode.AUTO
        // Depth (Config.DepthMode) could refine corner accuracy in a
        // later pass but adds its own device-support gate
        // (Config.isDepthModeSupported) - deliberately deferred, not
        // part of v1's plane-only pipeline.
      }
      newSession.configure(config)
      newSession.resume()
      session = newSession
      accumulator.reset()
      isSessionRunning = true
      setUpRenderer(newSession)
    } catch (e: UnavailableException) {
      onCaptureError(RoomScanCaptureErrorEvent(e.message ?: "ARCore is unavailable on this device."))
    } catch (e: CameraNotAvailableException) {
      onCaptureError(RoomScanCaptureErrorEvent("Camera is not available for AR scanning."))
    }
  }

  fun stopSession() {
    if (!isSessionRunning) return
    isSessionRunning = false

    val walls = accumulator.finalizeWalls()
    tearDownSession()

    when (val outline = RoomOutlineBuilder.build(walls)) {
      is RoomOutlineBuilder.Result.Success -> onCaptureFinished(
        RoomScanCaptureFinishedEvent(
          points = outline.points.map { RoomScanCapturedPointRecord(it.x, it.z) },
          widthMeters = outline.widthMeters,
          lengthMeters = outline.lengthMeters,
        ),
      )
      is RoomOutlineBuilder.Result.Failure -> onCaptureError(RoomScanCaptureErrorEvent(outline.message))
    }
  }

  private fun tearDownSession() {
    glSurfaceView?.let { removeView(it) }
    glSurfaceView = null
    session?.let {
      try {
        it.pause()
        it.close()
      } catch (_: Exception) {
        // Best-effort teardown - a Session already in a bad state (e.g.
        // the camera was yanked away by the OS) shouldn't throw out of
        // stopSession()/onDetachedFromWindow.
      }
    }
    session = null
  }

  /**
   * React Native drives layout from JS via Yoga and does not run the
   * normal Android measure/layout pass over children a native view adds
   * itself. Without this, the GLSurfaceView added in setUpRenderer is
   * never measured or positioned and stays 0x0 - the preview area renders
   * blank even though the ARCore session is running correctly.
   */
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    val width = right - left
    val height = bottom - top
    glSurfaceView?.let { child ->
      child.measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
      )
      child.layout(0, 0, width, height)
    }
  }

  /** Defensive safety net, not the primary teardown path (isActive=false
   * from JS is) - see class doc comment. Discards accumulated geometry
   * rather than finalizing/emitting anything, since a detach mid-scan
   * means the user navigated away, not that they tapped Done. */
  override fun onDetachedFromWindow() {
    if (isSessionRunning) {
      isSessionRunning = false
      tearDownSession()
    }
    super.onDetachedFromWindow()
  }

  /**
   * Minimal ARCore-camera-background GLSurfaceView renderer - draws the
   * live camera feed behind the JS-rendered UI, and pumps
   * session.update(frame) once per rendered frame so ARCore can keep
   * detecting/updating planes. Does NOT render any plane-outline overlay
   * (see class doc's UX note) - the surface exists to (a) show the user
   * a camera preview at all, and (b) drive ARCore's frame loop; nothing
   * more.
   */
  private fun setUpRenderer(activeSession: Session) {
    val view = GLSurfaceView(context)
    view.setEGLContextClientVersion(2)
    view.preserveEGLContextOnPause = true
    view.setRenderer(object : GLSurfaceView.Renderer {
      private var cameraTextureId = -1
      private val background = CameraBackgroundRenderer()
      private val planeOverlay = PlaneOverlayRenderer()

      override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        cameraTextureId = createExternalCameraTexture()
        activeSession.setCameraTextureName(cameraTextureId)
        background.createOnGlThread()
        planeOverlay.createOnGlThread()
      }

      override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
        // Keeps ARCore's projection and the camera-image transform in
        // step with the surface; without it the preview is rotated or
        // stretched after an orientation change.
        session?.setDisplayGeometry(currentDisplayRotation(), width, height)
      }

      override fun onDrawFrame(gl: GL10?) {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)

        val currentSession = session ?: return
        try {
          val frame: Frame = currentSession.update()
          // Must run before the draw: it re-derives the texture
          // coordinates when the display geometry has changed.
          background.transformTexCoords(frame)
          background.draw(cameraTextureId)
          ingestUpdatedPlanes(frame)
          // Drawn from the session's full plane collection rather than
          // just this frame's updated ones: a plane ARCore detected
          // earlier and has not revised this frame must stay on screen,
          // otherwise the overlay flickers as planes drop in and out of
          // the per-frame update set.
          // Fetched ONCE per frame and shared with the progress emit
          // below: getAllTrackables allocates a new collection on every
          // call, and calling it twice a frame at display rate was a
          // meaningful source of GC churn during a scan.
          val planes = currentSession.getAllTrackables(Plane::class.java)
          planeOverlay.draw(planes, frame.camera)
          emitProgressIfChanged(frame, planes)
        } catch (_: CameraNotAvailableException) {
          // Transient - skip this frame, the next onDrawFrame retries.
        }
      }
    })
    view.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    // Explicit MATCH_PARENT params: ExpoView is a plain ViewGroup, and a
    // child added without layout params can end up measured at 0x0, which
    // renders as an empty area rather than a camera preview.
    addView(
      view,
      android.view.ViewGroup.LayoutParams(
        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
    glSurfaceView = view
  }

  /**
   * Throttled live progress emit: at most ~4x/second, and only when the
   * payload actually changed, so JS re-renders are driven by real
   * changes rather than by the render loop's frame rate.
   *
   * Runs on the GL thread (onDrawFrame's caller). Expo's EventDispatcher
   * is safe to invoke off the main thread - it marshals to JS itself -
   * which is the same assumption the capture events already rely on.
   */
  private fun emitProgressIfChanged(frame: Frame, planes: Collection<Plane>) {
    val now = System.currentTimeMillis()
    if (now - lastProgressEmitMs < PROGRESS_EMIT_INTERVAL_MS) return
    lastProgressEmitMs = now

    val payload = Triple(
      accumulator.distinctWallCount(),
      describeTracking(frame),
      countNonWallSurfaces(planes),
    )
    if (payload == lastProgressPayload) return
    lastProgressPayload = payload

    onScanProgress(
      RoomScanProgressEvent(
        wallCount = payload.first,
        tracking = payload.second,
        otherSurfaceCount = payload.third,
      ),
    )
  }

  /**
   * Maps ARCore's camera tracking state into the small closed string set
   * RoomScanProgressEvent documents.
   *
   * VERIFY: TrackingFailureReason's constant names (BAD_STATE,
   * EXCESSIVE_MOTION, INSUFFICIENT_FEATURES, INSUFFICIENT_LIGHT,
   * CAMERA_UNAVAILABLE, NONE) are written from ARCore's documented API
   * surface but could NOT be checked against a real ARCore jar here - no
   * com.google.ar:core artifact exists anywhere in this environment and
   * there is no network access to fetch one. Confirm these compile
   * during the first real Android build, same standing caveat as
   * Pose.rotateVector elsewhere in this file. The `else ->` branch means
   * a wrong/renamed constant degrades to "paused" rather than breaking
   * the scan, but a genuinely wrong NAME is a compile error, not a
   * runtime fallback.
   */
  private fun describeTracking(frame: Frame): String {
    val camera = frame.camera
    return when (camera.trackingState) {
      TrackingState.TRACKING -> "tracking"
      TrackingState.PAUSED -> when (camera.trackingFailureReason) {
        TrackingFailureReason.NONE -> "initializing"
        TrackingFailureReason.EXCESSIVE_MOTION -> "excessive_motion"
        TrackingFailureReason.INSUFFICIENT_LIGHT -> "insufficient_light"
        TrackingFailureReason.INSUFFICIENT_FEATURES -> "insufficient_features"
        else -> "paused"
      }
      else -> "paused"
    }
  }

  /** Non-wall surfaces currently tracked - see the otherSurfaceCount
   * field on RoomScanProgressEvent for why this is reported separately
   * from the wall count. */
  private fun countNonWallSurfaces(planes: Collection<Plane>): Int =
    planes.count { plane ->
      plane.trackingState == TrackingState.TRACKING &&
        plane.subsumedBy == null &&
        !isUsableWall(plane)
    }

  private fun ingestUpdatedPlanes(frame: Frame) {
    for (plane in frame.getUpdatedTrackables(Plane::class.java)) {
      if (plane.subsumedBy != null) continue // ARCore already merged this into another plane
      if (plane.trackingState != TrackingState.TRACKING) continue
      if (!isUsableWall(plane)) continue
      accumulator.ingest(toWallFragment(plane))
    }
  }

  /** Delegates to the shared classifier so the ingest path and the
   * overlay renderer can never disagree about what counts as a wall -
   * see PlaneClassifier. */
  private fun isUsableWall(plane: Plane): Boolean = PlaneClassifier.isUsableWall(plane)

  private fun toWallFragment(plane: Plane): WallFragment {
    val pose: Pose = plane.centerPose
    val (normalX, normalZ) = extractHorizontalNormal(pose)
    return WallFragment(
      planeId = System.identityHashCode(plane),
      centerX = pose.tx(),
      centerZ = pose.tz(),
      normalX = normalX,
      normalZ = normalZ,
      extentX = plane.extentX,
      extentZ = plane.extentZ,
      boundaryPoints = extractBoundaryPoints(plane, pose),
    )
  }

  /**
   * Projects a plane's boundary polygon into top-down world (X, Z), so
   * LineFit can fit the wall line to the full observed surface rather
   * than to the plane normal alone (the noisiest quantity ARCore
   * reports, and previously the dominant source of error in the fitted
   * room outline).
   *
   * Plane.polygon is a FloatBuffer of (x, z) pairs in the plane's own
   * local space, with local Y implicitly 0 on the surface;
   * Pose.transformPoint lifts each into world space. transformPoint is
   * the correct call here rather than rotateVector, because these are
   * POSITIONS and must pick up the pose's translation.
   *
   * Subsampled to at most [MAX_BOUNDARY_POINTS]: ARCore's polygons grow
   * to hundreds of vertices on a large wall, and a total-least-squares
   * fit gains nothing measurable past a few dozen well-spread samples
   * while this runs inside the frame loop.
   */
  private fun extractBoundaryPoints(plane: Plane, pose: Pose): List<Vector2> {
    val polygon = plane.polygon
    val cornerCount = polygon.limit() / 2
    if (cornerCount < 3) return emptyList()

    val stride = maxOf(1, cornerCount / MAX_BOUNDARY_POINTS)
    val points = ArrayList<Vector2>((cornerCount + stride - 1) / stride)
    val local = FloatArray(3)
    var i = 0
    while (i < cornerCount) {
      local[0] = polygon.get(i * 2)
      local[1] = 0f
      local[2] = polygon.get(i * 2 + 1)
      val world = pose.transformPoint(local)
      points.add(Vector2(world[0], world[2]))
      i += stride
    }
    return points
  }

  /** A VERTICAL Plane's pose has its own local Y-axis pointing along the
   * wall's outward face normal, in world space - rotate the local
   * (0,1,0) vector by the pose's rotation and project to the top-down
   * (X, Z) plane to get the wall's horizontal-facing direction.
   * UNVERIFIED: Pose.rotateVector(FloatArray): FloatArray has been part
   * of ARCore's public Kotlin/Java API since early releases (rotates a
   * vector by the pose's rotation only, ignoring translation - the
   * correct operation for a direction/normal, as opposed to
   * transformPoint which also applies translation and would be wrong
   * here), but this has not been checked against a live ARCore jar in
   * this environment (none is available - no network access to fetch
   * com.google.ar:core here) - verify the exact method name/signature
   * once the real Gradle dependency resolves during a real prebuild. */
  private fun extractHorizontalNormal(pose: Pose): Pair<Float, Float> {
    val worldNormal = pose.rotateVector(floatArrayOf(0f, 1f, 0f))
    val nx = worldNormal[0]
    val nz = worldNormal[2]
    val len = kotlin.math.hypot(nx.toDouble(), nz.toDouble()).toFloat().coerceAtLeast(0.0001f)
    return Pair(nx / len, nz / len)
  }

  /** Surface rotation ARCore needs to orient the camera image. Read from
   * the view's own Display where available (API 30+), falling back to the
   * WindowManager's default display on older devices - minSdk here is 24,
   * so the deprecated path is still genuinely reachable. */
  @Suppress("DEPRECATION")
  private fun currentDisplayRotation(): Int {
    val displayFromView = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) display else null
    val resolved = displayFromView
      ?: (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay
    return resolved?.rotation ?: Surface.ROTATION_0
  }

  /** ARCore's Session.setCameraTextureName requires a texture bound as
   * GL_TEXTURE_EXTERNAL_OES specifically (the format Android's camera
   * pipeline writes into), not a plain GL_TEXTURE_2D - a plain 2D
   * texture here would make the session accept the id but never
   * actually receive camera frames into it. */
  private fun createExternalCameraTexture(): Int {
    val textures = IntArray(1)
    GLES20.glGenTextures(1, textures, 0)
    val textureId = textures[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_MIN_FILTER,
      GLES20.GL_LINEAR,
    )
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_MAG_FILTER,
      GLES20.GL_LINEAR,
    )
    return textureId
  }
}
