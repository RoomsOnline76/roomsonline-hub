# Additional Slides: one row per slide

Today every image pasted into the "Additional slides" slot prints on a single shared page, so the slide organizer shows one row ("Additional Slides · 3 images") and the three slides can only move together. They should each be their own slide, with their own title and caption, individually movable in the order.

## What changes for the user

- The organizer lists each additional slide as its own row, labelled with the section title typed for that image (falling back to "Additional slide 1/2/3") and a short caption preview.
- Each row can be moved, and hidden, independently — up or down, anywhere in the sequence, including between data pages.
- The printed report emits one page per additional slide, in the organizer's order, with the slide title as the page heading.
- Existing runs keep working: a saved order that still references the single "Additional Slides" entry expands in place into its individual slides, preserving their current sequence.

## Technical notes

- `src/lib/reportMediaSlots.ts` / `supabase/functions/_shared/reportMediaSlots.ts`: mark the `additional` slot (and custom reviewer-created slots) as `explode: true` — one printed page per image rather than one page per section.
- `src/lib/reportPages.ts` / `supabase/functions/_shared/reportPages.ts`: add `mediaImagePageKey(imageId)` producing stable `media:img:<uuid>` keys, plus an `expandLegacyMediaKeys()` helper that swaps a legacy `media:Additional Slides` key for the per-image keys at the same index inside `orderPageKeys`.
- `supabase/functions/revenue-report-draft/index.ts`: include `id` in the `report_media` select so per-image page keys can be built; keep passing slots as-is otherwise.
- `supabase/functions/_shared/revenueReportHtml.ts`: when assembling `builtPages`, for exploded slots emit one page per image (`key: media:img:<id>`, `title: sectionTitle || slot.title`, body = single figure block reusing the existing `.shots`/`.shot` markup) instead of folding them into a section page. Non-exploded sections keep current grouping.
- `src/hooks/useReportPageOrder.ts` + `src/components/reports/SlideOrganizerCard.tsx`: for exploded slots feed one organizer entry per image (key, title, caption summary) rather than a single aggregated media section; keep the aggregated behaviour for Channel Performance / Booking.com / Expedia.
- No database changes: `report_media.section_title` and `caption` already carry the per-slide title and caption, and order lives in `report_runs.page_order`.
- Verification: regenerate a draft for the Cathedral Peak run and confirm the three SiteMinder slides print as three separate pages and reorder independently.
