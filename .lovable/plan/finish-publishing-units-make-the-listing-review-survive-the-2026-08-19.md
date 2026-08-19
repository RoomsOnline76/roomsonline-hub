# Finish publishing units: make the listing review survive the channel rate limit

## What happens today

The wizard's listing review (step "Pull listings") calls `resolve_ru_property_ids`, which reads the sub-account's listings from the channel. `list_properties` is a deferrable action, so when the channel's one-call-per-sliding-minute window is already used the read is parked in the background queue and answers `202 { queued: true }`. The review step converts that into a hard failure:

`422 RU_RATE_DEFERRED — Channel rate limit — retry in 60s (sub-account ru-owner@… OwnerID 742004)`

Nothing resumes the review afterwards, so the remaining units stay unpublished and the "connect to channel" step never opens, even though the queued read does eventually run.

## What changes

1. **Try to pass the gate first.** When the listing read comes back queued/deferred, the review retries it once as a non-deferrable call so the gate waits out the remainder of the sliding window (up to its existing 25s cap) instead of giving up immediately. Most reviews then simply pass on the spot.

2. **If it still can't pass, finish in the background instead of failing.** The review enqueues a background job for the property and answers `202 { success: true, pending: true, retry_after_ms }` rather than a 422. A new `channel_listing_review` job type re-runs the same review; if the window is still closed it throws, so the existing job retry/backoff ladder re-attempts until the read lands. No new queue, no new cron.

3. **Finish outstanding units automatically.** When a publish run ends with units still outstanding (`remaining_unit_ids`), a `channel_publish_units` job is enqueued for exactly those units, so a rate-limited or budget-truncated run completes on its own instead of leaving e.g. 8/9 units live.

4. **Tell the user when it lands.** The wizard treats a pending review like the existing read-back pending state: an informational toast ("Reviewing your listings with the channel — this finishes on its own"), a small "in progress" marker on the step, and the existing poll/refresh loop already used for read-back. When the ledger's `pull_listings` step passes and every unit is confirmed, a success toast fires — "Listings confirmed — you can connect to the channel" — and the connect step unblocks. If the job exhausts its attempts, an error toast names the real reason.

Hard gates, credential checks and the one-call-per-minute discipline are unchanged; only the handling of a *deferred* read changes, and a deferral is never reported as an empty sub-account.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`, `resolve_ru_property_ids` (~4300-4340): retry the `list_properties` invoke once with `deferrable: false`; on a persisting deferral call `enqueueJob(admin, 'channel_listing_review', { property_id })` and return `202 { success: true, pending: true, retry_after_ms }`. All other error codes (`RU_CHILD_AUTH_REQUIRED`, `RU_LIST_FAILED`, `RU_OWNER_NOT_BOUND`) keep their current 422 behaviour.
- `supabase/functions/process-background-jobs/index.ts`: add `channel_listing_review` (invoke `ru-cert-portal` → `resolve_ru_property_ids`; throw when the answer is still `pending` so the job retries) and `channel_publish_units` (invoke `push-property-to-ru` with `only_unit_ids`, throw while any unit is still outstanding).
- `supabase/functions/push-property-to-ru/index.ts`: on a completed invocation with a non-empty `remaining_unit_ids`, enqueue `channel_publish_units` for those ids (idempotent per property+ids).
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx`: `pullListings` handles `pending: true` as a non-error path (info toast + `reviewPending` state reusing the `readBackPending` poll), and the driver result in `publishListing` reports "finishing in the background" when units remain.
- No schema change, no new table, no new cron; `background_jobs`, `ru_call_queue` and the ledger are used as built.

## Verification

Re-run the review for OwnerID 742004 while the window is closed: the step reports "reviewing in the background" instead of a 422, `background_jobs` shows one `channel_listing_review` row that completes within a couple of minutes, the property ends with `ru_listings_verified_units == ru_listings_expected_units`, and the connect-to-channel step opens with the success toast.
