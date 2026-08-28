---
name: Reservation writes vs our own availability block
description: Blocked-dates refusals on reservation create/modify are our own sold-out push; reopen the nights and replay, and never close nights while a reservation write is owed
type: feature
---

"Property is not available for a given dates" / "Can't check in or check out on selected dates" on a
reservation write is almost always ROL'OS's own availability delta having published the sold nights as
0 units before the reservation itself reached the channel.

Rules:
- `pushRuConfirmedReservation`, `modifyRuStay` and `confirmRuRequest` all self-heal a blocked-dates
  refusal the same way: reopen exactly the target nights **plus the departure day** (units 1,
  changeover 1) via `reopenStayNightsAtChannel`, then park the same write for ~65s (priority 1) —
  never retry inside the channel's sliding minute, it is always rejected.
- The claim ledger entry for a self-healed refusal settles as `deferred` (claim stays open), not
  `terminal`, or the queued replay is dropped as a duplicate.
- `syncBookingToChannel` skips the availability/rates delta entirely while a reservation write is
  queued/deferred (`ari_reason: reservation_pending_at_channel`). The channel closes the nights itself
  when the reservation registers.
- A queued `push_confirmed_reservation` that lands in the drainer must store the returned reservation
  id on the booking (the method key carries the booking id), otherwise the next edit re-registers the stay.
