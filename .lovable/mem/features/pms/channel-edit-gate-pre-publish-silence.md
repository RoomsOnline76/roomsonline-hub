---
name: Channel Edit Gate (pre-publish silence)
description: No channel calls or push toasts from ordinary edits until a property clears Channel onboarding steps 1-13
type: feature
---

Until a property has cleared the first 13 Channel onboarding steps, ordinary edits
(property save, rate plans, seasons, restrictions, charges, images, policies) must make
**no channel call at all** and must show **no push/queued/confirmation toasts**.

Single client gate: `src/lib/channelEditGate.ts` → `isChannelEditPushAllowed(propertyId)` /
`channelEditGateState(propertyId)`. DB-only reads, 60s cache, invalidated by
`RU_ACCOUNTS_CHANGED_EVENT`; **closed by default and on any read failure**.

Gate signals:
- `properties.rentalsunited_property_id` present and `ru_listings_verified_at` set (step 11)
- `properties.ru_push_enabled !== false`
- `ru_currency_state.verified_at` set and reported currency matches published (step 12)
- every `ROLOS_SIGNOFF_CHECKLIST` key ticked in `property_onboarding_roadmap.roadmap.channel_readiness.checks` (step 9)
- `channel_manager_enabled` true on `portfolio_billing_configs` (portfolio member) else `property_billing_configs` (step 13)

Step 14 (connect sales channels) is deliberately NOT required.

Choke points: `queueChannelContentSync` / `queueChannelRatesSync` return
`{ queued: false, reason: "onboarding_incomplete" }` without invoking any edge function;
`pushChangedChannelFields` and `pushRatePlanRates` return before any toast; `RuRateGateTimer`
stays hidden. Explicit operator/system pushes (manual "push now", wizard publish,
certification console, cron) pass `manual: true` to bypass the gate.
