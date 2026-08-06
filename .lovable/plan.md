# View Rates — per-night rate override on a booking

Add a "View Rates" panel to an open booking (from the ROL'OS Dashboard room plan and the Rooms page) where a user can see and override the rate for each room, for each night of the stay — matching the reference layout.

## What the user gets

- A **View Rates** button on the open booking record (next to the Account totals).
- A dialog with:
  - **Rate Sheet** selector (the property's rate plans) + **Refresh** to re-pull the calculated rates from the rate engine for the selected sheet.
  - **Fill to the right** checkbox: typing a rate on one night copies it to all later nights of that room line.
  - One collapsible block per booked room/unit, listing every night of the stay (e.g. "Tue 11 Aug") with an editable amount field.
  - Live **Booking Total** at the bottom and **Save**.
- Overridden nights are visually marked so it is clear the rate no longer matches the rate sheet, with a per-room "reset to rate sheet" action.
- Saving writes the nightly rates, recalculates each room line total and the booking total, and refreshes the booking card, folio and revenue figures.

## Why a change is needed

Today a booking room line stores only a single `rate_charged` (plus one `nightly_rate`), so per-night editing has nowhere to persist. The plan adds per-night storage.

## Technical notes

**Database**
- New table `public.rolos_booking_room_nights`: `id`, `booking_id`, `booking_room_id` (FK → `rolos_booking_rooms`, cascade), `property_id`, `stay_date`, `rate` numeric, `rate_plan_id`, `is_override` boolean, timestamps; unique on (`booking_room_id`, `stay_date`).
- GRANTs for `authenticated` (select/insert/update/delete) and `service_role`; RLS enabled with policies scoped through `can_access_property(property_id, auth.uid())`, matching the other `rolos_*` booking tables.

**Frontend**
- New `src/components/pms/booking/ViewRatesDialog.tsx` — rate-sheet select, Refresh, fill-to-the-right, per-room night inputs, total, Save. Reuses existing rate resolution (rate plan / `rolos_rate_prices` seasonal cascade) for the Refresh path so displayed defaults match the admin calendar.
- `BookingDetailsGrid.tsx`: add the View Rates trigger; after save, re-read line totals so Accommodation/Balance reflect overrides, and keep the existing manual line-total override in sync (line total = sum of its nights).
- Seed behaviour: if a booking has no night rows yet, the dialog derives them from `nightly_rate`/`rate_charged` ÷ nights so existing bookings open with sensible values.
- Wire the dialog into the booking sheet used by both `PMSDashboard.tsx` (room plan) and `PMSRooms.tsx`.

**Downstream**
- Booking total update triggers the existing commission recalculation path, so revenue/commission stay correct after an override.
