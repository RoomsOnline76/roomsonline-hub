## Plan: fix ONE46 ON M calendar room names and ARI

### What is wrong now
- The mapping repair now succeeds and matches **5/5 Hostfully units**.
- The database still stores/display names as local short names: `1 Bedroom`, `2 Bedroom`, `Compact 1 Bedroom`.
- The PMS screenshot expects canonical Hostfully/category names:
  - `Compact Studio`
  - `Studio`
  - `Compact One Bedroom Apartment`
  - `One-Bedroom Apartment`
  - `Two-Bedroom Apartment`
- The live availability cache currently has only 4 room IDs; `Compact One Bedroom` is still missing from persisted cache.
- The Hostfully sync writes cache entries asynchronously without awaiting completion, so the function can return before all 5 room types are saved.
- Calendar helpers still use room-name fuzzy matching for availability/rates/restrictions, which is risky when names are shortened or similar.

### Implementation steps

1. **Make ONE46 names canonical**
   - Update the ONE46 room rows in the backend data so `hostfully_room_types`, linked `rolos_room_types`, and `properties.amenities.room_types` use the expected display names:
     - `cffcaa35...` → `Compact One Bedroom Apartment`
     - `97536287...` → `One-Bedroom Apartment`
     - `c7166dba...` → `Two-Bedroom Apartment`
     - Keep `Compact Studio` and `Studio` unchanged.
   - This is a data correction, not a schema change.

2. **Fix Hostfully cache persistence**
   - In `hostfully-api`, remove the fire-and-forget cache write around multi-unit availability.
   - Await all cache upserts before returning success.
   - Track and return any per-room cache failures so a sync cannot silently report success with only 4/5 room types saved.
   - Keep cache rows keyed by the local room type ID so the orchestrator can safely filter to active room types.

3. **Preserve PMS-derived display names during mapping repair**
   - Enhance `repair_room_mapping` so its result can expose the matched Hostfully unit names and, for ONE46-style unit names, derive the canonical category label (`ONE46ONM 301 Compact One Bedroom` → `Compact One Bedroom Apartment`).
   - Avoid overwriting names with placeholders like `Property` or short aliases.

4. **Make calendar ARI lookup ID-based**
   - In `CalendarAccommodation.tsx`, ensure displayed rows keep `pmsRoomTypeId` populated.
   - Change `getAvailability`, `getRate`, and `getRestrictions` to match by room type ID first.
   - Remove fuzzy name fallback for PMS rows, or only use it as a final fallback when no ID exists.
   - Update the canonical safety net so it maps canonical backend room IDs to display rows instead of filtering purely by name.

5. **Purge and refresh ONE46 cache**
   - Delete the current ONE46 Hostfully availability cache rows.
   - Trigger a fresh Hostfully sync after the code fix so all 5 rooms persist with correct names/rates/availability.

6. **Verify**
   - Confirm backend cache has 5 external room type IDs for ONE46, including `cffcaa35...`.
   - Confirm the calendar displays exactly the 5 expected room names and no `Property`, `1 Bedroom`, `2 Bedroom`, or `Compact 1 Bedroom` rows.
   - Compare the visible date range against the provided PMS screenshot values for availability and rates.