# Revenue Reports: reference-folder properties, one at a time

Six properties, in order, each signed off against its own golden pack before the next starts. One shared capability is built first so nothing is hardcoded per property.

## What is on the branch today (verified)

- `docs/reference/protel/krige/` — PDF + golden `.xlsx` with sheets `FY`, `Historical`. Row 2 of `FY` already prints: `OTB @ 14 Aug 2026`, `OTB @ 30 July 2026`, `Variance`, `2025 ACTUAL`, `OTB vs 2025`, `2024 ACTUAL`, `OTB vs 2024`, `STLY`, `Variance OTB vs STLY`.
- `docs/reference/protel/devondale/` — two PDFs, no golden workbook.
- `docs/reference/protel/granderoche/` — two PDFs + a long-lived hand workbook.
- `docs/reference/roomracoon/` — PDF + golden `.xlsx` with sheets `OTB RR`, `Fin Year`, `Historical` (standard layout: OTB, prior OTB, Variance, Last Year Actual, OTB vs LY, Target (+7%), plus Room Nights and Occupancy blocks).
- `docs/reference/opera/` — Cathedral Peak monthly History & Forecast PDFs + the 20 Aug pack.
- `docs/reference/nightsbridge/` **does not exist on this SHA** — Mziki has no goldens here, so Mziki ships behind a fixture test and reconciles when the folder lands.
- `docs/reference/protel/CheetaPlains/` is also absent on this SHA; `semper-nightsbridge/` is present and stays untouched.

Existing plumbing that gets reused, not rebuilt: `property_report_settings` (already carries `nb_profile`, `room_count`, `historical_baseline`), `priorReportWorkbook.ts` + `report-prior-workbook-import` + `PriorReportImportCard`, the three parsers, and the per-source Excel workbook parts.

## Step 0 — Shared capability: `report_profile`

One migration adds a single JSONB `report_profile` column to `property_report_settings` (same pattern as `nb_profile`), plus a parser/normaliser `src/lib/reportProfile.ts` and a server mirror under `supabase/functions/_shared/reportProfile.ts`.

Fields: `compare_years: number[]`, `stly_from_prior_workbook: boolean`, `source_unavailable: boolean`, `source_mode: "ledger" | "prior_workbook_only"`, `year_columns: boolean`. An empty/absent profile means exactly today's behaviour, so every existing property is unaffected.

Wiring:

- **Snapshot** — extra keys on the existing months JSON: `actuals_by_year` (keyed `"YYYY"`) and `stly` with its `as_of`. No new table.
- **STLY** — when `stly_from_prior_workbook` is on, the prior-workbook step becomes required on the wizard; the newest dated `OTB @ …` column of the imported pack maps onto an explicit STLY series, labelled `vs STLY (as-of dd Mon yyyy)`. A stored successful run at that as-of date last year wins over the upload when one exists.
- **No-PMS mode** — `source_unavailable` / `prior_workbook_only` hides the PMS drop zone and shows one "Last sent revenue report" zone; the snapshot is written from that workbook. Reviewer edits (Dinner / Room 0 / Comp RNs, commentary) still apply.
- **Settings UI** — a card on Property Report Settings: comparison-years tag input, "STLY from prior workbook" toggle, "No PMS extract (use last sent report)" toggle. Defaults empty/off.

Excel/draft changes are presentation-only: each workbook part grows optional year and STLY columns when `year_columns` is on, and emits today's exact column order when off. The aggregation engine, snapshot shape and draft HTML stay source-agnostic.

## Step 1 — Hotel Krige (PROTEL) — first, then stop

Profile seed: `compare_years [2026, 2025, 2024]`, `stly_from_prior_workbook: true`, `source_mode: "ledger"`, `year_columns: true`.

House State parsing is unchanged. After parse, year actuals are overlaid from stored snapshots for those years, then the `Historical` / `FY` grids of an imported prior Krige workbook, then existing last-year actuals on the property. Draft keeps `reportTemplate: "protel"` and gains variance rows for 2025, 2024 and STLY.

Sign-off: a reconciliation table of revenue / room nights / occupancy / ADR per month against `14.08.2026 Hotel Krige _ Revenue Report.xlsx`, plus proof a PROTEL property with an empty profile still emits today's workbook. Nothing continues until that is accepted.

## Step 2 — Devonvale (PROTEL)

Default/empty profile unless the 13 Aug pack visibly prints extra year columns, in which case the same column builder is switched on with those years. House State parse only; room count from settings; F&B/extras pre-filled from House State. Reconciled against the two PDFs.

## Step 3 — Grande Roche (PROTEL)

Parser still consumes House State (+ optional Production). The hand workbook is treated purely as a prior-workbook/baseline source for Historical Stats and the current `OTB @ 14.08.26` / `OTB @ 29.07.26` columns through `priorReportWorkbook.ts`. Generated artefact is the current PROTEL template plus whichever years the 14 Aug pack prints. The 2017–2020 tabs are not regenerated.

## Step 4 — Les Chambres (RoomRaccoon, no data sheet)

Adds `roomraccoon` as the one new `ReportSourceKey`: status ready, parser reuses the prior-workbook import path, `reportTemplate: "standard"`, accepts `.xlsx`/`.xls`, with notes saying RoomRaccoon exposes no downloadable ledger. Descriptor mirrored in `reportSourceAdapters.ts`. No RoomRaccoon HTTP client, no scraping.

Profile: `compare_years [2026, 2025, 2024]`, `stly_from_prior_workbook: false`, `source_unavailable: true`, `source_mode: "prior_workbook_only"`, `year_columns: true`. Room count 15 comes from settings. Reconciled against the golden workbook's `OTB RR` / `Fin Year` / `Historical` numbers and the 14 Aug PDF.

## Step 5 — Mziki (NightsBridge, STLY)

Source stays `nightsbridge`; current-month files still go through `nightsbridge-report-parser`. Only `stly_from_prior_workbook: true` is set, so STLY comes from the pack sent same-time-last-year. Because the Mziki reference folder is absent on this SHA, the path is proven with a fixture test built from a copied prior workbook and reconciled for real when the folder returns.

## Step 6 — Cathedral Peak (OPERA, confirm only)

Re-run the existing OPERA parser over the monthly PDFs in `docs/reference/opera/` and confirm revenue / nights / occupancy / ADR still match the 20 Aug pack. No new source work and no `compare_years` unless a month actually mismatches.

## Out of scope

Cheeta Plains (incl. `cheetaplains-special-reports`, nationality slides, reservation-list path), Schoone Oordt / `semper-nightsbridge`, Jembisa and Explorers. No per-property branches in parsers, no property-specific `ReportSourceKey`s, no Canva PDF parsed as a ledger, no hardcoded room counts, and no changes to calendar, booking, RU/ARI or channel code. Narrative work stays on xAI.
