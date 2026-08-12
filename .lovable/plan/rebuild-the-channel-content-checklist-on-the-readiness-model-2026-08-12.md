# Rebuild the channel content checklist on the readiness model

The "Channel-connection content" card on the push panel is authored as its own list of 16 hardcoded rows. It can show **All confirmed** while the real readiness model still holds blockers, because it never looks at name hygiene, description length (700 for certification), image dimensions, arrival instructions, check-in/check-out, min stay, bookable window, kitchen composition or changeover rules.

The fix is to stop authoring rows and generate them from the same readiness model that drives the score badge, the pink field borders and the push gate.

## What changes for the owner

- The card lists **every** channel requirement that applies to the property, not a subset. Nothing that blocks a push can be absent from it.
- The header badge can only read "All confirmed" when the readiness model has zero outstanding mandatory items. Otherwise it reads the real outstanding count.
- Each row still names where to fix it, and clicking a row jumps to that field in the editor (same deep-link the checksheet already uses).
- Rows where the push sends a system fallback instead of an authored value (floor 0, 50 m², padded amenities, assumed payment methods / cancellation policy) stay amber as "fallback used — confirm", so that nuance is not lost.
- Checks a browser cannot compute (bookable window, MinStay, kitchen) render as "pending" until the channel report answers, never as satisfied.

## Technical approach

- `src/components/property/RuChannelContentChecklist.tsx`: replace `buildRows()` with a renderer over `usePropertyReadiness(propertyId)` items. Rows come from `evaluateRequirements()`, grouped mandatory first, then recommended. Keep the existing three-state visual (ok / fallback / missing) and the section label per row via `getSectionLabel`; drop the hand-written RU XML path strings in favour of the requirement label plus its owning section.
- Keep the `RuContentFlags` prop as an **overlay only**: a small map from flag name to requirement key (`floor_is_default` → `room_floors`/`property_floor`, `space_is_default` → `room_size`, `amenities_padded` → `room_amenities`, `payment_methods_is_default` → `payment_methods`, `cancellation_policies_is_default` → `master_policy`). A satisfied item whose overlay flag is true renders amber instead of green. Overlay flags can never turn an unsatisfied item green.
- Header badge logic derives from readiness counts (`mandatoryPassed` / `mandatoryTotal`) plus the amber overlay count, so "All confirmed" and the scorecard cannot disagree.
- Row click reuses `focusRequirementField` (as in `RolosReadinessChecklist`) so the checklist behaves like the rest of the editor.
- `src/components/property/PushToRentalsUnited.tsx`: pass `propertyId` into the checklist alongside the existing `validation` flags. No change to push or gate logic.
- No edge function, schema or push-payload changes; the gate remains `ruReadiness` server-side.

## Verification

- Typecheck.
- Open a property with a known blocker (short description or unmeasured images) and confirm the card shows the blocker and does not read "All confirmed", matching the RU readiness scorecard on the same page.
