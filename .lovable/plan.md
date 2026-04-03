

# Seasons Calendar — Multi-Period Seasons & Custom Names

## Problem
Currently each season has a single `from`/`to` date range. Real-world seasons often have **multiple non-contiguous periods** (e.g. "Peak" = Dec 15–Jan 10 AND Easter week AND school holidays). Users also want fully custom season names, not just preset categories.

## Current Data Model
```typescript
interface Season {
  id: string;
  name: string;
  from: string;  // single range start
  to: string;    // single range end
  color?: string;
  minStay?: number;
  maxStay?: number;
}
```

## New Data Model
Add a `periods` array to each season. Keep `from`/`to` as the first period for backward compatibility.

```typescript
interface SeasonPeriod {
  from: string;
  to: string;
}

interface Season {
  id: string;
  name: string;
  from: string;       // kept for backward compat (= periods[0].from)
  to: string;         // kept for backward compat (= periods[0].to)
  periods?: SeasonPeriod[];  // all periods including first
  color?: string;
  minStay?: number;
  maxStay?: number;
}
```

When `periods` is undefined/empty, fall back to `from`/`to` (backward compatible with existing data). When periods exist, `from`/`to` mirror `periods[0]`.

## Changes to `SeasonsCalendar.tsx`

1. **`getSeasonForDate()`** — check all `periods[]` entries (falling back to `from`/`to` if no periods array)

2. **"Add Range to Season" mode** — when a season is selected and user clicks "+ Add Period", enter range selection mode that appends a new period to the existing season instead of creating a new one

3. **Season detail panel** — show all periods as a list with individual from/to fields and a delete button per period. Add "+ Add Period" button that enters calendar range selection for that season.

4. **`confirmAddSeason()`** — initialize `periods: [{ from, to }]` when creating

5. **`updateSeason()`** — when editing `from`/`to` of a specific period, update both `periods[i]` and sync `periods[0]` back to top-level `from`/`to`

6. **Calendar rendering** — already works via `getSeasonForDate()` changes; all periods of a season render in the same color

7. **Custom names** — already supported (free text input), no changes needed. Remove any preset name suggestions if present.

## UI Flow

- Click "+ Add Season" → select range on calendar → enter name/color → creates season with one period
- Select existing season → panel shows all periods listed → click "+ Add Period" → select new range on calendar → appended to that season
- Each period row has from/to date inputs and a delete (trash) icon
- Rates are per-season (shared across all periods of that season), not per-period

## Files to Change

| File | Changes |
|------|--------|
| `src/components/property/SeasonsCalendar.tsx` | Add `periods` support, multi-period rendering, "Add Period" flow, period list in detail panel |

No other files need changes — the rate lookup keys by season ID, which stays the same regardless of how many periods a season has. The booking engine's date-matching will also work since it iterates seasons and checks date ranges.

