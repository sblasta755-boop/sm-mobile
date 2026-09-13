package expo.modules.roomscan

import android.opengl.GLES20
import android.opengl.Matrix
import com.google.ar.core.Camera
import com.google.ar.core.Plane
import com.google.ar.core.TrackingState
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Draws the outline of each detected VERTICAL plane straight onto the
 * camera feed, so the user can see the app recognising walls as it
 * happens.
 *
 * This exists because a numeric "N walls found" readout alone gave no
 * feedback about WHICH surface was recognised, or whether aiming
 * somewhere else would help - a user pointing at a blank wall that
 * ARCore could not lock onto had no way to tell that from a bug.
 *
 * Each plane is drawn twice: a translucent fill, then its boundary as a
 * thick line loop, using ARCore's own Plane.polygon (the plane-local 2D
 * convex hull ARCore maintains) lifted into world space via the plane's
 * centre pose. Vertical planes are drawn in the accent colour; the
 * horizontal planes ARCore also detects (floors, desks - never treated
 * as walls, see RoomScanView.ingestUpdatedPlanes) are drawn dimmer and
 * greyer, so the display distinguishes "this is a wall I will use" from
 * "this is a surface I can see but will not use".
 *
 * UNVERIFIED ON A REAL DEVICE, like all the ARCore plumbing here. This
 * follows the same GLES2 program/shader pattern as
 * CameraBackgroundRenderer (which is itself modelled on ARCore's
 * hello_ar sample), but has never been compiled or run in this
 * environment - no Android SDK, no ARCore artifact, no device.
 */
class PlaneOverlayRenderer {
  private var program = 0
  private var positionAttrib = 0
  private var mvpUniform = 0
  private var colorUniform = 0

  private var vertexBuffer: FloatBuffer = allocateFloatBuffer(INITIAL_VERTEX_CAPACITY)

  private val modelMatrix = FloatArray(16)
  private val viewMatrix = FloatArray(16)
  private val projectionMatrix = FloatArray(16)
  private val modelViewMatrix = FloatArray(16)
  private val mvpMatrix = FloatArray(16)

  fun createOnGlThread() {
    val vertexShader = compileShader(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER_SOURCE)
    val fragmentShader = compileShader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)

    program = GLES20.glCreateProgram()
    GLES20.glAttachShader(program, vertexShader)
    GLES20.glAttachShader(program, fragmentShader)
    GLES20.glLinkProgram(program)

