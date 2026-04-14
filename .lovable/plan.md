

## Fix Room Type Data & Toggle Sync

### Problem
1. **Seesig**: 9 chalets exist in amenities JSON (all `is_active: true`), but the `hostfully_room_types` table only has 4 names with `is_active = true` (ANEMOON, SEESTER, SWARTMOSSEL, WITMOSSEL). The other 5 (ALBATROS, DUIKER, OESTER, STANDLOPER, TOBIE) are `is_active = false`. Plus there's a typo entry "RANEMOON" that shouldn't exist.
2. **Massive duplicates**: ANEMOON/SEESTER/SWARTMOSSEL/WITMOSSEL each have 12 rows. Every sync creates new rows instead of updating existing ones.
3. **All properties**: The toggle updates amenities JSON correctly but the `hostfully_room_types` table may be out of sync with what the UI shows.

### Plan

**Step 1: Data cleanup via insert tool (UPDATE/DELETE statements)**

For **Seesig** (`76f524f3-8229-4097-b45d-18489f897195`):
- Delete the "RANEMOON" typo row
- For each of the 9 valid chalet names, keep only the most recent row (by `created_at`) and delete all others
- Set `is_active = true` on the surviving row for all 9 chalets

For **all other properties** with duplicates:
- Same dedup: keep most recent row per (property_id, name), delete the rest
- Sync `is_active` from the amenities JSON — if the room exists in `amenities.room_types` with `is_active: true`, set it true in the table

**Step 2: Fix the toggle function to prevent future duplicates**

The `toggleRoomActive` function in `RoomManagerTab.tsx` uses `ilike("name", roomName)` which correctly updates all dupes. But the root cause of duplicates is likely in the sync/import logic — not the toggle itself. The toggle logic is fine; we just need the data fixed.

**Step 3: Review all properties for consistency**

Write a quick query across all properties to compare amenities JSON `is_active` state vs `hostfully_room_types.is_active` state, and fix any mismatches via UPDATE.

### Technical Details

- Data operations use the insert tool (UPDATE/DELETE)
- No schema migrations needed
- No code changes needed — the toggle function already syncs both amenities JSON and the canonical table correctly
- The duplicate creation bug is in the sync/import flow (separate issue)

### Files Modified
- None (data-only fix)

