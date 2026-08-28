# Kill recurring channel price and availability pulls

## Confirmed diagnosis

The 22:26 calls were a paired live ARI read-back:

- `Pull_ListPropertyAvailabilityCalendar_RQ` at 22:26:04
- `Pull_ListPropertyPrices_RQ` at 22:26:12
- Both targeted Albatros listing `5966579` through the linked child account.

This pairing is produced by the readiness/certification probing path. Its current protection is a six-hour snapshot TTL, so the system treats an expired snapshot as permission to query the channel again. Scheduled ARI and reconciliation jobs already disable price read-back, so they did not originate this pair.

## Changes

1. **Make onboarding verification permanent per listing**
   - Record successful availability-and-price verification against the property and channel listing.
   - Treat that record as a one-time latch, not an expiring cache.
   - A replacement/new channel listing gets its own one-time verification.

2. **Enforce the rule at the channel gateway**
   - Permit `get_availability` and `get_prices` only when the request carries the dedicated onboarding-verification purpose and the listing has not already passed it.
   - Refuse calls from readiness dashboards, property saves, booking events, monitors, cron jobs, retries, diagnostics, and generic `force_probe` requests.
   - Prevent deferred queueing/replay of refused reads.

3. **Remove repeat callers**
   - Make readiness scoring use stored verification evidence plus the ROL'OS calendar/rates only.
   - Stop MCQ ordering, bulk readiness, recheck controls, and certification reruns from launching another live ARI pull after success.
   - Ensure normal property and ARI pushes always set all read-back flags to false.
   - Remove the recurring LNM availability pull; notifications may trigger outbound reconciliation but may not read availability back from the channel.

4. **Keep onboarding singular**
   - During first onboarding only, run exactly one availability pull and one price pull after the outbound ARI push.
   - Persist success only when both responses are valid for the intended listing and owner scope.
   - If one fails, retain the incomplete state and retry only the failed onboarding check through the explicit onboarding flow.

5. **Audit and verify**
   - Add tests proving post-onboarding requests cannot reach either channel pull endpoint, including `force_probe`, saves, booking changes, queue replay, MCQ, readiness, and cron paths.
   - Verify a fresh listing receives exactly one call of each type, while Albatros receives none because its successful 22:26 evidence already exists.
   - Deploy the affected functions and inspect fresh channel API logs to confirm zero recurring price/availability reads.

## Technical scope

- `supabase/functions/rentalsunited-api/index.ts`: central deny-by-default gateway guard for both read actions.
- `supabase/functions/ru-cert-portal/index.ts`: one-time onboarding latch; stored-evidence readiness; no TTL or force-probe bypass.
- `supabase/functions/push-property-to-ru/index.ts`: onboarding-only opt-in and no routine availability/price read-back.
- `supabase/functions/cron-ru-lnm-repull/index.ts`: remove recurring availability reads.
- Queue-drain and frontend readiness controls: prevent replay or generation of prohibited requests.
- Database migration: durable listing-scoped verification evidence with authenticated/admin access only.
