// Turns a link the phone hands the app (an emailed web address, or the app's own scheme) into the screen it opens.
// The web addresses are the ones the app claims in app.config.js. Anything else is left exactly as it came.

const NOTICEBOARD_PATHS = ["/mobile/noticeboard", "/noticeboard"];

/** Splits "https://host/path?x=1#y", "/path?x=1" or "smartclean://path" into a path and its query string. */
function split(input: string): { path: string; query: URLSearchParams } {
  let rest = input.trim();
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(rest);
  if (scheme) {
    rest = rest.slice(scheme[0].length);
    // A web address has a host before the path; the app's own scheme puts the path straight after.
    if (/^https?:/i.test(scheme[0])) rest = rest.includes("/") ? rest.slice(rest.indexOf("/")) : "/";
    else rest = `/${rest}`;
  }
  const hash = rest.indexOf("#");
  if (hash >= 0) rest = rest.slice(0, hash);
  const q = rest.indexOf("?");
  const path = (q >= 0 ? rest.slice(0, q) : rest).replace(/\/+$/, "") || "/";
  return { path, query: new URLSearchParams(q >= 0 ? rest.slice(q + 1) : "") };
}

/** The app screen for an incoming link: a notice opens that notice, the board opens the board, the rest is unchanged. */
export function screenForIncomingLink(input: string): string {
  const { path, query } = split(input);
  if (NOTICEBOARD_PATHS.includes(path)) {
    const id = query.get("notice");
    return id ? `/notice/${encodeURIComponent(id)}` : "/noticeboard";
  }
  return input;
}
