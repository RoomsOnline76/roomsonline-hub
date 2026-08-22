# Report Builder: guided step-by-step run wizard

Today the run page (`/runs/:runId`) shows every card at once in a fixed order — source files, add-more, process, downloads, draft preview, baseline, prior workbook, results, TOBI, manual inputs, screenshots, slide organizer, owner slides. Everything already works; it is just presented as one long page in an illogical order.

The change is to turn that page into a compartmentalised builder with one stage at a time, shared by all sources (NightsBridge, OPERA, PROTEL).

## The stages

```text
A  Parse source files      auto-parses on arrival, shows what was read
B  More files?             add + parse extras, or "no more files"
C  Previous report         first run: required · later runs: optional/skippable
D  Ingest from previous    tick what to absorb → Import selected
E  Comparison baseline     auto-derived; adjust or confirm
F  Screenshots & slides    per-source slot catalogue + section titles
G  Slide organiser         drag order of pages and images
H  Build & download        Process run, Excel, draft report, print pack
```

Each stage is its own screen with Back / Continue, a numbered progress rail at the top (clickable so a reviewer can jump back), and a short "what this step does" line. Stages already completed show a tick; the rail is not a locked funnel — you can revisit any completed stage without losing work.

## Stage behaviour

- **A — Parse.** On landing at a fresh run with unparsed files, parsing starts automatically (no button hunt). Live progress and the per-file result list stay visible; a file that fails can be re-parsed or removed right here. Expected-columns hint stays on this stage.
- **B — More files?** Drop zone plus two exits: "Upload and parse" or "No more files — continue". Newly uploaded files are parsed immediately, not deferred to the end.
- **C — Previous report workbook.** On a property's first run this stage must be satisfied (upload, or an explicit "no previous report exists" acknowledgement so a brand-new property is not blocked). On later runs it is skippable in one click, and pre-fills from the last locked baseline.
- **D — Ingest selection.** Only appears when a prior workbook exists. The existing tick-list (occupancy, targets, uplift, monthly commentary, baseline months) with **Import selected**.
- **E — Comparison baseline.** Shows the auto-derived baseline (previous OTB / last-year actual) and lets it be overridden or locked. If nothing needs changing, it is a single Continue.
- **F — Screenshots & slides.** The source-aware slot catalogue (NightsBridge / OPERA / PROTEL each get their own sections), including section titles for extra images. Cheetah Plains owner slides are offered here, only for that property.
- **G — Slide organiser.** Page and image ordering.
- **H — Build & download.** Manual "Process run", aggregated results table, manual inputs, TOBI insights review, then Excel / draft / print pack. Delete run lives here as a quiet destructive action.

Manual inputs and TOBI insights sit in H because both need the aggregated snapshot to exist.

## Progress and resumability

Stage position is stored on the run, so closing the tab and coming back resumes at the same stage rather than the top of the page. Stage completion is derived from real state, not just from clicking Continue:

- A/B complete when every source file has parsed
- C/D complete when a prior workbook is imported, or explicitly declined
- E complete when a baseline is present or confirmed
- F/G are always optional (a run with no screenshots can still build)
- H complete when a snapshot exists

Wizard creation (`/runs/new`) is unchanged — property, details, files, optional notes — and it hands off straight into stage A.

## Technical notes

- New `report_runs.build_stage` (text, default `parse`) + `prior_report_declined` (boolean) columns via migration, with GRANTs matching the existing `report_runs` policies.
- `ReportsRunReview.tsx` (535 lines) is split into `src/pages/reports/run-builder/`: a `RunBuilder` shell owning the stepper, stage resolution and shared run/snapshot hooks, plus one thin stage component per letter. Existing cards (`SourceFileList`, `FileDropZone`, `PriorReportImportCard`, `BaselineCard`, `ReportMediaSlots`, `SlideOrganizerCard`, `ManualInputsCard`, `AiInsightsPanel`, `SnapshotTable`, `DownloadBar`, `DraftReportPreview`, `SpecialReportsCard`) are reused as-is — no rewrite of their internals.
- Stage derivation lives in one pure helper (`runBuildStages.ts`) so the rail, the resume logic and the Continue guards agree.
- Auto-parse in stage A fires once per run via a guard on parsed-file count, so revisiting never re-parses silently.
- `RunEventTimeline` becomes a collapsible footer available on every stage.
- No parser, workbook or HTML-generation logic changes in this step.
