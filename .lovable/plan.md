# Revenue Reports — editable first step, file deletion, and a more forgiving previous-report reader

## What I confirmed on the Aire Del Mar run

- The run (as-of 24 Aug 2026, status "ready") has **two** previous-report uploads: the owner PDF `14 Aug 26 _ Revenue Report _ Aire Del Mar.pdf` and the spreadsheet `14.08.26_Aire_Del_Mar-Revenue_Report.xlsx`.
- The importer always prefers a PDF when both are present. Reading that PDF returns **no months at all** (every page skipped, no financial-year grid) — that is where "0 months" comes from.
- Reading the spreadsheet instead returns a full baseline: 7 window months (Jul 2026 – Jan 2027), previous OTB revenue and room nights, last-year actuals and nights, targets, and 24 historical months.
- That spreadsheet's `YOY` sheet — an 11-year revenue matrix (2015–2025) — is skipped, because sheet recognition matches only names containing "Fin Year", "Historic" or "Stats". Its layout is a normal year-column grid, so only the name is stopping it.
- The two extra NightsBridge exports (`Aug 2026.xlsx`, `Sept 2026.xlsx`) already ingest correctly (39 and 42 rows). The same consolidated report workbook was also dropped into the **source** slot, where it correctly fails ("could not find the NightsBridge header row") and is just noise on the run.
- Editing is currently allowed only while a run is a draft, which is why the report date cannot be reset and files cannot be deleted on this run.

## What changes

### 1. Reset the report date (Stage A)
Add an "Edit report date" control to the first stage. Changing it rewrites the run's as-of date, re-derives the six-month window, retitles the run when the title is still the generated one, and flags the previous-report figures for re-import (the as-of date decides which OTB column is the baseline). A short confirmation explains that the comparison columns will be re-read.

### 2. Delete added files
File removal (and adding more files) stays available on runs that are draft **or** ready — only locked/archived runs are read-only. Deleting a source file removes its parsed booking rows, and deleting a previous-report file clears any baseline figures that came from it, so the next parse is clean.

### 3. Choose which previous report is used, and never silently pick an empty one
- The previous-report step lists every uploaded prior file with a "use this one" choice, so the spreadsheet can be selected over the PDF.
- Automatic selection stops blindly preferring PDFs: a PDF is tried first, and if it yields no months the newest spreadsheet is read instead. The preview says which file was used and why.

### 4. Wider NightsBridge previous-report parsing (no change to what already works)
- Recognise year-matrix sheets by **shape** as well as name: any sheet whose header row is a run of four-digit years is read as a multi-year grid. This picks up `YOY` (and future variants) while leaving Fin Year / Historical precedence unchanged.
- Keep month labels tolerant of the variants seen here — "Sept", "Sep", and real date cells (Jan 2027 arrives as a date) all resolve.
- When a source-slot upload turns out to be a consolidated report workbook, the parse error becomes an actionable message offering to move it to the previous-report step instead of a bare header failure.

### 5. Re-run Aire Del Mar
After the changes, re-import the previous report on the existing run using the spreadsheet, and confirm the review grid shows the seven window months, last-year comparison and targets, plus the 2015–2025 history.

## Technical notes

- `supabase/functions/report-prior-workbook-import/index.ts`: replace the PDF-wins candidate pick with try-PDF-then-fallback based on extracted month count; surface `file_used` and `candidates` in the preview payload.
- `supabase/functions/_shared/priorReportWorkbook.ts`: add year-header shape detection alongside the `fin year|historic|stats` name test; treat name aliases (`yoy`, `year on year`) as long-running grids.
- `src/pages/reports/ReportsRunReview.tsx`: `editable` becomes `status === "draft" || status === "ready"`; add an as-of-date mutation passed through `RunBuilderContext`.
- `src/pages/reports/run-builder/StageParse.tsx`: report-date editor; `StagePriorUpload.tsx` / `PriorReportImportCard.tsx`: prior-file chooser wired to the existing `file_id` parameter.
- `src/lib/report-adapters/nightsbridge.ts`: consolidated-workbook detection for the friendlier source-slot error.
