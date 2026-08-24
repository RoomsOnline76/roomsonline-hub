# Three channel-traffic fixes: pop-out URL, roster spam, failing scheduled pulls

## 1. Pop-out window opens on the sandbox host

The live traffic pop-out opens the route relatively, so it inherits whatever host the workspace is on — in your case the `lovableproject.com` preview host. Generated/shared links must be domain driven.

Change: build the pop-out target from the resolved ROL'OS admin origin instead of a bare path. A small helper returns `window.location.origin` when the current host is already a ROL'OS host (production admin domain, `*.roomsonline.co.za`, or a custom domain), and `https://sleepinafrica.roomsonline.co.za` otherwise. The pop-out button opens `<origin>/admin/channel-monitor/live`.

## 2. `Pull_ListMyUsers_RQ` is being called far too often

Confirmed from the traffic log: 44 `Pull_ListMyUsers_RQ` calls in the last three hours, 20 of them throttled. The channel allows one per sliding minute, so most of that is wasted and it blocks the calls that genuinely need the roster.

Cause (verified in the code): the sub-user roster read is not shared. Every helper that needs it re-reads it, and the reader itself polls up to 4 times, 20 s apart, whenever the channel throttles:

- Step A (`plan_owner_account` / `ensure_owner_account`) reads the roster in up to five separate places in one run — plan preview, identity match, candidate collection, and two post-write re-reads.
- The bind dialog and the API-key dialog each read it again on open.
- The endpoint probe and the nightly reconciliation read it again.

Change: one cached roster.

- Add a short-lived roster cache (default 10 minutes) persisted server-side, keyed on the master account, holding the last successful `Pull_ListMyUsers_RQ` answer plus the time it was read.
- Every reader goes through the cache: a fresh entry is returned without any wire call; a stale entry triggers one wire read; a throttled read falls back to the cached answer and reports it as cached rather than polling the window.
- Within a single Step A run the roster is read at most once and passed to the helpers that currently fetch their own copy. The post-write re-reads (after creating a sub-user) bypass the cache once, because they must observe the new account, and then refresh it.
- The two dialogs and the endpoint probe use the cache and show "roster as of <time>" with a manual refresh, so opening a dialog never costs a wire call.
- Reconciliation keeps its own read (once nightly) but writes its result into the same cache.

## 3. The failed scheduled reservation and lead pulls

Two distinct failures in the log, both from the same place:

- `no_subuser_keys: … OwnerID 742004` — an account with no stored sub-user API keys is still being called. It is no longer even a bound account; the caller enumerates rows blindly.
- `status -6 … rate limited` — the same method is called several times inside one sliding minute, including a master-account call, from the same burst.

Cause (verified): the reservation-by-id lookup used by the notification retry sweep fans out over *every* row in the accounts table plus master, and for each of those tries `get_leads` and `list_reservations` across two date windows. That is up to four wire calls per account per lookup, guaranteed to collide with the 30-minute poll cron and to hit key-less accounts.

Change:

- Only scope the fan-out to accounts that actually have usable, verified API keys — the same rule the poll cron already applies — so key-less/demo accounts are never called. They are logged once as skipped, not filed as failures.
- Drop the second (wider) date window: try the narrow window first and only widen for the account that partially matched.
- Pace the fan-out against the per-method sliding window, and stop the whole lookup as soon as the reservation is resolved (already true for pass 1, to be applied to the listing pass too).
- Treat a rate-limited answer as "retry later" rather than continuing to the next account inside the same minute.

## Technical notes

- Files: `src/components/admin/channel-monitor/live/LiveTrafficFrame.tsx` (+ a small origin helper next to `src/lib/config.ts`); `supabase/functions/ru-cert-portal/index.ts` (`listRuSubUsers` → cached roster, Step A single read); `supabase/functions/_shared/` (new roster cache module, reused by `channel-manager-entitlement`); `supabase/functions/_shared/ruReservationIngest.ts` (`fetchRuReservationById` scope filter + pacing).
- The roster cache is stored in a small table so it survives cold starts, with the master OwnerID as key and a `fetched_at` timestamp; RLS admin/dev read-only, service role write.
- No change to what is pushed to the channel; these are read-side and link-side fixes only.
