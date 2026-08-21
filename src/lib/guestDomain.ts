// Guest booking host detection.
//
// White-label / `book.*` hosts are public guest booking surfaces. They must
// NEVER route a visitor to the staff dashboard (which is protected) or to
// `/auth`. This module resolves the current host to its public booking
// surface: a portfolio embed when the host maps to a portfolio, otherwise the
// single property embed.

import { supabase } from "@/integrations/supabase/client";

export type GuestHostTarget =
  | { kind: "portfolio"; slug: string }
  | { kind: "property"; slug: string }
  | null;

const CACHE_KEY = "rol_guest_host_target";

/** Hosts that always belong to the staff/admin surface. */
const ADMIN_HOSTS = new Set([
  "sleepinafrica.roomsonline.co.za",
  "connect.roomsonline.co.za",
  "survey.roomsonline.co.za",
  "reports.roomsonline.co.za",
  "localhost",
  "127.0.0.1",
]);


/**
 * Synchronous fallback so the first paint of a known guest host never flashes
 * the login screen while the public lookup is in flight.
 */
const BUILTIN_GUEST_HOSTS: Record<string, GuestHostTarget> = {
  "book.rolos.co.za": { kind: "portfolio", slug: "jongensfontein" },
  "book.sleepinafrica.roomsonline.co.za": { kind: "portfolio", slug: "jongensfontein" },
};

export const currentHost = (): string =>
  typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();

/**
 * True when the current host is a public guest booking host (white-label
 * domain or a `book.` subdomain) rather than the staff/admin surface.
 */
export const isGuestBookingHost = (): boolean => {
  const host = currentHost();
  if (!host) return false;
  if (ADMIN_HOSTS.has(host)) return false;
  if (host in BUILTIN_GUEST_HOSTS) return true;
  if (host.startsWith("book.")) return true;
  // Any other custom host that resolved to a booking surface previously.
  return readCachedTarget() !== null;
};

const readCachedTarget = (): GuestHostTarget => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { host: string; target: GuestHostTarget };
    if (parsed?.host !== currentHost()) return null;
    return parsed.target ?? null;
  } catch {
    return null;
  }
};

const writeCachedTarget = (target: GuestHostTarget) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ host: currentHost(), target }));
  } catch {
    /* storage unavailable — non-fatal */
  }
};

/** Best-effort target available without a network round-trip. */
export const resolveGuestHostTargetSync = (): GuestHostTarget =>
  BUILTIN_GUEST_HOSTS[currentHost()] ?? readCachedTarget();

/** Resolves the host against the public white-label registry (cached). */
export const resolveGuestHostTarget = async (): Promise<GuestHostTarget> => {
  const sync = resolveGuestHostTargetSync();
  if (sync) return sync;
  const host = currentHost();
  if (!host) return null;
  try {
    const { data, error } = await supabase.functions.invoke("resolve-whitelabel-host", {
      body: { host },
    });
    if (error) return null;
    const kind = (data as any)?.kind;
    const slug = (data as any)?.slug;
    if ((kind === "portfolio" || kind === "property") && typeof slug === "string" && slug) {
      const target: GuestHostTarget = { kind, slug };
      writeCachedTarget(target);
      return target;
    }
  } catch {
    /* fall through */
  }
  return null;
};

/** Public path a guest host should land on (preserves incoming query params). */
export const guestHostPath = (target: GuestHostTarget): string | null => {
  if (!target) return null;
  const search = typeof window === "undefined" ? "" : window.location.search;
  const base =
    target.kind === "portfolio"
      ? `/embed/portfolio/${target.slug}`
      : `/embed/property/${target.slug}`;
  return `${base}${search}`;
};
