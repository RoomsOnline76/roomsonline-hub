# ROL-2F5-0014: channel never received the modification

## What the data shows

Verified against the booking record, the availability table and the channel exchange log:

- ROL-2F5-0014 (channel reservation 147035439, Galjoen, 21–24 Aug) is still stored as a **3-night, 2-adult unconfirmed channel request** — `integration_type = rentalsunited_lead`, status `pending`, "dates held until 2026-08-23". The 7-night / 4-pax change was never written to the booking record either.
- The exchange log contains **zero stay-modification calls** for this reservation, and there is no channel sync row for the booking. The only pushes in that window were availability (`Push_PutAvbUnits_RQ`) and price pushes — which is exactly why the channel shows extra blocked days and an unchanged reservation.
- Cause in code: `modifyRuStay` refuses outright for unconfirmed requests (the channel only accepts stay modifications on confirmed reservations), and the only place guest counts are sent to the channel is inside that same modification call. So on a request-type booking, both the date change and the pax change silently end up as a calendar block only.

Not yet confirmed: which screen the operator used to extend the stay (the modification edge function was clearly not invoked — no sync row, no local date change). Step 1 below pins that down.

## Plan

1. **Find the edit path that bypassed the modification service.** Trace the stay-extension entry points (booking detail grid, modify dialog, dashboard drag/resize) and confirm which one wrote availability blocks without calling the modification service. Route every stay/pax edit of a channel booking through the single modification service — no local-only or availability-only writes.

2. **Handle request-type (unconfirmed) channel bookings honestly instead of silently.** When an operator edits a booking that the channel still holds as a request:
   - Block the save with a clear message ("this is still an unconfirmed channel request — accept it first, then change the stay") rather than letting availability drift.
   - Add an **Accept request** action that confirms the reservation at the channel first; once confirmed, the same edit proceeds through the normal modification call.
   - Log every refusal to the exchange log as a not-attempted entry with a reason, so it is visible in the Exchange Log instead of invisible.

3. **Make pax changes reach the channel.** Send the recalculated guest count on every modification push, including when only occupancy changed (no date change) — today a pax-only edit produces no channel call at all.

4. **Stop availability from being the fallback.** The blockout update must only run after the channel accepted the modification (or for local/native bookings). If the channel refuses, leave both the booking and the calendar untouched and surface the refusal.

5. **Repair this booking.** Accept request 147035439 at the channel, then push the 21–28 Aug / 4-guest state as a single modification, verify by reading the reservation back from the channel, and clear the stray blocked nights.

6. **Verify.** Confirm in the exchange log that the modification call was sent and accepted, that the reservation now reads 7 nights and 4 guests at the channel, and that the local record, calendar and channel agree.

## Technical notes

- `supabase/functions/_shared/ruBookingSync.ts` — `modifyRuStay` early-returns for leads; add a confirm-then-modify path and always pass `number_of_guests`.
- `supabase/functions/modify-booking/index.ts` — S6b (channel push) must gate S7 (availability blockout) and S8 (local update) for all channel bookings; today a caller that skips this function skips the whole gate.
- The exact channel verb used to accept a held request will be confirmed against the vendor API reference before implementation; if no accept verb is available for this account, the fallback is reject-then-push-confirmed-reservation, which changes the reservation id and must be recorded on the booking.
- Adapter-lock regions in the channel adapter will not be touched without explicit approval in that turn.
