

# Copy Branding to Other Properties

Add a "Copy Branding" modal to the Branding tab, following the same pattern as the existing `CopyChargesModal` used for Additional Charges.

## What It Does

Lets users copy their current property's branding (logo URL, primary/secondary/font colours, and brand override toggle) to one or more of their other properties in a single action. Includes a preview of what will be copied and a confirmation step.

## Changes

### 1. New component: `src/components/property/CopyBrandingModal.tsx`
- Mirrors `CopyChargesModal` structure (dialog, property list with checkboxes, select all/clear)
- Accepts current `BrandingData` and `sourcePropertyId` as props
- Fetches other properties via `owner_email` (same query pattern as charges modal)
- Shows a mini swatch preview of the colours being copied
- On confirm, updates each selected property's branding columns (`brand_logo_url`, `brand_primary_color`, `brand_secondary_color`, `brand_font_color`, `brand_override_enabled`) via Supabase
- Uses `useMutation` with toast feedback

### 2. Modify: `src/components/property/BrandingTab.tsx`
- Add a "Copy to Other Properties" button (only shown when `propertyId` exists and branding has content)
- Wire up the `CopyBrandingModal` with the current branding data
- Need to pass `ownerEmail` as a new prop (or fetch it internally from the property)

### 3. Modify: `src/pages/PropertyForm.tsx`
- Pass `ownerEmail` to the `BrandingTab` component (already available from the form's property data)

### 4. Export update: `src/components/property/index.ts`
- Export `CopyBrandingModal`

## Technical Notes
- The copy performs a direct `supabase.from('properties').update(...)` on the target property rows — no new tables or migrations needed
- RLS already allows property owners to update their own properties
- The modal fetches properties matching `owner_email` excluding the source property (same pattern as charges)

