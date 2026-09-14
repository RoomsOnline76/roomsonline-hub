# Reliable Cheetah Plains daily reports

## Goal
Make the Cheetah Plains daily report reliably process a full multi-file day, preserve the running workbook, and use daily-specific headings from the moment the daily report type is selected.

## Confirmed current issues
- The 14 September run parsed the PDFs and 15 House State workbooks, then hit the worker resource limit while reading the 195 KB Provisional Bookings workbook. Its result was never saved, so retrying selects the same file again.
- The stored running workbook is now 49.6 MB. Even after parsing succeeds, rebuilding that entire archive inside one request remains vulnerable to the same worker limit.
- Daily runs are created with the generic bi-monthly title because title generation only considers cadence, not report type. The failed run is stored as “Bi-Monthly Revenue Review – 14 Sept 2026”.

## Implementation

### 1. Make multi-file ingestion bounded and resumable
- Process exactly one source file per request, regardless of whether it is a spreadsheet or PDF.
- Keep each file's parsed payload and attempt state independently so a retry resumes at the failed file without re-reading successful files.
- Replace the Provisional Bookings path that repairs and materialises the entire workbook with a low-memory OOXML reader that opens only workbook metadata, shared strings, and candidate sheet XML needed for provisional rows.
- Read candidate sheets one at a time, stop after the recognised provisional sheet, and discard buffers between files.
- Preserve a clear per-file failure result after bounded retries; do not allow one optional export to strand all successfully parsed files or leave the run indefinitely processing.

### 2. Bound workbook creation as a separate stage
- Split finalisation into resumable steps: aggregate the saved file results, append the daily sheet, then render/store the report and mark the run ready.
- Replace the current full JSZip STORE rebuild with a ZIP update path that copies unchanged compressed workbook entries and rewrites only the new/changed sheet, workbook relationships, content types, and calculation metadata. This prevents the running workbook from inflating and avoids loading/re-serialising hundreds of unchanged sheets.
- Upload to a temporary versioned path first, verify the workbook can be reopened and contains the requested day sheet, then promote it as the running workbook. Never overwrite the known-good workbook on a failed append.
- Make every step idempotent: retrying the same date replaces that date's sheet once and cannot duplicate it.

### 3. Make the wizard daily-first immediately
- Extend generated titles to consider report type. Daily runs use `Daily Detailed Report – <date>`; monthly and bi-monthly revenue-review titles remain unchanged.
- When “Daily Detailed Report” is selected, immediately update an untouched generated title, hide the irrelevant cadence selector, and change the page heading and supporting copy to daily-report wording.
- Thread report type through date changes, run creation, and the run-review header so Step A never reverts to “Bi-Monthly Revenue Review”. Preserve manually edited titles.
- Correct existing generated daily titles when they are displayed or next saved, including the current 14 September run; do not overwrite genuinely custom titles.

## Verification
- Add parser tests using a representative Provisional Bookings workbook shape, including UTF-16 XML and large unused sheets.
- Add orchestration tests for a full day with many House State files, both movement PDFs, and the provisional workbook; verify resume begins at the failed file.
- Add a large-running-workbook fixture with hundreds of sheets; verify bounded memory behavior, output size does not balloon, the new date sheet exists, formulas/styles remain intact, and failure leaves the prior workbook untouched.
- Add title tests for selecting daily, changing its date, creating the run, reopening Step A, and preserving a custom title.
- Deploy the daily-report function, rerun the 14 September source set, and verify the run reaches Ready with both workbook and report downloads and the daily-focused heading.

## Technical details
- Keep the existing `report_source_files.detected_mapping` checkpoint model and extend it rather than introducing a second source-of-truth.
- Keep all function requests authenticated and all request payload fields in snake_case.
- Do not change the Cheetah Plains workbook layout, financial forms, graphs, same-day replacement rule, or monthly/owner report behavior.
