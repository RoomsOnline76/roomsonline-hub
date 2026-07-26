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

export type RecaptchaMode = "native" | "bridge";

const CANONICAL_HOST_SUFFIXES = [
  ".roomsonline.co.za",
  ".lovable.app",
  ".lovable.dev",
];

const CANONICAL_HOSTS_EXACT = new Set([
  "roomsonline.co.za",
  "localhost",
  "127.0.0.1",
]);

export function getRecaptchaMode(hostname: string = typeof window !== "undefined" ? window.location.hostname : ""): RecaptchaMode {
  if (!hostname) return "native";
  if (CANONICAL_HOSTS_EXACT.has(hostname)) return "native";
  if (CANONICAL_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) return "native";
  return "bridge";
}

/**
 * URL of the token-bridge page on a canonical host. Used by `useRecaptcha`
 * when running in "bridge" mode to mint tokens through a trusted origin.
 */
export const RECAPTCHA_BRIDGE_URL =
  "https://sleepinafrica.roomsonline.co.za/recaptcha-bridge";
