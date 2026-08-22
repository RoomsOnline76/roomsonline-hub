# Revenue report: richer graphs, titled image sections, editable TOBI commentary

Four changes to the draft visual report and the run review screen.

## 1. Graphs get Variance and OTB vs LY

The three grouped charts on the Revenue Review page currently plot only OTB / previous / last year. Each gains two signed series, in the same unit as the chart, drawn from a real zero line so negatives sit below the axis:

- **Revenue** — add `Variance` (OTB now − OTB previous) and `OTB vs LY` (OTB now − last year actual).
- **Occupancy %** — add `Variance` and `OTB vs LY` in percentage points.
- **ADR** — add `Variance` and `OTB vs LY` in rands.

Both new series use distinct muted colours with legend chips, so the base three stay dominant. Value labels stay on short windows only. Zero-value series are omitted rather than drawn flat, so a first run without a previous review does not print an empty pair.

## 2. Titles for uploaded image sections

Each pasted image can be given its own **section title** alongside the existing caption. In the report the title becomes the block heading above that image (or group of images sharing the title), so the "Additional slides" slot no longer prints under a generic label — the revenue team names each pasted section the way the original deck does. Where no title is entered, the built-in slot name is used as today.

## 3. Traveller Trends moves up

Page order becomes:

```text
1  Cover
2  Revenue Performance
3  Room Nights & Occupancy
4  Rate & Comparison Review
5  Revenue Review (3 grouped charts)
6  Pickup & Rate Trend
7  Traveller Trends            <- moved here
8+ Pasted image sections (Channel Performance, Booking.com, Expedia, Additional)
last Process Notes
```

## 4. TOBI recommendations: tick to include, edit before saving

The TOBI panel on the run review screen becomes a review-and-approve list:

- A tick box per recommendation and one for the narrative — only ticked items print in the report.
- Every item is editable inline; edits save against the run and are what the report prints (the original AI wording is kept underneath so it can be restored).
- Ticked, saved items render as a **Revenue Commentary** block on the Revenue Performance page of the draft, above the existing manual commentary.

The narrative prompt is retightened to produce the house style — one line per month, pickup first, then the gap to target or last year with rand amount and percentage, e.g.:

```text
July - ended with R144k on the books, R66k (84%) ahead on target!
September - had a pick-up of R11k, trailing last year by R28k (43%).
January 2027 - R320k increase, needing R57k (7%) to achieve the previous year!
```

Rules for the generator: use the run's actual month keys and figures only, compact rand format (R144k), percentage in brackets, no invented targets — where no target baseline exists, compare to last year and say so.

## Technical notes

- `supabase/functions/_shared/revenueReportCharts.ts` — `groupedBarChart` already takes n series; extend it to handle signed values with a zero baseline and drop all-zero series.
- `supabase/functions/_shared/revenueReportHtml.ts` — add the two derived series to the three grouped charts; reorder `pageDefs` so Traveller Trends precedes `mediaSections`; group media by `section_title` within a slot and use it as the block heading; add the TOBI commentary block to the Revenue Performance page and include the selected items in the Canva-pack manifest.
- Migration: `report_media.section_title text`; `report_insights` gains `narrative_final text`, `include_narrative boolean default true`, `selections jsonb default '{}'` (per-recommendation include flag + edited text). Existing GRANT/RLS shape unchanged.
- `src/lib/reportMediaSlots.ts` / `supabase/functions/_shared/reportMediaSlots.ts` — keep in step; no new slots, only the title field.
- `src/hooks/useReportMedia.ts` — `setSectionTitle` mutation; `src/components/reports/ReportMediaSlots.tsx` — title input per image.
- `src/hooks/useReportInsights.ts` — persist selections and edited text; `src/components/reports/AiInsightsPanel.tsx` — checkboxes, inline editing, save/reset.
- `supabase/functions/reports-xai-insights/index.ts` — prompt update for the month-by-month style; still routed through `_shared/aiModels.ts`.
- `supabase/functions/revenue-report-draft/index.ts` — pass `section_title` and the selected TOBI commentary into `DraftOptions`.

## Verification

Regenerate the draft for the current Torburnlea run, print to PDF, convert each page to an image and confirm: five/seven-series charts legible with negatives below the axis, Traveller Trends on page 7 ahead of pasted sections, titled image blocks, and the ticked TOBI lines printing in the edited wording with no blank or overflowing pages.
