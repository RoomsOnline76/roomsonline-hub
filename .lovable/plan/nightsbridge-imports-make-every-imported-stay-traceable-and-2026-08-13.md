# NightsBridge imports: make every imported stay traceable and visible

## What the data actually shows right now

Verified in the database:

- **Seesig Self Catering Chalets** — 585 imported NightsBridge bookings, all written in one run this morning (05:11–05:12). Arrivals run **2024-05-23 to 2026-06-10**. Every one of them is in the past, so nothing appears in the dashboard's default forward-looking window (your screenshot's 14 Jul – 12 Oct range legitimately contains zero of them).
- **Tidal Pools Self Catering Apartments** — **zero** NightsBridge bookings exist. Its only records are 2 widget bookings, 2 channel bookings and 1 channel lead.
- 189 of the 585 Seesig rows have no room/unit mapping (imported "unassigned").
- The "(0, 1 hidden)" / "(1, 3 hidden)" counters are just the cancelled-bookings toggle, not a data problem.

So the future stays and the whole Tidal Pools import never reached the database. The importer itself has no date-window filter and no property filter, so the cause is upstream of the write: either the run ended at the dry-run/preview stage without the live import being confirmed, or the live call failed and the failure was not surfaced. **This is not yet confirmed** — today there is no record anywhere of who uploaded which file, so it cannot be reconstructed after the fact. Closing that blind spot is the first step of the plan.

## The plan

### 1. Persist every import run (removes the blind spot)

New `nb_import_runs` table recording: property, file name, size, mode (dry-run vs live), operator, counts (parsed / created / updated / skipped / excluded / errors), earliest and latest arrival in the file, unmapped room names, and the error list. Written by the import function on **both** dry runs and live runs.

### 2. Show import history in the tool

The NightsBridge import panel gains a "Recent imports" list for the selected property: date, file, mode, and the outcome counts, with an expandable error/skip list. If the last action for a property was a dry run with no live import following it, the panel says so explicitly ("Preview only — nothing was saved").

### 3. Make the live import impossible to lose

- The result step becomes a persistent, explicit outcome panel ("Saved 412 bookings, updated 3, skipped 9") instead of a transient toast, and it stays until dismissed.
- If the live call fails or is interrupted, the panel shows the failure with the row-level errors and a Retry that re-sends the same file.
- Large files are sent in sequential chunks with a progress bar, so a big export cannot time out silently mid-write.
- The preview step gets a clear arrival-date span ("File covers 2024-05-23 → 2027-03-14, 96 future stays") so a history-only export is obvious before you commit it.

### 4. Surface historical and unassigned stays in the dashboard

- Bookings page: when the selected window returns nothing but imported stays exist outside it, show a one-line hint with the actual span and a button to jump to it (extends the existing out-of-window detection).
- Add an "Unassigned unit" filter chip so the 189 unmapped Seesig stays can be found and repaired through the existing "Fix unmapped rooms" tool.

### 5. Re-run the two imports

With the above in place, re-upload the Seesig future export and the Tidal Pools export. The run log will then show exactly what landed, and anything skipped will be visible per row rather than silently dropped.

## Technical notes

- Migration: `public.nb_import_runs` (property_id, created_by, file_name, file_bytes, mode, summary jsonb, errors jsonb, min/max arrival, created_at) with GRANTs for `authenticated` + `service_role` and RLS scoped through `can_access_property`.
- `supabase/functions/nb-import-bookings/index.ts`: write a run row at the end of both dry-run and live paths; accept an optional `chunk_index`/`chunk_total` for chunked writes and make the row loop idempotent on `external_reservation_id` (it already upserts by that key).
- `src/components/property/NightsBridgeBookingImport.tsx`: history list, persistent outcome panel, retry, progress, arrival-span summary in the preview.
- `src/lib/bookingHistoryWindow.ts` + `src/pages/Bookings.tsx`: out-of-window hint copy and the unassigned-unit filter.
- No change to commission behaviour — imported stays stay at 0% ROL commission.
