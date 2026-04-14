
What’s actually going wrong

1. The RU validator is still showing the old property RU ID and no unit IDs because the property is currently being treated as single-unit during validation, not multi-unit.
   - Evidence: the latest `push-property-to-ru` dry-run response returned `"multi_unit": false` with `ru_property_id: 4691753`.
   - Root cause in code: `push-property-to-ru` only looks at active rows in `hostfully_room_types`, but the save flow in `PropertyForm.tsx` is writing `is_active: room.selected !== false`. Most room records load with `selected: false`, so they get saved inactive even though the room UI uses `is_active`, not `selected`.

2. The background push after Save therefore also runs in single-unit mode.
   - That means it updates the property-level RU record only, never enters the unit loop, never assigns units to the building, and never pushes per-unit ARI.

3. Bed counts pushed to RU are likely still wrong for units because the RU payload builder ignores `bed_configuration`.
   - `buildUnitPayload` currently uses `unit.beds || unit.bedrooms || Math.max(1, maxGuests)`.
   - The Seesig fix updated `bed_configuration`, not necessarily `beds`, so RU can still receive inflated or incorrect `NumberOfBeds`.

4. Seasons/rates are not being pushed per unit in a room-specific way.
   - `pushARI` reads only property-level `amenities.seasons` and `amenities.season_rates`, but it does not know which room/unit it is pushing.
   - It currently scans all season rate groups and picks the lowest matching season rate across every room, instead of resolving the rates for the specific room type being pushed.
   - That can cause wrong rates, missing rates, or RU rejection depending on the returned shape.

What I will change

1. Fix room activation persistence for ROL properties
   File: `src/pages/PropertyForm.tsx`
   - Change the room sync payload so `hostfully_room_types.is_active` is derived from `room.is_active !== false`, not `room.selected !== false`.
   - This is the main blocker causing validation/push to ignore all units.

2. Fix Hostfully room loading to preserve bed configuration properly
   File: `src/pages/PropertyForm.tsx`
   - In the Hostfully room loader, map `bedConfiguration` from `hr.bed_configuration` first, instead of incorrectly reading `hr.beds`.
   - This keeps the editor and save flow aligned with the data you already entered for Seesig.

3. Fix RU bed count mapping
   File: `supabase/functions/push-property-to-ru/index.ts`
   - Add a helper to calculate total beds from `bed_configuration`.
   - Use that total for `number_of_beds` before falling back to `beds`, `bedrooms`, or guests.
   - This should resolve the “sufficient beds” validation issue for units.

4. Fix per-unit ARI rate resolution
   File: `supabase/functions/push-property-to-ru/index.ts`
   - Update `pushARI` to accept the current room/unit context, not just the property.
   - Resolve season rates using the same room-key fallback pattern used elsewhere in the app:
     - room UUID
     - linked overview id if available
     - room name
     - matching amenity room id by name if available
   - Only build price entries from that unit’s own season rate bucket.

5. Improve RU validation UI data freshness
   File: `src/components/property/PushToRentalsUnited.tsx`
   - After push success, refresh property RU IDs and unit RU IDs from the database (or merge returned results into local state).
   - Show building-assignment failure if the backend returns it.
   - This will make the visible badges match the latest saved/pushed values.

6. Verify multi-unit flow behavior after the fix
   Expected outcome after implementation:
   - Validate returns `multi_unit: true`
   - Building badge stays visible
   - Each unit shows its RU ID badge
   - Push runs the unit loop
   - Units get assigned into the building folder
   - ARI runs per unit using that unit’s season/rate data
   - Bed validation passes using the new bed configuration totals

Technical details

Files to update:
- `src/pages/PropertyForm.tsx`
- `src/components/property/PushToRentalsUnited.tsx`
- `supabase/functions/push-property-to-ru/index.ts`

Key logic corrections:
- Replace:
  - `is_active: room.selected !== false`
  with:
  - `is_active: room.is_active !== false`
- Replace Hostfully room load mapping from:
  - `bedConfiguration: Array.isArray(hr.beds) ? ...`
  to:
  - `bedConfiguration: hr.bed_configuration || ...`
- Refactor `pushARI(...)` to take unit metadata and resolve room-specific season keys before pushing prices.

Why this should fix your exact report
- Old RU ID/no unit IDs: caused by false single-unit detection.
- Units not belonging to building: unit loop never ran when save-triggered push treated property as single-unit.
- Beds outstanding: RU payload still not using `bed_configuration`.
- Seasons incorrect for all units: ARI logic is not scoped to the current unit.

If approved, I’ll implement these fixes and align the RU validation/push flow with the actual Seesig unit data.
