# Cheetah Plains: bespoke owner pack built from each run

Cheetah Plains gets a second, differently-shaped pack on top of the standard revenue report. Today that pack is only produced when someone imports last month's PDF, so it reprints last month's figures. This changes it to build from the day's own exports and to come out automatically with every run.

## What the user gets

Every Cheetah Plains run produces two deliverables:

1. The regular revenue report and spreadsheet, unchanged.
2. The bespoke owner pack, in its filed print order:
   - Business-on-the-books commentary
   - Current financial-year revenue grid + its chart
   - Distribution, reservations and revenue update
   - Forward financial-year grid + chart
   - Declined bookings
   - Top booking travel partners
   - Partner multi-year trends (inbound, outbound)
   - Bookings by nationality

No toggle: the pack is part of the run for this property. The existing owner-slides switch is removed for it.

## Where each number comes from

| Column | Source |
| --- | --- |
| Confirmed BOB, occupancy | This run's imported exports (the aggregated snapshot) |
| Active Enquiries | The run's Provisional Bookings file, read per month |
| Budget | Carried from the last pack held for the property; reviewer can correct any month |
| BOB STLY, LY Actual | Carried from the last pack for the same fiscal months |
| Variance columns, quarters, totals | Calculated from the above |

Anything with no source stays blank rather than being invented. The pack lists which months lacked a carried budget or last-year figure.

## Written pages

TOBI drafts the commentary and the distribution/reservations update from this run's figures — quarter-by-quarter movement against budget and STLY, provisional upside, and the key takeaways — in the pack's own voice. Every drafted page stays editable before printing, and last month's wording is offered as the starting reference. Declined bookings and partner trends carry forward from the last pack and remain editable, since neither is in the daily exports.

## Technical notes

- New shared reader for the provisional-bookings export (`supabase/functions/_shared/cheetaplains/provisional.ts`): month key, villa nights, revenue; tolerant of the UTF-16 / repeated-header shapes the other Cheetah Plains readers already handle.
- New `supabase/functions/_shared/cheetaplains/packFromRun.ts` assembles an `OwnerReportExtract`-shaped object from: the run snapshot (confirmed + occupancy), the provisional reader (active enquiries), and the most recent stored pack for the property (budget, STLY, LY actual, declined, partner trends). Existing `buildOwnerPackSlides` and `specialReportHtml.ts` are reused unchanged for rendering.
- Carry-forward source: latest `report_special_reports` payloads for the property (`revenue_grid_*`, `declined`, `partner_trend_*`), read via the run's property, newest run first. No new table.
- `cheetaplains-special-reports` becomes the single entry point: it builds the full pack from the run when a snapshot exists, and keeps the current PDF-import path as the fallback when a run has no parsed data. Nationality and partners keep their existing workbook readers; when those workbooks are absent, the carried figures print.
- Commentary drafting goes through `_shared/aiModels.ts` (`callLovableAi`, prose temperature), with the drafted blocks stored in each slide's `payload.blocks` so the existing editable-narrative path applies.
- The run pipeline calls the pack build after the snapshot is written, so processing a run yields both packs; `report_runs` records a run event per generated slide as it does now.
- Review UI: the optional-extra card becomes a pack panel listing the slides in `OWNER_PACK_ORDER` with rebuild and per-slide open; the enable switch and its plumbing (`ownerSlidesOffered`/`ownerSlidesEnabled`) are dropped for this property.
- Verification: run the 7 September 2026 day again and check the generated grid against the filed July pack's shape — column set, quarter roll-ups, totals — and confirm September prints both confirmed and provisional.
