

# Portfolio Branding Editor + Domain-Aware Embed Branding

## Problem

1. **No branding editor**: The portfolio create/edit dialog only has Name, Slug, and Property Picker — no way to set logo, colors, or fonts
2. **Embed ignores portfolio branding**: `EmbedPortfolio.tsx` reads `brand_color` from URL params only (defaulting to `#2563eb`), not from the portfolio's stored `metadata.branding`
3. **Cross-brand portfolios**: When navigating from portfolio to a property embed, the portfolio-level `brandColor` is passed — but if properties have their own branding, the property's colors should take precedence

## Design

The `property_portfolios.metadata` JSONB column already exists. Store branding under `metadata.branding`:

```json
{
  "branding": {
    "primary_color": "#F5A623",
    "secondary_color": "#1B7FAD",
    "font_color": "#333333",
    "logo_url": "https://...",
    "heading_font": "Playfair Display",
    "body_font": "Lato"
  }
}
```

No schema changes needed.

## Changes

### 1. `src/pages/admin/AdminPortfolios.tsx`
- Add state for branding fields: `brandPrimaryColor`, `brandSecondaryColor`, `brandFontColor`, `brandLogoUrl`
- Add a "Branding" section to `PortfolioFormFields` with color inputs and logo URL input
- On create/save, merge branding into `metadata.branding` JSONB
- On edit open, populate branding state from `portfolio.metadata?.branding`
- Update Portfolio interface to include `metadata`

### 2. `src/pages/EmbedPortfolio.tsx`
- After fetching portfolio data (both API and fallback paths), read `portfolio.metadata?.branding` and use as defaults when URL params are absent
- Pass portfolio branding (logo, colors) to the header
- In `handleViewProperty`: pass the **property's own** `brand_primary_color` (already fetched in the properties query) instead of the portfolio-level color, so each property embed gets its own branding. Fall back to portfolio color if property has none.

### 3. `supabase/functions/booking-portfolio-api/index.ts`
- Already returns `portfolio.metadata` — just ensure the response includes it in a usable shape (currently does via `branding: portfolio.metadata?.branding`)
- Add `brand_primary_color` to each property in the response (already selected on line 63)

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/admin/AdminPortfolios.tsx` | Add branding fields (colors, logo) to create/edit dialog, persist to `metadata.branding` |
| Modify | `src/pages/EmbedPortfolio.tsx` | Read portfolio branding from metadata, use property-level colors when navigating to individual properties |
| Modify | `supabase/functions/booking-portfolio-api/index.ts` | Ensure `brand_primary_color` is passed per-property in response |

