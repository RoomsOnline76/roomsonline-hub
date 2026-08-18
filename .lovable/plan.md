# Channel publish invariant: no unit can be silently unpublished

## What the audit found (verified against the database and the code, this turn)

Current state of the four trading Jongensfontein properties:

| Property | Active units | Canonical units (Rooms tab) | Active units holding a listing id | Building listing |
| --- | --- | --- | --- | --- |
| Dassiesingel | 4 | 4 | 4 | none |
| Fonteinhutte | 9 | 9 | **8** | none |
| Seesig | 9 | 9 | 9 | none |
| Tidal Pools | 4 | 4 | 4 | none |

So the local data is now consistent except one fact: **Galjoen is active, canonical, and holds no channel listing id.** Fonteinhutte also carries four inactive legacy misspellings (Blassoppie, Kaapse Nooientjie, KAAPSE NOOINTJIE, KABELJOU) with no ids — harmless, but they are the reason name-based matching has repeatedly gone wrong.

Why Galjoen was never noticed, traced through the code rather than guessed:

1. **The push only ever sees units active at push time.** `push-property-to-ru` selects `hostfully_room_types` where `is_active = true`, dedupes by lower-cased name, then intersects with `properties.amenities.room_types`. Galjoen was inactive during the last push, so it was never in the worklist. Nothing re-checks afterwards.
2. **A push reports "complete" on the units it happened to carry.** Chunk success is `every unit in this chunk succeeded`; the sequence has no notion of "every unit this property owns must end with a listing id".
3. **The readiness scorer never asks whether a unit is published.** `ru-cert-portal` builds its readiness units from the dry run's unit list — the same active-at-that-moment list — and `_shared/ruReadiness.ts` has no check at all for "this unit holds a channel listing". A property can therefore score 100% content-ready while a unit exists only locally.
4. **Reconciliation can see the gap but nobody is told.** The monitor's per-property footprint already computes `units_without_listing`, yet it is a passive row: no alert, no health-report finding, no wizard consequence.

That is the wound: **there is no invariant anywhere that active canonical units must equal published listings.** Galjoen is the symptom.

## What to change

### 1. Make "every active unit is published" a first-class readiness check
- Add a mandatory `units_published` check to the shared readiness scorer: for a published property, every canonical active unit must hold a channel listing id, and the check names the units that don't.
- Feed it from the property's own unit rows (not the dry-run snapshot), so a unit missing from the last push still counts in the denominator.
- The wizard's channel step then reads "8 of 9 units published — Galjoen not published" instead of 100%, and the fix action is the existing push.

### 2. The push must close the loop on the whole property
- After a push sequence finishes (last chunk, no remaining units), re-read the property's active canonical units and report any that still hold no listing id as an explicit `unpublished_units` result — a completed push with unpublished units is not "complete".
- Units that were inactive at push time but are active now are picked up automatically on the next push because the worklist is rebuilt from the current rows.

### 3. Surface and act on the gap where it is visible
- Channel monitor: promote `units_without_listing` from a passive row to a per-property warning with a **Publish missing units** action (existing push, `only_unit_ids`).
- Daily health report: an active canonical unit with no listing id on a trading property is a finding with the unit named, not silence.

### 4. Then fix Galjoen properly
- Publish Galjoen through the normal push, which now adopts an existing listing for that name (live first, archived reactivated) or creates one if the account genuinely has none — the adoption guard added earlier already prevents a duplicate generation.
- Re-verify Fonteinhutte's other 8 ids in the same run: the last account read showed eight live listings named exactly like Fonteinhutte's units sitting as orphans, which suggests our stored ids point at older copies. The reconcile after the push must show Fonteinhutte's 9 active units matched to 9 live listings, with no orphans left under those names.
- Clean up the four inactive misspelled unit rows so name matching can never re-adopt them.

## Technical notes

- `supabase/functions/_shared/ruReadiness.ts` — new `units_published` check + input field on `RuUnitInput` (`published: boolean`), mandatory only when the property is published.
- `supabase/functions/ru-cert-portal/index.ts` — `scoreProperty` merges the live `hostfully_room_types` active/canonical set into the readiness units, so the denominator is the property's real unit list.
- `supabase/functions/push-property-to-ru/index.ts` — post-sequence verification of unpublished units in the standalone-units branch; add `unpublished_units` to the result and treat a final chunk with gaps as `resumable` rather than `complete`.
- `supabase/functions/daily-health-report/index.ts` — unpublished-unit finding for trading properties.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx` + `src/hooks/useChannelReconciliation.ts` — warning state and the publish-missing-units action.
- No schema change.
