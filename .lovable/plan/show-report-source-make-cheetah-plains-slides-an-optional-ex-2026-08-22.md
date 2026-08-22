# Show report source + make Cheetah Plains slides an optional extra

## 1. Show which report type produced a run

Runs already store their source (`nightsbridge`, `opera`, `protel`) but the UI never shows it.

- Recent runs list on the Revenue Reports dashboard: add a small source badge to each row, so the line reads `As-of 20 Aug 2026 · 10 files · NightsBridge`.
- Property cards / grouped listing: keep as-is.
- Run review header: show the same source label next to the run title, so a reviewer can confirm the adapter before generating.
- Labels come from the existing adapter registry (NightsBridge / OPERA / PROTEL) — no new naming.

## 2. Cheetah Plains extras as a per-report add-on

Today the specialised nationality + travel-partner slides only appear when the *property* is flagged `cheetaplains`, and they are effectively always part of that property's pack.

Change it to an optional extra chosen per report run, on top of the standard pack:

- New report screen: an "Optional extras" block with a checkbox — "Add Cheetah Plains owner slides (nationality + travel partners)". Pre-ticked when the property's configured specialised set is Cheetah Plains, but always overridable, and available even when the property has no set configured.
- Run review screen: the same choice as a toggle on the Specialised owner slides card, so it can be added or dropped after the run exists. When off, the card collapses to a single "Add optional extras" row and no slides are generated.
- Generated slides are unaffected when the add-on is switched off later; they simply stop being offered/included until it is switched back on.
- The property-level setting stays as the default suggestion only.

## Technical notes

- Migration: add `special_report_set text` (nullable) to `report_runs`, defaulting to null; the run value wins over `property_report_settings.special_report_set`.
- `useReportRuns`: include the column in `RUN_SELECT`, expose `specialReportSet` on summary/detail, accept it in `CreateReportRunInput`, and add a small mutation to update it on an existing run.
- `ReportsNewRun`: reducer gets a `specialSet` field seeded from the property settings fetch alongside `default_source_type`.
- `ReportsRunReview`: gate `SpecialReportsCard` on the run's own flag (falling back to the property setting for existing runs), and pass the toggle handler into the card.
- `ReportsDashboard` / run review header: reuse `sourceLabel()` from `src/lib/report-adapters`.
- No change to parsers, workbook builders, or `cheetaplains-special-reports`.
