/**
 * Session freshness guard.
 *
 * `supabase.functions.invoke()` sends whatever access token the client currently holds.
 * When a tab has been open a while (or the app was just rerouted out of the onboarding
 * wizard) that token can already be expired, and every edge function answers
 * `401 Invalid session (UNAUTHORIZED)`. Refreshing before the call — and once more after a
 * refusal — turns that dead end into a silent renewal.
 */

import { supabase } from "@/integrations/supabase/client";

/** Renew when the stored token expires within this window. */
const EXPIRY_SKEW_SECONDS = 60;

/**
 * Make sure the stored login token is still valid, renewing it when it is expired or
 * about to be. Returns the usable access token, or `null` when no session can be had.
 */
export async function ensureFreshSession(force = false): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const expiresAt = session.expires_at ?? 0;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const stale = !expiresAt || expiresAt - nowSeconds <= EXPIRY_SKEW_SECONDS;

  if (!force && !stale) return session.access_token ?? null;

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error || !refreshed.session) return null;
  return refreshed.session.access_token ?? null;
}

/** True when a function error/payload is an expired-or-invalid-session refusal. */
export function isUnauthorizedFunctionError(
  error: unknown,
  payload?: Record<string, unknown> | null,
): boolean {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  if (status === 401) return true;
  const code = ((payload?.error ?? null) as { code?: string } | null)?.code;
  return code === "UNAUTHORIZED";
}

export class SessionExpiredError extends Error {
  constructor(message = "Your session expired — sign in again to continue.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/**
 * `supabase.functions.invoke()` with a session guard: renew a stale token first, and
 * retry once against a freshly refreshed token when the function still answers
 * `401 Invalid session`. A genuinely dead session throws `SessionExpiredError` so the
 * caller can surface a re-login instead of a blank screen.
 */
export async function invokeWithSession(
  fn: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: unknown }> {
  if (!(await ensureFreshSession())) throw new SessionExpiredError();
  let res = await supabase.functions.invoke(fn, { body });
  if (isUnauthorizedFunctionError(res.error, (res.data ?? {}) as Record<string, unknown>)) {
    if (!(await ensureFreshSession(true))) throw new SessionExpiredError();
    res = await supabase.functions.invoke(fn, { body });
    if (isUnauthorizedFunctionError(res.error, (res.data ?? {}) as Record<string, unknown>)) {
      throw new SessionExpiredError();
    }
  }
  return { data: res.data, error: res.error };
}
