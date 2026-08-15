# Fix: "TypeError: Assignment to constant variable" in RU reservation polling

## What is broken

Every 30 minutes the Rentals United reservation poll (`cron-pull-ru-reservations`) fails immediately. The health report flags it as a code defect. Confirmed in the sync log: 29 failed runs with `TypeError: Assignment to constant variable.`, the most recent at 06:00 UTC today, all with zero reservations and zero leads processed.

Consequence: no reservations or leads have been pulled from the channel on the scheduled cadence. Only the live push-notification path (LNM) has been bringing bookings in, so anything the channel did not notify us about is currently unseen.

## Root cause (verified)

In `supabase/functions/_shared/ruOwnerScopes.ts` the sub-account list is declared as a constant:

```text
line 74   const children: RuOwnerScope[] = [];
...
line 105  children = children.filter(...)   <- reassigning a const -> TypeError
```

Line 105 only runs when a caller passes `requireOperationalPush: true`, which is exactly what the reservation poll does — so that job throws on every run, before any account is contacted.

## The fix

1. In `supabase/functions/_shared/ruOwnerScopes.ts`, stop reassigning the constant: either declare the list with `let`, or keep `children` immutable and derive a filtered `eligible` list used for the return value. Behaviour stays identical — blocked sub-users are still logged with the same warning and excluded.
2. Redeploy `cron-pull-ru-reservations` and `cron-ru-rlnm-refresh` (both import this shared helper).
3. Run the reservation poll once manually and confirm the new `ru_sync_runs` row records `success: true` with an account label instead of the TypeError.
4. Because the poll has been dead for the whole failure window, the first successful run should be checked for reservations it now ingests that were previously missed (the ingest path is idempotent, so re-seeing known bookings is safe).

## Technical notes

- No schema change, no UI change; one shared edge-function helper plus redeploys.
- The same defect would silently affect any future caller passing `requireOperationalPush`, so fixing it in the shared helper is the correct scope rather than patching the cron.
- Verification is the sync-log row for `action = pull_reservations`, not just a clean deploy.
