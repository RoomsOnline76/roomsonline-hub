# Diagnostics: collapse the booking trail, add method search

## What changes

1. **Booking sync trail collapses by default**
   The panel becomes a collapsible card (same pattern as the Call queue and Archive log panels): header shows the counts summary (total / inbound / queued / skipped / failed) with a chevron, and the filters plus event list only render when opened. Nothing is fetched until it is first expanded, so the diagnostics page loads lighter.

2. **Free-text search for specific calls**
   - **Exchange log**: the existing "ResponseID lookup" box becomes a single search box that matches a channel method name (`Push_CancelReservation_RQ`, `Push_ModifyStay_RQ`, partial like `Cancel`), a ResponseID, a trace id, or an error message. The Action dropdown stays for picking from the loaded page, but the search hits the whole retained window server-side, so a method with only a handful of calls is findable even when it never appears in the visible page.
   - **Booking sync trail**: a search box that matches the summary/reason text, the channel reservation id, the booking reference and the trace id, so an operator can search "cancel" or paste a reservation id instead of stepping through dropdowns.

3. **Booking exchanges in the exchange log — already covered**
   Booking verbs are already recorded in the durable exchange log; the retained window currently holds `Push_CancelReservation_RQ`, `Push_RejectRequest_RQ`, `Push_ModifyStay_RQ`, `Push_PutConfirmedReservationMulti_RQ`, `Pull_ListReservations_RQ`, `Pull_GetReservationByID_RQ`, `Pull_GetLeads_RQ` plus the inbound `RLNM_Reservation*` notifications. They were hard to find because the Action dropdown only lists methods present in the page already loaded. Two additions make the link explicit:
   - a **Bookings only** quick filter on the exchange log that scopes to the booking/reservation verbs in one click;
   - each booking-trail row that carries a trace id gets a **View exchange** action that opens the exchange log pre-filtered to that trace, so the decision row and its raw XML line up.

## Technical notes

- `src/components/admin/channel-monitor/BookingSyncTrailPanel.tsx`: wrap in `Collapsible` (default closed), gate `load()` on first open, add a debounced `search` state applied as `or(...)` ilike across `summary`, `reason`, `channel_reservation_id`, `trace_id`.
- `src/hooks/useRuApiLog.ts`: rename/extend the `responseId` filter into a `search` filter that ORs `action ilike`, `response_id ilike`, `trace_id ilike`, `error_message ilike`; keep it independent of the other filters (a support lookup must not be narrowed). Add a `bookingsOnly` flag that applies `action in (<booking verbs>)`.
- `src/components/admin/channel-monitor/RuApiLogPanel.tsx`: relabel the lookup field, add the Bookings-only toggle, accept an optional external trace filter for the deep link from the trail.
- `src/pages/AdminChannelMonitor.tsx`: hold the shared trace/deep-link state between the two panels.

No database or edge-function changes; read-only diagnostics UI only.
