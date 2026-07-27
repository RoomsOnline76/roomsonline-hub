/**
 * reCAPTCHA host-mode detection.
 *
 * The Google reCAPTCHA v3 site key is registered against a fixed list of
 * canonical Rooms Online domains. When our app is served under a white-label
 * or embedded customer domain, mounting the provider directly triggers an
 * "Invalid domain for site key" error.
 *
 * On canonical hosts we run reCAPTCHA natively. On any other host we run in
 * "bridge" mode: the provider is not mounted, and `useRecaptcha` obtains
 * tokens via a hidden iframe hosted on the canonical domain.
 */

export type RecaptchaMode = "native" | "bridge" | "bypass";

const CANONICAL_HOST_SUFFIXES = [
  ".roomsonline.co.za",
];

const CANONICAL_HOSTS_EXACT = new Set([
  "roomsonline.co.za",
]);

// Lovable preview / sandbox / local dev — reCAPTCHA site key is not registered
// for these hosts, so we bypass verification client-side to unblock login and
// forms. Server-side verify is intentionally skipped on these hosts too.
const BYPASS_HOST_SUFFIXES = [
  ".lovable.app",
  ".lovable.dev",
  ".lovableproject.com",
  ".lovableproject.app",
];
const BYPASS_HOSTS_EXACT = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export function isRecaptchaBypassHost(hostname: string = typeof window !== "undefined" ? window.location.hostname : ""): boolean {
  const normalizedHostname = hostname.toLowerCase().split(":")[0] ?? "";
  if (!normalizedHostname) return false;
  if (BYPASS_HOSTS_EXACT.has(normalizedHostname)) return true;
  return BYPASS_HOST_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix));
}

export function getRecaptchaMode(hostname: string = typeof window !== "undefined" ? window.location.hostname : ""): RecaptchaMode {
  if (isRecaptchaBypassHost(hostname)) return "bypass";
  const normalizedHostname = hostname.toLowerCase().split(":")[0] ?? "";
  if (!normalizedHostname) return "native";
  if (CANONICAL_HOSTS_EXACT.has(normalizedHostname)) return "native";
  if (CANONICAL_HOST_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix))) return "native";
  return "bridge";
}

/**
 * URL of the token-bridge page on a canonical host. Used by `useRecaptcha`
 * when running in "bridge" mode to mint tokens through a trusted origin.
 */
export const RECAPTCHA_BRIDGE_URL =
  "https://sleepinafrica.roomsonline.co.za/recaptcha-bridge";

export const RECAPTCHA_BYPASS_TOKEN = "dev-bypass-token";

