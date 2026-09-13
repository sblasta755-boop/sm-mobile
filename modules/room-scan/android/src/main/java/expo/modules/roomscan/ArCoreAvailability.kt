package expo.modules.roomscan

import android.content.Context
import com.google.ar.core.ArCoreApk

/**
 * Collapses ArCoreApk.Availability's several states into the single
 * boolean isRoomPlanSupported() already exposes for iOS (see index.ts).
 * SUPPORTED_INSTALLED -> true. Everything else (not installed, needs
 * update, device incapable, or the check still resolving) -> false, per
 * the confirmed product decision NOT to build an install-prompt state
 * machine in v1 - the "not supported" screen instead links out to the
 * Play Store listing for Google Play Services for AR (see scan.tsx).
 *
 * Known, flagged limitation: checkAvailability() can report
 * UNKNOWN_CHECKING while an async network check resolves in the
 * background - this collapses to false here too, rather than polling
 * for the resolved value. A device mid-check may therefore report
 * unsupported once and supported on a later call, after Play Services
 * finishes resolving it - an accepted v1 tradeoff for the simple
 * boolean contract, not a bug to silently paper over.
 */
object ArCoreAvailability {
  fun isSupportedAndInstalled(context: Context): Boolean {
    return ArCoreApk.getInstance().checkAvailability(context) == ArCoreApk.Availability.SUPPORTED_INSTALLED
  }
}
