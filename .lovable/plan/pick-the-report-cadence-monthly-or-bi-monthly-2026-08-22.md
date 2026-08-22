# Pick the report cadence: Monthly or Bi-Monthly

Today every revenue review is hard-wired as "Bi-Monthly": the wizard's default title says it, and the printed report prints "Bi-monthly revenue review" on the cover and in every page footer regardless of what the title says. The reviewer will be able to choose the cadence per run, and the whole document follows that choice.

## What changes for the user

- **New run wizard (Details step):** a Monthly / Bi-Monthly toggle next to the as-of date. Bi-Monthly stays the default so nothing changes for existing habits.
- **Title follows the choice:** the suggested title becomes "Monthly Revenue Review – 31 Jul 2026" or "Bi-Monthly Revenue Review – 31 Jul 2026". A title the user has typed by hand is never overwritten.
- **Changeable after creation:** the same toggle appears on the run review screen, so a run created with the wrong cadence can be corrected and the draft regenerated.
- **Printed report picks it up:** cover kicker, cover title block, page footers and the browser/PDF document title all read "Monthly revenue review" or "Bi-monthly revenue review" to match the run.

## Technical notes

- **Database:** add `report_runs.cadence text not null default 'bimonthly'` with a check constraint limiting it to `monthly` / `bimonthly`. Existing rows keep the bi-monthly behaviour they were produced with.
- **Wizard:** extend `WizardState` in `src/pages/reports/ReportsNewRun.tsx` with `cadence`, make `defaultTitle(dateIso, cadence)` cadence-aware, and re-derive the title on cadence change unless `titleEdited`. Pass `cadence` through `useReportRunMutations().createRun`.
- **Run review:** small segmented control in `ReportsRunReview.tsx` that patches `report_runs.cadence` and invalidates the run query so the next draft build uses it.
- **Draft HTML:** `revenue-report-draft` already selects the run row — add `cadence` to that select and pass it into `buildDraftReport`. In `supabase/functions/_shared/revenueReportHtml.ts`, add `cadence: "monthly" | "bimonthly"` to `DraftOptions` (defaulting to `bimonthly` when absent) and replace the three hard-coded strings: the `<title>`, the `cover-kicker`, and the footer line in `pageChrome` (which needs the label threaded in). Cover heading stays "Revenue Review" as the two-line brand mark; the cadence reads in the kicker above it.
- Excel and the CheetaPlains special reports carry no cadence wording, so they need no change.
