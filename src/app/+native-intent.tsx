import { screenForIncomingLink } from "@/domain/deepLinks";

/**
 * Runs for every link that opens the app (a tapped email link, a notification, the app's own scheme) before the
 * router looks at it. A web link to the noticeboard becomes the matching app screen; see domain/deepLinks.ts.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return screenForIncomingLink(path);
}
