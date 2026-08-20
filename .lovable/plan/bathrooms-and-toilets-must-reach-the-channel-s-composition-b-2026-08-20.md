# Bathrooms and toilets must reach the channel's Composition block

The channel listing shows "0 Bathroom / 0 Toilet" while ROLOS holds real values.

## Confirmed cause

The channel derives the Composition panel (bedrooms / bathrooms / toilets) from the
`CompositionRoomsAmenities` blocks, one block per room. The read-back of unit "Elf"
(5655615) shows only two blocks, both `CompositionRoomID="257"` (Bedroom) — hence
"2 bedrooms" is right and bathrooms/toilets are zero.

Bathroom and WC blocks are deliberately omitted in `push-property-to-ru`
(lines 1442-1446): an earlier attempt sent them with an empty `<Amenities/>`, which the
channel parses as amenity id 0 and rejects ("Wrong composition room id:0"). Instead the
counts are sent only inside the root `<Amenities>` list as `81` (Bathroom) and `37`
(toilet) — visible in the read-back, but the root list never feeds the Composition panel.

The valid composition room ids for this account are already documented in the same file:
`53` WC, `81` Bathroom, `94` kitchen in living room, `101` Kitchen, `249` Living room,
`257` Bedroom, `372` Livingroom/Bedroom, `517` Bedroom/Living room with kitchen corner.

## What to change

### 1. Emit one composition block per bathroom and per toilet
In `buildUnitPayload` (and the building/primary-room path), after the bedroom blocks:

- push `CompositionRoomID = 81` once per resolved bathroom count,
- push `CompositionRoomID = 53` once per resolved toilet count,
- push `CompositionRoomID = 101` once when the separate-kitchen fact is true.

Counts come from the existing `resolveUnitComposition` (unit value wins, property-wide
value is the fallback), so nothing changes about where the numbers are authored.

### 2. Never send an empty amenity list in a block
Each block carries at least one real child amenity, picked from the unit's own selection
where possible so the data stays truthful:

- Bathroom block: first selected Bathroom-category amenity (shower, bath, washbasin,
  towels, …), falling back to `245` washbasin.
- WC block: `37` toilet.
- Kitchen block: first selected Kitchen-category amenity (fridge, kettle, cookware, …),
  falling back to `101` Kitchen.

Category lookup uses the existing `ru_amenities` dictionary, so no new data is needed.
The root `<Amenities>` list keeps carrying `81`/`37` as it does today — the change is
additive and cannot remove anything the channel already stores.

### 3. Verify by read-back, not by assumption
After deploying, re-push the RUTEST CLOPONE B units and read each one back through
`get_property` (with the owning account's `owner_id`), confirming the response contains
one `81` block per bathroom and one `53` block per toilet, and that the listing panel
reports the right numbers. Record the outcome in the verification notes.

### 4. Readiness surfacing
The readiness gate already requires bathrooms and toilets to be authored. Extend the
channel-content check so a unit with a zero/blank bathroom or toilet count is reported as
a content gap rather than pushing a silently incomplete composition.

## Technical notes

- Files: `supabase/functions/push-property-to-ru/index.ts` (composition block builder,
  replacing the "intentionally OMITTED" note), and `supabase/functions/_shared` helpers if
  the category lookup is shared with the cert portal.
- The XML shape in `rentalsunited-api` (`CompositionRoomAmenities CompositionRoomID=...`)
  already supports repeated blocks; no builder change expected there.
- No schema change, no UI change.
- Deploy: `push-property-to-ru`, then a static delta or full push per property.
