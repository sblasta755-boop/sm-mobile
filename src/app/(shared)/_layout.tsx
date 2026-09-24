import { Stack } from "expo-router";

/**
 * Screens every role reaches from its own profile, wherever that profile
 * lives.
 *
 * These three (edit profile, notifications, privacy notice) used to sit
 * inside app/(app)/ - the cleaner's tab group - because the cleaner was
 * the only role with a profile screen that linked to them. Expo Router
 * groups don't share routes, so a supervisor's profile pushing
 * "/notifications" was pushing at a route that did not exist outside the
 * cleaner's group; those two rows on supervise-profile.tsx did nothing.
 *
 * A plain Stack rather than Tabs: none of these is a tab root anywhere.
 * Each is drilled into from a profile screen and returns there, so they
 * keep whichever tab bar the pushing group already had.
 */
export default function SharedLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
