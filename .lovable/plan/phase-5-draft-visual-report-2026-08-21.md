# Phase 5 – Draft Visual Report

Turn a processed run into a branded, print-ready revenue report that mirrors the Canva
deck, plus a designer asset pack. Excel stays exactly as it is.

## What you get

- **Draft report** button on the run review page. It builds the report from the saved
  snapshot and the property's branding, then opens a preview inside the app.
- **Preview** shows the real pages (cover + content) at A4 proportions with page
  thumbnails, so you can check it before sharing.
- **Save as PDF** from the preview — one click, correct page breaks, no blank pages,
  logo and colours embedded.
- **Canva pack** download: a zip with each chart as an SVG, each table as a CSV, and a
  JSON manifest of every number, so the designer can rebuild the deck in minutes.
- **Branding**: report logo, cover artwork, primary/secondary colours and room count come
  from Property Settings. The settings page gets image previews and colour pickers so it is
  obvious what will appear on the cover and in the charts. Sensible ROL defaults when a
  property has none.

## Report structure (mirrors the supplied deck)

```text
Page 1  Cover        cover artwork, wreath logo, "BI-MONTHLY REVENUE REVIEW",
                     property name, as-of date
Page 2  Revenue Performance   OTB vs Last Year chart + month table
                              (OTB, previous, variance %, LY, additional, combined)
Page 3  Revenue Review        pickup variance chart, ADR trend, occupancy strip,
                              commentary (min stay / promotions / rate overrides)
Page 4  Source Mix            source share donut + per-source table
                              (Own, Booking.com, Expedia, LekkeSlaap, Other)
Page 5  Notes / Footer        OTB & provisional notes, contact block,
                              www.roomsonline.co.za
```

Charts: OTB vs LY grouped bars, pickup variance bars (positive/negative), ADR line, source
mix donut. Empty or missing series are omitted rather than drawn blank.

## Technical notes

- New edge function `revenue-report-draft`:
  - Reads `report_runs`, `report_snapshots`, `report_additional_inputs`,
    `property_report_settings` and the property name.
  - Builds charts as hand-rolled inline SVG in a shared module
    `supabase/functions/_shared/revenueReportCharts.ts` (no chart dependency, deterministic
    output, reusable for the Canva pack).
  - Renders a self-contained HTML document in
    `supabase/functions/_shared/revenueReportHtml.ts` — inline CSS, `@page A4`,
    `print-color-adjust: exact`, `break-inside: avoid` per page block.
  - Uploads to the existing `revenue-reports` bucket at
    `runs/{run_id}/draft-report.html`; returns a signed URL.
  - Action `pack` returns a zip (fflate) with `charts/*.svg`, `tables/*.csv`,
    `manifest.json`.
- Migration: add `draft_report_path`, `draft_generated_at` to `report_runs` (same shape as
  the existing Excel columns).
- Frontend:
  - `src/hooks/useReportDraft.ts` — generate, signed-URL fetch, pack download.
  - `src/components/reports/DraftReportPreview.tsx` — iframe preview with page thumbnails
    and a Save-as-PDF action that prints the iframe.
  - `src/components/reports/DownloadBar.tsx` — Excel / Draft report / Canva pack, replacing
    the single Excel button on `ReportsRunReview.tsx`.
  - `ReportsPropertySettings.tsx` — logo/cover previews, colour pickers with hex input.
- Amounts formatted as ZAR, months as `Aug 26`, dates Africa/Johannesburg — consistent with
  the Excel builder.
- Verification: generate a draft for an existing ready run, convert its pages to images and
  inspect each one for clipped text, overlap, missing charts and wrong colours; fix and
  re-check before handing over.
