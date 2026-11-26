// Shared caller verification for edge functions.
// Every privileged action must prove WHO is calling: the service role (internal
// function-to-function calls), a genuine scheduled job (x-cron-secret), or a
// signed-in user whose access to the property is checked in the database.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Caller =
  | { kind: "service" }
  | { kind: "cron" }
  | { kind: "user"; userId: string; email: string | null };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

let adminClient: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (!adminClient) adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  return adminClient;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

/** Resolve the caller, or null when anonymous. Never trusts body fields. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const token = bearer(req);
  if (token && SERVICE_KEY && token === SERVICE_KEY) return { kind: "service" };
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data } = await serviceClient().rpc("verify_cron_token", { _token: cronSecret });
    if (data === true) return { kind: "cron" };
  }
  if (!token) return null;
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data?.user) return null;
  if ((data.user as { is_anonymous?: boolean }).is_anonymous) return null;
  return { kind: "user", userId: data.user.id, email: data.user.email ?? null };
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "dev", "fearless_leader"]);
  return (data?.length ?? 0) > 0;
}

export async function canAccessProperty(userId: string, propertyId: string | null | undefined): Promise<boolean> {
  if (!propertyId) return false;
  if (await isPlatformAdmin(userId)) return true;
  const { data } = await serviceClient().rpc("can_access_property", { _property_id: propertyId, _user_id: userId });
  return data === true;
}

/** Internal only: service role or scheduled job. */
export async function requireInternal(req: Request): Promise<Caller> {
  const c = await getCaller(req);
  if (!c || c.kind === "user") throw new AuthError("Not allowed", 403);
  return c;
}

/** Internal callers or platform admins (admin/dev/fearless_leader). */
export async function requireAdminOrInternal(req: Request): Promise<Caller> {
  const c = await getCaller(req);
  if (!c) throw new AuthError("Sign in required", 401);
  if (c.kind !== "user") return c;
  if (!(await isPlatformAdmin(c.userId))) throw new AuthError("Not allowed", 403);
  return c;
}

/** Any signed-in (non-anonymous) user, or an internal caller. */
export async function requireSignedIn(req: Request): Promise<Caller> {
  const c = await getCaller(req);
  if (!c) throw new AuthError("Sign in required", 401);
  return c;
}

/** Internal callers, or a signed-in user who manages the property. */
export async function requirePropertyAccess(req: Request, propertyId: string | null | undefined): Promise<Caller> {
  const c = await getCaller(req);
  if (!c) throw new AuthError("Sign in required", 401);
  if (c.kind !== "user") return c;
  if (!(await canAccessProperty(c.userId, propertyId))) throw new AuthError("Not allowed", 403);
  return c;
}

/** Same as requirePropertyAccess, resolving the property from a booking id. */
export async function requireBookingAccess(req: Request, bookingId: string | null | undefined): Promise<{ caller: Caller; propertyId: string | null }> {
  const c = await getCaller(req);
  if (!c) throw new AuthError("Sign in required", 401);
  if (!bookingId) throw new AuthError("Booking required", 400);
  const { data } = await serviceClient().from("bookings").select("property_id").eq("id", bookingId).maybeSingle();
  const propertyId = (data?.property_id as string | undefined) ?? null;
  if (!propertyId) throw new AuthError("Not found", 404);
  if (c.kind !== "user") return { caller: c, propertyId };
  if (!(await canAccessProperty(c.userId, propertyId))) throw new AuthError("Not allowed", 403);
  return { caller: c, propertyId };
}

/** Allowed redirect origins for payment / OAuth returns. */
const ALLOWED_HOST_SUFFIXES = ["roomsonline.co.za", "rolos.co.za", "lovable.app", "jongensfontein.com", "localhost"];
export function isAllowedReturnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && u.hostname === "localhost")) return false;
    return ALLOWED_HOST_SUFFIXES.some((s) => u.hostname === s || u.hostname.endsWith("." + s));
  } catch {
    return false;
  }
}
/** Returns url when allowed, else the fallback. */
export function safeReturnUrl(url: string | null | undefined, fallback: string): string {
  return isAllowedReturnUrl(url) ? (url as string) : fallback;
}

export function authErrorResponse(err: unknown, cors: Record<string, string>): Response | null {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  return null;
}

/** Escape caller-supplied text before placing it in email HTML. */
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Like isAllowedReturnUrl, but also trusts configured white-label domains. */
export async function isTrustedReturnUrl(url: string | null | undefined): Promise<boolean> {
  if (isAllowedReturnUrl(url)) return true;
  if (!url) return false;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  const sb = serviceClient();
  for (const table of ["property_portfolios", "property_billing_configs", "portfolio_billing_configs"]) {
    const { data } = await sb.from(table).select("white_label_domain").ilike("white_label_domain", host).limit(1);
    if ((data?.length ?? 0) > 0) return true;
  }
  return false;
}
export async function trustedReturnUrl(url: string | null | undefined, fallback: string): Promise<string> {
  return (await isTrustedReturnUrl(url)) ? (url as string) : fallback;
}

/**
 * Entry guard for functions scoped to one property named in the JSON body.
 * Internal callers and platform admins pass; other users must manage the property
 * (resolved from `property_id`, or from `booking_id` when given). Returns a
 * ready-made denial response, or null to continue.
 */
export async function guardBodyProperty(
  req: Request,
  cors: Record<string, string>,
  opts: { only?: (body: Record<string, unknown>) => boolean } = {},
): Promise<Response | null> {
  if (req.method === "OPTIONS") return null;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.clone().json()) ?? {};
  } catch { /* empty body */ }
  if (opts.only && !opts.only(body)) return null;
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ success: false, error }), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const caller = await getCaller(req);
  if (!caller) return deny(401, "Sign in required");
  if (caller.kind !== "user") return null;
  if (await isPlatformAdmin(caller.userId)) return null;
  let propertyId = (typeof body.property_id === "string" && body.property_id) ||
    (typeof body.propertyId === "string" && body.propertyId) || null;
  if (typeof body.booking_id === "string" && body.booking_id) {
    const { data } = await serviceClient().from("bookings").select("property_id").eq("id", body.booking_id).maybeSingle();
    const bp = (data?.property_id as string | undefined) ?? null;
    if (!bp) return deny(404, "Not found");
    if (propertyId && propertyId !== bp) return deny(403, "Not allowed");
    propertyId = bp;
  }
  if (!propertyId || !(await canAccessProperty(caller.userId, propertyId))) return deny(403, "Not allowed");
  return null;
}
