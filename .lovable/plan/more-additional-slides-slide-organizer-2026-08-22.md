# More additional slides + slide organizer

Two additions to the run review screen: unlimited named extra slide sections, and a
drag-to-reorder organizer that controls the page order of the final draft report.

## 1. Add as many additional slides as you like

Today "Additional slides" is one fixed slot at the end. Instead:

- An **Add another slide section** button under Screenshots & slides creates a new custom
  slot with an editable title (e.g. "Airbnb performance", "Competitor rates") and a
  full/two-up layout choice.
- Each custom slot behaves exactly like the built-in ones: paste from clipboard, drag-drop
  or browse, multiple images, captions, reorder, delete.
- Rename or delete a custom slot at any time; deleting it removes its images.
- The original "Additional slides" slot stays, so existing runs are unaffected.
- Each custom slot prints as its own titled block, in organizer order.

## 2. Slide organizer

A new **Slide organizer** card lists every page the draft will print, in order:

```text
1  Cover                       (locked first)
2  Revenue Performance
3  Room Nights & Occupancy
4  Rate & Comparison Review
5  Revenue Review
6  Pickup & Rate Trend
7  Traveller Trends
8  Channel Performance         (4 pasted slots)
9  Booking.com
10 Expedia
11 Airbnb performance          (custom)
12 Process Notes
```

- Drag a row (or use up/down buttons) to change the order.
- A show/hide toggle per page for optional pages; data pages that have no content stay
  hidden automatically as they do now.
- Each row shows what it contains (table, charts, N images) so it is clear what is moving.
- "Reset to default order" restores the standard sequence.
- Order is saved per run and applied to the draft HTML and print-to-PDF, and to the Canva
  pack manifest so the designer receives the same sequence.

## Technical notes

- Migration:
  - `report_media_slots` (id, run_id, slot_key, section, title, hint, layout, sort_order,
    created_by, timestamps) for custom slots — `GRANT` for `authenticated`/`service_role`,
    RLS mirroring `report_media` (via the run's property and `has_reports_access`).
  - `report_runs.page_order jsonb` — array of page keys, null means default order.
- `src/lib/reportMediaSlots.ts` + `supabase/functions/_shared/reportMediaSlots.ts`: give every
  built-in slot a stable page key and export a `DEFAULT_PAGE_ORDER` list of page keys
  (data pages + media sections); keep the two files in step.
- `src/hooks/useReportMedia.ts`: load custom slots and merge them into `slots`; add
  `createSlot`, `renameSlot`, `setSlotLayout`, `deleteSlot` mutations.
- New `src/hooks/useReportPageOrder.ts` (read/write `page_order`, reset) and
  `src/components/reports/SlideOrganizer.tsx` (dnd-kit if already a dependency, otherwise
  HTML5 drag events plus up/down buttons for accessibility).
- `src/components/reports/ReportMediaSlots.tsx`: add-slot button, per-slot title/layout/delete
  controls for custom slots.
- `supabase/functions/revenue-report-draft/index.ts`: read `report_media_slots` and
  `page_order`; pass custom slot definitions and the order into `DraftOptions`.
- `supabase/functions/_shared/revenueReportHtml.ts`: tag each entry in `pageDefs` with its
  page key, sort by the supplied order (unknown keys appended, hidden keys dropped), then
  paginate — page numbering and running headers recomputed after sorting.
- Excel output untouched.

## Verification

Create two custom slide sections on the current Torburnlea run, paste an image into each,
reorder pages (move Traveller Trends after Booking.com, move a custom slide before Process
Notes), regenerate the draft, print to PDF and confirm the page sequence, numbering and
headings match the organizer with no blank or overflowing pages.
