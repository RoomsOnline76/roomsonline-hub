# Lean out RU onboarding traffic (RU Test 4 / OwnerID 742570)

Implement this in the existing adapter layer only. No PropertyForm / calendar / booking UI changes.

Isolation stays as-is: channel onboarding talks to `rentalsunited-api` / `push-property-to-ru` / `channel-manager-entitlement`. Those functions own sequencing. Do not start portfolio ARI, `channel-reconcile`, reservations, or leads from the onboarding page mount.

## Goal

One onboard run for a new (or existing) RU child + one listing must produce **zero `RU_RATE_DEFERRED` / 429s** and must not replay ARI after activation.

Observed waste on Test 4 (18:00–18:04):

- `Pull_ListOwnerProp_RQ` paid once at 18:00:39, then called again from publish at 18:00:50 / 18:01:10 / 18:01:56 (2 throttles + 77s retry ladder). Snapshot lived only in one warm worker.

- `Pull_ListPropertyPrices_RQ` twice in the same second (verify + 365-day coverage audit).

- `Push_SetPropertiesStatus_RQ` (entitlement) immediately triggered `push-property-to-ru → refresh_ari` after Step B had just pushed avb + prices → second PutAvb 429 at 18:02:16, replay at 18:03:00.

- `Push_ChangeCurrency_RQ` sent unconditionally → Status **339** “Location already has the requested currency set.”

## Target sequence (this is the new order)

```text

# Step A — account (skip CreateUser when OwnerID already exists on the property)

Push_CreateUser_RQ                         # only if no OwnerID yet; master keys only

Push_CreateApiKey_RQ                       # master keys + OwnerID + XmlApi. NEVER UserName/Password

Push_FillCompanyDetails_RQ

Pull_ListOwnerProp_RQ                      # ONCE. Shared snapshot keyed by OwnerID, TTL ~60s

# Step B — listing

Push_PutProperty_RQ                        # ID=0 on create

Push_PutAvbUnits_RQ

Pull_ListPropertyAvailabilityCalendar_RQ   # one read-back only

Push_PutPrices_RQ

Pull_ListPropertyPrices_RQ                 # one pull; feed both verify + coverage audit

Pull_ListSpecProp_RQ

Push_ChangeCurrency_RQ                     # ONLY if SpecProp currency ≠ intended; treat Status 339 as success/skip

Push_SetPropertiesStatus_RQ                # entitlement; pass skip_ari_refresh=true

# RLNM / LNM_PutHandlerUrl unchanged (account-level, not per listing)

```

Do **not** follow this with a second PutAvb / calendar pull / PutPrices / price pull.

## Fix 1 — one owner-roster read per run

Problem: `resolve_ru_property_ids` (Step A adopt) and the publish step each call `Pull_ListOwnerProp_RQ` for the same OwnerID seconds apart. In-memory `OWNER_LISTING_SNAPSHOTS` is isolate-local, so publish never sees Step A’s read.

Do:

- Promote the snapshot to a **shared short-TTL cache** (same pattern as the existing roster cache). Key: `OwnerID`. TTL: ~60 seconds.

- Keep the in-memory map as L1 only.

- An empty `<Properties />` is a **valid hit**. Do not treat empty as a cache miss or you will poll again and 429.

- Publish / `push_property` must adopt that snapshot. No second `Pull_ListOwnerProp_RQ` inside the TTL.

Files: `supabase/functions/rentalsunited-api/index.ts` and whatever already persists the roster cache. Service-role only. No new public API.

## Fix 2 — one price read-back, not two

Problem: post-push verify and `auditChannelPriceCoverage` both pull `Pull_ListPropertyPrices_RQ` for the same PropertyID + window in the same second.

Do:

- `auditChannelPriceCoverage` accepts optional pre-fetched `priceXml` (or the already-parsed structure). Pull from RU only when that argument is absent (cron / standalone audit).

- Inside `push-property-to-ru`, the verification pull hands its XML into the audit. Same invocation — pass in-process. Do not add a table for this.

Files:

- `supabase/functions/_shared/ruPriceCoverage.ts`

- `supabase/functions/push-property-to-ru/index.ts`

## Fix 3 — no second ARI round after activation

Problem: enabling Channel Manager fires `channel_monitor_unit_activation` / `channel_monitor_reactivation` → `push-property-to-ru` → `refresh_ari` immediately after Step B.

Do both layers:

1. Orchestrator sends `skip_ari_refresh: true` on the entitlement call when Step B just succeeded.

2. `channel-manager-entitlement` honours that flag and does not invoke `refresh_ari`.

3. Safety net inside `push-property-to-ru`: skip `refresh_ari` when **this PropertyID** has a successful `Push_PutAvbUnits_RQ` **and** `Push_PutPrices_RQ` within the last few minutes. One of the two succeeding is not enough.

Log `skip_ari_refresh=true` or `ari_fresh` so the next Test 4 log is auditable.

Files:

- `supabase/functions/push-property-to-ru/index.ts`

- `supabase/functions/channel-manager-entitlement/index.ts`

- the onboard orchestrator that calls entitlement

## Fix 4 — skip the no-op currency write

- Run `Pull_ListSpecProp_RQ` first.

- Call `Push_ChangeCurrency_RQ` only when published currency ≠ intended currency.

- Status **339** is success / no-op. Do not fail the step, do not retry.

Currency moves to **after** SpecProp (after the listing exists). That is intentional.

## Dead path to delete (same PR)

`Push_CreateApiKey_RQ` with `<UserName>` / `<Password>` `ROLOS`, `ROLOS-r2`) returns `-4 Incorrect login`. Remove that branch. The only create-key call is master `AccessKeySecretKey` + `OwnerID` (label like `ROLOS-m`). Child keys from that response are stored and used for FillCompanyDetails, PutProperty, ARI, channels.

## Out of scope (do not mix into this PR)

- Portfolio ARI on other PropertyIDs `5808363`, `5808364`, `5808568`, `5806176`)

- `channel-reconcile` / `Pull_ListMyUsers_RQ` / `Pull_ListOwnerProp_RQ` for a different OwnerID `741761`)

- Scheduled `Pull_ListReservations_RQ` / `Pull_GetLeads_RQ`

- Dropping the single calendar read-back (keep it for the Step B verdict)

- UI, schema beyond the shared roster-cache row if one is required

If those jobs share the onboard page mount, stop invoking them from that mount. Do not change their cron behaviour in this PR.

## Acceptance

Re-run onboarding on a test property (same path as RU Test 4). The RU traffic log must show the target sequence above and:

- exactly one `Pull_ListOwnerProp_RQ` for that OwnerID

- exactly one `Pull_ListPropertyPrices_RQ`

- exactly one `Push_PutAvbUnits_RQ` + one calendar pull

- exactly one `Push_PutPrices_RQ`

- no `Push_ChangeCurrency_RQ` when currency already matches (or 339 treated as ok if it still fires once during the transition)

- entitlement log includes `skip_ari_refresh` / `ari_fresh`

- **zero** `RU_RATE_DEFERRED` / 429s

Step A/B verdicts and the coverage audit stay evidence-based (they read the one calendar pull and the one price pull).