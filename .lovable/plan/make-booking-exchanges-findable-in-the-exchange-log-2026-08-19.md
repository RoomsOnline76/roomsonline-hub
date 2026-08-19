# Make booking exchanges findable in the Exchange Log

## What I checked

The exchanges are **not missing** — they are recorded, just unreachable in the UI. Counts in the last 7 days of `ru_api_log`:

| Exchange | Direction | Rows (7 days) |
| --- | --- | --- |
| Push_ModifyStay_RQ | outbound | 16 |
| Push_PutConfirmedReservationMulti_RQ | outbound | 15 |
| Push_RejectRequest_RQ | outbound | 7 |
| RLNM_ReservationRequest | inbound | 6 |
| Push_CancelReservation_RQ | outbound | 5 |
| RLNM_ReservationConfirmed | inbound | 3 |
| RLNM_ReservationCancelled | inbound | 2 |
| Pull_ListReservations / GetLeads / GetReservationByID | outbound | 799 / 778 / 227 |

## Why they look absent

1. **The Action dropdown is built from the loaded page only.** The list loads 100 rows at a time out of 1 578 in the window, and the newest 100 are almost entirely the availability/price pulls and the reservation polling. Every rarer verb — cancel, reject, modify, confirmed-multi, inbound RLNM — never becomes a dropdown option, so it reads as "no history exists".
2. **No way to reach them by paging.** A cancel from earlier in the day sits thousands of rows down; "Load more" in 100-row steps never gets there in practice.
3. **The counters describe the loaded page, not the window** ("100 exchanges loaded of 1 578", 16 failed, avg 421 ms), which reinforces the impression that the window only holds pull traffic.

## What to build

**1. Window-wide facets (the core fix).** Add a read-only database function that returns, for the selected window, every distinct `action` with its row count, plus the distinct operations and channel accounts. The Action, Operation and Account pickers read from that instead of from the loaded rows, and each option shows its count — so `Push_CancelReservation_RQ (5)` is visible and selectable even when it is nowhere near the first page.

**2. Booking verb quick chips.** Above the table, one row of chips for the booking lifecycle — Confirmed multi, Modify stay, Cancel, Reject, Inbound notifications — each with its window count, each selecting that verb (or the inbound group) in one click. A chip with zero rows in the window renders dimmed and disabled, so "nothing happened" is stated explicitly rather than looking like a gap.

**3. "Bookings only" covers inbound too.** Keep the existing booking-verb list, and make the toggle include `direction = inbound` notifications regardless of verb, so `RLNM_Reservation*` posts always appear in the booking view.

**4. Honest counters.** Relabel the stats line so failures / ResponseID / avg latency are clearly "in the loaded page", with the window total shown separately, and add a "Load all matching" action when a filtered result set is under a few hundred rows.

**5. Verify.** After the change, confirm from the UI path that each verb in the table above resolves to its rows and that opening one shows the stored request and response XML.

## Technical notes

- New function `public.ru_api_log_facets(_days int)` — `security definer`, `stable`, restricted to platform roles via the existing role check, returning `(kind text, value text, count bigint)` for kinds `action`, `operation`, `owner`, `direction`. Facets in one round trip, no client-side aggregation.
- `src/hooks/useRuApiLog.ts`: replace the `setActions` / `setOperations` / `setOwners` page-derived accumulation with a facet query keyed on `filters.days`; expose counts. Extend `applyFilters` so `bookingsOnly` becomes `action.in.(…)` OR `direction.eq.inbound`.
- `src/components/admin/channel-monitor/RuApiLogPanel.tsx`: chips row, counts in the select options, revised stats copy.
- No change to logging itself — `ruApiLog.ts` already records all of these verbs including inbound notifications.
