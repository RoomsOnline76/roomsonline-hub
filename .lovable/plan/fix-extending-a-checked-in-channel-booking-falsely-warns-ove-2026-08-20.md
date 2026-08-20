# Fix: extending a checked-in channel booking falsely warns "overbooked"

## What is happening

When a channel-sourced stay is edited, the calendar in the modify dialog treats the stay's **own** channel block as somebody else's booking, so extending it trips the availability warning even though the nights belong to that same reservation.

Confirmed on the live data for RU Test Clone B: the stop-sell rows for room type `Elf` on 22 and 23 Aug 2026 carry `blocked_reason = channel_booking:<id of ROL-700-0006>` — i.e. the block written for the very booking being modified. The stay-exclusion logic in the availability snapshot only skips rows from the `bookings` table; it does not skip block rows tagged with that booking's own id. The database guard itself is correct (it excludes the booking under edit and skips channel-sourced stays), so this is purely a false client-side warning.

## Changes

1. **Availability snapshot (`src/lib/unitAvailability.ts`)**
   - When `excludeBookingId` is set, ignore `property_availability` rows whose `blocked_reason` references that booking (pattern `channel_booking:<id>`, plus any `booking:<id>` variant), so the stay's own held nights stay selectable.
   - Keep every other block (property blocks, other channel bookings, maintenance) exactly as today.

2. **Modify dialog (`src/components/pms/BookingModifyDialog.tsx`)**
   - Also exclude the stay's own nights (original check-in → check-out) from the clash test, as a safety net for blocks written without an identifiable booking tag.
   - When a genuine clash remains, keep the current message and the privileged override with reason.

3. **Verification**
   - Re-check that extending ROL-700-0006 from 22–24 Aug to a longer stay no longer raises the warning, while a real double-booking on the same room type still does.

## Notes

No schema or edge-function changes are needed; the guard trigger and `modify-booking` conflict rules stay as they are.
