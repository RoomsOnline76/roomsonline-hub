# Cheetah Plains daily report — accept PDFs, accept pasted email text, stop the build failing

Three fixes for the Daily Detailed Report.

## 1. PDFs rejected as "unsupported type"

The day's created / cancelled reservation prints are PDFs. The wizard's upload step already accepts them, but two other places on the way in still only accept spreadsheets, so the file is marked "Unsupported type" before it can be uploaded:

- the file box on the **New report** page (where a daily run is started with its first files)
- the **More files** step inside the run

Both will accept PDFs whenever the run is a Daily Detailed Report, matching the day's-files step. Monthly reviews keep their current file types unchanged.

## 2. Paste the email text

The day's email carries figures and remarks that are not in any export. A **Paste from the email** box goes on the day's-files step:

- paste the text, save it, edit or clear it later
- it is stored against the run, so it survives leaving and returning
- the build reads it: figures it can recognise (created / cancelled counts and values) fill gaps the PDFs did not cover, and the remaining text prints on the daily report under a "From the day's email" note
- exports always win over pasted text; the paste only fills what is missing

## 3. Build fails with "not enough compute resources"

A day carries around 18 villa-state workbooks plus the movement PDFs, and the build currently reads all of them in a single pass. That exhausts the worker before it finishes.

The build becomes stepped: the wizard asks for a small batch of files at a time, each batch's result is saved against that file, and once every file is read the workbook and the report are produced from the saved results. The build button behaviour does not change — it shows progress ("reading 6 of 19 files") and finishes with both downloads as it does today. Re-running a day still replaces that day.

## Technical notes

- `src/pages/reports/ReportsNewRun.tsx` (drop zone at the file step) and `src/pages/reports/run-builder/StageMoreFiles.tsx` pass `adapter.acceptedFileTypes` only; both get the daily-aware `[...adapter.acceptedFileTypes, ".pdf"]` already used by `StageDailyUpload` and the run-builder upload call.
- Pasted text stored in `report_additional_inputs.free_commentary` keyed by `run_id` (table exists; no schema change). New save/load in `useDailyDetailedReport.ts`, new card in `StageDailyUpload.tsx`.
- `supabase/functions/cheetaplains-daily-report/index.ts` splits into modes:
  - `parse_batch` — claims up to N unparsed source files (N=3 workbooks, 1 PDF max per call), stores the extracted per-file payload in `report_source_files.detected_mapping` with `parse_status`, returns remaining count;
  - `build` — only when nothing is left to parse: assembles `ProtelDay[]` / provisional buckets / movements from the stored payloads, applies pasted-email fallbacks, then upserts `report_daily_days`, rebuilds the workbook, renders the HTML and marks the run `ready` exactly as now.
- `useDailyDetailedReport.ts` loops `parse_batch` until `remaining === 0`, surfacing progress, then calls `build`.
- `buildDailyReportHtml` gains an optional email-notes block; `buildDailyFigures` gains optional pasted movement fallbacks.
- Verification: re-run the 7 September 2026 Cheetah Plains set end to end (19 files incl. PDFs), confirm the workbook day count and both downloads, and confirm the run lands `ready`.
