# Scope TOBI's analysis to the report period

## What's wrong

Grand Roche's run stores 123 snapshot months (2011-08 through 2027-07) because the prior-workbook and PROTEL ingests fold historical comparatives into the same snapshot. The TOBI insights pass reads every month in that snapshot and is told to "cover every month present in the data", so it narrates January 2016, December 2023, March 2024 and so on — exactly what the screenshot shows.

The printed report already uses the six-month window anchored on `report_runs.report_month`; only TOBI's pass ignores it.

## What changes

TOBI works on the reporting period and nothing else, for every source (NightsBridge, OPERA, PROTEL):

- The insights pass reduces the snapshot to the run's window months before any maths or prompting: the anchor month from `report_month` (falling back to the as-of rule) plus the following five months, exactly the months the report prints.
- Anomaly flags are computed on that scoped snapshot, so no flag can reference an out-of-window month.
- The prompt states the property, the source system, the as-of date and the exact month list, and instructs one line per window month in order — with a dash line where a month has no figures, rather than dropping it.
- Months outside the window stay in the snapshot untouched; they remain available as last-year and historical baseline comparatives, and TOBI may reference them only as comparison (e.g. "against last year's R1,7m"), never as a month line of its own.
- If the window resolves to no months with data, the pass returns a clear message asking for the run's report month to be set instead of narrating history.
- Existing insight rows are not migrated; regenerating on a run produces the scoped read. Grand Roche's run gets regenerated after deploy to confirm only Jul–Dec 2026 lines appear.

## Technical notes

- `supabase/functions/reports-xai-insights/index.ts`: select `report_month, source_type` on the run; build the month list with `windowMonths()` / `reportMonthAnchor()` from `_shared/reportWindow.ts`; filter `snapshot.months` and every per-month map (`otb_revenue`, `previous_otb_revenue`, `last_year_actual`, `room_nights`, `previous_room_nights`, `last_year_room_nights`, `capacity_days`, `additional_revenue`, `adr`, `occupancy`, `source_breakdown` entries) to those keys before `detectAnomalies()` / `summariseSnapshot()`.
- Recompute the totals passed to the model from the scoped maps so the model never sees an all-years total.
- Add `period` to the user payload (`{ report_month, months, source }`) and tighten the system prompt's "cover every month" rule to "cover exactly the months in `period.months`, in order".
- Persist `period` on the saved `report_insights` row (inside `slides_considered`'s sibling metadata) so the review UI can show which months TOBI read.
- Deploy `reports-xai-insights`; no schema change, no frontend change required beyond the existing "Read N pasted slides" line, which gains the month range.
