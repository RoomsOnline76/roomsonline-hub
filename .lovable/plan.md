# Close the Floor & Size (Space) gap

## What I found (verified in code)

- **Unit Floor** (Rooms tab) *is* a wizard blocker: `has_floor` is added as mandatory in
  `supabase/functions/_shared/ruReadiness.ts`, and the field carries the pink border
  (`data-field="floor"`, `channelMandatoryClass("floor")`) with a `room_floors` entry in
  `src/config/propertyFieldRequirements.ts`.
- **Size (Space) is NOT a blocker anywhere.** `has_space` is explicitly added with
  `mandatory = false` in `ruReadiness.ts`, and there is **no** size entry in
  `propertyFieldRequirements.ts` and **no** `size` entry in `channelMandatoryFields.ts`.
  The unit `Size (m²)` input in `RoomManagerTab.tsx` has no `data-field` and no border class.
- **The property-level Floor and Property size (m²) on Info & Facilities are unscored and
  unmarked.** `RuChannelContentFields.tsx` renders them with only a pink `*` in the label —
  no `data-field`, no `channel-required` class, no registry entry — so they never appear in
  the wizard count, the legend, or the deep-link stepper, even though
  `push-property-to-ru` uses them as the fallback for RU `Floor` and `Space`
  (and otherwise invents `0` / `50 m²`).

So the gap is real: Size is nowhere a blocker, and neither property-level field is part of
the one readiness model.

## What changes

1. **Size becomes a real mandatory requirement**, exactly like Floor:
   - new `room_size` requirement in the field registry (mandatory, section `rooms`),
     satisfied only when every active unit has a size greater than 0;
   - `has_space` in the RU readiness scorer flips to mandatory, and it fails when the
     50 m² default was substituted;
   - the unit `Size (m²)` input gets `data-field="room_size"` plus the pink mandatory
     border that fades once a value is captured, and an inline hint stating the rule.

2. **Property-level Floor and Property size get the same treatment**, so the two fields the
   user is looking at on Info & Facilities are visibly mandatory:
   - `data-field="property_floor"` / `data-field="property_size_sqm"` and the
     `channel-required` border on both controls in `RuChannelContentFields`;
   - two new registry entries (`property_floor`, `property_size_sqm`, section
     `info-facilities`) so they are counted by the wizard, the legend and the section
     badges, and are deep-linkable from a wizard blocker;
   - tier: mandatory, but satisfied when either the property value **or** every unit value
     is authored — they are fallbacks, so authoring them per unit is equally valid and the
     owner is never asked for the same fact twice.

3. **Registry alignment** — add `room_size`, `property_floor` and `property_size_sqm` to
   `channelMandatoryFields.ts` with their reasons, and map the backend checks
   (`has_space` → `room_size` / `property_size_sqm`, `has_floor` → `room_floors` /
   `property_floor`) in the `CHECK_TO_FIELD_KEYS` map so the wizard does not double count.

## Technical notes

- Files touched: `src/config/propertyFieldRequirements.ts`,
  `src/lib/channelMandatoryFields.ts`, `src/components/property/RuChannelContentFields.tsx`,
  `src/components/property/RoomManagerTab.tsx`,
  `supabase/functions/_shared/ruReadiness.ts` (redeploy `push-property-to-ru` and
  `ru-cert-portal`, which import the shared scorer).
- Satisfaction reads the same shapes already loaded by `usePropertyReadiness`:
  `amenities.room_types[].floor`, `amenities.room_types[].roomSize` / `room_size`,
  `amenities.property_floor`, `amenities.property_size_sqm`.
- Effect on scores: properties with no authored size will lose one mandatory item and their
  channel push stays gated until it is filled — intended, since RU currently receives an
  invented 50 m².

## Out of scope

No change to how `push-property-to-ru` builds the payload (the fallback chain stays), and no
new fields beyond Floor and Size.
