# Bedroom composition becomes an explicit onboarding check

## What the reads confirm

- The channel gate has a mandatory "At least 1 bedroom in the composition" check (`has_bedroom` in `_shared/ruReadiness.ts`), and the push sets it from the emitted composition blocks: `has_bedroom: bedroomBlocks.length >= 1`, where a bedroom block (RoomID 257) is produced only from an **array** `bed_configuration`, or — for the building path — from `bedrooms > 0 && beds > 0`.
- The client registry has no equivalent check. `room_beds` scores *capacity* only (`bedCapacity(bedConfiguration) >= maxPeople`) and `has_bedroom` is merely aliased onto it in the check-to-field map.
- `bedCapacity` accepts a **legacy string** configuration (`calculateBedCapacity("king-twin")`), the push builder does not (`Array.isArray(unit.bed_configuration)`).
- The database has this exact case live: 9 active units store `bed_configuration` as a string (`"king-twin"`, `"king"`, `"queen"`) with `bedrooms` and `beds` both null. Those units score satisfied client-side and emit **zero** bedroom composition blocks on push, so RU content quality fails while ROL'OS reads green.

## Changes

1. **New mandatory client check `room_bedroom_composition`** ("Bedroom composition authored", section Rooms, focus `bed_configuration`), satisfied for a unit when the push would emit at least one bedroom block:
   - an array `bed_configuration` with at least one entry carrying a bed type and a count of 1 or more, or
   - `bedrooms >= 1` and `beds >= 1` (the derived fallback the push uses).
   A string configuration alone does **not** satisfy it, with a hint telling the owner to re-author the beds per bedroom in the unit's bed configuration.
2. **Re-point the check map** so `has_bedroom` and `beds_distributed` deep-link to the new check instead of `room_beds`, and add it to the Rooms section list so the rail counts and legend include it.
3. **Tighten `room_beds` to the same shape** — capacity is only counted from an authored array configuration, so a legacy string no longer passes the capacity rule either. This makes the client rule identical to what the push actually reads.
4. **Push-side normalisation of legacy string configurations** in `push-property-to-ru`: before the bedroom blocks are built, a string `bed_configuration` is parsed through the existing bed-label resolver into the equivalent array entries, so the 9 legacy units emit real bedroom blocks (with unmapped labels still reported and still blocking) instead of silently publishing with no bedroom. This touches the composition builder only — not the locked OwnerID/phase-gate or inventory-evidence regions.

Result: a studio (or any unit) with only loose beds and no bedroom composition node is now blocked in the editor with a named field to fix, and legacy string data is converted rather than dropped.

## Technical notes

- `src/config/propertyFieldRequirements.ts` — new `UNIT_ROW_RULES.bedroomComposition`, new registry entry, `bedCapacity` array-only, `SECTION_CHECKS.rooms`, `CHECK_TO_FIELD` map for `has_bedroom` / `beds_distributed`.
- `src/lib/channelMandatoryFields.ts` — `bed_configuration` reason updated to mention the bedroom composition requirement.
- `supabase/functions/push-property-to-ru/index.ts` — string→array normalisation ahead of both bedroom-block builders (`bedBlocksFromConfiguration` and the unit path), then redeploy the function.
