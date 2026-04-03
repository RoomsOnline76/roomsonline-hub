

# Seasons Calendar — Visual Rate & Season Management

## Problem
Currently, seasons and rates are managed across three separate sub-tabs (Seasons, Rate Types, Rate Breakdown) within the Rates tab. Users must jump between tabs to define a season, then set rates for it, then check the breakdown. This is confusing and error-prone.

## Solution
Add a new **Seasons Calendar** sub-tab inside the existing Rates tab that provides an annual calendar view where users can:
1. Visually select date ranges and label them as seasons (drag or click start/end)
2. Set rates per room type directly within each season block
3. See the full year at a glance with color-coded season bands

For external PMS properties, this calendar is **read-only** — seasons and rates are synced from the PMS and displayed for reference.

## Design

### Calendar Layout
```text
┌─────────────────────────────────────────────────────┐
│  [Room: ▼ 3-Bedroom House]   [Year: ◄ 2026 ►]     │
├─────────────────────────────────────────────────────┤
│  JAN  │████ SUMMER (PEAK) ████│                     │
│  FEB  │████ SUMMER (PEAK) ████│                     │
│  MAR  │▓▓▓ AUTUMN (SHOULDER) ▓▓│                    │
│  APR  │▓▓▓ AUTUMN (SHOULDER) ▓▓│                    │
│  MAY  │▓▓▓ AUTUMN (SHOULDER) ▓▓│                    │
│  JUN  │░░░ WINTER (LOW) ░░░░░░│                     │
│  ...  │                        │                     │
│       │  [+ Add Season]       │                     │
├─────────────────────────────────────────────────────┤
│  Click a season band to edit rates & dates          │
└─────────────────────────────────────────────────────┘
```

Each month row shows 1-31 day cells. Season bands span across cells with distinct colors. Clicking a band opens an inline editor for that season's dates, name, min/max stay, and per-room rates.

### Interaction Flow
1. **Add Season**: Click "+ Add Season", select date range on the calendar (or type dates), name it, set color
2. **Set Rates**: Click an existing season band → expands an inline panel below showing rate fields for the selected room (room amount, adult, teen, child, infant — based on pricing model)
3. **Edit/Delete**: Right-click or use edit/delete buttons on the expanded panel
4. **Drag to Resize**: Drag season edges to adjust dates (stretch goal)

### Bidirectional Sync
- Creating/editing a season in the calendar updates `seasons[]` and `seasonRates{}` state in PropertyForm
- Edits in the existing Seasons or Rate Breakdown sub-tabs reflect in the calendar
- Last edit wins — both write to the same state variables

### External PMS (read-only mode)
- For non-ROL'OS properties (`external_system !== "roomsonline"` and `!== "none"`), the calendar renders `rolos_rate_seasons` data as read-only color bands
- No add/edit/delete controls shown
- Badge: "Synced from [PMS name]"

## Implementation

### New Component: `src/components/property/SeasonsCalendar.tsx`
- Props: `seasons`, `seasonRates`, `roomTypes`, `selectedRoomType`, `pmsRateTypes`, `pricingModel`, `currency`, `isReadOnly`, `onSeasonsChange`, `onSeasonRatesChange`
- Renders a 12-month horizontal grid (each month = row of day cells)
- Season bands rendered as absolutely positioned overlays with color coding
- Click handler opens inline rate editor panel
- Add season flow: click two dates to define range, then fill in details

### PropertyForm.tsx Changes
- Add new sub-tab `"seasons-calendar"` to the Rates tab's inner `<Tabs>` (between "Seasons" and "Rate Breakdown")
- Pass existing `seasons`, `seasonRates`, `roomTypes`, `selectedRoomType`, `pmsRateTypes` state
- Wire `onSeasonsChange` to `setSeasons` and `onSeasonRatesChange` to `setSeasonRates`
- Mark `setIsDirty(true)` on any change

### Season Colors
- Peak/Summer: red/orange band
- Shoulder/Autumn/Spring: amber/yellow band  
- Low/Winter: blue/teal band
- Custom: user-selectable from preset palette
- Stored as `color` field on each season object (backward compatible — existing seasons get auto-assigned colors)

### Rate Editor (inline panel)
When a season band is clicked, show below the calendar:
- Season name, date range (editable)
- Min/max stay
- Rate fields per linked rate type for the selected room
- Uses same `updateSeasonRate()` function already in PropertyForm

### Booking Engine Check
No changes needed — the existing `QuickBookDrawer.tsx` already iterates `seasons[]` and checks `seasonRates{}` per date. The calendar just provides a better UI for the same data.

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/property/SeasonsCalendar.tsx` | **Create** — new calendar component (~400 lines) |
| `src/pages/PropertyForm.tsx` | **Modify** — add "Calendar" sub-tab in Rates, wire props |

## What This Does NOT Change
- Existing Seasons and Rate Breakdown sub-tabs remain functional (users can use either)
- Data model unchanged (same `amenities.seasons` and `amenities.season_rates`)
- Booking engine pricing logic unchanged
- External PMS sync logic unchanged

