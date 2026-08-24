# Fix: Owner binding shows "not bound" and re-assign does nothing

## What actually happened

Confirmed by reading the database and the audit trail:

- RU Test Clone A **is** bound: its portfolio carries a distribution account (login `ru-owner@roomsonline.co.za`, channel OwnerID `742004`, API keys verified 18 Aug).
- The Channel Monitor still printed "not bound", scope "—".
- The audit entry for your 16:38 attempt reads: `rebound RU Test Clone A to ru-owner@roomsonline.co.za (previous OwnerID —)` — the backend genuinely believed there was no account, so it archived nothing, cleared nothing and simply re-wrote the same owner email. Hence "something ran, nothing changed".

## Root cause

The query that reads the binding asks for a column that does not exist on the distribution-account table (`owner_name`). The database rejects the whole request, and the code ignores the error and treats the empty answer as "no account is bound".

Two places do this:

1. The onboarding gate's binding reader (feeds the Owner binding card, and the re-assign operation's decisions).
2. One fallback branch in the cert portal that resolves the owner identity from an existing distribution account.

Because the binding read fails, every downstream verdict is wrong: the card shows unbound, scope is blank, re-assign has nothing to archive or unbind, and the old account is never considered for archiving.

## Fix

1. **Correct the queries** — stop requesting the non-existent column in both places. The owner's display name is taken from the property/portfolio (as the rest of the flow already does), so nothing is lost.
2. **Never treat a failed read as "not bound"** — the binding reader will surface query errors instead of swallowing them, and the gate returns an explicit "binding could not be read" state.
3. **Card shows the truth** — when the read fails, the Owner binding card shows a warning row rather than "not bound", so a lookup failure can never again look like an unbound property.
4. **Re-assign refuses to run blind** — the re-assign operation aborts with a clear message if the binding cannot be read, and when the target email equals the current owner it is labelled as a deliberate reset (archive listings, clear binding, re-run Step A) instead of silently doing nothing.
5. **Re-check this property** — after the fix, reload the Owner binding card for RU Test Clone A; it should read login `ru-owner@roomsonline.co.za`, scope "Portfolio-wide", with its sibling count, and the listing state as it truly is.

## Technical detail

- `supabase/functions/ru-onboard-property/index.ts` — `readBinding()`: drop `owner_name` from the select list, capture and return the PostgREST error, add `read_error` to the returned binding shape; `rebind_owner` returns 409 when `read_error` is set.
- `supabase/functions/ru-cert-portal/index.ts` (owner-identity fallback, branch 5): drop `owner_name` from the select; keep the portfolio-name fallback for the display name.
- `src/lib/channelOnboardOrchestrator.ts` — extend the `binding` type in `OnboardGateSnapshot` with `read_error: string | null`.
- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx` — render the warning state and disable "Unbind & re-assign" while `read_error` is set.
- No schema change and no data change: the account row is intact; only the reads were wrong.
