# Uniform full-width pasted screenshots

## Problem

Pasted screenshots are printed inside a fixed-height frame with the image scaled to *fit* that box. Because scaling preserves each upload's own aspect ratio, a tall or narrow screenshot shrinks until it fits the height and ends up much narrower than the page, while a wide one fills the width. The result: pasted images print at inconsistent widths, with empty side margins around some of them.

## What changes

- Every pasted screenshot prints at the **same full content width** of the page, regardless of the shape of the uploaded image. Height follows naturally from the image's own proportions.
- Frames no longer force a fixed height, so no image gets shrunk to fit a box and no image is letterboxed with white space on either side.
- A safety cap keeps a very tall screenshot from overflowing the sheet: if scaling to full width would exceed the available page height, the image is capped at that height (and stays centred), so it still never bleeds off the page.
- Two-up (half-width) sections keep their side-by-side layout, but the two images each fill their own column width consistently.
- Full-page additional slides fill the page width and use the full page height as their cap.

## Technical notes

- `supabase/functions/_shared/revenueReportHtml.ts`, screenshot CSS block (`figure.shot`, `figure.shot .frame`, `figure.shot img`):
  - `.frame`: drop the fixed `height`, keep `width: 100%`, add `max-height` (120mm default, 110mm two-up, 232mm for `.one-up.full-page`) so it caps rather than sizes.
  - `figure.shot img`: `width: 100%`, `height: auto`, `max-height: 100%`, `object-fit: contain` — full width first, height capped second.
- No markup, schema, data, or edge-function logic changes; existing runs render correctly on the next draft rebuild.
- Verify by rebuilding the Torburnlea Homestead draft and comparing the Booking.com / Expedia / additional-slide pages for equal image widths and no page bleed.
