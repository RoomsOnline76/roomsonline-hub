# Phase 2 – NightsBridge Parser + Aggregator

Turns the uploaded bookingsummary files from Phase 1 into real numbers: revenue, room nights, ADR and occupancy per month, stored as a snapshot that later phases (Excel, PDF, Canva) simply read.

## What the user will see

- On a draft run's review page: a **Process files** button.
- While it runs: a processing state, then a results panel showing, per month, OTB revenue, room nights, ADR, occupancy %, capacity days, and a source breakdown (Booking.com / Expedia / Own / LekkeSlaap / Other).
- Per-file feedback: parsed OK with row counts, or a clear list of what failed (wrong file, missing columns, unreadable rows).
- Rows flagged as non-sellable (Room 0, Holding in Credit, Events) shown separately so they never inflate occupancy.
- A **Report settings** card per property to set room count (used for capacity), pre-filled from the property's active rooms where available.
- Re-processing a run replaces its snapshot; the previous ready run for the same property is linked automatically as the "previous" baseline.

## Rules applied (from the brief)

- Revenue and nights are attributed to the **arrival month**.
- Only rows with numeric Revenue and Nights count; all statuses kept, provisional bookings included.
- Occupancy = room nights / (room count × days in month). Capacity days computed per month (e.g. 31 × 7 = 217).
- ADR = revenue / room nights (0 nights → no ADR, not a division error).
- Source names normalised: Expedia/Hotels.com/Travelo → Expedia; any "… | Roomsonline" / Own Booking / Own web site → Own; Booking.com, LekkeSlaap, Airbnb kept as-is; anything else → Other.
- Month window = the union of months present in the uploaded files, in chronological order.

## Technical section

**Database migration**
- `report_snapshots` (run_id PK → report_runs, months, otb_revenue, previous_otb_revenue, last_year_actual, room_nights, previous_room_nights, last_year_room_nights, capacity_days, additional_revenue, source_breakdown, adr, occupancy, totals, non_sellable jsonb, created_at) — GRANTs for authenticated/service_role, RLS via the existing `has_reports_access()`.
- `property_report_settings` (property_id PK, room_count int, report_logo_url, cover_artwork_url, brand_primary, brand_secondary, historical_baseline jsonb, default_source_type default 'nightsbridge') — same grants/RLS pattern.
- Add `previous_run_id` linkage use and allow `report_runs.status` transitions draft → processing → ready → failed.

**Edge function `nightsbridge-report-parser`**
- Input: `{ run_id }`; validates caller has reports access, loads the run's source files, downloads each from the `revenue-reports` bucket.
- Parses XLSX with SheetJS (`npm:xlsx`), locating the header row by matching the known column set rather than a fixed index; tolerates the two title rows.
- Emits a normalised ledger row per booking (booking_id, arrival, last_night, nights, revenue, extras, commission, nett, room_name, source, status, type, currency).
- Writes `parsed_ok`, `row_count`, `parse_errors` back to `report_source_files`.

**Aggregator (`_shared/nightsbridgeAggregate.ts`)**
- Pure function: ledger + room_count → months, per-month revenue/nights/ADR/occupancy/capacity_days, source_breakdown, non-sellable buckets, totals. Reused later by Excel/PDF phases and unit-testable against the sample files.
- Pulls the previous ready run's snapshot for `previous_*` fields and `property_report_settings.historical_baseline` for last-year fields (left empty when absent).
- Persists the snapshot, sets `previous_run_id`, flips status to `ready` (or `failed` with errors).

**Frontend**
- `src/hooks/useReportSnapshot.ts` — trigger processing (invoke the function) and read the snapshot.
- `src/hooks/usePropertyReportSettings.ts` — read/write report settings.
- `src/pages/reports/ReportsRunReview.tsx` — add Process action, per-file parse status, and a snapshot results table.
- `src/pages/reports/ReportsPropertySettings.tsx` — replace the placeholder with the room count / branding form.
- Currency formatted ZAR, dates treated as Africa/Johannesburg.

**Verification**
- Reconcile the four supplied sample files (Aug–Nov 2026) against `31.07.26_Torburnlea Homestead-Revenue Report.xlsx` at room_count 7 before calling the phase done.
