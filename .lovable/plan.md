

# Fix Hostfully Ingestion: Room Type Overwriting & Image Assignment

## Problems Found

### 1. Room types get overwritten/duplicated on re-import
The upsert uses `onConflict: 'property_id,hostfully_room_id'` but `hostfully_room_id` is set to `group.unitUids[0]` — the first UID in each type group. If the API returns units in a different order on re-import, the "first" UID changes, creating a duplicate row instead of updating the existing one.

### 2. PMS photos not saved to room types
- The **orchestrator path** (`transformRooms`) never passes `images` to room data — photos fetched from the property-level `/photos` endpoint all go to `properties.images`, nothing goes to `hostfully_room_types.images`
- The **writer** (`writer.ts` line 190) doesn't include `images` in the room upsert object, so even if images existed, they'd be dropped
- The **unit-ingestion path** correctly fetches per-unit photos and builds an `images` array, but it only writes them via `roomData.images = room.images || []` for the representative unit — other units' images in the same type group are lost

### 3. Property-level photos should go to `properties.images` (this already works)

## Changes

### 1. Fix room type deduplication (`writer.ts` + `unit-ingestion.ts`)
- Before upserting room types, query existing `hostfully_room_types` for this property
- Match by normalized `property_type` (type name) rather than relying solely on `hostfully_room_id`
- If a matching type row exists, UPDATE it by `id` instead of upserting with a potentially different `hostfully_room_id`
- This prevents duplicates when the first-unit ordering changes between syncs

### 2. Pass room images through orchestrator path (`transformers.ts` + `writer.ts`)
- In `transformRooms()`: assign per-room photos from `ctx.photos` filtered by room UID/category, or fall back to property photos for standalone properties
- In `writer.ts` line 190: add `images: room.images || []` to the `roomData` object so images are persisted to `hostfully_room_types`

### 3. Aggregate all unit images per type group (`unit-ingestion.ts` + `writer.ts`)
- When grouping units by type, collect ALL images from all units in the group (deduplicated by URL)
- Write the merged image set to the representative room type row
- This ensures all photos across units of the same type are available

### 4. Separate property vs room images in orchestrator
- Property-level photos (category: 'property' or 'exterior') → `properties.images` (already working)
- Room-level photos (category: 'room', 'bedroom', 'bathroom', 'interior') → `hostfully_room_types.images`
- When Hostfully doesn't provide category metadata, all photos go to property AND the first set goes to the standalone room type

## Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `supabase/functions/hostfully-api/ingestion/writer.ts` | Add `images` to room upsert; match existing types by name before upsert |
| Modify | `supabase/functions/hostfully-api/ingestion/transformers.ts` | Pass images to `TransformedRoomData`; separate property vs room photos |
| Modify | `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts` | Merge all unit images per type group; match existing types by name |
| Modify | `supabase/functions/hostfully-api/ingestion/types.ts` | Ensure `images` field on `TransformedRoomData` is typed |

