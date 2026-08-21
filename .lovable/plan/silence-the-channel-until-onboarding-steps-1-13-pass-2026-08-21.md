# Silence the channel until onboarding steps 1–13 pass

Today every save on a property fires a channel delta and a toast lifecycle, even when the property has not been published to the Channel Manager yet. The result is noise ("queued", "will be delivered automatically") and pointless traffic for properties still working through the wizard.

Rule to enforce: **no channel calls and no channel toasts from ordinary edits until the first 13 wizard steps are complete** (identity, location, rooms, media, commercial, push owner, keys, company profile, sign-off, pull listings, publish, currency, Channel Manager entitlement). Step 14 (connect channels) is not required — a published, entitled property still pushes deltas.

## Behaviour after the change

| Situation | Result |
| --- | --- |
| Property still inside steps 1–13, operator saves anything | Save toast only. No delta call, no "queued"/"confirmed" toast, no confirmation polling. |
| Rate plan / season / restriction edit on the same property | Same: silent, no channel call. |
| Steps 1–13 complete | Exactly today's behaviour — delta push, confirmation, toasts. |
| Manual "push now", wizard publish, certification console, cron | Unchanged. These are explicit actions and keep working at any stage. |

## Technical approach

**1. New gate helper `src/lib/channelEditGate.ts`**
`isChannelEditPushAllowed(propertyId)` resolves the step-13 line from database state only (no RU traffic), with a short in-memory cache (60s) plus invalidation on the existing RU accounts signal:
- `properties.rentalsunited_property_id` present and `ru_listings_verified_at` set (step 11 published & read back),
- `ru_currency_state.verified_at` present and consistent (step 12),
- billing config `channel_manager_enabled = true` (step 13),
- sign-off recorded (step 9).
Any missing signal ⇒ not allowed. Failures resolve to *not allowed* so a read error can never cause a surprise push.

**2. Choke point in `src/lib/channelContentSync.ts`**
`queueChannelContentSync` / `queueChannelRatesSync` consult the gate before invoking `ru-static-delta` / `ru-ari-delta` and return `{ queued: false, reason: "onboarding_incomplete" }` without any edge invoke. A new `options.manual = true` bypasses the gate; it is passed by the manual push surfaces (`ChannelContentSyncStatus`, wizard actions, NightsBridge import if desired). Ledger bookkeeping (`markChannelStepsStale`) still runs — it is local and off by default.

**3. Quiet toasts in `src/lib/channelSavePush.ts`**
- `pushChangedChannelFields`: returns immediately when the gate is closed — no sections triggered, no confirmation polling, no toast.
- `pushRatePlanRates`: checks the gate *before* `toast.loading`, so no spinner appears and nothing is dismissed later.
- Also treat `reason: "onboarding_incomplete"` as silent everywhere it can surface.

**4. Server backstop in `supabase/functions/_shared/`**
A shared DB-only check used by `queueRuStaticDelta` and `queueRuAriDelta`: when the property has not cleared steps 1–13, skip quietly (like `not_connected`) instead of parking the delta as `gate_pending`. Deltas for already-published properties keep parking and re-arming as they do now, so nothing owed to a live listing is lost. Cron and explicit `force`/manual invocations are unaffected.

**5. Editor chrome**
The RU rate-gate countdown pill only renders once the gate is open, so a pre-publish property shows no channel timers.

## Notes

- No schema change; the gate reads existing tables.
- Once a property crosses step 13, its next save pushes the full current content (the fingerprint is stale), so nothing edited during onboarding is lost.
- Unit tests for the gate resolver (each missing signal closes the gate; all present opens it).
