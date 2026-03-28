

# Add "Today" + Next-Available-Day Labels to Room Cards

## What Changes

The room availability badge currently shows "X left" — this is today's availability but doesn't say so. Two improvements:

1. **"X left today"** — clarify the badge refers to today
2. **"Y available from Wednesday"** — new secondary badge (different color, e.g. green/teal) showing the next day this room type has availability, helping users who see 0 today know they can shift dates

## How It Works

### Data: Fetch 7-day availability window

In `PropertyShowcase.tsx`, expand the `pms_availability_cache` query from `eq("date", today)` to fetch the next 7 days (`.gte("date", today).lte("date", today+7)`). Group results by room type, storing both today's count and the first future date with availability > 0.

Pass a new `getNextAvailableDay` callback to `RoomCollection` alongside the existing `getAvailability`.

### UI: RoomCollection badge updates

- Change `"{availability} left"` → `"{availability} left today"`
- When `availability === 0` and a next-available date exists, show a teal/green badge: `"Available from {dayName}"` (e.g. "Available from Wednesday")
- When `availability > 0` but a future date has MORE availability, optionally show `"+{n} more from {dayName}"` in a subtle secondary badge

### Day name formatting

Use `new Date(dateStr).toLocaleDateString('en', { weekday: 'long' })` to get "Wednesday", "Thursday" etc.

## Files

| Action | File |
|--------|------|
| Modify | `src/pages/PropertyShowcase.tsx` — expand cache query to 7 days, compute next-available map, pass to RoomCollection |
| Modify | `src/components/showcase/RoomCollection.tsx` — new `getNextAvailableDay` prop, updated badge rendering |

No database changes needed.

