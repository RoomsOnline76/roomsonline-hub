# Report builder: 6-month window, review + TOBI stages, tidier activity and footnotes

## 1. Six-month display window (Grande Roche)

The report is "for" the month just closed before the as-of date (July for an early-August run). From now on the report shows that month **plus the following five** — six months in total. Anything outside that span stays in the data but is not printed or listed.

- Add `windowEndMonth(asOfDate)` alongside the existing `windowStartMonth` in the shared report-window helper (start month + 5).
- The draft HTML report, the aggregated results table and the workbook's monthly grids all filter to `start..end`, so the three views agree.
- Earlier months keep their current treatment (folded in as last-year actuals). Later months are simply not displayed — no data is deleted, so widening the window later needs no re-upload.

## 2. Wizard stages

The rail grows from A–H to A–J:

```text
A  Parse source files
B  More files?
C  Previous report workbook
D  Ingest from previous
E  Comparison baseline
F  Review aggregated results      (new)
G  Screenshots & slides
H  Slide organiser
I  TOBI analysis & acceptance     (new)
J  Build & download
```

- **F — Review aggregated results.** The run is processed here and the aggregated table is reviewed against the six-month window, together with the monthly reviewer inputs that change the numbers (Dinner / Room 0 / complimentary nights, per source). Continue means "these figures are right".
- **I — TOBI analysis & acceptance.** The insights panel (tick/edit/accept findings) plus the narrative fields: Minimum Stay, Promotions, Rate Overrides, Commentary. This stage is no longer skippable-by-accident: it is marked as a review gate on the rail, complete once findings have been accepted or explicitly dismissed.
- **J — Build & download.** Excel, draft report, print pack, delete run. The aggregated table and manual inputs move out of here into F and I.

## 3. Activity panel

- Collapsed by default on every stage, expandable.
- Header carries a summary line built from the event trail:
  - Run created and Draft report generated timestamps
  - Data acquisition & processing total (first upload/parse event through the last successful processing)
  - Slides total (first screenshot upload through the last slide-order change)

## 4. Report footnotes

- "Additional revenue covers dinner and Room 0…" prints for NightsBridge only. OPERA and PROTEL keep the accommodation-only line.
- "This is a draft for the revenue team — screenshots and commentary can be added before it is issued." is removed for all sources.

## Technical notes

- `supabase/functions/_shared/reportWindow.ts`: new `windowEndMonth` + a `monthsInWindow` filter used by `revenueReportHtml.ts`, `revenueReportWorkbook.ts` and mirrored in the client `SnapshotTable`.
- `src/lib/runBuildStages.ts`: two new stages (`review`, `insights`) with re-lettered `STAGE_META`; completion derived from snapshot presence (F) and accepted-insight state (I). Stored `build_stage` values keep working — unknown/legacy values fall back through `resumeStage`.
- New `src/pages/reports/run-builder/StageReview.tsx` and `StageInsights.tsx`; `StageBuild.tsx` slims down. `ManualInputsCard` gains a `section` prop (`monthly` | `narrative`) so it can render in F and I without duplicating state.
- `RunEventTimeline` gets `defaultOpen={false}` and a derived-duration summary helper; no schema change.
- Footnote change is two lines in `revenueReportHtml.ts` gated on `sourceType === "nightsbridge"`.
- No migration required.
