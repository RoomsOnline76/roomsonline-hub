# Live content-rule helpers on the controls themselves

Goal: every hard channel content rule shows its measured shortfall *while typing*, on the control itself — not only after save, and not only in the readiness rail.

## Current state (verified)

- Name hygiene, description length and image minimum size already have rule helpers in `src/lib/channelFieldRules.ts` (`CHANNEL_MIN_DESCRIPTION = 700`) and the readiness registry.
- Property description already has a live counter in `InfoFacilitiesTab.tsx`, but it counts against a local `MIN_DESCRIPTION_CHARS = 800` and never names the 700 hard channel floor.
- Room description already has a live counter (`MIN_ROOM_DESCRIPTION_CHARS = 700`) in `RoomManagerTab.tsx`.
- `ImageQualityMarker.tsx` paints a badge on sub-threshold photos in both the property gallery and the room gallery, but it renders nothing for photos that pass or are still being measured, and there is no gallery-level tally.
- Beds vs guests only appears as a one-off "Max guests is N" nudge next to the bed editor, and only when the value differs and the field is not PMS-synced. The unit card/list rows show no shortfall.
- Kitchen is a mandatory readiness rule (`room_kitchen`), but the unit amenity area has no live helper telling a self-catering owner what is missing.

## What gets built

**1. One description counter, two thresholds**
A shared `CharacterCounterHint` helper shows `chars / 700 required · 800 recommended`, turns solid-warning under 700, amber between 700 and 800, and quiet once satisfied. Used by the property description and the unit description so both read identically.

**2. Per-image dimension badges that always speak**
- Passing photos get a quiet dimension chip (`1600×1067`) so owners can see measurements without failing first.
- Sub-threshold and unmeasurable photos keep the current solid marker.
- Each gallery gains a one-line tally: "3 of 14 photos below 1024×683 — re-upload those" plus a "main photo not set" note when nothing is flagged as hero.

**3. Live "beds vs max guests" on the unit card**
Every unit row and the open unit card show a capacity line: "Beds sleep 2 · needs 4" while short, "Beds sleep 4 of 4" once met, recomputed as beds are authored. Keeps the existing one-click "set max guests to capacity" action, but the shortfall line itself is always visible and uses the same wording as the readiness rail.

**4. Kitchen helper on unit amenities**
When the unit/property is self-catering (self-catering property type, or a unit with no meal plan) and no kitchen or kitchenette amenity is ticked, the amenity block shows an inline helper: "Self-catering units must declare a kitchen or kitchenette — the channel rejects the listing without it", with a quick-tick shortcut for kitchen / kitchenette.

All four helpers read their thresholds and wording from the existing registry + `channelFieldRules`, so the control, the rail popover and the push gate can never disagree.

## Technical notes

- New shared component `src/components/property/ContentRuleHint.tsx` (counter, capacity line, tally line) so wording lives in one place.
- Export the measured shortfall describers already added to `src/config/propertyFieldRequirements.ts` and reuse them for the inline hints instead of re-deriving text.
- `ImageQualityMarker.tsx`: render a neutral chip on `status === "pass"`; add `ImageAuditSummary` for the gallery tally; wire in `PropertyForm.tsx` (property gallery) and `RoomManagerTab.tsx` (room gallery).
- `RoomManagerTab.tsx`: capacity line from `calculateBedCapacity`, shown on unit list rows and the unit card; kitchen helper next to the unit facilities block.
- `InfoFacilitiesTab.tsx`: swap its bespoke counter for the shared one, keeping 800 as the recommended target and adding the 700 hard floor.
- No schema, edge function or push-gate changes — presentation and validation wording only.
