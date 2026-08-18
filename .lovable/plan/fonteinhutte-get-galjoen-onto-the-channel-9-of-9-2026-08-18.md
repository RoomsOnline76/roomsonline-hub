# Fonteinhutte: get Galjoen onto the channel (9 of 9)

## What the data shows (checked before writing this)

Fonteinhutte Self-Catering Chalets holds exactly **9 active units**, and **8 of them carry a channel listing id**:


| Unit            | Listing id |
| --------------- | ---------- |
| Blaasoppie      | 5806492    |
| Kaapse Noontjie | 5806507    |
| Kabejou         | 5806497    |
| Karel Grootoog  | 5806516    |
| Mosselkraker    | 5806518    |
| Perekil         | 5806495    |
| Roman           | 5806514    |
| Steenbras       | 5806504    |
| **Galjoen**     | **none**   |


Galjoen's record (created April 12) was **inactive** during the push that created the other eight and was only reactivated today at 15:56, so the push never saw it. Its content is on par with the units that pushed successfully: max guests 4, two double beds (capacity 4, no shortfall), one image — nothing content-wise is blocking it.

The last account reconcile read 26 live listings with 8 live orphans, and none of those orphans is named Galjoen, so the channel most likely holds **no** Galjoen listing — it needs to be created, not adopted. Adoption is still tried first so a listing hidden or archived upstream is reused rather than duplicated.

Note: the second "Galjoen" row in the database belongs to the **(Copy)** clone property, which is non-trading and holds no channel ids. It is not a real unit and stays out of every count.

## What to do

1. **Push Galjoen for Fonteinhutte** through the existing single-property push, which now adopts an existing listing for the unit name (live or archived, reactivating if archived) and only creates when the account genuinely has none. The other eight units keep their ids untouched.
2. **Read back and verify**: after the push, confirm the account returns a live listing for Galjoen, store the id on the unit, and refresh `ru_listings_verified_*` for Fonteinhutte so the wizard shows 9 of 9.
3. **Close the recurrence**: a unit that is active with push switched on but holds no listing id must be visible and actionable — surface it as "Active locally, not on the channel" with a per-unit push action in the property's channel panel and in the reconcile per-property footprint, instead of silently pushing only the units that happen to hold ids. A unit reactivated after a push is automatically queued into the next delta push rather than waiting for a manual full push.
4. **Confirm the counts** after the run: Fonteinhutte 9 active units = 9 matched live listings, and the account total moves from 26 to 27 live listings with the orphan list unchanged. And this 27 is wrong: there are only 26 Units (4+9+9+4)  
  
This analysis and root cvause identification is weak, ineefective and not digging to the core, why this is failing. You are applying plasters over a wound that needs proper fix. patching each failure is not working.   
This plan is NOT approved, until the channel wizard flow is audited, the channel mananger and its actions have individually scoped and check a proper analysis is compelted with action plan.   
Note: Telling me "(checked before writing this)" is utter nonsense and lazy. Do better.

## Technical notes

- No schema change.
- `supabase/functions/push-property-to-ru/index.ts`: build the unit worklist from all active units (not only those holding ids); missing-id units go through the adopt-then-create path; chain the existing read-back so verification fields are written on success.
- `supabase/functions/channel-manager-entitlement/index.ts` (`reconcile`): per-property footprint gains an `unpushed_units` list (active, push on, no listing id) so Galjoen-type gaps appear in the monitor.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx` and the property channel panel: render the unpushed-unit rows with a "Push this unit" action using the existing verify → act → verify flow.
- Clone `(Copy)` properties stay excluded from all channel counts, as today.