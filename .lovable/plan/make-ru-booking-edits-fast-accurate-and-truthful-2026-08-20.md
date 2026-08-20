# Make RU booking edits fast, accurate, and truthful

## Confirmed current state

- Channel reservation `147041016` remains an unconfirmed channel request for **24–31 Aug 2026**, with a local total/balance basis of **R6,300**.
- Recent acceptance attempts were rejected because the channel reads the stay dates as unavailable; repeated attempts also collide with its one-call-per-minute limit. Several retries have been superseded or exhausted.
- The edit service currently performs channel acceptance/modification before local date, pricing, charge, room-line, and settlement writes. A queued or rejected acceptance therefore leaves the local booking unchanged, making Save appear slow or ineffective.
- The confirmation button waits on the channel call, while the account summary is loaded separately and is not refreshed in place after a save. Dates and balance can therefore remain visibly stale.

## Changes

1. **Make confirmation non-blocking and single-flight**
   - “Accept at channel” will enqueue one durable acceptance attempt and return immediately.
   - Reuse an existing pending attempt instead of superseding or recreating it on every click.
   - Show a quiet live state: `Waiting for channel`, `Accepted`, or the channel’s actual refusal reason.
   - Refresh status automatically without leaving the button in an endless loading state.

2. **Separate local save from channel delivery where safe**
   - Save guest details, notes, and payment fields immediately because they are local-only.
   - For confirmed channel reservations, commit validated dates, occupancy, accommodation, charges, settlement, room lines, and availability locally; enqueue only the exact channel delta afterward.
   - For unconfirmed requests, retain the safety rule: do not commit stay/date/pax changes the channel has not accepted. Preserve them as a pending modification and apply them automatically after acceptance succeeds instead of reporting them as saved.

3. **Correct date, pricing, and balance refresh**
   - Return the authoritative updated booking, accommodation, extras, payments, balance, and timestamps from the modification service.
   - Update the open drawer immediately from that response and invalidate/refetch booking, room-line, folio, arrival/departure, and calendar data.
   - Re-read reconciled booking charges and payments after every successful local save or accepted queued modification.

4. **Make messages honest and actionable**
   - Never show “Booking updated” when acceptance was only queued or refused.
   - Distinguish `Saved in ROL’OS`, `Queued for channel`, `Accepted and updated`, and `Channel refused—stay unchanged`.
   - Surface the unavailable-date reason and stop automatic retries when the channel returns a permanent validation failure.

5. **Verify the complete flow**
   - Test local-only edits, confirmed-channel date/price edits, unconfirmed-request acceptance, queue reuse, unavailable-date refusal, and post-save drawer/calendar refresh.
   - Verify balance equals accommodation + reconciled extras − payments, with no duplicate channel calls or false success toasts.
   - Deploy the affected booking functions and validate against reservation `147041016` without forcing a stay change the channel has not accepted.

## Technical scope

- Frontend: booking drawer/detail editor, modify dialog, channel booking sync helper, and query refresh/state handoff.
- Backend: `modify-booking`, `channel-booking-sync`, shared RU booking sync, and the existing durable RU call/job queues.
- No locked adapter region needs to change; the channel transport remains untouched.