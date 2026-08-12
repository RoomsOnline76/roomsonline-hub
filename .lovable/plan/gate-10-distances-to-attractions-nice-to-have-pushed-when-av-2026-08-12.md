# Gate 10 — Distances to attractions (nice-to-have, pushed when available)

Goal: capture distances to nearby attractions, score them as a **recommended** (never blocking) requirement, and include them in the channel property push when they exist.

## Current state (verified)

- `local_experiences` already has `distance_km` (numeric) per attraction, with `category`, `is_active`, `display_order`. 34 rows currently carry a distance (culture, adventure, nature, dining, wellness, relaxation).
- `LocalExperiencesManager.tsx` authors those rows including a "Distance (km)" input, but it is **not mounted anywhere** in the app — there is no editor surface for it today.
- The channel push (`push-property-to-ru`) emits no `<Distances>` block. The XML builder notes confirm the schema expects `Distances` in the slot right after `Coordinates` (alongside `CompositionRooms`/`CompositionRoomsAmenities`).
- The requirement registry (`src/config/propertyFieldRequirements.ts`) has no attractions/distance entry; it supports a `recommended` tier that paints blue and never blocks the push gate.

## What to build

### 1. Authoring surface (Nearby attractions)
- Mount `LocalExperiencesManager` inside the property editor as a collapsible "Nearby attractions & distances" block in the **Facilities** section, wrapped with `data-field="attraction_distances"` so the requirement stepper can focus it.
- Keep the existing fields; make the distance input the emphasised one (km, one decimal) and show a small "pushed to channels when set" hint.

### 2. Recommended requirement (nice-to-have)
- Add `attraction_distances` to the registry: `tier: "recommended"`, section `info-facilities`, target `[data-field="attraction_distances"]`.
- Satisfied when at least 3 active attractions have a distance set; `describeShortfall` reports the measured count ("2 of 3 attractions have a distance").
- Mirror the same check in `supabase/functions/_shared/ruReadiness.ts` as a non-mandatory check so the channel report and wizard agree, and so it can never contribute to `mandatoryOutstanding`.

### 3. Push when available
- New shared mapper `supabase/functions/_shared/ruDistances.ts`: reads active `local_experiences` with a numeric `distance_km`, maps each attraction to the channel's destination dictionary id, and returns entries sorted by distance, de-duplicated per destination id (nearest wins).
- Before writing the mapping table, confirm the channel's exact dictionary and element shape with a live `Pull_` dictionary call from the diagnostics console, and cache the result in a new `ru_destinations` dictionary table (same pattern as `ru_amenities` / `ru_property_types`). Category → destination id mapping is derived from that dictionary; an attraction whose category has no dictionary match is skipped rather than guessed.
- Emit the `<Distances>` block in `Push_PutProperty_RQ` in the verified slot after `Coordinates`, and **omit the element entirely** when there are no mappable distances (an empty wrapper is what triggers RU parser rejections elsewhere).
- Include the block in the differential-push fingerprint so distance edits trigger a delta push.
- Log the emitted distance count in the `ru_sync_runs` / `ru_api_log` evidence for the run.

### 4. Verification
- Dry run one single-unit and one multi-unit property, read the returned XML from the diagnostics console, and confirm the block validates and that a property with no distances still pushes cleanly.
- Confirm the readiness score for a property with zero distances stays `passed: true` (recommended-only shortfall).

## Notes

The channel-side dictionary shape is not asserted here — step 3 verifies it with a live dictionary pull before any mapping is written, so no invented destination ids reach the channel.
