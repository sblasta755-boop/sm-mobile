import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

/**
 * Face ID / fingerprint as a LOCK on an already-stored session - not as
 * a way to sign in.
 *
 * Worth being precise about, because "login with biometrics" can mean
 * two very different things. This app already restores a session
 * silently on launch: SecureSessionService holds a refresh token good
 * for 14 days (refresh_token_expire_days on the backend), and
 * SmartCleanProvider's restore effect hands it straight to the app with
 * no interaction at all. So the door was already unlocked; this adds a
 * lock to it.
 *
 * What it deliberately does NOT do is store the user's password. The
 * alternative design - keep credentials and replay signIn() after a
 * biometric check - would survive an explicit sign-out, but it means
 * parking a reusable plaintext credential on the device for an app
 * holding POPIA-scoped personal data. Gating the token the device
 * already has is strictly weaker in what it exposes and no weaker in
 * what it protects.
 *
 * After an explicit sign-out there is nothing to unlock: signOut()
 * clears SecureStore and calls /auth/logout, which revokes the refresh
 * token server-side. That is correct - a deliberately ended session must
 * not be resurrectable by a fingerprint - and it is why the preference
 * below is stored under its own key that SecureSessionService.clear()
 * does not touch: the session goes, the user's choice stays.
 */

const ENABLED_KEY = "smartclean.biometricLock.enabled";

export type BiometricKind =
  | "face"
  | "fingerprint"
  | "iris"
  /** The device offers BOTH a face and a fingerprint sensor. Its own
   * prompt will accept either, so naming just one of them would be a
   * lie half the time - common on Android, where a phone typically has
   * a fingerprint reader and face unlock enrolled together. */
  | "face-or-fingerprint"
  | "biometric";

export interface BiometricCapability {
  /** Hardware exists AND something is actually enrolled. Either one
   * missing means we must not offer the toggle - an enabled lock with
   * nothing to authenticate against would strand the user behind a
   * prompt that can never succeed. */
  available: boolean;
  kind: BiometricKind;
}

/** What to call it in the UI.
 *
 * Naming the actual sensor rather than saying "biometrics" is the
 * difference between a setting people understand and one they skip - but
 * it has to name the RIGHT one. "Face ID" and "Touch ID" are Apple's
 * product names for Apple's sensors; an Android phone with face unlock
 * is not running Face ID, and calling it that is simply wrong. Hence the
 * platform split.
 *
 * A device with both sensors names both: its system prompt accepts
 * either, so picking one would be wrong half the time. */
export function labelFor(kind: BiometricKind): string {
  const ios = Platform.OS === "ios";
  switch (kind) {
    case "face":
      return ios ? "Face ID" : "face unlock";
    case "fingerprint":
      return ios ? "Touch ID" : "fingerprint";
    case "iris":
      return "iris unlock";
    case "face-or-fingerprint":
      return ios ? "Face ID or Touch ID" : "face or fingerprint unlock";
    default:
      return "biometric unlock";
  }
}

/** Sentence-leading form of labelFor, for the one place a label starts a
 * sentence. Only the Apple product names are capitalised mid-sentence,
 * so the generic wordings need a capital when they lead. */
export function labelForSentenceStart(kind: BiometricKind): string {
  const label = labelFor(kind);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function getCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return {
      available: hasHardware && enrolled,
      kind: kindFrom(types),
    };
  } catch {
    // The native module is missing entirely - an older build of the app
    // that predates this dependency, or Expo Go. Treat it as "this
    // device cannot do it" rather than letting the throw take down
    // whatever screen asked.
    return { available: false, kind: "biometric" };
  }
}

function kindFrom(types: LocalAuthentication.AuthenticationType[]): BiometricKind {
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  // Both is its own answer, not a tie to be broken. This previously
  // returned "face" whenever a face sensor was present, so every Android
  // phone with a fingerprint reader AND face unlock - the common case -
  // was told to use "Face ID", naming an Apple product it does not have
  // and ignoring the sensor its owner probably actually uses.
  if (face && finger) return "face-or-fingerprint";
  if (face) return "face";
  if (finger) return "fingerprint";
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
  return "biometric";
}

/** Whether the user has turned the lock on for THIS device.
 *
 * Device-scoped on purpose, and stored outside the reducer's State: the
 * SIGN_OUT case resets State wholesale (`{ ...initial() }`), so a flag
 * kept there would silently switch itself off every time someone signed
 * out. It is also not the kind of thing that should follow an account
 * between devices - a shared site tablet and a personal phone want
 * different answers. */
export async function isLockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // Best-effort. A failed write means the lock is simply not on next
    // launch, which is the safe direction to fail: the user keeps access
    // to their own session rather than being shut out of it.
  }
}

export type UnlockOutcome =
  /** Authenticated - reveal the session. */
  | { status: "unlocked" }
  /** They dismissed the prompt, or it failed in a way that is worth
   * another try. The lock screen stays up with a retry button. */
  | { status: "retry" }
  /** The lock cannot work on this device any more - biometrics were
   * removed, or the OS has locked the sensor out after too many
   * attempts. The only honest move is to send them to a password
   * sign-in rather than leave them stuck. */
  | { status: "fallback"; reason: string };

/**
 * Prompt for whichever biometric this device actually has.
 *
 * `disableDeviceFallback` is left at its default (false), so after a few
 * failures the OS offers the device passcode itself. That is wanted
 * here: the passcode is the same secret that protects every other app's
 * data on the device, and refusing it would mean a user whose face is
 * not recognised in bad light has no way into their own shift.
 */
export async function requestUnlock(kind: BiometricKind): Promise<UnlockOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Unlock Šoma360 with ${labelFor(kind)}`,
      cancelLabel: "Use password",
    });
    if (result.success) return { status: "unlocked" };

    switch (result.error) {
      // Nothing enrolled any more, no usable sensor, or the OS has shut
      // the sensor off after repeated failures. Retrying cannot help.
      case "not_enrolled":
      case "not_available":
      case "passcode_not_set":
      case "lockout":
        return {
          status: "fallback",
          reason: "Biometric unlock isn't available on this device any more.",
        };
      // They deliberately chose the "Use password" cancel label.
      case "user_fallback":
        return { status: "fallback", reason: "" };
      default:
        return { status: "retry" };
    }
  } catch {
    // Native module unavailable - same reasoning as getCapability. Don't
    // strand someone behind a lock screen that can never resolve.
    return {
      status: "fallback",
      reason: "Biometric unlock isn't available in this build.",
    };
  }
}
