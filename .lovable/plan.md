

# Expand Portfolio Integrations to Full Parity with Single Property

## Problem
Portfolio mode in `/pms/integrations` currently only has 4 tabs: Portfolio Widget, Direct Link, Full Embed, and Payment. Single property mode has 9 tabs. The missing tabs are: **Smart Button, Widget, Booking Bar, WordPress, Elementor, and API**.

## Solution
Expand the portfolio integration tabs to include all 9 integration types. Each tab renders per-property sections — a card per portfolio member with that property's integration component inside it — so owners can configure and copy snippets for every property from a single portfolio view.

## Changes

### `src/pages/pms/PMSIntegrations.tsx`

1. Expand the portfolio `TabsList` from 4 tabs to 9+1 (matching single property's 9, plus Payment which is portfolio-specific):
   - Smart Button, Direct Link, Widget, Booking Bar, Full Embed, WordPress, Elementor, API, Portfolio Widget, Payment

2. For each new tab content, render a per-property loop card pattern:
   ```text
   For each portfolioProperty:
     <Card>
       <CardHeader>{property.name}</CardHeader>
       <CardContent>
         <SmartBookButtonGenerator property={pp} />  // or WidgetTab, BookingBarTab, etc.
       </CardContent>
     </Card>
   ```

3. Fetch full property details (id, name, slug, brand_primary_color) for all portfolio members — the current query only fetches id/name. Add slug and brand_primary_color to the portfolio properties query so the existing integration components receive the props they need.

4. Keep the existing `PortfolioDirectLinks` and `PortfolioFullEmbed` inline components but also include the richer single-property `DirectLinkTab` / `FullEmbedTab` per property (with documentation) alongside the quick-copy portfolio summaries.

### `src/hooks/usePmsPropertyId.ts`

Ensure `portfolioProperties` includes `slug` and `brand_primary_color` fields — currently these may not be fetched. Add them to the member properties select query.

## Tab layout (Portfolio mode)

```text
Smart Button | Direct Link | Widget | Booking Bar | Full Embed | WordPress | Elementor | API | Portfolio Widget | Payment
```

Each tab (except Portfolio Widget and Payment which already work) shows a stacked list of property cards, one per portfolio member, each containing the same component used in single-property mode.

## Files to change

| File | Change |
|------|--------|
| `src/pages/pms/PMSIntegrations.tsx` | Add 6 missing tabs to portfolio mode, render per-property integration components, fetch full property details for portfolio members |
| `src/hooks/usePmsPropertyId.ts` | Add `slug`, `brand_primary_color` to portfolio member property query |

