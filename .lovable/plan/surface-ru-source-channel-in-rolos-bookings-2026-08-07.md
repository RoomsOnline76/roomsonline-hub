# Surface RU Source Channel in ROLOS Bookings

## Current state

Inbound Rentals United reservations already carry the originating sales channel. The RU `<Creator>` value is parsed, looked up against `ru_channel_creators`, and stored inside the booking's `modification_notes` JSON as `ru_creator_channel.channel_label` (e.g. "Booking.com", "LekkeSlaap", "Airbnb", "Expedia"). However, the ROLOS UI only renders the generic `booking_channel` value (`rentals_united` → displayed as "ROL'OS Channels"), so staff cannot see which OTA actually produced the booking.

## Goal

Make the specific source channel visible in the ROLOS dashboard and booking details without changing the underlying booking data model or reporting filters.

## Plan

1. Add a small shared helper `src/lib/ruChannelDisplay.ts` that:
   - Extracts `ru_creator_channel` from a booking's `modification_notes`.
   - Maps RU `channel_key` values (`booking`, `lekkeslaap`, `airbnb`, etc.) to the existing `ChannelLogo` keys (`booking_com`, `lekkeslaap`, `airbnb`, etc.).
   - Returns `{ label, channelLogoKey, isRuSourced }`.

2. Update the booking detail sheet in `src/pages/pms/PMSDashboard.tsx`:
   - Resolve the source channel from `modification_notes` when a booking is opened.
   - Show the channel logo + label in the sheet header for ROL'OS Channels bookings.

3. Update `src/components/pms/roomplan/RoomPlanBar.tsx`:
   - In the hover card, display the specific channel logo/label next to the existing "ROL'OS" badge when a source channel is present.

4. Update `src/components/pms/booking/BookingDetailsGrid.tsx`:
   - Add a read-only "Source channel" row in the booking metadata section.

5. Keep `booking_channel` and `integration_type` untouched so filters, revenue reporting, and the existing "ROL'OS Channels" badge continue to work.

## Out of scope

- No new database columns or migrations.
- No changes to the RU ingestion logic (`ruReservationIngest.ts`, `cron-pull-ru-reservations`).
- No changes to invoice billing-party/channel attribution work already in flight.

## Acceptance criteria

- A booking created from a Booking.com RU reservation shows "Booking.com" with the Booking.com logo in the dashboard hover card, detail sheet header, and booking details grid.
- A booking with no `ru_creator_channel` metadata continues to display only the generic "ROL'OS Channels" badge.
- Existing manual and direct ROL'OS bookings are unaffected.
