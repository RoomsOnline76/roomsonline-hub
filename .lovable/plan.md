# Cheetah Plains daily workbook recovery and size control

## Goal
Restore the running workbook to a compact, reliable file while preserving the team's original layout, daily tabs, formulas, graphs and both final downloads.

## Confirmed current state
- The uploaded master sample is **11,008,430 bytes**; the stored running workbook is **49,577,641 bytes**.
- The current running workbook was last updated on 11 September and is the file returned by the successful 7 and 11 September runs.
- Daily data is safely stored for 7, 11 and 14 September, so those days can be rebuilt without re-reading all source files.
- The workbook patcher preserves unchanged compressed files inside the spreadsheet, but writes changed/new spreadsheet parts without compression. The previous full rebuild path also used uncompressed ZIP output, which accounts for the excessive growth.
- The 14 September run has all 18 source files read successfully; only the oversized workbook append is failing.

## Implementation

### 1. Recover from the clean master
- Keep the current 49.6 MB workbook as a dated recovery backup; never overwrite it during repair.
- Use the original 11 MB uploaded master as the clean base.
- Reapply the stored 7, 11 and 14 September day data in date order, replacing an existing date tab rather than duplicating it.
- Write the repaired workbook to a temporary/versioned location first, verify that it opens and contains all three date tabs, then promote it as the running workbook.

### 2. Keep future workbooks compact
- Compress only newly written or replaced spreadsheet parts while byte-copying all unchanged ZIP members.
- Avoid loading or recompressing all 380+ sheets.
- Add size guards: reject promotion if the result grows unexpectedly relative to the base, and preserve the last known-good workbook.
- Keep append idempotent so rebuilding the same date does not increase sheet count or file size repeatedly.

### 3. Separate the memory-heavy stages
- Split the current final operation into resumable calls:
  1. aggregate and store the day's figures,
  2. append and verify the workbook,
  3. render and store the report.
- Let the browser resume at the failed stage instead of re-reading all source files.
- Mark the run ready only after both workbook and report paths exist.

### 4. Provide a safe downloadable sample
- Add a **Download clean workbook sample** action to the daily upload step.
- The download will use the compact repaired master, not the oversized workbook.
- A reworked workbook uploaded with the daily source files will be recognised as the replacement base, but will only become the running workbook after validation and a successful append.

### 5. Finish the daily-first wording
- Hide the monthly/bi-monthly cadence control for Daily Detailed Report.
- Keep the title, steps and build/download wording daily-specific from the moment Daily Detailed Report is selected.

## Verification
- Confirm repaired workbook size is close to the original 11 MB rather than 49.6 MB.
- Open the workbook and verify the original sheets, formulas, graphs and the 07Sep2026, 11Sep2026 and 14Sep2026 tabs.
- Rebuild 14 September and confirm Ready status with working Excel and PDF downloads.
- Rebuild 14 September again and confirm no duplicate tab and no material size increase.
- Verify monthly report creation still shows cadence controls and remains unchanged.
