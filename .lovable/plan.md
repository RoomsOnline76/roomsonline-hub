# Close the channel wizard ↔ property tracker gaps

Goal: every rule that can block a channel push becomes a first-class, named, clickable item in the property editor — same numbers, same wording, on every surface (Admin Edit Property, ROL'OS Setup, property lists, push gate).

## What is confirmed today

- `PROPERTY_FIELD_REQUIREMENTS` has 30-odd entries. Images are only counted (`images.length >= 10`); there is no dimension, name-hygiene, kitchen or bookable-window entry, so those never paint a border or add to a rail count.
- Image URLs are stored as plain strings (no width/height saved), so dimensions can only be judged by measuring — `useImageDimensionAudit` already does this, but it is a tab-local widget.
- Name hygiene already has a client validator (`channelFieldRules.validateListingName`); kitchen (`has_kitchen`) and the 3-day bookable window + MinStay (`bookable_window`, `min_stay_set`) already come back from the channel report via `ru-cert-portal → property_readiness` (both live and pre-publish paths). None of them reach `usePropertyReadiness`.
- `PropertySectionRail` shows numeric badges only; outstanding labels exist in the data (`mandatoryLabels`) but are hidden inside a `title` tooltip.
- `QualityGateIndicator` runs its own `check-activation-readiness` query (`activation-readiness` cache key) instead of the shared model, so list rows and the edit page can report different counts.
- The push gate (`RuPushContinueButton`) only checks `mandatoryScore === 100` from field requirements — it does not include the channel report's availability/window checks.

## Work

### 1. Extend the requirement registry

Add to `src/config/propertyFieldRequirements.ts`:

- `name_hygiene` (mandatory, general, `#name`) — reuse `validateListingName`, hint spells out the rule.
- `room_kitchen` (mandatory, rooms, unit facilities target) — kitchen declared in unit composition or amenities, matching the server's `has_kitchen`.
- `image_dimensions` (mandatory, images) — evaluated from a measured-dimension map placed on the subject (below), so a photo under 1024×768 paints the gallery and names itself.
- `bookable_window` and `min_stay_set` (mandatory, calendar/rates) — evaluated from the channel report, with targets pointing at the calendar/stay-restriction controls.

Extend `CHECK_TO_FIELD_KEYS` for the new keys.

### 2. Feed measured + channel truth into the shared model

In `usePropertyReadiness`:

- Measure the gallery URLs (same helper the audit uses) and attach the result to the subject. While a photo is still being measured it is "pending" — never counted outstanding, so nothing flickers on load.
- Pull `bookable_window`, `min_stay_set`, `has_kitchen` from the channel report (`property_readiness`) and fold them in as items, keeping their server wording and fix hint.
- Everything stays in one `items` array, so score badge, rail counts, legend chips, checklist and wizard cannot diverge.

### 3. Rail shows what is wrong, not just how many

`PropertySectionRail`: under any section with outstanding mandatory items, render the first 2–3 labels (e.g. "Description (min 700 characters)", "Beds cover maximum occupancy") with a "+N more" tail, and keep the full list in the hover panel. Clicking a label opens that section and focuses the control.

### 4. Inline helpers next to the control

- Name field: live hygiene hint (emoji / specials / ALL CAPS) as you type.
- Images tab: keep the compliance checklist but also show the failing dimension inline on the offending photo.
- Bed configuration: live "sleeps X of Y maximum" mismatch line instead of only after a dry-run.

### 5. One readiness source for list and edit surfaces

Rewrite `QualityGateIndicator` on top of `usePropertyReadiness` (shared cache key, same labels), so `/admin/properties`, the review queue and the editor always agree.

### 6. Unit-level failures name the unit and jump to it

Any unit-scoped failure (description length, toilets, beds, kitchen, images) carries the unit name in its label and calls `focusUnitCard(unitName)` from every path: rail label, legend chip, wizard row, checklist row.

### 7. Decoration re-runs after every save

Repaint requirement borders after each successful save on both Admin `PropertyForm` and ROL'OS `PMSPropertySetup`, so the static channel-required styling and the dynamic `.pf-req-*` classes cannot drift.

### 8. Tighten the push gate

`RuPushContinueButton` shows/enables only when `mandatoryOutstanding === 0` from the shared model (now including window, MinStay, kitchen, name hygiene and image dimensions) plus channel identity/keys. When it is blocked, it lists the outstanding items instead of disappearing silently.

## Technical notes

- Files: `src/config/propertyFieldRequirements.ts`, `src/hooks/usePropertyReadiness.ts`, `src/hooks/usePropertyFieldRequirements.ts`, `src/components/property/PropertySectionRail.tsx`, `RequirementLegend.tsx`, `QualityGateIndicator.tsx`, `RuPushContinueButton.tsx`, images/rooms/name controls in `PropertyForm.tsx` + tabs, `src/pages/pms/PMSPropertySetup.tsx`.
- No schema change and no new edge function: dimensions are measured in the browser; window / MinStay / kitchen come from the existing `property_readiness` action.
- Image measurement is cached per URL for the session to avoid re-downloading on every tab switch.
- Unit tests for the new registry predicates (name hygiene, kitchen, dimension map, window) alongside the existing requirement tests.
