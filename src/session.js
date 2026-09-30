// Shared native-login marker for the Antigravity CLI.
//
// Claude CLI and Codex report their own login to OpenClaw. agy does the same:
// it keeps the access token, refresh token, and expiry, and OpenClaw only
// records that the CLI session is usable. This marker is not an API key.

/** Marker returned when `agy models` shows a live CLI login. */
export const ANTIGRAVITY_NATIVE_AUTH_MARKER = ["openclaw", "antigravity-cli-native-auth"].join(
  ":",
);

/** Retired provider-config marker. Doctor removes it. It is not a login. */
export const ANTIGRAVITY_SESSION_MARKER = "agy-session";

export const ANTIGRAVITY_SYNTHETIC_AUTH_SOURCE = "Antigravity CLI native login";

const AUTH_MARKERS = new Set([ANTIGRAVITY_NATIVE_AUTH_MARKER, ANTIGRAVITY_SESSION_MARKER]);

/** @param {unknown} value */
export function isAntigravityAuthMarker(value) {
  return typeof value === "string" && AUTH_MARKERS.has(value.trim());
}

export function antigravityNativeAuthResult() {
  return {
    apiKey: ANTIGRAVITY_NATIVE_AUTH_MARKER,
    mode: "oauth",
    source: ANTIGRAVITY_SYNTHETIC_AUTH_SOURCE,
  };
}

/** @param {{ resolvedApiKey?: string }} [params] */
export function shouldDeferAntigravitySyntheticProfileAuth(params = {}) {
  return isAntigravityAuthMarker(params.resolvedApiKey);
}
