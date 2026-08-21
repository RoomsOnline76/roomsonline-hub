# Revenue Report — match the original, then improve it

Comparing the generated 14 Aug draft against the original 31 Jul Torburnlea report, the draft is prettier but thinner: it drops columns, drops whole sections, reduces the three signature charts to one, and prints a blank page. This plan brings the draft to full parity with the original's information and order, adds paste-in slots for the screenshots the revenue team supplies, and tightens the layout so every page is print-perfect.

## What the original has that the draft lost

| Original (31 Jul) | Draft (14 Aug) |
| --- | --- |
| Revenue grid: OTB now, OTB previous, Variance, Last Year Actual, **OTB vs LY**, **Dinner**, **Room 0**, **Comp RNs**, Additional, Total Combined | only 7 of those columns; OTB vs LY, Dinner, Room 0, Comp RNs missing |
| Room Nights block (OTB now / prev / variance / LY / OTB vs LY) | nights shown only as a small combined table |
| Occupancy block (same 5 columns) | occupancy % only |
| ADR block (same 5 columns) | ADR only |
| Legend + "provisional bookings included" note beside the grids | on the last page only |
| Revenue Comparison Review table (Revenue OTB vs LY %, ADR OTB vs LY %) | missing |
| Three grouped bar charts — Revenue, Occupancy %, ADR — each with 5 series | one 2-series revenue chart |
| Nightsbridge Hits, Booking Totals (last year vs this year), Minimum Stay, Promotions & Rate Overrides | missing |
| Booking.com Performance, Promotion Stats, Rate Plan Stats | missing |
| Expedia Performance, Promotion Stats, Traveller Trends | traveller trends replaced by an internal source-mix donut |
| — | blank page 3 (layout overflow bug) |

## Page order after this change

```text
1  Cover (artwork, property, as-at, window, sellable rooms)
2  Revenue Performance   full revenue grid + legend
3  Room Nights · Occupancy · ADR grids + Revenue Comparison Review
4  Revenue Review        Revenue / Occupancy % / ADR grouped bar charts
5  Pickup + ADR trend    (retained draft-only additions)
6  Channel Performance   pasted slots: Nightsbridge hits, booking totals, min stay, promotions
7  Booking.com           pasted slots: performance, promotion stats, rate plan stats
8  Expedia               pasted slots: performance, promotion stats, traveller trends
9  Traveller Trends      source mix donut + table + occupancy strip (kept)
10 Process Notes         legend, commentary, prepared-by block
```

Pages 6–8 print only when the team has pasted something into their slots, so a first run stays clean. Nothing is ever dropped when data exists.

## Paste-in capture for revenue-team screenshots

A new **Report media** step on the run review screen gives one card per named slot, in the same order the original prints them. Each card accepts:

- paste straight from the clipboard (Cmd/Ctrl+V while the card is focused — the way the original was assembled),
- drag-and-drop, or click to browse,
- multiple images per slot, with caption, reorder and delete,
- one free-form "Additional slides" slot so the team can add sections we have not named.

Images upload to the existing `revenue-reports` bucket under `{property}/{run}/media/`, and are re-signed when the draft is built so they render inside the HTML and survive the print-to-PDF step.

## Formatting fixes

- Kill the blank page: pages become content-flow based rather than fixed-height, with explicit break rules so a page never emits with just a header.
- Wide grids get a compact numeric type scale, right-aligned figures, thousands separators and consistent zero handling ("—" not "R0").
- Grouped bar charts gain a real zero line, negative-value support below the axis, per-series legend chips and value labels — visually cleaner than the Excel originals but with the same series.
- Repeating page header/footer, correct page numbering after conditional pages, A4 margins verified against print output.

## Technical notes

- `supabase/functions/_shared/revenueReportHtml.ts` — rebuild the section builders: full revenue grid, three metric blocks, comparison-review table, media pages, conditional pagination. Add `media` to `DraftOptions`.
- `supabase/functions/_shared/revenueReportCharts.ts` — extend `groupedBarChart` to n series with signed values, zero baseline and legend; add a percent-formatted variant for the occupancy chart.
- `supabase/functions/revenue-report-draft/index.ts` — load `report_media` rows, sign each image URL, pass them through; include media in the Canva pack manifest.
- New migration: `report_media` (id, run_id, slot_key, storage_path, caption, sort_order, created_by, timestamps) with `GRANT` for `authenticated`/`service_role`, RLS scoped through `has_reports_access` and the run's property, mirroring `report_source_files`.
- New `src/components/reports/ReportMediaSlots.tsx` + `src/hooks/useReportMedia.ts`; mounted in `ReportsRunReview.tsx` above the draft preview. Upload path reuses `src/lib/reportUpload.ts` conventions.
- Excel output is untouched; only the visual PDF/HTML draft changes.

## Verification

Regenerate the draft for the Torburnlea 14 Aug run, print to PDF, convert every page to an image and compare side by side with the 31 Jul original — column-by-column on the grids, series-by-series on the charts — and confirm no blank or overflowing pages.
