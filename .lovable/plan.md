# Fix five Create-Booking and calendar issues

## What I confirmed first

- **Fab Fam · Tidal Pools 13–18 Aug** (`ROL-TID-0243`) has **3 room lines** in the booking-rooms table but an **empty assigned-unit list**. The calendar only matches a booking to a room type via the single `room_type_id` on the booking, so it draws one bar instead of three.
- The dashboard's booking query **does not select `rol_reference`** at all, which is why neither the hover card nor the opened booking shows a reference (the reference itself exists).
- In portfolio ("All units") mode, the Create Booking dialog is handed the **selected property's** rate resolver, not a per-property one — so picking Tidal there resolves no rates and shows "No rate configured for these dates".
- Tidal has 225 guest profiles, so the imported guests are stored; the read policy on guest profiles grants owner/admin/dev only — **`fearless_leader` is missing**, so that role's search returns nothing.
- No code or database rule requires a deposit; the field simply stays visible and editable when a booking is marked Paid, which reads as "deposit demanded".

## Changes

### 1. Past-guest search in Create Booking
- Keep the profile search, and add a fallback that searches previous bookings (name / email / phone) for the same property when profiles return nothing, so imported history is always reachable.
- Grant `fearless_leader` read access to guest profiles and booking room lines so that role sees the same history as admin/dev.

### 2. Respect unit capacity
- Pass each room type's maximum occupancy into the dialog, show it under the occupancy inputs, and block saving with a clear message when a line exceeds it.

### 3. Rates in portfolio mode
- Give the dialog a property-aware rate resolver so a room type on any portfolio property prices correctly instead of falling through to "No rate configured".

### 4. Deposit optional on paid bookings
- When Payment Status is Paid, clear and disable the Deposit field with a "not applicable — paid in full" hint. Blank continues to save as no deposit.

### 5. Multi-room bookings and references on the calendar
- Load the booking's room lines for the visible range and use every line's room type / unit when placing bars, so a three-room stay shows three bars (auto-assignment fills unassigned lines round-robin, one unit per line).
- Add `rol_reference` to the calendar booking query and show it on the hover card and in the booking sheet header.

## Technical notes

- New `src/hooks/useBookingRoomLines.ts`: chunked `rolos_booking_rooms` lookup keyed by booking id, returning room-type and unit ids per booking; used by `PMSDashboard` and `PMSRooms`.
- `src/lib/bookingAssignment.ts`: accept per-line room types and assign one non-conflicting unit per line.
- `src/components/pms/roomplan/RoomPlanGrid.tsx`: `bookingBelongsToType` also matches line room types; `RoomPlanBar` gains a reference line in the hover card (`displayBookingReference`).
- `src/pages/pms/PMSDashboard.tsx`: add `rol_reference, external_reservation_id` to the bookings select; pass a `getRateForPropertyDate` callback to `ManualBookingDialog`.
- `src/components/pms/ManualBookingDialog.tsx`: `max_occupancy` on the room-type shape, per-line capacity guard, deposit disabling, portfolio rate resolver, guest-search fallback.
- One migration: add `has_role(auth.uid(),'fearless_leader')` to the select policies on `rolos_guest_profiles` and `rolos_booking_rooms`.
