

# Add "View Cart" with Calendar Timeline View

## What
Add a calendar/timeline visualization to the JourneyBuilder widget so users can see all booked stays laid out across dates. Also add a dedicated "View Cart" action accessible from portfolio/property pages.

## How

### 1. New component: `JourneyCalendarView`
- A horizontal timeline or month-grid calendar showing each stay as a colored bar spanning check-in to check-out
- Each bar shows property name, room type, and night count
- Color-coded per property (use a small palette, assign by index)
- Gaps between stays are visually obvious (empty days shown)
- Tapping a stay bar highlights it and shows details (property image, price, rooms)
- Remove button on each bar

### 2. Update `JourneyBuilder.tsx`
- Add a "View Journey" / calendar icon toggle button in the header alongside the existing expand/collapse
- When toggled, show the `JourneyCalendarView` instead of the list view
- Add a tab-style toggle: "List | Calendar" at the top of the expanded content
- Keep existing list view as default; calendar is the alternate view

### 3. Add "View Cart" floating action
- When `hasStays` is true, the JourneyBuilder pill already shows — enhance it with a small calendar icon badge
- In the expanded state, add a "View Journey Map" button that opens a dialog/sheet with the full calendar view (more space than the small widget)
- Use a Sheet (bottom on mobile, side on desktop) for the full calendar view

### 4. Calendar rendering approach
- Determine date range: earliest check-in to latest check-out across all stays
- Render a simple row-per-stay horizontal bar chart aligned to a shared date axis
- Each row: property thumbnail + name on left, colored bar spanning the dates on right
- Date headers across the top (day numbers with month labels)
- Total nights and total price summary at the bottom

## Files Changed

| File | Change |
|---|---|
| `src/components/journey/JourneyCalendarView.tsx` | New component — horizontal timeline of all stays with date bars, property labels, gap indicators |
| `src/components/journey/JourneyBuilder.tsx` | Add List/Calendar view toggle in expanded content; add "View full journey" button that opens Sheet with calendar |
| `src/components/journey/index.ts` | Export new component |

