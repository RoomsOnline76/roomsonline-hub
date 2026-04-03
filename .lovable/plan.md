

# Fix: Seasons Calendar — Clear Separation of Property Seasons vs Room Rates

## Problem
The calendar currently has a single room selector dropdown at the top, making it ambiguous whether season date edits apply to just that room or the whole property. In reality:
- **Seasons (dates, names, colors, min/max stay)** = property-wide settings
- **Rates** = per room/unit

The UI needs to make this distinction visually obvious.

## Solution

Restructure `SeasonsCalendar.tsx` into two clearly separated sections:

### 1. Top Section — "Property Seasons" (no room selector)
- Calendar grid, season legend, add/edit season controls
- Season detail panel shows: name, color, min/max stay, periods — all clearly labelled as property-wide
- Remove the room selector from this area
- Add a subtle header: "Property Seasons" with a note "(applies to all rooms)"

### 2. Bottom Section — "Room Rates by Season"
- Moves the room selector here, prominently labelled "Set rates for:"
- Shows a compact table/card: rows = seasons, columns = rate fields
- Each season row shows its color badge + name, with rate inputs for the selected room
- Makes it unmistakable that rate edits are scoped to the selected room
- When switching rooms, rates update accordingly (already works via `seasonRates[selectedRoomType]`)

### Visual Layout
```text
┌─────────────────────────────────────────────┐
│  PROPERTY SEASONS  (applies to all rooms)   │
│  [< 2026 >]           [+ Add Season]        │
│  ┌─────────────────────────────────────┐     │
│  │  Jan  1  2  3  4  5 ... 31         │     │
│  │  Feb  ████████░░░░░░░░░░           │     │
│  │  ...                               │     │
│  └─────────────────────────────────────┘     │
│  Legend: ■ Peak (2)  ■ Low  ■ Shoulder       │
│                                              │
│  [Season detail: name, color, periods, stay] │
├──────────────────────────────────────────────┤
│  ROOM RATES                                  │
│  Set rates for: [▼ Luxury Suite         ]    │
│                                              │
│  ■ Peak     Room: R___  Adult: R___  ...     │
│  ■ Low      Room: R___  Adult: R___  ...     │
│  ■ Shoulder Room: R___  Adult: R___  ...     │
└──────────────────────────────────────────────┘
```

## Changes

### In `SeasonsCalendar.tsx`:
1. Move the room `<Select>` from the top header down into a new "Room Rates" section below the season detail panel
2. Add section headers: "Property Seasons" (with subtitle) and "Room Rates by Season"
3. Restructure the rate editor from inside the season detail card into a standalone section that shows ALL seasons' rates for the selected room in a compact grid
4. Season detail card only shows season-level fields (name, color, periods, min/max stay) — no rates

## File to Change

| File | Changes |
|------|---------|
| `src/components/property/SeasonsCalendar.tsx` | Move room selector below calendar; split season detail from rate editor; add section headers |

