import { useEffect } from "react";
import { Redirect } from "expo-router";
import * as NativeSplashScreen from "expo-splash-screen";
import { SplashScreen } from "@/components/SplashScreen";
import { useSmartClean } from "@/features/store";
import { useThemeVersion } from "@/theme";

/**
 * Where every signed-in session lands, and the one place that decides
 * WHICH app a person gets.
 *
 * Four apps now share this binary: the cleaner's field app, the
 * manager's, the supervisor's, and Šoma360's own platform console. They
 * are separate route groups rather than one shell with conditionals
 * because their tab bars share almost nothing - a manager has no shift
 * to clock into, a supervisor is never a task's assignee, and an
 * operator belongs to no customer tenant at all.
 *
 * Routing is by ROLE, deliberately, not by subscription modules. Modules
 * answer "what has this organisation paid for" and gate tabs WITHIN an
 * app; role answers "what is this person for" and picks the app. The
 * platform tenant's seeded enterprise subscription makes the difference
 * concrete: every module resolves as unlocked for operator staff, so
 * module-based routing would hand them a full customer app backed by
 * queries that return nothing.
 */
export default function Index() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();

  // Fires after this component's first commit, whichever branch below
  // renders - the native splash comes down only once something of ours
  // is already on screen to receive the handoff, so there's never a gap
  // of blank content between the two splashes.
  useEffect(() => {
    NativeSplashScreen.hideAsync().catch(() => {});
  }, []);

  if (!state.sessionRestored) {
    return <SplashScreen />;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  // Outranks even the password gate: this session was restored from
  // secure storage and the user asked for it to stay sealed until they
  // prove who they are. Nothing below - not the role split, not the
  // set-password obligation - may be reached first, or the lock would be
  // a suggestion rather than a gate.
  if (state.locked) {
    return <Redirect href="/lock" />;
  }

  // Checked before the role split because it outranks every
  // destination: an account onboarded by QR approval holds a random
  // password nobody has ever seen (see provision_tenant and
  // StaffOnboardingController.create on the backend), so there is
  // nothing useful it can do until it chooses one.
  if (state.mustChangePassword) {
    return <Redirect href="/set-password" />;
  }

  // Checked right after the password gate, before the role split: this
  // is the very next thing an account onboarded by QR approval sees,
  // once, straight after choosing a password. Outranks the role split
  // rather than living inside each role's own app, since every role can
  // reach here by the same onboarding path and none of them should have
  // to remember to check for it separately.
  if (!state.hasSeenWelcome) {
    return <Redirect href="/welcome" />;
  }

  switch (currentUser.role) {
    // Šoma360's own operator staff.
    case "system_admin":
      return <Redirect href="/platform-dashboard" />;

    // The management app. Three roles share it because ROLE_ACCESS gives
    // them near-identical surfaces; what differs is SCOPE, and the
    // backend already enforces that (is_site_scoped filters a site
    // manager's lists to their own sites), so the same screens show each
    // role the right rows without branching here.
    case "org_admin":
    case "operations_manager":
    case "site_manager":
      return <Redirect href="/manage-home" />;

    // Field quality assurance: inspects others' work rather than being
    // assigned any.
    case "supervisor":
      return <Redirect href="/supervise-home" />;

    // An external client-side reviewer: reads the record, writes
    // nothing. They used to fall through to the cleaner's app below,
    // where every screen is built around `assigneeId === currentUser.id`
    // - so an auditor got a clock-in button they must never press and an
    // empty task list. ROLE_ACCESS gives them dashboard/reports/quality
    // and nothing else (see permissions.ts on the web).
    case "client_auditor":
      return <Redirect href="/audit-home" />;

    // cleaner, plus anything a newer backend adds that this build has
    // not heard of. Falling through to the field app is the safe
    // default: it is the least-privileged surface, and every screen in
    // it fails closed against the server's own checks.
    default:
      return <Redirect href="/home" />;
  }
}
