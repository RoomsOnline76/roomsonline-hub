# Renaming a unit must rename its listing, not create a second one

## What happened

On "RU Name Change", the unit **Albatros** was renamed to **Albatros RU TEST Name Change**. The database now holds two active units for that one physical unit:

| Unit name | Channel listing |
| --- | --- |
| Albatros | 5733060 (the original) |
| Albatros RU TEST Name Change | 5862186 (created on the next push) |

The channel portal therefore shows an extra listing, and the original one still carries the old name.

## Why

The property editor matches saved units to database rows **by name**, not by identity. A rename produces a name that matches nothing, so the save inserts a brand-new unit row with no listing id — and the next push, seeing a unit with no listing id, correctly creates a new listing for it.

The safety net that was supposed to catch this made it worse: the orphan cleanup refuses to deactivate the leftover "Albatros" row precisely because it holds a live listing id, so both rows stay active and both get pushed.

## The fix

**1. Match units by identity first.**
A unit row already has a stable id, and the editor already knows it. The save will resolve the target row in this order:

1. the unit's own id, whenever a row with that id exists on this property — regardless of what the name now says;
2. only for units that have never been saved (no id), fall back to the normalised-name match that exists today;
3. insert only when neither resolves.

That single change makes a rename an update: the same row keeps listing 5733060, and the scoped delta pushes just the changed name field to that listing.

**2. Never let a rename strand a listing.**
Add a guard on save: if a unit row is about to be inserted while a *different* active row on the same property already holds a listing id and is no longer represented in the editor, treat that as a rename rather than an addition — adopt the existing row and its listing id instead of inserting. This closes the same hole for units renamed outside the editor (imports, bulk edits).

**3. Repair the current state of "RU Name Change".**
- Keep row `Albatros` (listing 5733060) as the surviving unit and set its name to `Albatros RU TEST Name Change`.
- Retire the duplicate row and its listing 5862186 through the existing per-listing retire path (delete at the channel, archive if delete is refused), so the portal drops back to the correct unit count.
- Fire a scoped static delta so listing 5733060 shows the new name in the portal, and confirm by reading the listing back from the channel.

**4. Verify.**
- Rename a unit on a test clone, save, and confirm: one row, same listing id, name changed in the portal, no new listing created.
- Confirm the published unit count for "RU Name Change" matches the local active unit count after the repair.

## Technical notes

- `src/pages/PropertyForm.tsx` — unit persistence loop (`targetId` resolution around the `hostfully_room_types` update/insert) and the orphan-cleanup block below it.
- Repair uses the existing listing retire helper in `supabase/functions/channel-manager-entitlement/index.ts` (`delete → archive` fallback, unit-listing aware) and `queueRuStaticDelta` for the scoped name push.
- No schema change required; the repair is data-only.
