

# Add Availability Indicators to Embed Property Room Cards

## What

Add the same availability badges ("3 left today", "1 available from Friday") that appear on the property showcase (`RoomCollection.tsx`) to the embed property's "Rooms & Suites" section in `EmbedProperty.tsx`.

## Data Already Available

The embed page already has all the data needed:
- `pmsCacheMap[roomId]` — per-date availability with `available_units`
- `availabilityOverrides[roomId]` — manual stop-sell / unit overrides
- `liveRates` — live PMS data with availability flags
- `gridRooms` — already computes per-date rates including SOLD status

## Implementation

### Single file change: `src/pages/EmbedProperty.tsx`

Inside the `roomTypes.map()` block (lines 554–635), compute availability for today and next 7 days, then render badges on the room image:

1. **Compute today's availability** from `pmsCacheMap` and `availabilityOverrides`:
   - Count available units for today's date
   - If 0 today, scan the next 7 days for the first date with availability (same logic as `RoomCollection`)

2. **Render badges** on the room image area (top-left corner, matching the showcase style):
   - `{n} left today` (red badge) when 1–3 units remain
   - `{n} available from {dayName}` (green badge) when sold out today but available within 7 days
   - Reduce card opacity to 80% when sold out today but future availability exists
   - Reduce to 50% opacity when fully unavailable

3. **Style** uses inline styles (consistent with the rest of EmbedProperty) with the same visual treatment as `RoomCollection`:
   - Red: `background: rgba(239,68,68,0.9)`, white text
   - Green: `background: rgba(5,150,105,0.9)`, white text
   - Small pill shape, `font-size: 10px`

### No new files or dependencies needed

