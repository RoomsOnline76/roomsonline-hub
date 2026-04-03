# Fix: Seesig ROL'OS Dashboard — Missing Rooms and Wrong Rates

## Root Cause (Two Problems)

**Problem 1 — Only 4 of 9 room types are active.**
Edit Property correctly shows all 9 chalets (SEESTER, WITMOSSEL, SWARTMOSSEL, ANEMOON, OESTER, STANDLOPER, ALBATROS, DUIKER, TOBIE). But `rolos_room_types` has only 4 active — the other 5 were deactivated by a previous cleanup. The Dashboard only queries `is_active = true`, so it shows 4 rooms. Unlike the Rooms page, the Dashboard never calls the sync function that would reactivate them.

**Problem 2 — Rates don't resolve from season calendar.**
The season rates in `amenities.season_rates` are keyed by amenity room type IDs (e.g., `1775237066341` for SEESTER). But the Dashboard's `getRateForDate` looks up by rolos UUID (e.g., `4a885682-...`). The `linked_overview_id` fallback is `null` for amenities-sourced types, and the name fallback also fails because keys are numeric IDs, not names. So the Dashboard falls back to `default_rate` on the room type (which may be stale or null) instead of using the correct seasonal rates (e.g., LOW=960, MIDDLE=1170, HIGH=2100 for SEESTER).

## Solution

### 1. Data fix — Activate all 9 Seesig room types

Use the insert tool to set `is_active = true` on the 5 deactivated room types (ALBATROS, DUIKER, OESTER, STANDLOPER, TOBIE). This is a one-time fix. Check for Phantom previously created rooms in ROLOS. They have Title case names and not CAPTIALS as NAMES, they should not be in ROLOS. Check all other [JOngensfontein.com](http://JOngensfontein.com) properties. This issue is common for all. 

### 2. Dashboard calls sync on load

Add a call to `syncRolosRoomTypesFromOverview` in the Dashboard's room types query (same pattern as PMSRooms). This ensures future deactivations are auto-corrected when any PMS page loads, not just the Rooms page.

### 3. Fix rate lookup to resolve amenity IDs

In `getRateForDate`, after the existing key attempts fail, build a name→amenityId map from `amenities.room_types` and try looking up season_rates by the amenity ID that matches the room type's name. This bridges the ID mismatch for ROL properties.

```text
Rate resolution chain (updated):
1. rolos_seasonal_prices (existing)
2. amenities.season_rates[rolosRoomTypeId]     ← existing, works for non-ROL
3. amenities.season_rates[linked_overview_id]   ← existing, works for hostfully
4. amenities.season_rates[amenityRoomTypeId]    ← NEW: match by name → amenity ID
5. rate plan base_rate                          ← existing fallback
6. room type default_rate                       ← existing fallback
```

## Files to Change


| File                             | Changes                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Database** (insert tool)       | `UPDATE rolos_room_types SET is_active = true` for the 5 inactive Seesig room types                                           |
| `src/pages/pms/PMSDashboard.tsx` | Import and call `syncRolosRoomTypesFromOverview` inside the room types query; add amenity-ID-based lookup in `getRateForDate` |
