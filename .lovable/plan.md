

# Expand Branding Palette — 7-Color System for Properties & Portfolios

## Summary

Add 4 new color fields to both property-level and portfolio-level branding, expanding from a 3-color system (Primary, Secondary, Font) to a 7-color system. This gives granular control over text hierarchy, backgrounds, and accents across the booking flow.

## New Fields

| Label | DB Column (property) | Portfolio metadata key | CSS Variable Target |
|-------|---------------------|----------------------|-------------------|
| Primary | `brand_primary_color` (exists) | `primary_color` (exists) | `--primary` |
| Secondary | `brand_secondary_color` (exists) | `secondary_color` (exists) | `--secondary` |
| Heading Text | `brand_heading_text_color` (new) | `heading_text_color` (new) | `--foreground`, `--card-foreground` |
| Body Text | `brand_body_text_color` (new) | `body_text_color` (new) | `--popover-foreground` + body text |
| Muted Text / Links | `brand_muted_text_color` (new) | `muted_text_color` (new) | `--muted-foreground` |
| Light BG / Cards | `brand_light_bg_color` (new) | `light_bg_color` (new) | `--card`, `--popover`, `--background` |
| Dark BG Accent | `brand_dark_bg_color` (new) | `dark_bg_color` (new) | `--accent`, `--sidebar` |

The existing `brand_font_color` column remains for backward compatibility but the UI will be reorganized to use the new split fields. If the new fields are empty, the system falls back to `brand_font_color` for all text colors (no breaking change).

## Changes

### 1. Database Migration
Add 4 new columns to `properties`:
- `brand_heading_text_color text`
- `brand_body_text_color text`
- `brand_muted_text_color text`
- `brand_light_bg_color text`
- `brand_dark_bg_color text`

### 2. `src/lib/brandOverride.ts`
- Add new fields to `PropertyBrand` interface: `headingTextColor`, `bodyTextColor`, `mutedTextColor`, `lightBgColor`, `darkBgColor`
- Update `buildBrandVarsMap` to map new fields to CSS variables, with fallback: if `headingTextColor` is empty but `fontColor` exists, use `fontColor` for headings

### 3. `src/pages/pms/PMSBranding.tsx`
- Add new fields to `VisualBrand` interface and `defaultVisual`
- Add 5 new `ColorField` inputs in the Brand Colours card, replacing the single "Font Colour" with the 3 text tiers + 2 background fields
- Keep "Font Colour" as a legacy fallback label or remove it in favor of the new fields
- Update save/load to persist/read the new columns
- Add the same 4 new fields to the portfolio branding state and UI section
- Update contrast check preview to show heading vs body vs muted text samples

### 4. `src/components/property/CopyBrandingModal.tsx`
- Include new columns in the copy query and update payload

### 5. Consumers (booking-portfolio-api, embed pages)
- Pass new color fields through the API response
- Map them into `PropertyBrand` when building brand override objects

## Files to Change

| File | Change |
|------|--------|
| Migration (new) | Add 5 columns to `properties` |
| `src/lib/brandOverride.ts` | Extend interface + CSS var mapping |
| `src/pages/pms/PMSBranding.tsx` | Add fields to property + portfolio branding UI |
| `src/components/property/CopyBrandingModal.tsx` | Include new columns |
| `supabase/functions/booking-portfolio-api/index.ts` | Pass new fields in API response |
| `src/pages/EmbedPortfolio.tsx` | Map new fields when applying brand |

