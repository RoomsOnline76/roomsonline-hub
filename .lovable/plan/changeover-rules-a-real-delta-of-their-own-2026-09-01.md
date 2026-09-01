# Changeover rules: a real delta of their own

Goal: a changeover edit reaches the channel as an availability-only, range-bound delta — never
prices, never a listing pull plus full property put — can be authored per date range or season, and
is visible on the calendar wherever it differs from the property master rule.

## What the code shows today (verified)

- Changeover is authored in only three shapes: a property master code, per-weekday overrides, and a
  per-unit override (`ChangeoverRulesCard`, `resolveChangeoverRules` in `push-property-to-ru`).
  There is no date-range or season authoring at all.
- The three changeover fields are classified in the `rates` section
  (`src/lib/channelPushFields.ts:103-105`), so a changeover-only save is queued with the generic
  `property_save_mandatory_fields` trigger.
- `ruDeltaScopeForTrigger` has no changeover case, so that trigger classifies as `both`: a
  changeover edit currently asks for a prices push as well as availability.
- Changeover values are folded into the availability entries and therefore into the availability
  hash, and the availability write is skipped when the prior hash matches
  (`push-property-to-ru/index.ts:2827`) unless the caller forces it. A changeover edit is sent with
  no force flag, so a stale or coincidentally-matching prior hash silently drops it.
- No calendar surface renders changeover (`src/lib/restrictionMarkers.ts` covers stop-sell, min/max
  stay and lead days only).

The exact reason the last live edit never appeared is not yet proven from the logs, so the first
step below is a measurement, not a guess.

## Step 1 — Prove the silent path

Fire one changeover-only save on the Leopard test listing and read `ru_api_log` for that trace:
confirm whether `Push_PutAvbUnits_RQ` was attempted, skipped on hash, or never enqueued, and whether
`Pull_ListSpecProp_RQ` / `Push_PutProperty_RQ` rode along. Record the finding; it decides nothing
below but confirms the fix is complete.

## Step 2 — A changeover trigger that owns only availability

- Add changeover to the availability-only classifier so it can never carry prices.
- Split the save push: when changeover fields move, they are queued as their own
  `changeover_change` delta (availability scope, forced, with the affected date range) instead of
  being folded into the generic rates trigger. Other rate fields in the same save keep their own
  prices-only delta — the two never merge, per the existing "never both" rule.
- The changeover delta forces the availability write so the availability hash can no longer mask it,
  and it never touches the static/content path (no listing pull, no property put).

## Step 3 — Range and season changeover

- New authoring store `amenities.changeover_spans`: a list of `{ from, to, code, season_id?, label? }`
  entries, additive to what exists.
- `ChangeoverRulesCard` gains a spans editor: add a span by date range, or pick a season from the
  property's authored seasons (dates resolved from that season), with the same code choices as the
  master rule.
- Resolution precedence per night, used by both the push and the local availability guard:
  unit override → span covering the night → per-weekday rule → property master.
- The push sends only the nights the edit touched (`date_from`/`date_to` scoped), not the 365-day
  window, when the edit is a span change.

## Step 4 — Calendar visibility

- A changeover lane in the week, month and room-plan views: a thin marker on every night whose
  effective code differs from the property master rule.
- Hover states the rule in plain language and where it came from ("No arrivals — Saturday rule",
  "Both allowed — season 'Festive' span", "Unit override").
- Nights that match the master rule stay unmarked, so the calendar shows exceptions only.

## Step 5 — Verify

- Range-scoped read-back of the availability calendar for the changed nights only, asserting the
  returned changeover matches what was authored (the existing readback already compares the
  `changeover` field).
- Confirm from `ru_api_log` that the changeover save produced exactly one `Push_PutAvbUnits_RQ`
  covering the edited range, and no `Push_PutPrices_RQ`, `Pull_ListSpecProp_RQ` or
  `Push_PutProperty_RQ`.

## Technical notes

- Files: `supabase/functions/_shared/ruDeltaScope.ts`, `src/lib/channelPushFields.ts`,
  `src/lib/channelSavePush.ts`, `src/lib/channelContentSync.ts`,
  `supabase/functions/push-property-to-ru/index.ts` (`resolveChangeoverRules`,
  `expandAvailability`), `supabase/functions/_shared/ruChangeoverRules.ts` (shared span resolver),
  `src/lib/restrictionMarkers.ts`, `src/components/property/policies/ChangeoverRulesCard.tsx`,
  calendar grids (`RoomPlanGrid`, week/month views).
- Wire codes stay as measured (`4` = arrival and departure allowed, `1` = neither); no change to
  `_shared/ruChangeover.ts`.
- Deploys: `push-property-to-ru`, `ru-ari-delta`, `cron-ru-call-queue-drain`.
