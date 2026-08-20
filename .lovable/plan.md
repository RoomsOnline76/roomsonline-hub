# Honest booking edits, real channel pushes, and the channel's own reservation number

Focused on the RU-received request `RentalsUnited 147041016 / ROL-700-0001`.

## What the reads show

- The booking is a held channel **request** (`integration_type = rentalsunited_lead`), external id `147041016`, listing `5655615`, yet it is already `checked_in` locally.
- The booking drawer's inline edit saves **straight to the database** and then toasts "Booking updated successfully". It never calls `modify-booking` and never pushes anything to the channel — this is why the edit "cannot be pushed back" while the UI claims success.
- The same drawer's lifecycle buttons (check in, check out, confirm/mark paid, cancel, no show) also write locally with no channel delta push, so a check-in or confirmation never reaches the channel.
- The channel's accept call (`Push_ConfirmReservation_RQ`) is being refused with StatusID 1 "Property is not available for a given dates". The self-heal does reopen the request's own nights (that call succeeded), but the retry immediately afterwards is rejected by the channel's one-call-per-minute limit, so no attempt ever runs against the reopened calendar.
- Held requests still cannot have their stay or pax changed at the channel (no working accept verb on this account) — that stays a refusal, not a local-only edit.

## What to change

**1. Never save a stay edit locally without the channel**
The drawer's edit form routes through `modify-booking` like the modify dialog already does. Guest/notes-only fields stay a local write; dates, pax, unit, price and status go through the function so the channel push, pricing and settlement all happen in one pass.

**2. Lifecycle actions become delta push events**
Check in, check out, confirm, cancel and no show each fire the matching channel delta after the local action succeeds, and the toast reports what actually landed:
- pushed → "Checked in · sent to channel"
- refused → the channel's own reason, error toast, and for held requests: "accept this request in the channel portal first".
- queued behind the rate limit → "queued, will land shortly" rather than a plain success.

**3. Show the channel's reservation number**
Channel-received bookings display the received id (`147041016`) in the drawer's details grid next to the ROL'OS reference, monospaced and copyable, with the channel name beside it.

**4. Stop burning the accept attempt**
When the accept is refused for closed dates and the reopen succeeds, re-queue the accept ~65 seconds later instead of retrying inside the same minute (which the channel always rejects). The queued retry then runs against the reopened calendar.

## Technical notes

- `src/pages/pms/PMSDashboard.tsx`: replace the drawer's direct `bookings.update` in `handleSave` with a `modify-booking` invocation; add `pushBookingToChannel` (from `src/lib/channelBookingSync.ts`) calls plus outcome-aware toasts in `handleLifecycleAction` and `handleQuickAction`.
- `src/components/pms/booking/BookingDetailsGrid.tsx`: render `external_reservation_id` for channel bookings.
- `supabase/functions/_shared/ruBookingSync.ts`: in `confirmRuRequest`, after a successful `reopenOwnNights`, enqueue the confirm with a delay rather than calling `attemptConfirm()` straight away.
- No schema changes.
