

# Add Housekeeping Alert for Dirty Rooms with Same-Day Arrivals

## Problem
The PMS dashboard computes `dirty` room counts (line 556) but never displays them. More critically, it never cross-references dirty rooms against today's arrivals to surface an urgent alert like "Room X is dirty but has a guest checking in today."

## What Changes

### `src/pages/pms/PMSDashboard.tsx`

1. **Add dirty/maintenance stat pills** to the existing `statCards` array (line 659-665). Add two more entries showing dirty and maintenance counts with appropriate amber/red colors.

2. **Compute urgent rooms** — a new `useMemo` that cross-references:
   - `rooms` where `status === "dirty"` or `status === "maintenance"`
   - Today's arrivals (`todayArrivals`) matched to room types
   - Uses `roomsByType` to find which specific dirty rooms belong to the arriving booking's room type
   - Result: list of `{ room, arrivalGuestName }` pairs needing immediate attention

3. **Render an alert banner** between the stat pills and the calendar card (line ~698) when urgent rooms exist:
   - Red/amber Card with `AlertTriangle` icon
   - Lists each dirty room + the guest name expecting to check in
   - Example: "⚠ The Dungeon is dirty — guest John Smith checking in today"
   - Includes a quick-action button linking to the Housekeeping page

### Matching logic
- Each arrival booking has a `room_type_id` (may be a Hostfully UUID or ROL'OS UUID)
- Match against `rolos_room_types` using both `id` and `linked_overview_id`
- Find dirty `rolos_rooms` that belong to matched room types
- If no specific room assignment exists on the booking, flag ALL dirty rooms of that room type

### No backend changes needed
All data is already fetched: `rooms`, `todayArrivals`, `roomTypes`. This is purely a UI computation + rendering addition.