    val linkStatus = IntArray(1)
    GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linkStatus, 0)
    if (linkStatus[0] != GLES20.GL_TRUE) {
      val log = GLES20.glGetProgramInfoLog(program)
      GLES20.glDeleteProgram(program)
      program = 0
      throw RuntimeException("Failed to link plane overlay program: $log")
    }

    GLES20.glDeleteShader(vertexShader)
    GLES20.glDeleteShader(fragmentShader)

    positionAttrib = GLES20.glGetAttribLocation(program, "a_Position")
    mvpUniform = GLES20.glGetUniformLocation(program, "u_ModelViewProjection")
    colorUniform = GLES20.glGetUniformLocation(program, "u_Color")
  }

  /**
   * @param planes every plane currently known to the session, including
   *   horizontal ones and planes ARCore has subsumed into a larger
   *   neighbour - this method does its own filtering so the caller does
   *   not have to build a second filtered collection each frame.
   */
  fun draw(planes: Collection<Plane>, camera: Camera) {
    if (program == 0) return

    camera.getViewMatrix(viewMatrix, 0)
    camera.getProjectionMatrix(projectionMatrix, 0, Z_NEAR, Z_FAR)

    GLES20.glUseProgram(program)

    // Translucent overlay on top of an opaque camera backdrop: blend,
    // and do not write depth (the planes would otherwise occlude each
    // other in draw order rather than by real distance).
    GLES20.glEnable(GLES20.GL_BLEND)
    GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
    GLES20.glDepthMask(false)
    GLES20.glEnableVertexAttribArray(positionAttrib)

    var drawn = 0
    for (plane in planes) {
      if (plane.trackingState != TrackingState.TRACKING) continue
      // A subsumed plane is already represented by the larger plane that
      // absorbed it; drawing both double-paints the same surface.
      if (plane.subsumedBy != null) continue
      // Tiny planes are visual noise - ARCore spawns many small
      // short-lived ones, and drawing them all both clutters the preview
      // and costs draw calls every frame.
      if (maxOf(plane.extentX, plane.extentZ) < MIN_DRAWN_EXTENT_METERS) continue
      drawPlane(plane)
      if (++drawn >= MAX_DRAWN_PLANES) break
    }

    GLES20.glDisableVertexAttribArray(positionAttrib)
    GLES20.glDepthMask(true)
    GLES20.glDisable(GLES20.GL_BLEND)
  }

  private fun drawPlane(plane: Plane) {
    val polygon = plane.polygon
    // polygon is (x, z) pairs in plane-local space; fewer than 3 points
    // is not a drawable surface.
    val cornerCount = polygon.limit() / 2
    if (cornerCount < 3) return

    // Must match RoomScanView.isUsableWall exactly. If the overlay
    // painted a plane blue that the ingest path then rejected, the user
    // would watch a wall highlight itself and still see the wall count
    // stay put - the exact confusion this overlay exists to remove.
    val isWall = PlaneClassifier.isUsableWall(plane)

    ensureVertexCapacity(cornerCount * COORDS_PER_VERTEX)
    vertexBuffer.rewind()
    polygon.rewind()
    for (i in 0 until cornerCount) {
      val x = polygon.get(i * 2)
      val z = polygon.get(i * 2 + 1)
      // Plane-local coordinates are on the plane's own surface, so the
      // local Y is always 0; the centre pose lifts them into world space.
      vertexBuffer.put(x)
      vertexBuffer.put(0f)
      vertexBuffer.put(z)
    }
    vertexBuffer.rewind()

    plane.centerPose.toMatrix(modelMatrix, 0)
    Matrix.multiplyMM(modelViewMatrix, 0, viewMatrix, 0, modelMatrix, 0)
    Matrix.multiplyMM(mvpMatrix, 0, projectionMatrix, 0, modelViewMatrix, 0)
    GLES20.glUniformMatrix4fv(mvpUniform, 1, false, mvpMatrix, 0)

    GLES20.glVertexAttribPointer(
      positionAttrib,
      COORDS_PER_VERTEX,
      GLES20.GL_FLOAT,
      false,
      0,
      vertexBuffer,
    )

    if (isWall) {
      GLES20.glUniform4f(colorUniform, WALL_R, WALL_G, WALL_B, WALL_FILL_ALPHA)
      GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, cornerCount)
      GLES20.glUniform4f(colorUniform, WALL_R, WALL_G, WALL_B, WALL_EDGE_ALPHA)
      GLES20.glLineWidth(WALL_EDGE_WIDTH)
    } else {
      GLES20.glUniform4f(colorUniform, OTHER_R, OTHER_G, OTHER_B, OTHER_FILL_ALPHA)
      GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, cornerCount)
      GLES20.glUniform4f(colorUniform, OTHER_R, OTHER_G, OTHER_B, OTHER_EDGE_ALPHA)
      GLES20.glLineWidth(OTHER_EDGE_WIDTH)
    }
    GLES20.glDrawArrays(GLES20.GL_LINE_LOOP, 0, cornerCount)
  }

  /** Plane polygons grow as ARCore refines a surface, so the buffer is
   * sized on demand rather than fixed at construction. */
  private fun ensureVertexCapacity(floatsNeeded: Int) {
    if (vertexBuffer.capacity() >= floatsNeeded) return
    var capacity = vertexBuffer.capacity()
    while (capacity < floatsNeeded) capacity *= 2
    vertexBuffer = allocateFloatBuffer(capacity)
  }

  private fun allocateFloatBuffer(capacityFloats: Int): FloatBuffer =
    ByteBuffer.allocateDirect(capacityFloats * BYTES_PER_FLOAT)
      .order(ByteOrder.nativeOrder())
      .asFloatBuffer()

  private fun compileShader(type: Int, source: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, source)
    GLES20.glCompileShader(shader)

    val compileStatus = IntArray(1)
    GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compileStatus, 0)
    if (compileStatus[0] != GLES20.GL_TRUE) {
      val log = GLES20.glGetShaderInfoLog(shader)
      GLES20.glDeleteShader(shader)
      throw RuntimeException("Failed to compile plane overlay shader: $log")
    }
    return shader
  }

  private companion object {
    const val BYTES_PER_FLOAT = 4
    const val COORDS_PER_VERTEX = 3
    const val INITIAL_VERTEX_CAPACITY = 256

    const val Z_NEAR = 0.1f
    const val Z_FAR = 100f

    /** Skip visually insignificant planes - keeps the preview readable
     * and bounds per-frame draw calls. */
    const val MIN_DRAWN_EXTENT_METERS = 0.3f

    /** Hard ceiling on draw calls per frame. A real room settles well
     * under this; the cap exists so a pathological environment (lots of
     * fragmented surfaces) cannot degrade the preview's frame rate
     * without bound. */
    const val MAX_DRAWN_PLANES = 24

    /** Walls: the app's primary blue (#21779b), matching the scan UI. */
    const val WALL_R = 0.129f
    const val WALL_G = 0.467f
    const val WALL_B = 0.608f
    const val WALL_FILL_ALPHA = 0.35f
    const val WALL_EDGE_ALPHA = 0.95f
    const val WALL_EDGE_WIDTH = 8f

    /** Non-wall surfaces: dim grey, visibly "seen but not used". */
    const val OTHER_R = 0.7f
    const val OTHER_G = 0.74f
    const val OTHER_B = 0.77f
    const val OTHER_FILL_ALPHA = 0.12f
    const val OTHER_EDGE_ALPHA = 0.4f
    const val OTHER_EDGE_WIDTH = 3f

    const val VERTEX_SHADER_SOURCE = """
      uniform mat4 u_ModelViewProjection;
      attribute vec4 a_Position;
      void main() {
        gl_Position = u_ModelViewProjection * a_Position;
      }
    """

    const val FRAGMENT_SHADER_SOURCE = """
      precision mediump float;
      uniform vec4 u_Color;
      void main() {
        gl_FragColor = u_Color;
      }
    """
  }
}
