# Fix: Modify (and Cancel) on the calendar hover card do nothing

## Root cause (verified)

The room-plan hover card (`RoomPlanBar`) fires `onModifyBooking` / `onCancelBooking`, and the dashboard stores the booking in `modifyTarget` / `cancelTarget` state. But those two state values are never rendered anywhere — the only `BookingModifyDialog` / `BookingCancelDialog` instances in `PMSDashboard.tsx` live inside the `BookingDetail` sheet and are driven by their own local `showModifyDialog` / `showCancelDialog` flags. So clicking Modify on the hover card sets state that nothing consumes and nothing opens.

## What changes

- Render a dashboard-level `BookingModifyDialog` and `BookingCancelDialog` driven by `modifyTarget` / `cancelTarget`, so the hover-card actions open the same dialogs the booking sheet uses.
- Pass the booking fields the modify dialog needs (id, guest name, dates, pax, total, `property_id`, `room_type_id`) so the automatic re-pricing and original-stay calendar work the same way as from the sheet.
- Detect channel origin for the selected booking (RU-sourced vs RU lead, from `booking_channel` / `integration_type`) and pass `isRuBooking` / `isRuLead` so cancel shows the channel-withdrawal notice and leads are rejected rather than cancelled.
- On completion, close the dialog, clear the target and refresh the calendar bookings (same refresh the sheet's `onSaved` uses).
- Keep the hover card's Modify hidden for held channel requests, matching the sheet's existing rule that RU refuses modify on unconfirmed requests.

## Technical notes

- Single file: `src/pages/pms/PMSDashboard.tsx`. Add the two dialogs near the existing booking sheet render, keyed off `modifyTarget?.id` / `cancelTarget?.id`, with `open={!!target}` and `onOpenChange` clearing the target.
- Reuse the existing RU-origin helper logic already used by `BookingDetail` rather than duplicating string checks.
- No backend, edge function or schema changes.
