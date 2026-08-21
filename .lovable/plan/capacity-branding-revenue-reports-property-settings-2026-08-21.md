# Capacity & branding — Revenue Reports property settings

Make the "Capacity & branding" card work off real ROL data instead of hand-typed URLs and numbers.

## What changes

**1. Upload files instead of pasting URLs**
- Report logo and cover artwork get drag/click upload zones with an inline preview and a Remove button.
- Files go to the existing public `property-images` bucket under `reports/{propertyId}/logo-…` and `reports/{propertyId}/cover-…`, so the stored URL keeps working inside the Excel workbook and the printed report pack (the `revenue-reports` bucket is private, so it can't serve images to the report renderer).
- Manual URL entry stays available as a fallback for externally hosted artwork.
- Cover artwork must clear the project minimum of 1024×683px; logos are exempt from the size rule.

**2. Sellable rooms pulled from ROL property data**
- The field pre-fills from the property's own inventory the first time settings are opened and no room count has been saved: count of the property's rooms, falling back to its room types, then to its bedroom count.
- A small "Use ROL inventory (N)" action next to the field lets the user re-sync at any time, and a hint line shows where the number came from. The value stays editable and saved — reports never silently change capacity behind a saved figure.

**3. Branding source switch**
- New toggle: **Property branding** vs **Rooms Online default**.
- Property branding: colours and logo are read from the property's brand fields and shown read-only with swatches; blanks fall back to the ROL defaults.
- Rooms Online default: pink `#E91E8C` / charcoal `#1A1A2E`.
- A third state, **Custom**, keeps the existing per-report colour pickers and uploaded logo for cases where the report should differ from the property site.
- Whatever the mode resolves to is written into the saved settings, so the Excel and draft-report edge functions need no change.

**4. Small fix**
- The card currently renders the "Report logo URL" field twice; the duplicate goes away.

## Technical notes

- Migration: add `brand_source text not null default 'custom'` (allowed: `property` | `rol` | `custom`) to `property_report_settings`; no new table, so grants/RLS are unchanged.
- `usePropertyReportSettings` gains `brandSource` on read and write.
- New `src/hooks/useReportPropertyBrand.ts` — reads `brand_override_enabled`, `brand_primary_color`, `brand_secondary_color`, `brand_logo_url` plus inventory counts (`rolos_rooms`, `rolos_room_types`, `bedrooms`) for one property.
- New `src/lib/reportBranding.ts` — `ROL_DEFAULT_BRAND` constants and `resolveReportBrand(source, propertyBrand, custom)` returning `{ logoUrl, primary, secondary }`; used by the settings screen so what is saved equals what the report renders.
- New `src/components/reports/BrandAssetUpload.tsx` — reusable upload/preview/remove zone, validating type and size and calling `getPublicUrl` after upload.
- `ReportsPropertySettings.tsx` is rewired to the above; capacity/baseline logic and the save flow stay as they are.
