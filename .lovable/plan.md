
## Problem

In cookbook v5 the portfolio-scoped sections still leak white-label branding into the "Canonical" variant:

- §3 Portfolio Iframe Embed — canonical renders blue
- §4 rol-embed.js Portfolio Widget — canonical renders blue
- §6 WordPress Portfolio Shortcode — canonical renders blue

Two independent bugs cause this:

1. **Portfolio embed page ignores `wl=1`.** In `src/pages/EmbedPortfolio.tsx` (line 119) the resolved brand color is:
   ```ts
   const brandColor = urlBrandColor || portfolioBranding.primary_color || "#2563eb";
   ```
   When a canonical URL is opened (no `brand_color`, no `wl=1`), the page still auto-applies the portfolio's own branding — so canonical always looks like WL. The property-level `EmbedProperty` already gates this on `wl=1`; `EmbedPortfolio` does not.

2. **`PortfolioWidgetTab.tsx` emits a single snippet.** For iframe (§3) and `rol-embed.js` (§4) it emits one URL/div; when `wl.enabled` is true both the "Canonical" and "White-label" copies in the cookbook end up with the WL parameters (or neither, but the embed page then applies portfolio branding — see bug 1). The WP portfolio shortcode (§6) is already split in `WordPressTab.tsx`, but the rendered result still leaks because of bug 1.

## Changes

### 1. `src/pages/EmbedPortfolio.tsx` — gate portfolio branding on `wl=1`

Read `wl` from the URL and only apply portfolio/URL brand overrides when it is set. Canonical (no `wl`) always renders ROL pink `#E91E8C`, matching the property-level embed contract.

```ts
const wlActive = searchParams.get("wl") === "1";
const ROL_PINK = "#E91E8C";
const brandColor = wlActive
  ? (urlBrandColor || portfolioBranding.primary_color || ROL_PINK)
  : ROL_PINK;
const brandSecondaryColor = wlActive
  ? (portfolioBranding.secondary_color || brandColor)
  : ROL_PINK;
const brandLogo = wlActive
  ? (urlBrandLogo || portfolioBranding.logo_url || null)
  : null;
```

Also propagate `wl=1` on any internal navigation (e.g. the `params.set("brand_color", …)` at line ~490) so click-throughs from a WL portfolio into a property retain WL context, and canonical clicks stay canonical.

### 2. `src/components/integrations/PortfolioWidgetTab.tsx` — emit dual snippets

Split every generated URL/snippet into a **Canonical** and (when `wl.enabled`) a **White-label** variant. The canonical variant must never carry `wl=1`, `brand_color`, `brand_logo`, `data-brand-*`, `data-white-label`, or `data-wl-host`. The WL variant carries all of them and points at the verified WL host when active.

Concretely:

- Compute `canonicalEmbedUrl` (host = `PUBLIC_DOMAIN`, params = `?layout=…` only) and `wlEmbedUrl` (host = `wlHost`, params = layout + brand_color + brand_logo + `wl=1&hide_powered_by=1`).
- Compute `canonicalDirectPortfolioUrl` and `wlDirectPortfolioUrl` the same way.
- Compute `canonicalSnippetDiv` (bare `data-rolos-portfolio="…"` + optional `data-layout`) and `wlSnippetDiv` (adds `data-brand-color`, optional `data-brand-logo`, `data-white-label="true"`, optional `data-wl-host`).
- Compute `canonicalIframeSnippet` and `wlIframeSnippet` from the respective URLs.
- Render two `WidgetPreviewFrame`s side-by-side (Canonical + White-label), each using its own URL, mirroring the property-level Widget/Booking-bar tabs. Only show the WL preview/snippet when `wl.enabled`.

No business-logic changes — this is presentation-layer only, aligned with the branding contract already applied to `WidgetTab`, `BookingBarTab`, `DirectLinkTab`, `SmartBookButtonGenerator`.

### 3. Cookbook v6

Regenerate `/mnt/documents/rolos-integrations-cookbook-jongensfontein-v6.docx` after the code fixes so sections 3, 4, and 6 preview correctly (Canonical = ROL pink, WL = property blue). Add a "Fixed in v6" callout describing the portfolio branding gate.

## Verification

- Open `PUBLIC_DOMAIN/embed/portfolio/jongensfontein?layout=grid` → renders ROL pink.
- Open `PUBLIC_DOMAIN/embed/portfolio/jongensfontein?layout=grid&brand_color=%232563eb&wl=1` → renders blue.
- Portfolio tab in `/admin/edit property` and `/rolos` shows two labelled previews with correct colors and two copy blocks per snippet type.
- Cookbook v6 §3/§4/§6 previews match the branding contract.

## Files

- `src/pages/EmbedPortfolio.tsx` (branding gate)
- `src/components/integrations/PortfolioWidgetTab.tsx` (dual snippet + dual preview)
- `/mnt/documents/rolos-integrations-cookbook-jongensfontein-v6.docx` (new)

No DB, no edge-function, no API changes.
