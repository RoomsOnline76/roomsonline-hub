

# Phase 2: Full BrandKit System

## Overview

Add custom font support to the branding system. Properties can select any Google Font for headings and body text. The experience-engine serves the brand_kit config, and both the public booking flow (`useBrandOverride`) and PMS interface (`PMSBrandContext`) automatically load and apply the chosen fonts via CSS custom properties — zero changes to the booking engine itself.

## 1. Database Migration

Add font columns to the `properties` table:

```sql
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS brand_heading_font text,
  ADD COLUMN IF NOT EXISTS brand_body_font text;
```

These store Google Font family names (e.g. `"Playfair Display"`, `"Inter"`). Null = use system default.

## 2. BrandingTab UI — Font Picker

**File**: `src/components/property/BrandingTab.tsx`

Add a new "Typography" card below Brand Colours with two font picker fields:

- **Heading Font** — text input with autocomplete/search against Google Fonts API (`https://www.googleapis.com/webfonts/v1/webfonts?key=...&sort=popularity`). Since we don't want to require an API key on the client, use a simpler approach: a combobox with a curated popular list (~50 fonts) PLUS a free-text input that accepts any Google Font name. The preview card renders the chosen font live by injecting a `<link>` tag.
- **Body Font** — same pattern.

Both fields save to `brand_heading_font` / `brand_body_font` on the property record.

Update `BrandingData` interface to include `brand_heading_font` and `brand_body_font`.

Update `FontPreviewCard` to apply the selected fonts in the preview so admins see real-time rendering.

**New component**: `src/components/property/GoogleFontPicker.tsx`
- Combobox with ~50 popular Google Fonts pre-loaded (Playfair Display, Lora, Merriweather, Montserrat, Inter, Poppins, Raleway, etc.)
- Free-text "Custom font name" option for any Google Font not in the list
- On selection, injects `<link href="https://fonts.googleapis.com/css2?family=FontName:wght@400;600;700&display=swap">` into `<head>` for live preview
- Debounced to avoid spamming font loads

## 3. Font Loading Utilities

**New file**: `src/lib/brandFonts.ts`

```typescript
export function loadGoogleFont(fontFamily: string): void
// Injects <link> into <head> if not already present
// Uses fonts.googleapis.com/css2 URL format

export function applyBrandFonts(headingFont?: string | null, bodyFont?: string | null): () => void
// Sets CSS custom properties:
//   --font-heading: 'Playfair Display', serif
//   --font-body: 'Inter', sans-serif
// Returns cleanup function
```

## 4. Extend PropertyBrand & Brand Override System

**File**: `src/lib/brandOverride.ts`

- Add `headingFont?: string | null` and `bodyFont?: string | null` to `PropertyBrand` interface
- In `buildBrandVarsMap`, add `--font-heading` and `--font-body` CSS vars when fonts are set
- In `applyBrandToDocument`, call `loadGoogleFont()` for each configured font before setting vars

**File**: `src/hooks/useBrandOverride.ts`

- Fetch `brand_heading_font` and `brand_body_font` alongside existing color columns
- Include them in the `PropertyBrand` object saved to session

**File**: `src/contexts/PMSBrandContext.tsx`

- Add `headingFont` and `bodyFont` to `PMSBrandData` interface
- Fetch the two new columns in the property query
- In `applyPmsBrand`, load Google Fonts and set `--font-heading` / `--font-body` CSS vars

## 5. CSS Integration

**File**: `src/index.css` (or tailwind config)

Add font-family fallback using CSS custom properties:

```css
h1, h2, h3, h4, h5, h6, .font-heading {
  font-family: var(--font-heading, var(--font-serif, ui-serif, Georgia, serif));
}

body, .font-body {
  font-family: var(--font-body, var(--font-sans, ui-sans-serif, system-ui, sans-serif));
}
```

This means when `--font-heading` / `--font-body` are not set, everything falls back to system defaults. When a property sets fonts, they cascade everywhere automatically.

## 6. Experience Engine — brand_kit Handler

**File**: `supabase/functions/experience-engine/index.ts`

The existing `brand_kit` route already falls through to `resolveExperienceConfig`. Enhance it to also return the property's font config from the properties table alongside the experience config:

```typescript
if (experience_type === 'brand_kit') {
  const { data: property } = await supabase
    .from('properties')
    .select('brand_heading_font, brand_body_font, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url')
    .eq('id', property_id)
    .single();
  
  const config = await resolveExperienceConfig(supabase, property_id, 'brand_kit');
  result = { config, fonts: { heading: property?.brand_heading_font, body: property?.brand_body_font }, colors: { ... } };
}
```

## 7. PropertyForm Save Integration

**File**: `src/pages/PropertyForm.tsx`

- Add `brand_heading_font` and `brand_body_font` to the branding state object
- Load them from the property record on fetch
- Save them alongside existing brand fields on form submit

## 8. Session Storage for FOUC Prevention

Extend the `index.html` inline script (FOUC prevention) to also load Google Fonts synchronously from the cached brand data. The `PropertyBrand` session object will now include font names, so the inline script can inject `<link>` tags before React mounts.

## Files

| Action | File |
|--------|------|
| Migration | Add `brand_heading_font`, `brand_body_font` columns to `properties` |
| Create | `src/components/property/GoogleFontPicker.tsx` — font selection combobox |
| Create | `src/lib/brandFonts.ts` — Google Font loading + CSS var application |
| Modify | `src/components/property/BrandingTab.tsx` — add Typography card with font pickers |
| Modify | `src/lib/brandOverride.ts` — extend PropertyBrand, buildBrandVarsMap with font vars |
| Modify | `src/hooks/useBrandOverride.ts` — fetch font columns, include in session |
| Modify | `src/contexts/PMSBrandContext.tsx` — fetch + apply fonts in PMS context |
| Modify | `src/pages/PropertyForm.tsx` — load/save font fields |
| Modify | `src/index.css` — add CSS custom property font-family rules |
| Modify | `supabase/functions/experience-engine/index.ts` — enhance brand_kit handler |
| Modify | `index.html` — extend FOUC script for font preloading |

## Rollout

- Fonts default to null (system fonts) — zero visual change for existing properties
- PMSBrandContext and useBrandOverride automatically pick up fonts when set
- No changes needed in Booking.tsx, PropertyShowcase.tsx, or any page component — CSS custom properties cascade everywhere

