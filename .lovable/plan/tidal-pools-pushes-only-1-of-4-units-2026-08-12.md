# Tidal Pools pushes only 1 of 4 units

## What is actually wrong

The push is behaving correctly — it only ever pushes units that are marked active. Right now Tidal Pools has only **one** active unit record.

Confirmed in the data:

- The Rooms tab for Tidal Pools lists 4 units: **Elf, Wildeperd, Geelstert, Leervis**.
- The unit records hold 8 rows (4 real + 4 legacy ALL-CAPS copies), and **only Wildeperd is active** (it holds channel listing 5763781). Elf, Geelstert and Leervis were switched inactive at 17:53–17:54 today.
- The audit trail shows why: a run of single-unit "remove from channel" actions from the channel cost monitor at 17:53:50–17:54:17 (Elf, Geelstert, Leervis and their ALL-CAPS twins), immediately followed by the duplicate purge. The unit toggle sets the local `is_active` flag off as part of delisting, so removing a *listing* also switched the real *unit* off.
- Consequence: the push log reads `Multi-unit mode: 1 units`, and the other three units also lost their channel ids, so they are no longer on the channel at all.

Seesig came out of the same cleanup intact (9 units, 9 listings). Only Tidal Pools was left short. Dassiesingel and Fonteinhutte have units switched off from 8 August — unrelated to this cleanup, and not touched by this plan.

## The fix

### 1. Restore the three units (data repair)

Reactivate the Rooms-tab-named unit records for Tidal Pools — Elf, Geelstert, Leervis — and leave the ALL-CAPS legacy copies inactive so the duplicate guard keeps working. Their channel ids stay empty, which is correct: they are genuinely not on the channel any more and will be created fresh by the next push.

### 2. Stop delisting from switching units off

Separate the two ideas that are currently one action in the channel cost monitor:

- **Remove from channel** clears the channel listing id and archives/deletes it upstream. It must not change `is_active` when the unit is still listed in the property's Rooms tab — that unit still exists and still sells locally.
- **Deactivate unit** stays available as its own explicit action for a unit that is genuinely gone.

Where the unit is *not* in the Rooms tab (a true stale/legacy row), the current behaviour is fine and is kept.

The bulk cleanup and duplicate purge paths get the same rule, so a future cleanup can never silently shrink a property's sellable inventory.

### 3. Re-push Tidal Pools

With 4 active units, push again from the property's Channel Manager panel. The chunked driver will create the three missing listings and refresh Wildeperd. Expected result: 4 listings under the sub-account, and the reconciliation panel reporting 4 live / 4 matched for Tidal Pools.

## Technical notes

- Repair migration: `update hostfully_room_types set is_active = true` for the three ids that match the canonical Rooms-tab names for property `af57b357-…`; the ALL-CAPS rows are excluded by exact-name match.
- `supabase/functions/channel-manager-entitlement/index.ts`, `scope: "unit"`: before flipping `is_active` off, read the parent property's `amenities.room_types` and skip the flag write when the unit's name is in that canonical list. Report back which units were delisted-but-kept-active so the UI can say so.
- `src/pages/AdminChannelMonitor.tsx` / `ChannelPropertyTable.tsx`: relabel the row action to make delisting versus deactivating explicit, and surface the "kept active locally" outcome.
- No change to `push-property-to-ru`: its active-unit filter and Rooms-tab reconciliation are the correct source of truth and stay as they are.
