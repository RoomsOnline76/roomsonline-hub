# Rate plan changes: confirmed delta push to the Channel Manager

## What happens today

- Saving a rate plan (create/update, incl. season rates) calls the rates delta fire-and-forget and, at best, shows "Rates queued for the Channel Manager". Toggling a plan active/inactive and deleting a plan fire the delta with no toast at all.
- The rates delta is debounced 5 minutes per property in `ruAriDelta`, and the callers do not pass `force`. So a rate edit made shortly after any other rates push is silently dropped (`reason: "debounced"`) and never reaches the channel until the cron runs.
- Season date changes (new season / removed season in the Calendar) already go through the property save path, which pushes the `rates` section and reports a confirmed toast. Rate plan surfaces have no equivalent confirmation.

## What to build

A single confirmed rates-push flow, reused by every rate plan surface:

1. On a successful rate plan write, push the rates delta with `force: true` so the change is never swallowed by the debounce window.
2. Show a live toast lifecycle:
   - immediately: "Sending rates to the Channel Manager…"
   - on confirmed delivery: "Rates sent to the Channel Manager — delivery confirmed"
   - when parked behind the readiness gate / rate limit: "Rates queued — will be delivered automatically" (plus the reason)
   - on rejection: destructive toast with the channel's reason
3. Keep it non-blocking: the "Rate plan updated" save toast stays immediate; the channel toast resolves in the background and a channel failure never becomes a save failure.

Surfaces to wire up:
- Rate plan create / update (including season rate edits and removed seasons) — `RatePlanEditor`
- Rate plan activate / deactivate — `RatePlansSurface`
- Rate plan delete — `RatePlansSurface`
- Copy rate plan to other properties — `RatePlanSyncToOthersDialog` (one confirmed push per target property)

Season add/remove in the Calendar keeps its existing confirmed push via the property save; no change there beyond verifying the toast wording matches.

## Technical notes

- New helper `pushRatePlanRates(propertyId, changeLabel)` in `src/lib/channelSavePush.ts`, reusing `queueChannelRatesSync(propertyId, trigger, { force: true })` and `confirmChannelPush({ propertyId, section: "rates", sinceIso })`.
- Map the verdicts: `delivered` -> success, `deferred` -> queued (with the parked-delta watch already used by `pushChangedChannelFields`), `failed` -> destructive, `not_owed` -> silent (property not distributed, or channel already holds the value).
- Triggers stay descriptive so the ledger reads well: `rate_plan_create`, `rate_plan_update`, `rate_plan_toggle`, `rate_plan_delete`, `rate_plan_copy`.
- Use sonner's updatable toast id in `RatePlanEditor`/`RatePlansSurface` so the pending toast becomes the outcome instead of stacking two toasts.
- No backend or schema change; the ARI delta and `push-property-to-ru` contract stay untouched.
