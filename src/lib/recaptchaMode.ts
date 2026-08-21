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

// Local dev and Lovable preview/staging hosts — the reCAPTCHA site key is not
// registered for these hosts, and the canonical-domain iframe bridge cannot mint
// tokens for them either (third-party storage is blocked in the preview frame).
// We bypass verification client-side to unblock login and forms; server-side
// verify is skipped for the bypass token too.
const BYPASS_HOSTS_EXACT = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

const BYPASS_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com", ".lovable.dev"];

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

// ── Native-failure latch ────────────────────────────────────────────────────
// If the native provider cannot mint a token on this host (typically Google's
// "Invalid domain for site key" — a stale/incorrect key/domain pairing), we
// latch that fact for the rest of the session, unmount the native provider so
// Google's red "ERROR for site owner" surface disappears, and mint tokens via
// the canonical-host bridge instead.

const NATIVE_FAILED_KEY = "rol_recaptcha_native_failed";

let nativeFailed = (() => {
  try {
    return sessionStorage.getItem(NATIVE_FAILED_KEY) === "1";
  } catch {
    return false;
  }
})();

const listeners = new Set<() => void>();

export function hasNativeRecaptchaFailed(): boolean {
  return nativeFailed;
}

export function markNativeRecaptchaFailed(reason?: unknown): void {
  const key = typeof window !== "undefined" ? window.location.hostname : "";
  console.warn(
    `reCAPTCHA native mode unavailable on ${key}; falling back to canonical bridge.`,
    reason ?? "",
  );
  if (nativeFailed) return;
  nativeFailed = true;
  try {
    sessionStorage.setItem(NATIVE_FAILED_KEY, "1");
  } catch {
    /* non-fatal */
  }
  listeners.forEach((l) => l());
}

export function subscribeNativeRecaptchaFailure(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mode after taking the runtime native-failure latch into account. */
export function getEffectiveRecaptchaMode(
  hostname: string = typeof window !== "undefined" ? window.location.hostname : "",
): RecaptchaMode {
  const mode = getRecaptchaMode(hostname);
  if (mode === "native" && nativeFailed) return "bridge";
  return mode;
}


