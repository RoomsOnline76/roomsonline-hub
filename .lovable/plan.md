

# Portfolio Brand Continuity to Checkout

## Problem
When a guest navigates from a portfolio page → property showcase → checkout, the brand colors change at each step. Currently `EmbedPortfolio.tsx` always passes the **property's own** `brand_primary_color` when navigating to a property (line 443). Then `EmbedProperty.tsx` passes the property's colors to checkout (line 485). The portfolio brand is lost.

## Solution

**Default behaviour**: Portfolio brand colors carry through the entire flow (portfolio → property → checkout).

**Optional override**: A new toggle in portfolio settings — `"Allow property branding override"` — when enabled, switches to the property's own brand as soon as a guest selects a specific property.

## Technical approach

### 1. Add toggle to portfolio metadata
Add `allow_property_brand_override?: boolean` to the `PortfolioBranding` interface and expose it as a Switch in `AdminPortfolios.tsx` (and `PMSBranding.tsx` portfolio view).

### 2. Pass portfolio brand through the flow

**`EmbedPortfolio.tsx` — `handleViewProperty` (line 441-464)**:
- When override is OFF (default): always pass portfolio's `brandColor` / `brandSecondaryColor` / font colors as URL params, ignoring the property's own colors.
- When override is ON: use current logic (`prop?.brand_primary_color || brandColor`).
- Add a new URL param `portfolio_brand=1` so downstream pages know to preserve portfolio branding.

**`EmbedProperty.tsx` (line 483-487)**:
- When `portfolio_brand=1` is set and brand params are already in the URL, forward those same portfolio brand params to checkout instead of overwriting with property's DB colors.

### 3. Files changed

| File | Change |
|---|---|
| `src/pages/admin/AdminPortfolios.tsx` | Add `allow_property_brand_override` toggle to portfolio form; add to `PortfolioBranding` interface |
| `src/pages/pms/PMSBranding.tsx` | Add same toggle in portfolio branding view |
| `src/pages/EmbedPortfolio.tsx` | Read toggle from portfolio metadata; conditionally pass portfolio vs property brand colors; add `portfolio_brand` URL param |
| `src/pages/EmbedProperty.tsx` | Detect `portfolio_brand` param; forward incoming brand params to checkout instead of property DB colors |

