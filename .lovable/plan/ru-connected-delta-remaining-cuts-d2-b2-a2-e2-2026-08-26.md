# RU connected-delta — remaining cuts (D2, B2, A2, E2)

Adapter-only change. No calendar, booking, PropertyForm or onboarding work. Goal: a save on a connected listing sends only the nights, units and fields that moved.

## Confirmed current state

- `supabase/functions/_shared/ruAriDelta.ts` still sleeps in-isolate for up to 5 minutes (`await new Promise(setTimeout(RU_ARI_DELTA_DEBOUNCE_MS - sinceLast))`) before invoking the push — that wait outlives the isolate, so a coalesced last click is lost.
- `push-property-to-ru` `refresh_ari` builds `targets` from every active room type; `only_unit_ids` is only honoured in the `static_only` / per-unit push paths, not for ARI.
- Prior ARI hashes load only when both `windowFrom` and `windowTo` are absent, so any scoped write always re-sends.
- `cron-push-all-properties-to-ru` `continue`s on `staticScope.unchanged` with no `ru_sync_runs` row — invisible in the operator log.
- Every current caller of `syncRestrictionsToChannels(` and `pushRatePlanRates(` omits the date range those helpers already accept (bulk restriction dialogs, `RestrictionsManagerDialog`, `RatePlanEditor`, `RatePlansSurface`, `RatePlanSyncToOthersDialog`).
- Reusable parking already exists: `ru_call_queue` with `ru_enqueue_call` (upsert-collapse on `method_key`, `not_before` delay) drained every minute by `cron-ru-call-queue-drain` (pg_cron job `ru-call-queue-drain`). No migration needed.

## 1. D2 — park the deferred ARI instead of sleeping

`_shared/ruAriDelta.ts`: when `!options.force` and a real `refresh_ari` ran inside the debounce window, stop sleeping. Instead enqueue via `ru_enqueue_call` with a stable per-property `method_key` (e.g. `ari_delta:<property_id>`), action `refresh_ari_delta`, `not_before` = remaining debounce, and payload carrying the latest `trigger`, `dateFrom`, `dateTo`, `onlyUnitIds`, `verifyAvailabilityReadback`. The unique pending index collapses three clicks into the last snapshot. Return `{ queued: true, reason: "coalesced" }` immediately; no await longer than ~2s.

`cron-ru-call-queue-drain/index.ts`: add one branch — rows with action `refresh_ari_delta` invoke `push-property-to-ru` (`action: 'refresh_ari'`, force flags off) instead of `rentalsunited-api`. Same success/backoff/no_op handling as today.

Booking `force: true` keeps invoking inline, still closes sold nights, still pulls the calendar.

## 2. B2 — honour the span and the unit

Edge (the real bug): in `push-property-to-ru` `refresh_ari` target assembly, when `only_unit_ids` is a non-empty array, build `targets` from those room types only; log dropped units.

Callers — pass through ranges/unit ids they already hold, nothing more:
- restriction dialogs and `RestrictionsManagerDialog` → `syncRestrictionsToChannels(ids, label, { from, to })` from the span just written to `property_availability`.
- `RatePlanEditor` / `RatePlansSurface` / `RatePlanSyncToOthersDialog` → `pushRatePlanRates(..., { dateFrom, dateTo })` when the edit is scoped to one season; omit when it is not (365 stays).
- `_shared/channelBookingSync.ts` → pass the stay dates and the booked unit id into `queueRuAriDelta` where already in scope.

No new components, no date pickers, no JSX restyle.

## 3. A2 — compare hashes per window

In `push-property-to-ru` `refresh_ari`, replace the "only load priors when unscoped" guard: load the most recent successful `refresh_ari` whose `details.window.from/to` equals this request's window (both-null = full year), and take `availability_hash` / `prices_hash` from that row's targets. No matching window → write. Keeps writing `details.window`, `details.skipped` and per-target hashes.

Result: a second identical scoped close logs `skipped_avb`, sends zero PutAvb, zero calendar pull; the daily full-year cron still compares to the last full-year hash.

## 4. E2 — log weekly skips

`cron-push-all-properties-to-ru`: before `continue` on `staticScope.unchanged`, insert a success `ru_sync_runs` row with `details: { skipped: true, reason: 'unchanged', content_hash }`. Result array keeps `status: 'skipped'`.

## Preserved

`static_only` / `refresh_ari` isolation, booking force + reserved-day split/retry, daily `cron-refresh-ru-ari` cadence, `staticSnapshotHash` shape, image-probe skip, coverage-cron `skipped_fresh_ari`, onboard lean-out, `adapter-contract.ts`.

## Verification

Unit test for window-matched prior-hash selection alongside `ruStaticDelta.hash.test.ts`; grep that `queueRuAriDelta` has no wait over 2000 ms; list every touched `syncRestrictionsToChannels` / `pushRatePlanRates` call site; replay a scoped restriction save twice against a test listing and confirm the second run logs `skipped_avb`.
