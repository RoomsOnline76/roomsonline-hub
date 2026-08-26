# Make a property save economical: push only what changed

## What the last Seesig save actually did (from the ledger)

One save at 21:00 produced, in this order:

```text
20:58:55  ensure_company_details   (x2 calls, each logged twice)   → Pull_ListMyUsers_RQ (roster:step-a)
20:59:08  property_readiness       x4 runs, 10.3s – 11.9s each
21:00:28  phase_blocked            "Step A has not passed yet; Ready to sell has not passed yet"
21:00:28  static_delta_pending     push_type=full, changed_fields=[], scope=property, 5.7s
21:02:04  ari_delta_pending + wizard_sync_blocked
```

Four separate problems are visible in that trace:

1. **The static delta is never a delta.** `push_type: full`, `changed_fields: []`, `scope: property` — the whole property (all 9 unit listings) is queued for a push even when only the name moved. It stays that way permanently: the fingerprint map is only stored on a *successful* delta, and no delta has succeeded on this property, so every save starts from "no baseline = push everything".
2. **The server gate refuses the push** with `ONBOARDING_INCOMPLETE` ("Step A has not passed", "Ready to sell has not passed") even though the property has 9 live unit listings, verified currency and Channel Manager entitlement. So the work is done, then thrown away, then parked and retried.
3. **`Pull_ListMyUsers_RQ` comes from the save.** The company section is pushed through `ensure_company_details`, which re-enters the Step A account path and reads the sub-account roster (`roster:step-a`). A property-name change has nothing to do with the company profile or the roster.
4. **Everything runs twice (or four times).** Two `ensure_company_details` calls, four `property_readiness` scorecards at 10–12s each, and each ledger row written twice. That is what makes the save feel like it never ends.

## What changes

### 1. Only the changed fields go on the wire

- A save's changed-field list drives the payload, not just the unit scope: a `name`-only change sends the name (and the fields that share its listing record), and skips amenities/composition/images/distances/deposits entirely.
- No image probe, no `get_location_*` / currency lookup, no discount reads and no availability/price reads unless a field in that family actually changed.
- Property-level text on a multi-unit listing still has to reach each unit record, but as one minimal write per unit — not a full re-push of every attribute of nine listings.

### 2. A parked delta still records its baseline

Store the field fingerprint map whenever the content is computed, with a separate flag for "delivered". A refused or parked delta then leaves a baseline behind, so the next save is a real diff (`push_type: delta`, one or two fields) instead of another full push.

### 3. One gate, same answer on both sides

The server-side phase gate is refusing a property whose listings are live at the channel. It gets the same rule the editor gate now uses: live unit listings + verified currency + entitlement + pushes enabled = accepted. Genuinely unpublished properties keep parking as they do today. This removes the "blocked → park → re-arm" loop that doubles the traffic for every edit.

### 4. Saves never touch the account/roster path

- The company section is pushed only when a company field actually changed (it is already mapped that way; the trigger is what needs tightening).
- When it does run from a save, it uses the cached roster only — a save may never issue `Pull_ListMyUsers_RQ`. Fresh roster reads stay where they belong: Step A, binding, and the Channel Monitor.

### 5. One call per save

- A single in-flight guard per property + section, so a save cannot fire the same section twice.
- Fix the duplicated ledger insert (every run is currently written twice).
- The save does not re-run the readiness scorecards: readiness refreshes once, from one endpoint, after the save, instead of `check-activation-readiness` plus four `property_readiness` runs.
- A content-only change (e.g. name) no longer queues a rates/ARI delta.

## Result

| Save | Today | After |
| --- | --- | --- |
| Property name edited | company push + roster read, 4 readiness runs, full 9-unit content push, ARI delta — all refused and parked | one minimal content write for the name, delivered and confirmed |
| Nothing channel-relevant edited | readiness runs + skip rows | local save only |

## Technical notes

- `supabase/functions/_shared/ruStaticDelta.ts` — persist `field_fingerprints` on parked/refused runs (new `baseline_only` detail flag) and let `lastStaticRun` read that baseline; keep the hash gate keyed on delivered runs so a refused delta is still retried.
- `supabase/functions/push-property-to-ru/index.ts` — honour `changed_fields` when composing the `Push_PutProperty_RQ` payload (field families: identity/text, composition, amenities, images, distances, deposits) and skip the collateral reads (`get_location_by_*`, `list_locations`, `list_cities_and_currencies`, `get_prices`, `get_availability`, discount pulls) unless their family moved.
- `supabase/functions/_shared/ruPhaseGate.ts` — treat live unit listing ids + verified currency + entitlement as Step A/Ready-to-sell evidence, mirroring `src/lib/channelEditGate.ts`; keep `ONBOARDING_INCOMPLETE` for properties with no live listing.
- `supabase/functions/ru-cert-portal/index.ts` — `ensure_company_details` invoked with a `from_save` intent resolves the account from the roster cache (`cacheOnly`), never `forceFresh`; audit the double ledger insert around the company/readiness handlers.
- `src/lib/channelSavePush.ts` — per-property/section in-flight guard; only trigger `company` when a company field changed; never trigger `rates` for content-only field sets.
- `src/hooks/usePropertyReadiness.ts` — one readiness pass per save (drop the duplicate `property_readiness` + `check-activation-readiness` pairing on the save path).
- No schema change. Verification: edit the Seesig name and confirm a single `static_delta` row with `success=true`, `push_type=delta`, `changed_fields: ["property.name"]`, no `Pull_ListMyUsers_RQ` in `ru_api_log` for that window, and a "delivery confirmed" toast.
