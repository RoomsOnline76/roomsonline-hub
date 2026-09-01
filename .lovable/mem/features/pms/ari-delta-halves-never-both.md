---
name: ARI Delta Halves Never Both
description: A trigger owns one half of ARI — rate edits push prices only, availability edits push availability only; both together only for onboarding/full refresh/scheduled runs
type: feature
---

`supabase/functions/_shared/ruDeltaScope.ts` → `ruDeltaScopeForTrigger(trigger)` returns
`'rates' | 'availability' | 'both'` and is the single classifier for every ARI delta.

- **rates only** (`rate_*`, `rate_plan_*`, `price_*`, `season_*`, `currency_*`, `discount_*`,
  `derived_rate*`, or a `:rates` suffix): `skipAvailability: true`. No `Push_PutAvb_RQ`, no
  `force_availability`, no calendar read-back.
- **availability only** (`booking_*`, `restriction_*`, `stop_sell*`, min/max stay, `lead_days*`,
  `availability*`, `block*`/`unblock*`/`release*`, or a `:availability` suffix):
  `skipPrices: true`. No `Push_PutPrices_RQ` even when `prices_hash` is stale.
- **both** only for onboarding, initial/full/manual refresh, cron/scheduled/reconciliation,
  certification and repair triggers. Unknown triggers default to `both`.

The debounce queue is scope-keyed (`ru_ari_delta:<propertyId>:<scope>`) so a parked rates delta
and a parked availability delta can never collapse into each other and publish the half nobody
edited.
