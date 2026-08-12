# Side rail: show the exact error, not just the field label

Today the left rail badges carry a count and a browser `title` tooltip built from `mandatoryLabels` — short labels like "Description" or "Beds cover maximum guests". The owner still has to open the section and hunt for what is actually wrong.

The requirement is that the rail names the precise shortfall, e.g. "Description is 444 characters — needs 700", "SEESTER: beds sleep 2 of 4 guests", "Photos: 6 of 10 at 1024x768", "TOBIE: no minimum stay set".

## What changes for the owner

- Hovering (or tapping) a rail count opens a small panel instead of a native tooltip. It lists each outstanding item on that page with its exact measured shortfall, mandatory first, then nice-to-have.
- Unit-level problems name the unit ("SEESTER: 1 bedroom has no bed"), so a multi-unit property does not just say "Beds".
- Clicking a line in the panel switches to that section and pulses the exact field, matching the readiness checksheet behaviour.
- Where a check has no measurable number (a plain missing value), the line falls back to the label plus its existing hint, so no row is ever blank.

## Technical approach

**1. Requirements can describe their own shortfall**
- `src/config/propertyFieldRequirements.ts`: add an optional `describeShortfall?: (subject: RequirementSubject) => string | undefined` to `FieldRequirement`, evaluated only when `satisfied === false`, and carry the result on `RequirementStatus` as `detail`.
- Author it for the checks that have real numbers: `description` and `room_descriptions` (character count vs 700), `name_hygiene`, `images` / `image_dimensions` / `hero_image` (count of measured 1024x768 images vs 10, main-photo flag), `facilities` (amenity count vs 10), `room_beds` / `room_beds_distributed` / `room_bedroom_composition` (per-unit capacity vs max guests, bedrooms without beds), `room_size`, `room_floors`, `room_bathrooms`, `room_toilets`, `room_channel_type`, `min_stay_set` / `max_stay_set`, `check_times`, `changeover_rules`, `geo`, `postal_code`, `ru_location_id`.
- Unit-level descriptions iterate `roomRows(subject)`, reuse the existing `UNIT_ROW_RULES` predicates, and prefix each failure with the unit name (cap at the first three units plus "+N more" so the panel stays short).

**2. Readiness carries the detail through**
- `src/hooks/usePropertyReadiness.ts`: put `detail` on `ReadinessItem` (registry items from `requirement.detail`, server items from their existing `message`).
- Extend `SectionReadinessCounts` with `mandatoryItems` / `recommendedItems`: `{ key, label, detail, paintable }` arrays, kept alongside the existing `mandatoryLabels` / `recommendedLabels` so current consumers keep working.

**3. Rail renders a detail panel**
- `src/components/property/PropertySectionRail.tsx`: widen `requirementCounts` to accept the item arrays; wrap each count badge in a shadcn `HoverCard` (with `Popover` behaviour on touch via click) listing `label — detail`. Add an `onSelectRequirement?: (section, key, paintable)` prop so a line click can navigate and focus.
- `src/pages/PropertyForm.tsx` and `src/pages/pms/PMSPropertySetup.tsx`: pass the new item arrays into the rail and wire `onSelectRequirement` to the section switch plus `focusRequirementField` (same pattern already used by `RolosReadinessChecklist`).

No schema, edge function, or gate changes; this is presentation plus one optional descriptor per requirement.

## Verification

- Typecheck.
- Open a property with a short description and an under-covered unit, hover the Info & Facilities and Rooms rail badges, and confirm the panel prints the measured numbers and the unit name, and that clicking a line lands on the field.
