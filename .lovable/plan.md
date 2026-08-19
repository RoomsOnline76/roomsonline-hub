# Exchange log — professional log viewer redesign

UI-only restructure of the Exchange log section in the Channel Manager (Cert Status & Logs). No changes to data fetching, filter logic, API calls or state shape — every filter, count, export and the detail sheet keep working exactly as they do today.

## New layout, top to bottom

1. **Header** — "Exchange log" with a two-line description (durable request/response record with ResponseID, 90-day retention, credentials redacted).
2. **Primary toolbar** — one row: search input on the left ("Find a call by ResponseID, action, or free text"), and Window dropdown + Refresh + Export list on the right. Scope/Property/Operation selects leave this row.
3. **Quick filter bar** — compact pill/segmented toggles for the three most-used dimensions:
   - Scope: All / Bookings only
   - Direction: Both / Outbound / Inbound
   - Outcome: All / Success / Failed
4. **More filters** (collapsed by default) — Channel account, Property, Action, Operation in a clean 2–3 column grid. A count badge shows how many advanced filters are active, plus a "Clear" action.
5. **Activity summary** — the current chip row becomes a quiet stats strip, grouped:
   - Bookings: Confirmed · Modify · Cancel · Reject
   - Other: Reservation poll · Reservation by id · Leads · Inbound notifications
   Numbers stay clickable exactly as today (same patch calls), styled as secondary stats rather than competing buttons. Zero-count items stay disabled/muted, and the existing "none recorded in this window" hint is preserved.
6. **Results meta** — the existing "X exchanges match… showing newest N… failures, ResponseIDs, avg ms" line, kept but muted and right-aligned under the summary.
7. **Table** — identical columns and data. Slightly denser rows, failed rows get a subtle destructive tint and bolder status badge, ResponseID rendered monospace with a small copy button that copies without opening the detail sheet. Load-more footer, empty state, skeletons and the detail sheet stay as-is.

## Technical notes

- Single file touched: `src/components/admin/channel-monitor/RuApiLogPanel.tsx`.
- Filter state stays `RuApiLogFilters` with the same `patch()` calls; the segmented controls map to the same values (`bookingsOnly`, `direction: all/outbound/inbound`, `outcome: all/success/failure`).
- Advanced panel uses the existing `Collapsible` primitive; local `useState` for open/closed only.
- Booking summary reuses `RU_BOOKING_CHIPS`, `actionCounts` and `inboundCount`; the grouping is a presentation split (first four booking verbs vs the rest), no new data.
- All colours via semantic tokens (`bg-destructive/5`, `text-muted-foreground`, `border-border`) — no hardcoded colours.
- Row copy uses the existing `copy()` helper with `stopPropagation` so the sheet is not triggered.
