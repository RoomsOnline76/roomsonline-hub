# Fix brand-color leakage between canonical and white-label embeds

## Problem confirmed

Visiting `https://rolos.co.za/jongensfontein-com/` (WordPress plugin page) shows a mix: some white-label areas render in ROL pink and some canonical areas render in the property's blue. Two independent leaks cause this:

1. **`src/pages/EmbedProperty.tsx` line 222-224** — the renderer *always* falls back to `property.brand_primary_color` / `brand_font_color` / `brand_logo_url` when no query param is present. So a canonical URL (no `wl=1`, no `brand_color`) still paints itself in the property's blue.

2. **Cookbook snippet generators** — `WidgetTab.tsx`, `PortfolioWidgetTab.tsx`, `DirectLinkTab.tsx`, `WidgetSetupWizard.tsx`, and `SmartBookButtonGenerator.tsx` all inject `brand_color=<property blue>` (and often `brand_logo`) into the URL *regardless* of whether white-label is enabled. So even the "canonical" copy-paste snippet ships blue chrome to third-party sites.

Combined, the WordPress plugin page ends up with canonical URLs that carry blue query params, plus white-label frames that sometimes inherit ROL pink defaults where the property brand isn't explicitly forwarded.

## Contract we want

- **Canonical** (no `wl=1`): ROL pink (`#E91E8C`), ROL logo/chrome, no property brand color/logo/font. This is the public marketing surface on `rolos.co.za`, `book.roomsonline.co.za`, etc.
- **White-label** (`wl=1` or on a verified WL host): full property brand — `brand_primary_color`, `brand_font_color`, `brand_logo_url` — with "Powered by ROL'OS" hidden.

## Changes

### 1. `src/pages/EmbedProperty.tsx`
- Compute `isWhiteLabelContext = isFullWhiteLabel || !!brandColorParam || !isCanonicalHost(window.location.host)` (canonical hosts = `rolos.co.za`, `roomsonline.co.za`, `book.roomsonline.co.za`, `*.lovable.app`).
- Only fall back to `property.brand_primary_color / brand_font_color / brand_logo_url` when `isWhiteLabelContext` is true. In canonical mode, force `brandColor = "#E91E8C"`, `fontColor = "#FFFFFF"`, `logoUrl = null`.
- Apply the same rule to the two downstream places that re-forward `brand_color` into checkout URLs (lines ~654 and ~942).

### 2. Cookbook snippet generators — snippets must match the mode
Update each so that when `wl.enabled === false`:
- Drop `brand_color`, `brand_logo`, `brand_secondary_color`, `brand_font_color` from the generated URL/attributes.
- Drop the `data-brand-color` / `data-brand-logo` attributes from `<div class="rol-booking-widget">` markup.
- Keep only the property/portfolio slug + `integration=` tag.

And when `wl.enabled === true`:
- Include all brand params + `wl=1&hide_powered_by=1` (already done, keep as-is).
- Include `data-white-label="true"` and, when a verified WL host exists, `data-wl-host`.

Files:
- `src/components/integrations/WidgetTab.tsx`
- `src/components/integrations/WidgetSetupWizard.tsx`
- `src/components/integrations/PortfolioWidgetTab.tsx` (line 85 embedUrl + line 95 previewUrl + snippet builder)
- `src/components/integrations/DirectLinkTab.tsx`
- `src/components/integrations/SmartBookButtonGenerator.tsx`

### 3. `public/rol-embed.js` / `public/rol-sdk.js`
- When the host script sees no `data-white-label` and no explicit `data-brand-color`, do not forward a brand color at all — let the embed page apply the canonical ROL pink.
- When `data-white-label="true"` and no `data-brand-color` is provided, fetch the property's brand from the API response (the embed already does this) — do not force any color on the URL from the parent script.

### 4. Cookbook copy — `src/components/integrations/IntegrationDocumentation.tsx`
- Add an explicit "Canonical vs White-label" callout above the snippet blocks explaining: canonical snippets render ROL pink; white-label snippets require WL to be enabled on the property (and, when applicable, a verified WL domain) to render the property's brand.
- Refresh the example URLs (`/embed/property/...`, `/embed/portfolio/...`, `?wl=1&hide_powered_by=1`) so the visible example strings match what the generators now emit.
- Update the WordPress plugin section to note that `[rolos_booking]` / `[rolos_portfolio_booking]` inherit the property's WL configuration automatically — no manual `brand_color=` needed in the shortcode.

### 5. Verification against `https://rolos.co.za/jongensfontein-com/`
After the fix, drive Playwright to:
1. Open the canonical embed URL for `jongensfontein` with no params → assert computed background/CTA color starts with `#e91e8c` (ROL pink) and `Powered by ROL'OS` is visible.
2. Open the WL URL (`?wl=1&brand_color=<property blue>`) → assert CTA renders the property blue and `Powered by ROL'OS` is hidden.
3. Screenshot both for the user.

## Out of scope
- No DB schema changes.
- No changes to `property_billing_configs` / white-label domain verification flow.
- No visual redesign — only color/logo source-of-truth fixes and cookbook copy refresh.
