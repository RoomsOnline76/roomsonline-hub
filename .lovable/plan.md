

# Show Active Specials on Portfolio Embed Page

## Problem
Properties in a portfolio may have active specials (e.g., "Pensioners Special — 40% off" on Dassiesingel), but the portfolio embed page (`/embed/portfolio/:slug`) has no awareness of specials. Visitors see no indication of deals.

## Solution
Add a "Specials" banner section to the portfolio page that fetches active, public specials for all member properties and displays them prominently.

### Data Flow
1. **Edge function** (`booking-portfolio-api`): Add a query to `property_specials` for all member `propertyIds` where `is_active = true`, `is_public = true`, and `valid_to >= today`. Return as a `specials` array in the response, each with property name/slug attached.
2. **Fallback path** (direct DB in `EmbedPortfolio.tsx`): Same query as a client-side fallback after properties load.

### UI — Specials Banner
Position: Between the header/filters and the property grid (or between the AI Featured Banner and filters).

Layout:
```text
┌─────────────────────────────────────────────┐
│ 🏷️ Special Offers                          │
│ ┌──────────────┐  ┌──────────────┐          │
│ │ 40% Off      │  │ Winter Deal  │          │
│ │ Pensioners   │  │ Fonteinhutte │          │
│ │ Dassiesingel │  │ Valid: Jun…  │          │
│ │ [View & Book]│  │ [View & Book]│          │
│ └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────┘
```

- Horizontal scrollable row of cards (or 2-col grid on desktop)
- Each card shows: special name, discount summary (e.g., "40% off"), property name, validity dates, and a "View & Book" button linking to that property's embed
- Branded with `brandColor` accent
- Section hidden when no active public specials exist
- Also show a small "Special" badge on the property card itself if that property has an active special

### Property Card Badge
On property cards that have specials, overlay a small tag (e.g., "🏷️ Special") next to or below the rate badge in the image area.

## Files to Change

| File | Changes |
|------|---------|
| `supabase/functions/booking-portfolio-api/index.ts` | Query `property_specials` for active+public specials; include in response as `specials` array with property name/slug |
| `src/pages/EmbedPortfolio.tsx` | Add specials state; render specials banner section; add special badge on property cards; fallback fetch |

