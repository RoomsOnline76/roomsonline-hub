# Beds distributed between bedrooms

Close the third checklist gap: the channel reviews beds **per bedroom**, but ROL'OS authors a flat bed list for the whole unit and the wizard only checks total sleeping capacity. A 4-bedroom unit authored as "1 king" can score green and fail content review.

## What changes for the owner

In the unit editor (Rooms tab → Beds), beds are grouped into bedrooms instead of one flat list:

```text
Bedroom 1   [King ▾]  1  ·  sleeps 2      [+ add bed]
Bedroom 2   [Twin ▾]  2  ·  sleeps 2      [+ add bed]
Living area [Sofa bed ▾] 1 · sleeps 2     (not a bedroom)
                                          [+ add bedroom]
```

- Each bedroom holds one or more beds; every bedroom must hold at least one bed.
- Sofa beds / extra sleepers can sit in a non-bedroom slot so they still count towards capacity without pretending to be a bedroom.
- The declared bedroom count on the unit and the number of authored bedrooms stay in step — a mismatch is shown inline ("2 bedrooms declared, 1 authored").
- The Beds block keeps its channel-mandatory pink border until distribution is satisfied, and satisfied units collapse to the faded border as elsewhere.
- Existing units are shown pre-grouped: a legacy flat list is read as Bedroom 1 holding those beds, so nothing looks empty and nothing is lost until the owner saves a real grouping.

## Readiness and push behaviour

- New mandatory check **"Beds distributed between bedrooms"** in the rooms section, keyed `room_beds_distributed`, satisfied when every unit's authored bedrooms each hold a bed and the number of authored bedrooms covers the unit's declared bedroom count.
- The existing capacity check ("Beds cover maximum occupancy") stays, computed across all slots.
- The push emits one `<CompositionRoomAmenities RoomID="257">` per authored bedroom with that bedroom's beds inside it, and non-bedroom sleepers go to the living-room block rather than inflating bedroom count.
- The push-side `beds_distributed` flag is tightened to compare authored bedrooms against the declared bedroom count instead of passing automatically whenever only one block exists, so the wizard score and the push gate cannot disagree.

## Technical notes

- `src/lib/bedConfig.ts`: extend `BedEntry` with an optional `room` slot (`{ index: number; kind: "bedroom" | "living" }`), add `groupBedsByRoom()` / `normalizeBedGroups()` helpers, and keep `parseBedConfiguration` / `calculateBedCapacity` backwards compatible so legacy flat arrays and legacy strings still parse (flat entries fold into bedroom 1).
- No database migration: `bed_configuration` is JSONB, so the added slot is additive.
- `src/config/propertyFieldRequirements.ts`: add `UNIT_ROW_RULES.bedsDistributed`, register the `room_beds_distributed` mandatory check, add it to `SECTION_CHECKS.rooms`, and repoint `CHECK_TO_FIELD.beds_distributed` at it.
- `src/lib/channelMandatoryFields.ts`: reason text for `bed_configuration` mentions the per-bedroom requirement.
- `src/components/property/RoomManagerTab.tsx`: rebuild the Beds block as grouped bedrooms with add/remove bedroom, per-bed type/count controls, capacity summary and the declared-vs-authored hint.
- `supabase/functions/push-property-to-ru/index.ts`: build bedroom blocks from the grouped configuration (reusing `normalizeBedConfiguration` for legacy shapes), route non-bedroom sleepers to the living-room block, and recompute `bedsDistributed` against declared bedrooms; redeploy.
- `supabase/functions/_shared/ruReadiness.ts`: keep the `beds_distributed` label and let it read the tightened flag.
- Verify with a typecheck plus a live push readiness read on a multi-bedroom unit (Tidal Pools / Seesig) to confirm the score and the gate agree.
