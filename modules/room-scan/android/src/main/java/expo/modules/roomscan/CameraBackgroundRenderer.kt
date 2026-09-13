package expo.modules.roomscan

import android.opengl.GLES11Ext
import android.opengl.GLES20
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Draws ARCore's camera feed as a full-screen background quad.
 *
 * This replaces an earlier placeholder that cleared the surface to a
 * flat colour and drew nothing else, which made the scan screen render
 * as a blank area on a real device - the session was running and planes
 * were being detected, but the user had no camera preview to aim with,
 * so there was no way to tell a working scan from a broken one.
 *
 * The camera texture is GL_TEXTURE_EXTERNAL_OES (the format Android's
 * camera pipeline writes into), which is why the fragment shader needs
 * the samplerExternalOES extension rather than a plain sampler2D.
 *
 * UNVERIFIED ON A REAL DEVICE, like the rest of the ARCore plumbing
 * here: this is standard, well-documented GLES2 boilerplate matching
 * ARCore's own hello_ar background renderer, but it has never been
 * compiled or run in this environment (no Android SDK, no device). The
 * shader source, the attribute wiring and the transform call are the
 * parts most worth re-checking against a real build.
 */
class CameraBackgroundRenderer {
  private var program = 0
  private var positionAttrib = 0
  private var texCoordAttrib = 0
  private var textureUniform = 0

  private lateinit var quadVertices: FloatBuffer
  private lateinit var quadTexCoords: FloatBuffer

  /** Clip-space full-screen triangle strip. Static - the quad always
   * covers the whole viewport; it's the *texture* coordinates that get
   * re-derived per configuration change (see [transformTexCoords]). */
  private val quadCoords = floatArrayOf(
    -1f, -1f,
    +1f, -1f,
    -1f, +1f,
    +1f, +1f,
  )

  fun createOnGlThread() {
    quadVertices = allocateFloatBuffer(quadCoords)
    // Seeded with the raw image-space corners; ARCore rewrites these via
    // transformCoordinates2d whenever the display geometry changes, which
    // is what keeps the preview correctly rotated and aspect-correct
    // across device orientations.
    quadTexCoords = allocateFloatBuffer(
      floatArrayOf(
        0f, 1f,
        1f, 1f,
        0f, 0f,
        1f, 0f,
      ),
    )

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
      throw RuntimeException("Failed to link camera background program: $log")
    }

    // Shaders are reference-counted by the program once attached and
    // linked, so they can be released immediately.
    GLES20.glDeleteShader(vertexShader)
    GLES20.glDeleteShader(fragmentShader)

    positionAttrib = GLES20.glGetAttribLocation(program, "a_Position")
    texCoordAttrib = GLES20.glGetAttribLocation(program, "a_TexCoord")
    textureUniform = GLES20.glGetUniformLocation(program, "u_Texture")
  }

  /**
   * Re-derives the texture coordinates for the current display rotation
   * and viewport size. Must be called whenever
   * [Frame.hasDisplayGeometryChanged] reports true, otherwise the preview
   * appears rotated or stretched after an orientation change.
   */
  fun transformTexCoords(frame: Frame) {
    if (!frame.hasDisplayGeometryChanged()) return
    frame.transformCoordinates2d(
      Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
      quadVertices,
      Coordinates2d.TEXTURE_NORMALIZED,
      quadTexCoords,
    )
  }

  fun draw(textureId: Int) {
    if (program == 0) return

    quadVertices.position(0)
    quadTexCoords.position(0)

    // The camera feed is an opaque backdrop: it must not be occluded by
    // or blended with anything, and it should not write depth that later
    // passes would test against.
    GLES20.glDisable(GLES20.GL_DEPTH_TEST)
    GLES20.glDepthMask(false)

    GLES20.glUseProgram(program)

    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glUniform1i(textureUniform, 0)

    GLES20.glVertexAttribPointer(positionAttrib, 2, GLES20.GL_FLOAT, false, 0, quadVertices)
    GLES20.glVertexAttribPointer(texCoordAttrib, 2, GLES20.GL_FLOAT, false, 0, quadTexCoords)
    GLES20.glEnableVertexAttribArray(positionAttrib)
    GLES20.glEnableVertexAttribArray(texCoordAttrib)

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

    GLES20.glDisableVertexAttribArray(positionAttrib)
    GLES20.glDisableVertexAttribArray(texCoordAttrib)

    GLES20.glDepthMask(true)
    GLES20.glEnable(GLES20.GL_DEPTH_TEST)
  }

  private fun allocateFloatBuffer(values: FloatArray): FloatBuffer =
    ByteBuffer.allocateDirect(values.size * BYTES_PER_FLOAT)
      .order(ByteOrder.nativeOrder())
      .asFloatBuffer()
      .apply {
        put(values)
        position(0)
      }

  private fun compileShader(type: Int, source: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, source)
    GLES20.glCompileShader(shader)

    val compileStatus = IntArray(1)
    GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compileStatus, 0)
    if (compileStatus[0] != GLES20.GL_TRUE) {
      val log = GLES20.glGetShaderInfoLog(shader)
      GLES20.glDeleteShader(shader)
      throw RuntimeException("Failed to compile camera background shader: $log")
    }
    return shader
  }

  private companion object {
    const val BYTES_PER_FLOAT = 4

    const val VERTEX_SHADER_SOURCE = """
      attribute vec4 a_Position;
      attribute vec2 a_TexCoord;
      varying vec2 v_TexCoord;
      void main() {
        gl_Position = a_Position;
        v_TexCoord = a_TexCoord;
      }
    """

    /** samplerExternalOES (not sampler2D) - required for the
     * GL_TEXTURE_EXTERNAL_OES texture ARCore writes camera frames into. */
    const val FRAGMENT_SHADER_SOURCE = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 v_TexCoord;
      uniform samplerExternalOES u_Texture;
      void main() {
        gl_FragColor = texture2D(u_Texture, v_TexCoord);
      }
    """
  }
}
