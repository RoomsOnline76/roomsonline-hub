

# Multi-Property Portfolio Widget — Book/Widget/API Access

## Problem
All current booking widgets, embed snippets, and API endpoints are **single-property scoped** — each `<div data-rolos-property="slug">` targets exactly one property. There is no way for an owner with multiple properties (or a portfolio group spanning multiple PMS systems) to embed a **single portal widget** that lists all their properties together with search, filtering, and per-property booking — the kind of experience a hotel group or vacation rental management company needs on their website.

## Solution
Create a **Portfolio Widget** layer across all integration surfaces — a new embed page, a new `rol-embed.js` attribute, a new API endpoint, and admin UI to configure and generate portfolio snippets.

```text
┌──────────────────────────────────────┐
│ Owner's Website                      │
│ <div data-rolos-portfolio="my-group" │
│      data-brand-color="#xxx">        │
└──────────────┬───────────────────────┘
               │ iframe
               ▼
┌──────────────────────────────────────┐
│ /embed/portfolio/:portfolioSlug      │
│ Property grid → filter → select     │
│ → redirects to /embed/property/:slug │
│   for individual booking             │
└──────────────┬───────────────────────┘
               │ Supabase
               ▼
┌──────────────────────────────────────┐
│ property_portfolios                  │
│ property_portfolio_members           │
│ properties (any PMS)                 │
└──────────────────────────────────────┘
```

## Changes

### 1. Create `EmbedPortfolio.tsx` — Multi-property embed page
New route: `/embed/portfolio/:portfolioSlug`
- Fetches portfolio by slug → gets member properties with images, city, rates, room counts
- Renders a filterable, branded grid of property cards (hero image, name, city, starting rate, "View & Book" button)
- Search bar + city filter dropdown
- Brand theming from URL params (same pattern as `EmbedProperty.tsx`)
- Clicking a property card navigates to `/embed/property/:propertySlug` (existing single-property embed)
- PostMessage resize protocol (same as `EmbedProperty.tsx`)
- Responsive: 1-col mobile, 2-col tablet, 3-col desktop
- Fluent design language with `framer-motion` reveals

### 2. Create `booking-portfolio-api` edge function
Public API endpoint returning portfolio metadata:
- `?portfolio=slug` → returns `{ portfolio: { name, branding }, properties: [{ slug, name, city, hero_image, starting_rate, room_count }], snippet }`
- Uses `property_portfolios` + `property_portfolio_members` + `properties` tables
- Cached 5 min (same pattern as `booking-widget-api`)

### 3. Extend `rol-embed.js` — Portfolio mode
Add support for `data-rolos-portfolio="slug"` attribute alongside existing `data-rolos-property`:
- Detects portfolio containers during scan
- Creates iframe pointing to `/embed/portfolio/:slug` with brand params
- Same resize/event protocol
- `window.RolosBooking.initPortfolio()` programmatic API

### 4. Add Portfolio route to `App.tsx`
Register `/embed/portfolio/:portfolioSlug` → `EmbedPortfolio`

### 5. Database migration — Add `slug` to `property_portfolios`
The table already has a `slug` column. Add a migration to ensure portfolios have auto-generated slugs (same pattern as `set_property_slug` trigger).

### 6. Create `PortfolioWidgetTab.tsx` — Admin configurator
New integration tab component for portfolio-level widgets:
- Portfolio selector dropdown (from `property_portfolios`)
- Brand color picker + logo URL
- Layout options (grid/list)
- Live preview in `WidgetPreviewFrame`
- Code snippet generator for `data-rolos-portfolio` and iframe fallback
- "Test in New Tab" button

### 7. Add "Portfolio" tab to integration pages
Add a 9th tab to both `PropertyFormIntegrationsTab.tsx` and `PMSIntegrations.tsx`:
- Icon: `Building2`
- Label: "Portfolio"
- Renders `PortfolioWidgetTab` with the current property's portfolio context

### 8. Extend `PortfolioManager.tsx` — Slug management
Add slug field (auto-generated from name, editable) to portfolio creation dialog so portfolios are addressable via the embed URL.

## Files Summary

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/pages/EmbedPortfolio.tsx` | Multi-property embed page with filterable grid |
| Create | `supabase/functions/booking-portfolio-api/index.ts` | Public portfolio metadata API |
| Create | `src/components/integrations/PortfolioWidgetTab.tsx` | Admin portfolio widget configurator |
| Modify | `public/rol-embed.js` | Add `data-rolos-portfolio` support |
| Modify | `src/App.tsx` | Add `/embed/portfolio/:portfolioSlug` route |
| Modify | `src/components/property/PropertyFormIntegrationsTab.tsx` | Add Portfolio tab |
| Modify | `src/pages/pms/PMSIntegrations.tsx` | Add Portfolio tab |
| Modify | `src/components/portfolio/PortfolioManager.tsx` | Add slug field to creation |
| Migration | SQL | Add slug trigger for `property_portfolios` |

## Result
Owners with multiple properties across any combination of PMS systems can embed a single branded portal widget on their website — visitors browse all properties, filter by city, and book directly. Works via one-line snippet (`data-rolos-portfolio`), iframe, API, WordPress, and Elementor.

