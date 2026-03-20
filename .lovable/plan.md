

# Fix: Calendar Only Shows Hostfully Data for Current Month

## Problem
The calendar fetches availability only for the **visible date range** (current month in month view, or current week + 8 days). When you navigate forward past March, the cache is empty and a new API call is made — but it only covers the new visible window. The Hostfully API itself returns data fine; the issue is the narrow fetch window combined with a 30-minute cache staleness check that causes re-fetches scoped to tiny ranges.

Additionally, when navigating forward, `fetchPmsAvailability(false)` is called (non-forced), so if cache exists for part of the range, it may return partial data and skip the API call.

## Fix

### 1. Widen the fetch window (CalendarAccommodation.tsx)
**Lines 428-444**: Change the date range calculation to always fetch **90 days ahead** from the start of the visible range, regardless of view mode. This ensures forward navigation has pre-fetched data.

```typescript
// Current: only fetches current month (31 days max)
// New: fetch 90 days from start of visible range
const endDate = new Date(startDate);
endDate.setDate(endDate.getDate() + 90);
```

### 2. Fix cache freshness check to be range-aware (CalendarAccommodation.tsx)
**Lines 312-336**: The current cache check loads data for the requested range but checks staleness based on the newest `fetched_at`. If only part of the range has fresh data, it returns that partial data as "fresh" and skips the API call. Fix: also check that the cache covers the full date range (has data for start and end dates).

### Files changed
- `src/pages/CalendarAccommodation.tsx` — widen fetch range to 90 days, improve cache coverage check

