# TOBI Utilities fixes + amenity scouting with vision

Four changes, all inside the TOBI tooling surface.

## 1. Back navigation on TOBI Utilities

The TOBI Utilities page renders as a standalone route (no admin sidebar around it), so there is currently no way back to the menu. Add the same header back control the Billing Defaults page uses: a ghost arrow button that returns to the previous screen, plus a "Back to Admin" link so a cold-loaded page still has an exit.

## 2. Integration asset generator fails with a non-2xx error

Confirmed root cause: `generate-integration-assets` selects a `location` column from `properties`, and that column does not exist on the table. The select errors, the function treats it as "Property not found" and returns 404.

Fix:
- Drop the non-existent column from the select and build the location string from the columns that do exist (city / country / address).
- Return the real database error message instead of masking every failure as "Property not found".
- On the page, surface the function's error body (not just the generic "non-2xx" wrapper) so future failures name themselves.

## 3. Bulk editorial belongs on the ROL Spec tab

Move the editorial generation trigger out of TOBI Utilities into the ROL Spec tab of Edit Property, scoped to the property being edited:
- Extend `bulk-editorial-generate` to accept an optional property scope and an "overwrite existing copy" flag. With no scope it keeps today's behaviour (all active properties missing editorial copy), so nothing existing breaks.
- Add a "Run TOBI editorial" action to the ROL Spec tab that generates the five editorial fields for the current property, shows progress, and writes the returned copy into the form fields for review before save.
- On TOBI Utilities, keep the estate-wide run but relabel it clearly as the bulk/backfill job.

## 4. Amenity scouting should also read the images

Today the TOBI amenity check only uses the property record plus a website crawl; the image consistency check is a separate tool. Merge them:
- `ai-amenity-suggester` will also load the property's images, run them through the existing vision detection path, and pass the detected visual features into the suggestion prompt as additional evidence.
- Suggestions backed by an image get a distinct "seen in photos" marker in the results dialog so the reviewer knows where the evidence came from.
- Image analysis is best-effort: if it fails or there are no images, the check still completes on text evidence alone.

## Technical notes

- `supabase/functions/generate-integration-assets/index.ts` — fix the `properties` select, propagate real errors.
- `supabase/functions/bulk-editorial-generate/index.ts` — optional `property_ids` + `overwrite`, return generated content per property.
- `supabase/functions/ai-amenity-suggester/index.ts` — fetch images, reuse the vision detection prompt from `validate-images-against-data`, feed features into the catalogue prompt, tag suggestions with `evidence: "image"`.
- `src/pages/AdminTobiTools.tsx` — back button, error surfacing, relabel bulk editorial.
- `src/components/property/ROLSpecTab.tsx` — per-property editorial run.
- `src/components/property/AiAmenityDialog.tsx` — render image-evidence badges.
