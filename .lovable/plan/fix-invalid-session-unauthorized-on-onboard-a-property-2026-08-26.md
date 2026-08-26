# Fix "Invalid session (UNAUTHORIZED)" on Onboard a property

## What's happening

Coming out of the onboarding wizard into Channel Manager, the "Onboard a property" card reads the onboarding gate immediately. That read goes to the `ru-onboard-property` backend function, which validates the caller's login token and answers `401 Invalid session` when the token has expired. The auth log for the same minute as the screenshot shows repeated "token is expired" rejections for the signed-in user, so the browser was still sending a stale token rather than refreshing it first.

Today the card just prints the raw backend message in red, with no retry and no way for you to recover other than reloading the app.

## What to change

1. **Refresh before the call** — add a small shared "make sure the login token is still valid" helper. Any Channel Manager onboarding call (gate read, Step A, Step B, entitlement) runs it first; if the stored token is expired or close to expiring, it silently renews the session before sending the request.
2. **Retry once on an expired token** — if a call still comes back unauthorized, renew the session once and repeat the same request. Only if that also fails do we show an error.
3. **Human-readable recovery state** — when the session genuinely cannot be renewed, replace the red `Invalid session (UNAUTHORIZED)` line with a clear notice ("Your session expired — sign in again to continue onboarding") plus a Sign in button, instead of a raw backend code.
4. **Don't fire the gate read too early** — the card waits for the auth state to be settled before its first gate read, so the reroute out of the wizard can't kick off a request with no/stale token.

## Technical notes

- New helper `src/lib/ensureFreshSession.ts`: reads `supabase.auth.getSession()`, calls `supabase.auth.refreshSession()` when `expires_at` is missing or within a ~60s skew, returns the valid access token or `null`.
- Wrap the four `supabase.functions.invoke` sites in `src/lib/channelOnboardOrchestrator.ts` (`ru-cert-portal`, `ru-onboard-property` ×2, `push-property-to-ru`, `channel-manager-entitlement`) with a single `invokeWithSession()` wrapper that pre-checks freshness and retries once when the response carries `UNAUTHORIZED`.
- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`: gate the initial gate-read effect on the `useAuth` loading flag; add a `sessionExpired` state that renders the re-auth notice (link to `/auth` preserving the current return path) in place of the red error line.
- No database, RLS, or edge function changes — the backend behaviour (401 on expired token) is correct.
