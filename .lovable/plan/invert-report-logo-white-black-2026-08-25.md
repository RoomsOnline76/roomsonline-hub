# Invert report logo (white ↔ black)

White logos disappear on the ivory/white report pages. Add a per-property switch that flips the logo's tones so it prints legibly.

## What changes

**Revenue Reports → property settings ("Capacity & branding")**
- New switch: **Invert logo colours (for white logos)**, sitting next to the resolved-brand preview.
- The preview logo in that card renders with the inversion applied, so the setting is visually confirmed before saving.
- The switch applies to whichever logo the branding source resolves to (property brand, custom upload, or none), and is saved with the rest of the settings.

**Draft visual report**
- When the switch is on, the logo in the page header and on the cover page prints inverted (white marks become black, dark marks become white), everything else untouched.
- Off by default, so existing reports look exactly as they do today.

## Technical notes

- Migration: add `logo_invert boolean not null default false` to `property_report_settings` (existing table, no grant/RLS change).
- `usePropertyReportSettings.ts`: read/write `logoInvert` on `PropertyReportSettings`.
- `ReportsPropertySettings.tsx`: `logoInvert` state, shadcn `Switch`, preview `<img>` gets `style={{ filter: "invert(1) hue-rotate(180deg)" }}` when on; included in the save payload.
- `supabase/functions/revenue-report-draft/index.ts`: select `logo_invert` and pass it through the branding object.
- `supabase/functions/_shared/revenueReportHtml.ts`: add `logoInvert: boolean` to the branding type, thread it into `pageChrome()` and the cover logo, and emit `class="logo logo-invert"` with a `.logo-invert { filter: invert(1) hue-rotate(180deg); }` rule in the print stylesheet.
- Redeploy `revenue-report-draft` so new drafts pick it up.
