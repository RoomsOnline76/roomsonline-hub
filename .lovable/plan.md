# Currency: flip per OwnerID, never off a shared location cache

## What is in the code today

`decideRuCurrency` (`supabase/functions/_shared/ruCurrency.ts`) has four skip branches before it will send
`Push_ChangeCurrency_RQ`. The fourth one is the problem: when nothing is known for this OwnerID, it calls
`getLocationCurrencyAnyScope(locationId)` and — if *any other account* was ever told this LocationID holds the
authored ISO — it skips the write, records an assumption for this OwnerID, and returns
`skip_reason: 'currency_already_set_location'`. So a brand-new sub-account never sends a flip, and its listings
can stay USD while the tracker reports ZAR.

Drift is currently only warned about: after the unit push, `verifyAndRecordCurrency` records
`flip_outcome: 'failed'` and logs a console warning. Nothing re-flips.

## Changes

### 1. Delete the any-scope short-circuit
- Remove the `getLocationCurrencyAnyScope` branch from `decideRuCurrency` and drop
  `currency_already_set_location` from the `skip_reason` union. Cross-account location knowledge stops being
  evidence for this account entirely (the helper itself is removed unless another caller needs it).
- Remaining skips are OwnerID-scoped only:
  - scoped read-back (`ru_location_currency_scope.source = 'ru_readback'`) for this OwnerID + LocationID + ISO;
  - a prior successful write on this same OwnerID + LocationID + ISO;
  - a durable listing-level verdict on this property whose `owner_scope` and `ru_location_id` match.

Result: first list on a new OwnerID always sends exactly one `Push_ChangeCurrency_RQ`, as child keys, with the
property's LocationID and the authored ISO.

### 2. 339 stays success, and becomes this account's read-back
Already the behaviour and kept: RU status 339 ("location already has the requested currency") is success, is
persisted as `{ owner_id, location_id, currency }` with `source: 'ru_readback'`, never retried, and never fails
the listing create. Later runs on the same OwnerID + Location then legitimately skip the write.

### 3. Drift after PutProperty triggers a re-flip, never a USD conversion
In `push-property-to-ru`, after the post-push `ListSpecProp` read-back:
- if the reported ISO equals the authored ISO, nothing changes;
- if it differs (e.g. USD while we authored ZAR), clear the scoped cache row for this OwnerID + Location, send
  one more child-scoped `Push_ChangeCurrency_RQ`, then re-read once. Bounded: one corrective flip per run.
- if the re-read still disagrees, the verdict stays `flip_outcome: 'failed'` with the RU-reported ISO so the
  tracker shows red drift. Rates are **not** converted to USD, `conversion_in_force` stays false, and prices
  keep publishing in the authored ISO.

### 4. Deferred never reaches the USD fallback
Confirmed already coded and kept as-is: a `429` / `RU_RATE_DEFERRED` on `push_change_currency` returns
`flip_outcome: 'deferred'` with `conversion_in_force: false` and retains the authored ISO — it short-circuits
before the FX block. The corrective flip in step 3 follows the same rule.

## Technical scope

- `supabase/functions/_shared/ruCurrency.ts` — remove the any-scope branch and its `skip_reason`; add a small
  helper to clear/refresh a scoped row; keep the deferred short-circuit and the 339 read-back path untouched.
- `supabase/functions/push-property-to-ru/index.ts` — corrective re-flip + single re-read at the two post-push
  verification sites; drift keeps `failed` and stays out of the FX path.
- No schema change, no UI change, no changes to the availability/price payload paths.

## Verification

Run a first list on a fresh OwnerID and check `ru_api_log` / `ru_sync_runs`:
- exactly one `Push_ChangeCurrency_RQ` with `auth_mode=child_api_keys`, that Location and ZAR;
- a 339 recorded as `ru_readback` for that OwnerID, no retry;
- `ListSpecProp` after `PutProperty` reports ZAR and `ru_currency_state` shows a fresh `verified_at`;
- a forced USD drift produces one corrective flip and, if it fails, a red `failed` verdict with
  `conversion_in_force = false`.
