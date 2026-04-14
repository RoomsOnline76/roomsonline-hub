

## Phase 2: Process RU RLNM Notifications into Bookings

### What This Does
Upgrades the `ru-reservation-handler` edge function to create actual booking records in the `bookings` table when a confirmed reservation arrives from Rentals United, and cancel bookings when a cancellation notification arrives. Bookings created via RU channels are marked with a distinctive `booking_channel` value and visual badge so users can immediately identify them.

### How RU Channel Bookings Will Be Marked
- `booking_channel` = `'rentals_united'` — used for filtering, reporting, and channel breakdowns
- `integration_type` = `'rentalsunited'` — consistent with existing integration type naming
- `external_reservation_id` = RU reservation ID — for deduplication and cross-referencing
- **UI**: An orange "RU" badge displayed next to the booking channel in the PMS Dashboard booking detail panel and the Bookings list page, making these bookings instantly recognizable

### Changes

**1. `supabase/functions/ru-reservation-handler/index.ts` — Major update**

Extract full reservation details from the RLNM XML:
- `DateFrom` / `DateTo` → `check_in_date` / `check_out_date`
- `NumberOfGuests` → `adults`
- `GuestName` + `GuestSurname` → `guest_name`
- `Email` → `guest_email`
- `Phone` → `guest_phone`
- `RUPrice` → `total_price`
- `ReservationID` → `external_reservation_id`
- `PropID` → resolve to `property_id` (existing logic) + `room_type_id` (from `hostfully_room_types`)

For **confirmed reservations**:
- Check if booking with same `external_reservation_id` already exists (dedup)
- If not, insert into `bookings` with `booking_channel: 'rentals_united'`, `integration_type: 'rentalsunited'`, `status: 'confirmed'`, `payment_status: 'paid_externally'`
- Mark `ru_notifications` row as `processed: true`

For **cancelled reservations**:
- Find existing booking by `external_reservation_id` and update `status: 'cancelled'`
- Mark notification as processed

For **leads**:
- Log only (no booking creation) — same as current behavior

**2. `src/pages/pms/PMSDashboard.tsx` — Add RU channel badge**

In the booking detail panel where `booking_channel` is displayed (around line 2312-2316), add a colored badge for `rentals_united` channel:
- Orange `Badge` with "RU" text and a distinctive icon
- This makes RU-originated bookings visually distinct from direct bookings, website bookings, and itinerary bookings

**3. `src/pages/Bookings.tsx` — Add RU channel badge in list view**

Add similar visual treatment in the bookings list to identify RU channel bookings with the orange badge.

### Files to Update
- `supabase/functions/ru-reservation-handler/index.ts` — booking creation + cancellation logic
- `src/pages/pms/PMSDashboard.tsx` — RU badge in booking detail
- `src/pages/Bookings.tsx` — RU badge in bookings list

### What Does NOT Change
- No schema changes needed — `bookings` table already has `booking_channel`, `integration_type`, `external_reservation_id`, `payment_status` columns
- No changes to `rentalsunited-api` or `push-property-to-ru`
- No changes to cron job

