# Delete all booking transactions (test data)

Confirmed scope: every booking in the system, deleted permanently, with no channel traffic.

## What is there now (verified)

- 791 bookings in total: 711 NightsBridge imports, 53 native ROL'OS, 5 embed, 8 Rentals United reservations, 8 Rentals United leads, 6 with no source recorded.
- Attached records that go with them: 743 room lines, 643 folios, 3,092 channel booking events, 96 sync-status rows, 58 invoices, 19 folio transactions, 18 guest check-ins, 13 refunds, 10 booking charges, 9 guest portal tokens, 5 journey links, 3 payout statement lines.
- Nothing is stranded in the middle of settlement: no payments, no revenue attributions, no channel reservation rows, and the only payout statement is still a draft.
- No availability rows are held by a booking (`blocked_by` is empty everywhere), so nothing needs unblocking afterwards.

## What will happen

1. **Delete every booking row.** Everything that hangs off a booking and only exists because of it — room lines, room nights, folios, folio transactions, invoices, charges, refunds, check-ins, guest comments, feedback requests, guest portal tokens, journey links, sync status, revenue attributions, channel events, sync logs — goes with it. Most of this is already automatic through the database's cascade rules; the few links that are not (payout statement lines, invoice lines, journey/event/group references) are cleared first so no orphan rows or blocked deletes remain.
2. **Clear the draft payout statement** and its lines, since it was built from these bookings and would otherwise show a total with nothing behind it.
3. **Reset the reference counters** (`ROL-<PROP>-NNNN` and `ROL-TRIP-NNNN`) so new bookings start at 0001 again rather than continuing from the test range.
4. **Rebuild guest statistics** by running the existing rollup so the 830 guest profiles show zero stays and zero spend instead of retaining test totals. The guest profiles themselves are kept — say the word if you want those cleared too.
5. **Leave the NightsBridge import history** (14 import runs) in place, so re-importing real bookings later still works from a known baseline. Bookings created by those runs are deleted like everything else.
6. **No channel calls.** No cancellations, no availability deltas, nothing is pushed to the distribution account. Whatever exists upstream stays as it is.

## After the clean-up

Bookings, Calendar, ROL Pulse, Reports, payouts and commission figures will all read zero. That is expected — there is no code change in this work, only data removal.

## Technical notes

- Executed as data statements (no schema change): explicit `DELETE`/`UPDATE` on the non-cascading references first (`property_payout_statement_lines`, `rol_property_invoice_lines`, `itinerary_bookings`, `rolos_event_reservations`, `rolos_group_reservations`, `rolos_guest_comments`, `rolos_inquiries.linked_booking_id`, `rolos_refunds`, `rolos_reservations`, `sync_logs`, `rolos_invoices.booking_id`), then `DELETE FROM public.bookings` to let `ON DELETE CASCADE` clear the rest.
- `channel_booking_events` and `booking_sync_status` truncated for the same booking ids (events carry no FK constraint, so they are matched by `booking_id`).
- Counters: `booking_reference_counters`, `itinerary_reference_counters` reset to 0.
- `select public.rebuild_guest_stats(null)` to recompute the derived guest figures — the only writer of those columns.
- Verification pass afterwards: row counts of `bookings` and each dependent table back to zero, and a check that no `booking_id` remains non-null in the nullable-FK tables.
