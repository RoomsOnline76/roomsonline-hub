

# Plan: Fix Rate Plan Descriptions, Calendar Availability Counts & Manual Booking

## Issues Identified

1. **Rate Plans "configure rate amount" text**: The `description` field on rate plans was set during initial creation with stale placeholder text. The actual `base_rate` values (R2,650 and R650) are correctly stored and displayed. Fix: clean up descriptions during sync, and stop showing misleading description text when a rate exists.

2. **Calendar missing availability counts**: The calendar shows room type headers with "X rooms" but doesn't show per-day availability breakdown (total vs booked vs remaining).

3. **No manual booking creation**: Users need to create bookings directly from the PMS calendar.

## Implementation

### 1. Fix Rate Plan Description Display (PMSRatePlans.tsx)

- In the `syncFromAmenities` function, when upserting rate plans, update stale descriptions that contain "configure rate amount" if the plan now has a `base_rate > 0`.
- In the card UI: if `base_rate > 0`, don't display a description that says "configure rate amount" — replace with a meaningful fallback or hide it.

### 2. Calendar Availability Counts (PMSDashboard.tsx)

Add an availability summary row within each room type header cell showing:
- **Total rooms** of that type
- **Booked** count for that date (active bookings occupying rooms of this type)
- **Available** remaining count
- Format: e.g. `2/3 avail` or `1 booked · 2 avail`

Both `WeekCalendarGrid` (RoomTypeSection) and `MonthCalendarGrid` room type header rows need this. Compute per room-type per-date: count bookings where `room_type_id` matches or `rolos_room_ids` includes rooms of that type, subtract from total rooms of that type.

### 3. Manual Booking Dialog (PMSDashboard.tsx)

Add a "New Booking" button in the calendar header area. Opens a Dialog/Sheet with form fields aligned to the bookings table:

**Required fields:**
- Guest name, email, phone
- Check-in / Check-out dates (date pickers)
- Room type (select from `rolos_room_types`)
- Room assignment (select from `rolos_rooms` filtered by type)
- Rate plan (select from `rolos_rate_plans`)
- Adults count
- Total price (auto-calculated from rate × nights, editable)

**Optional fields:**
- Children, teens, infants, pets counts
- Special requests (textarea)
- Payment status (unpaid/partial/paid) 
- Payment method (cash/card/eft/other)
- Booking status (pending/confirmed)
- Booking channel (default: "direct/walk-in")

**On save:**
- Insert into `bookings` table with `property_id`, `booking_channel: 'direct'`, `integration_type: 'rolos'`
- Set `rolos_room_ids` from selected rooms
- Set `rolos_rate_plan_id` from selected rate plan
- Auto-calculate price: `base_rate × nights` as default, allow manual override
- Invalidate calendar queries to refresh
- Create stop-sell/availability update if needed

### 4. Fix PropertyForm Stale Descriptions

In `PropertyForm.tsx`, when creating rate types with no baseRate, use a cleaner default description (empty string or the rate type name) instead of "Configure rate amount".

## Files Modified

| File | Change |
|------|--------|
| `src/pages/pms/PMSRatePlans.tsx` | Clean stale descriptions during sync; hide "configure" text in UI when rate exists |
| `src/pages/pms/PMSDashboard.tsx` | Add per-day availability counts in room type headers; add manual booking dialog with full form |
| `src/pages/PropertyForm.tsx` | Stop setting "Configure rate amount" as default description |

