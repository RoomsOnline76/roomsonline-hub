

# Fix: Seasons Calendar ↔ Rate Tabs Data Alignment

## Root Cause

The **Seasons Calendar** and the **Rate Breakdown tab** use **different key structures** in the same `seasonRates` object, so data entered in one never appears in the other:

| Component | Rate key format | Example |
|-----------|----------------|---------|
| Calendar | `${seasonId}` or `${seasonId}-${mealType}` | `"12345"` or `"12345-breakfast"` |
| Rate Breakdown | `${seasonId}-${rateTypeId}` | `"12345-manual-rate-678"` |

They write to completely different slots in `seasonRates[roomId]`, so they never see each other's values.

Additionally, the Calendar has no rate type selector — it doesn't know which rate type it's editing, making it impossible to align with Rate Breakdown.

## Solution

### 1. Add Rate Type selector to the Calendar's "Room Rates" section

Currently the calendar only iterates over `mealTypeSuggestions`. Instead:
- Add a **Rate Type dropdown** in the room rates section (next to the room selector)
- The rate key becomes `${seasonId}-${rateTypeId}` — matching the Rate Breakdown format exactly
- If a room has linked rate types, show those; otherwise show all available rate types
- Meal type is secondary: if both rate type AND meal types exist, key = `${seasonId}-${rateTypeId}-${mealType}`

### 2. Align key format across all tabs

Standardize on `${seasonId}-${rateTypeId}` as the canonical key format:
- **Calendar** `updateRate`/`getRate`: use `${seasonId}-${rateTypeId}` instead of `${seasonId}-${mealType}`
- **Rate Breakdown**: already uses this format — no change needed
- **`getSeasonRateSummary`**: update to iterate over rate type IDs, not meal types

### 3. Migration of existing calendar-only data

On load, detect any `seasonRates` entries using the old key format (keys that don't match any rateTypeId) and migrate them to the first linked rate type ID. This preserves any rates already entered via the calendar.

## Changes

### `SeasonsCalendar.tsx`
- Add `selectedRateType` state and a Rate Type `<Select>` dropdown in the Room Rates section
- Change `updateRate`/`getRate` to use `${seasonId}-${selectedRateTypeId}` key format
- Show the selected rate type name in the grid header
- Remove meal-type-based iteration from the rate grid (rate types replace this role)

### `PropertyForm.tsx`
- Update `getSeasonRateSummary` to iterate over rate type IDs instead of meal types
- Pass the room's linked rate types properly so calendar can filter

## Visual Result

```text
┌─────────────────────────────────────────────┐
│  ROOM RATES                                 │
│  Room: [▼ Luxury Suite]                     │
│  Rate Type: [▼ Standard Rate]               │
│                                             │
│  ■ Peak     Room: R___  Adult: R___  ...    │
│  ■ Low      Room: R___  Adult: R___  ...    │
└─────────────────────────────────────────────┘
```

Data entered here will now appear identically in the Rate Breakdown tab, and vice versa.

## Files to Change

| File | Changes |
|------|---------|
| `src/components/property/SeasonsCalendar.tsx` | Add rate type selector; align rate key format to `${seasonId}-${rateTypeId}` |
| `src/pages/PropertyForm.tsx` | Update `getSeasonRateSummary` to use rate type IDs; migrate legacy calendar keys on load |

