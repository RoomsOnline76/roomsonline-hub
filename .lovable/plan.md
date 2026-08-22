# Neaten pasted screenshots in the report

Pasted screenshots are printed at `width: 100%; height: auto`, so a tall or oddly
shaped upload grows past the bottom of the A4 sheet and gets clipped, while wide
and narrow images end up looking inconsistent next to each other.

## What changes

- Every pasted screenshot prints inside a **uniform frame**: same width across all
  slides, fixed maximum height, image centred and scaled to fit (never cropped,
  never stretched).
- A portrait screenshot (like the NightsBridge Hits table) shrinks to fit the
  frame height instead of running off the page.
- A small or low-resolution screenshot no longer blows up to full width — it sits
  centred in the frame at a sensible size, so all sections look the same weight.
- Half-width (two-up) sections keep their side-by-side layout with the same
  fit-to-frame rule and equal-height frames.
- Captions and section titles stay where they are, always inside the page.

## Technical notes

- `supabase/functions/_shared/revenueReportHtml.ts`:
  - `.shots` / `figure.shot`: give each figure a fixed-height frame
    (one-up ≈ 200mm on a full media page, ≈ 120mm when a section title and
    other blocks share the page; two-up ≈ 110mm) using flex centring.
  - `figure.shot img`: `max-width: 100%; max-height: 100%; width: auto;
    height: auto; object-fit: contain;` plus a cap so upscaling is limited.
  - Add a `one-up full-page` variant used by the exploded per-image pages so a
    single screenshot fills the available page height exactly.
  - Keep `break-inside: avoid` and the existing print `overflow: hidden` — with
    the frame in place nothing reaches the clip boundary.
- No schema, hook or upload changes; nothing about how images are stored changes.
- Redeploy `revenue-report-draft` (and `cheetaplains-special-reports` if its slide
  HTML shares the shot styles) so a rebuilt draft picks the new layout up. Existing
  runs are re-processed by pressing **Rebuild** on the draft.
- QA: rebuild the Torburnlea/Cathedral Peak draft, print to PDF, and check the
  media pages page-by-page for clipping and consistent image width.
