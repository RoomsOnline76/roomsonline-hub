

## Fix: RU Seasons/Prices Not Pushed + Beds Warning

### Root Causes Found

**1. Seasons/Prices: Rate key mismatch**
The `resolveUnitRateKey` function tries to look up rates using `hostfully_room_types.id` (UUID like `f042d323-...`) and `linked_rolos_id` (UUID like `c6a5bd41-...`). But the actual `season_rates` composite keys use the **amenity room_type ID** from `properties.amenities.room_types` (timestamp-based IDs like `1775237066341`).

Example: For SEESTER, the rate key is `1775218225666-1775237066341` (seasonId-amenityRoomId), but the code searches for `1775218225666-ea5b95f2-...` (seasonId-hostfullyId). No match is ever found, so **zero prices are pushed** to RU for any unit.

**2. Beds: Missing bed amenity IDs in Rooms block**
The `<Rooms>` section currently sends generic property amenities (wifi, parking, etc.) but never includes RU bed-type amenity IDs. RU requires bed definitions within the `<Room>` amenities using specific IDs (e.g., 97=Single bed, 98=Double bed, 99=King bed, 100=Sofa bed). The `<NumberOfBeds>` tag alone is insufficient — RU needs to know the bed *types*.

### Changes

**1. `supabase/functions/push-property-to-ru/index.ts`**

- **Fix rate key resolution**: In `resolveUnitRateKey`, add the amenity room_type ID as a candidate key. Match the unit to its corresponding `amenities.room_types[]` entry by name, then use that entry's `id` for the composite key lookup. This is the only way the `seasonId-roomId` keys in `season_rates` will resolve.

- **Add bed amenities to Rooms block**: In `buildUnitPayload`, map `bed_configuration` entries to RU bed amenity IDs:
  - `single` → amenity ID 97
  - `double` → amenity ID 98  
  - `king` → amenity ID 99
  - `sofa` → amenity ID 100
  - `bunk` → amenity ID 101
  
  Include these in the `rooms` array with `count` set to the actual bed count from the configuration.

**2. `supabase/functions/rentalsunited-api/index.ts`**
- No changes needed. The `buildPushPropertyXml` and `buildPushPricesXml` functions are correct — they just never receive data due to the key mismatch upstream.

### Expected Outcome
- Each unit push includes bed-type amenities in `<Room>`, resolving the "Add sufficient amount of beds" warning.
- Each unit push is followed by a successful `push_prices` call with the correct per-unit rates per season, resolving the "Please add more seasons with defined prices" warning.

