# Fix arrival instructions not saving (master + per unit)

## What is happening

Three separate defects, all confirmed by reading the code and the live data.

1. **Saving the property wipes the master arrival policy.** The Arrival policy editor writes to `amenities.house_rules.check_in_instructions`, but the property form rebuilds the whole `house_rules` block from its own fields when you press Save — and that rebuilt block has no `check_in_instructions` key. So the text saves, then the next property Save silently deletes it.

2. **Per-unit instructions only reach one of the duplicated unit records.** Seesig and Tidal Pools each have duplicate unit rows for the same unit (e.g. `Albatros` and `ALBATROS`). The editor collapses them into one row and saves to a single record, so the other copy stays blank — which is the copy the channel wizard and the push can read. Every active unit checked is currently at 0 characters.

3. **A TOBI draft never marks the property form dirty.** The editor keeps its own draft state, so the main form's Save bar does not appear after TOBI writes, and there is no TOBI helper at all for a single unit's arrival instructions.

## What will change

**Master arrival policy becomes part of the form's saved state**
- The property form loads the existing arrival text and includes `check_in_instructions` in the `house_rules` block it writes, so a normal property Save preserves (and can update) it instead of erasing it.
- Editing or TOBI-drafting the arrival text marks the property form dirty, so the standard Save bar appears exactly like every other field. The editor's own "Save arrival policy" button stays for an instant write, and after it saves, the form is no longer flagged dirty for that field.

**Per-unit instructions write to every copy of the unit**
- A unit save applies the value to all active unit records that share that unit name, so no stale blank duplicate is left behind for the wizard or the channel push to read.
- "Reset all units to the property policy" clears all copies the same way.

**TOBI for a single unit**
- Each unit row gets a "Write with TOBI" / "Improve with TOBI" button that drafts unit-specific arrival detail (which door, gate or key box, parking bay) from the property's own facts, seeded with the master policy. Drafts are placed in the unit's box for review and saved with the existing unit Save button; no invented codes or key-safe numbers.

**Verification after the change**
- Write a master policy, press the main property Save, reload, and confirm the text is still there.
- Save a unit's instructions and confirm both duplicate records carry it, then re-run the channel readiness wizard and confirm the arrival check passes for that unit.

## Technical notes

- `src/pages/PropertyForm.tsx`: add an arrival-instructions state seeded from `amenities.house_rules.check_in_instructions` on load; include it in the `house_rules` payload near line 3306; pass value/onChange plus `onDirty` into the policies tab.
- `src/components/property/policies/ArrivalPolicyPanel.tsx`: accept controlled `value` / `onChange` / `onDirty`; keep `writeArrivalPolicy` for the immediate save; per-unit save switches from `.eq("id", unit.id)` to an `.in("id", ids)` over all duplicate ids for that name (collected during load); add the per-unit TOBI action reusing `editorial-ai-assist` `generate_arrival_policy` with a unit-scoped context.
- `src/components/property/PoliciesTab.tsx`: thread the new props through; the library summary keeps refreshing via `useArrivalPolicy.refetch`.
- No database or edge function changes; storage stays `amenities.house_rules.check_in_instructions` for the master and `hostfully_room_types.check_in_instructions` for overrides.
