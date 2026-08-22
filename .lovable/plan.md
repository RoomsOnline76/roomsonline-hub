# Revenue report cover: real logos and uncropped property image

Three fixes to the cover page of the draft visual report.

## 1. Real ROL wreath instead of the "(ROL)" text badge

The circled "(ROL)" on the cover (and in each page header) is a CSS fallback badge, not a logo. Replace it with the ROL laurel-wreath mark rendered in solid black, so it reads as a proper brand mark next to "roomsonline".

- A black version of the existing wreath mark is prepared as a CDN asset and referenced by URL in the report HTML (the report is built in an edge function, so it cannot import project assets).
- The wreath prints when the property has no report logo of its own; where a property logo is set, the property logo stays as today and the wreath sits as the ROL mark alongside it.

## 2. Property image no longer cropped

The cover artwork is currently drawn as a fixed-height band with `background-size: cover`, which crops the sides/top of tall or wide artwork (visible on the Torburnlea sketch). It becomes a contained image on a clean ivory field: the whole artwork is always visible, centred, with the band height allowed to flex within A4 limits. No stretching, no crop.

## 3. "Revenue Review" with the roomsonline strapline logo right-aligned

The title block becomes a single row:

```text
Revenue                              roomsonline
Review                        STRATEGIZE. OPTIMIZE. MAXIMIZE
------
```

The `roomsonline / STRATEGIZE. OPTIMIZE. MAXIMIZE` logo is added as a CDN asset and placed right-aligned, baseline-aligned with the title, filling the empty right half of the cover. It scales down on narrow print widths and never overlaps the title.

## Technical notes

- New assets: `src/assets/rol-wreath-black.png.asset.json` (black recolour of `rol-wreath-logo.jpg`, transparent background) and `src/assets/roomsonline-strapline.png.asset.json` (from the supplied artwork), both created with `lovable-assets` so no binaries enter the repo.
- `supabase/functions/_shared/revenueReportHtml.ts`:
  - add the two absolute asset URLs as constants; swap the `.wreath` span for an `<img class="wreath-mark">` in both `pageChrome()` and the cover block;
  - `.cover-art` switches to `background-size: contain` / `background-repeat: no-repeat` on an ivory field with a max height that keeps the cover on one page;
  - new `.cover-titlerow` flex row holding `.cover-title` and `.cover-strapline`, with the rule and property/meta lines unchanged beneath.
- No data, schema or Excel changes; `revenue-report-draft` is redeployed so the new cover renders.

## Verification

Regenerate the draft for the current Torburnlea run, print to PDF and check page 1: full artwork visible with no crop, black wreath next to "roomsonline", and the strapline logo right-aligned beside "Revenue Review" with no overlap or overflow.
