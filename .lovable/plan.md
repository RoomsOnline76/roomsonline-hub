

# Fix Rate Type Deletion Not Persisting for ROL'OS Properties

## Problem
When deleting rate types from a ROL'OS property and saving, they reappear on re-entry. Two bugs cause this:

1. **Auto-regeneration on load**: When all rate types are deleted, `amenities.pms_rate_types` is saved as `[]`. On reload, the empty array fails the `length > 0` check (line 3332), so the fallback at line 3378 auto-generates rate types from `amenities.room_types` — resurrecting deleted rates.

2. **Deactivation skipped when empty**: The `rolos_rate_plans` deactivation block is guarded by `pmsRateTypes.length > 0` (line 4100), so deleting all rate types skips the cleanup entirely — stale plans remain active in the database.

3. **Overly lenient stale detection**: The deactivation filter uses `!matchId && !matchCode && !matchName` (all three must fail). Name matching means a renamed-then-deleted plan can survive cleanup.

## Solution

### File: `src/pages/PropertyForm.tsx`

**Change 1 — Prevent fallback regeneration when rate types were explicitly saved as empty** (~line 3328-3332):
- Check if `amenities.pms_rate_types` exists as an array (even if empty). If it's `[]`, treat it as intentional — set `pmsRateTypes` to `[]` and skip the room-based fallback generation.
- Only fall through to auto-generation when `pms_rate_types` key is completely absent (fresh/legacy properties).

**Change 2 — Move deactivation outside the `pmsRateTypes.length > 0` guard** (~line 4100):
- Extract the deactivation block (lines 4164-4191) so it runs even when `pmsRateTypes` is empty. When empty, ALL active `rolos_rate_plans` for that property should be deactivated.

**Change 3 — Tighten stale detection** (~line 4177):
- Change from triple-AND (`!id && !code && !name`) to only match on `id` and `code`. Remove name matching to prevent false retention of renamed plans.

