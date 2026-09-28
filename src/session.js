// Session marker for the Antigravity CLI login.
//
// agy keeps the access token, refresh token, and expiry in its own file and
// refreshes them itself. Reconnect records a non-secret marker so the providers
// page can show a session. OpenClaw does not copy those tokens or their expiry:
// a past access-token expiry would mark the profile dead even while agy is
// still signed in.

export const ANTIGRAVITY_SESSION_PROFILE_ID = "antigravity-cli:agy";
/** Non-secret marker. agy still authenticates the turn from its own login. */
export const ANTIGRAVITY_SESSION_MARKER = "agy-session";

export function buildAntigravitySessionProfile() {
  return {
    profileId: ANTIGRAVITY_SESSION_PROFILE_ID,
    credential: {
      type: "token",
      provider: "antigravity-cli",
      token: ANTIGRAVITY_SESSION_MARKER,
    },
  };
}
