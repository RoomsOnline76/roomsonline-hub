

# Extend Availability Calendar to 13 Months Forward

## Summary

Replace all 90-day availability windows with 13-month (395-day) windows across the admin calendar, ROLOS dashboard embeds, property showcase, QuickBookDrawer, and the backfill edge function.

## Changes

### 1. `src/pages/CalendarAccommodation.tsx` (line ~447)
Change `endDate.setDate(endDate.getDate() + 90)` → `+ 395` (13 months). Update comment.

### 2. `src/pages/PropertyShowcase.tsx` (lines ~452, ~484)
- Change `addDays(today, 90)` → `addDays(today, 395)`
- Change `for (let i = 0; i < 90; i++)` → `i < 395`
- Update comment from "90-day range" to "13-month range"

### 3. `src/components/booking/QuickBookDrawer.tsx` (lines ~156, ~430)
- Change `endDate.setDate(endDate.getDate() + 90)` → `+ 395`
- Change `for (let i = 0; i < 90; i++)` → `i < 395`
- Update comments

### 4. `src/components/journey/EditStayDatesDialog.tsx` (line ~59)
Change `addDays(today, 180)` → `addDays(today, 395)` to match 13-month window.

### 5. `supabase/functions/roomsonline-pms-api/index.ts` (line ~1952)
Change backfill default from `days_ahead || 90` → `days_ahead || 395`.

### 6. `supabase/functions/nightsbridge-reservations-sync/index.ts` (line ~109)
Change default sync window from `+ 90` → `+ 395`.

### 7. `src/components/RoomAvailabilityCalendar.tsx`
No hard 90-day limit found — it fetches per-month on navigation. Already supports forward navigation. No change needed.

### 8. `src/components/embed/EmbedAvailabilityGrid.tsx`
No hard limit — uses offset-based navigation with data passed in. No change needed, but parent components feeding it data (EmbedProperty.tsx) should provide 13-month data if applicable.

## Scope
- **7 files** modified (5 frontend, 2 edge functions)
- All changes are simple numeric constant replacements (90 → 395, 180 → 395)
- Edge functions will auto-deploy

