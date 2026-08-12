# Align the RU channel gate with certification requirements

## Goal
Make the property editor, onboarding wizard, certification score, dry run, and live channel push enforce the same RU minimums. A blank or zero toilet count on Seester—or any other unit—must be visibly marked and must block channel onboarding.

## Confirmed causes
- Seester’s saved unit record has `toilets` blank, while the property-wide fallback is `1`.
- The channel payload currently inherits that property-wide value, so the unit passes despite its blank field.
- Bathrooms and toilets are mandatory in the shared backend scorer, but are absent from the editor’s mandatory-field registry and field-level readiness model; the room controls therefore receive no solid border.
- Several client-side readiness minimums are stale: 3 images instead of 10, 100 description characters instead of 700, and bed capacity of 50% instead of the workbook’s required match to maximum occupancy.

## Implementation

### 1. Establish one RU requirement contract
- Consolidate the workbook-backed minimums used by the shared readiness evaluator: valid type and clean name, 700-character description, complete address/location, max occupancy, 10 measured images at 1024×768 with a main image, positive pricing and a 3-day bookable window with MinStay, cancellation/payment policies, authored arrival/check-in/out data, and valid bedroom/kitchen/bathroom/bed composition.
- Treat bed capacity matching `CanSleepMax` as mandatory, not advisory.
- Keep workbook-declared exclusions such as licence information, attraction distances, preparation time, additional fees, and PCI certificate out of the property gate.

### 2. Require explicit per-unit composition values
- Stop a property-level toilet or bathroom value from clearing a blank unit field for multi-unit listings.
- Resolve each unit against the canonical `amenities.room_types` entry using stable identifiers first and normalized name only as a legacy fallback; report an unmatched unit rather than silently inheriting unrelated values.
- Keep property-wide composition fallback only for a genuine single-unit/legacy listing where no unit-level authoring record exists.
- Preserve the existing master-arrival-policy inheritance rule; this stricter behavior applies only to unit composition fields.

### 3. Align editor validation and solid-border highlighting
- Register unit bathrooms, toilets, floor, max guests, name, description, bed configuration, images, amenities, and required composition controls as Channel Manager mandatory fields where applicable.
- Apply the solid mandatory border and satisfied state directly to the Room editor controls, including Seester’s toilet input.
- Add inline helpers for exact numeric constraints: bathrooms and toilets must be at least 1; zero and blank both fail.
- Replace coercing display defaults such as `bathrooms || 1` with blank-preserving values so missing saved data remains visible.

### 4. Align wizard, score, deep links, and push gate
- Add field-level requirement entries and check-to-field mappings for all RU mandatory checks, replacing stale 3-image/100-character thresholds with certification values.
- Ensure every backend check key has a section, field target, and unit target so “Open step” lands on the exact failing room and control.
- Derive the wizard and connection state from the same fresh dry-run report used by the live push; no separate reduced `isReady` subset may enable a push.
- Invalidate/refetch readiness after room saves and on initial property load so clearing a field immediately trips the gate.

### 5. Verify against Seesig and regression-test the full matrix
- Confirm Seester’s blank toilet field shows the solid border, appears as a unit-specific mandatory blocker, routes to Seester → Toilets, and prevents channel connection/push.
- Verify entering `1` clears that blocker after save/refetch, while `0` and blank remain blocked.
- Add focused tests for every workbook minimum, master arrival-policy inheritance, multi-unit identity matching, and parity between editor status, wizard status, certification report, dry run, and live push gate.
- Deploy the affected channel readiness functions and run a fresh Seesig dry run without changing or auto-filling its saved toilet data.

## Technical scope
- Shared RU content/readiness rules and the unlocked payload composition resolver in `push-property-to-ru`.
- Room editor mandatory-field styling and value handling.
- Property field requirements, check mappings, deep links, readiness hooks, and push UI.
- No changes to the locked OwnerID/phase-gate or inventory-evidence regions.
