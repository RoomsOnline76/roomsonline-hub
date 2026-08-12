# Unblock Phase 2 of the Rentals United onboarding

## What is happening

The channel gate rejects the push with 18 blockers across the 9 Seesig units — two per unit:

1. **"The ROL'OS type ... does not map to a Channel Manager property type"** — the unit's channel type is being read from the PMS free-text field, which currently holds the unit's own name ("Duiker", "Tobie", "Seester"...). Those are not channel property types, so the channel would silently receive an assumed "Chalet".
2. **"No changeover rule is set on this unit or the property"** — nothing in the property editor can author a changeover rule today, so this check can never pass from the UI.

At the same time the onboarding card shows **Phase 2 Complete · 300/300 mandatory checks passed**. The in-app readiness model does not include these two checks, so the UI and the server gate disagree. That mismatch is the reason this looks like a surprise failure.

## What to build

**1. Unit channel type becomes a real choice**
- Add a "Channel property type" dropdown on each unit in Rooms, populated from the supported channel types (Apartment, Chalet, House, Villa, Studio, Cottage, B&B, Guest house, Room, etc.), separate from the free-text PMS type field.
- Mark it mandatory (pink border) while empty or unmapped, and persist it as the unit's channel type so the push stops guessing.
- For Seesig: the unit names currently sitting in that field are ignored for the channel; each unit gets an explicit type.

**2. Changeover rules get an authoring surface**
- Add a "Changeover / arrival & departure rules" section in Policies: a property-level master rule (any day, arrival only, departure only, or per-day-of-week) plus an optional per-unit override in Rooms, with the same master-fallback behaviour as the arrival policy.
- Persist it where the push already looks for it, so an authored rule clears the blocker without touching the push logic.

**3. Close the UI vs gate mismatch**
- Add both checks to the shared readiness model so the onboarding card, the mandatory-field counters and the "Data that will be sent" panel count them, and Phase 2 only reports Complete when the server gate would also pass.
- Keep the existing deep links working: type blocker jumps to the unit in Rooms, changeover blocker jumps to Policies.

**4. Blocker list readability**
- Group the phase-2 blocker list by unit instead of one flat list of 18 lines, so nine units with the same two gaps read as nine rows with two fixes each.

## Also in this change

A leftover type error from the previous fix must be corrected before anything builds:
`src/hooks/usePMSSync.tsx` — the preserved unit fields (toilets, floor, separate kitchen, meal types) are typed `unknown` and rejected by the JSON column type; they need concrete `number | null` / `boolean` / `string[]` types.

## Technical notes

- Server gate lives in `supabase/functions/_shared/ruReadiness.ts` (`object_type_authored`, `changeover_authored`); the payload flags come from `push-property-to-ru` (`PROPERTY_TYPE_MAP` lookup and `isChangeoverAuthored`, which reads `amenities.changeover_rules` / `amenities.changeover` at unit then property level).
- The channel type list must be shared between the edge function map and the new dropdown so the UI can only offer values that map.
- Unit channel type is stored on the canonical unit row (`property_type`), currently written from the room's `pmsRoomType` in `PropertyForm.tsx` — that write is split so the PMS field no longer doubles as the channel type.
- Readiness parity is added in `src/config/propertyFieldRequirements.ts` + `src/hooks/usePropertyReadiness.ts`; deep links already exist in `src/config/channelRegistry.ts`.
- No database migration required.
