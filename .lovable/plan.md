

# Fix Email Template Preview — Missing Brand Colors, Logo & Layout

## Problem

The `EmailTemplatePreview` component supports `brandColors`, `logoUrl`, and `propertyName` props, but **neither caller passes them**:

1. **PMSMessaging.tsx** (line 465-468): Passes only `subject` and `bodyHtml` — no brand data fetched at all
2. **ExperienceEmailDesigner.tsx** (line 249-254): Passes `brandColors` and `logoUrl` from `rolos_experience_configs`, but the property may store branding on the `properties` table directly (columns `brand_primary_color`, `brand_logo_url`, etc.), so this query can return null. Also missing `propertyName`.

Result: preview always renders with fallback dark navy header (#1a1a2e), no logo, and "Sample Property" instead of the real property name.

## Fix

### PMSMessaging.tsx
- Add a `useQuery` to fetch the property's brand fields (`brand_primary_color`, `brand_secondary_color`, `brand_font_color`, `brand_logo_url`, `name`) from the `properties` table using `pid`
- Pass `brandColors`, `logoUrl`, and `propertyName` to `EmailTemplatePreview`

### ExperienceEmailDesigner.tsx
- Add a secondary query (or extend existing) to also read brand fields from the `properties` table as a fallback when `rolos_experience_configs` brand_kit has no colors
- Merge: prefer `rolos_experience_configs` values, fall back to `properties` table values
- Pass `propertyName` (from the same properties query)

### EmailTemplatePreview.tsx
- No structural changes needed — already supports all props
- Minor improvement: add a proper email template layout with footer showing property name and secondary color accent

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/pms/PMSMessaging.tsx` | Fetch property brand data, pass to EmailTemplatePreview |
| Modify | `src/components/property/ExperienceEmailDesigner.tsx` | Fetch properties table as fallback for brand data, pass propertyName |

