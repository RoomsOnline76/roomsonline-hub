

# Fix Portfolio Map: Greyscale, Label Alignment & Attraction Details

## Issues

1. **Map not greyscale**: The `mapId: 'portfolio-map'` on line 65 overrides the `styles` array — cloud-based map IDs take precedence over JSON styling. Removing `mapId` will let the greyscale `mapStyles` apply.

2. **Property labels centered on pin**: The label `AdvancedMarkerElement` uses `align-items:center` and shares the exact pin position. Fix: use `align-items:flex-start` on the wrapper and add a left offset so the label floats to the right of the pin instead of centered below it.

3. **Attraction legend is name-only**: The legend and InfoWindows show just the place name. Enhance by showing `vicinity` (location context) in the legend row, and adding the place types/category as a brief descriptor in both the legend and InfoWindow.

## Changes — `src/components/embed/EmbedPortfolioMap.tsx`

### 1. Remove `mapId` to enable greyscale styles
Delete `mapId: 'portfolio-map'` from the Map constructor (line 65). The existing `styles: mapStyles` will then apply the greyscale theme.

### 2. Left-align property labels
- Change the label wrapper from `align-items:center` to `align-items:flex-start`
- Add `transform:translate(18px, -16px)` so the label pill sits to the right of the pin, not centered on it
- Add a small left-pointing arrow/nub on the label pill via a CSS border-triangle pseudo-element (or just offset cleanly)

### 3. Enrich attraction details
- **InfoWindow**: Add `vicinity` line and a brief type description (from `place.types` — map to human-readable like "Popular attraction", "Local restaurant")
- **Legend below map**: Show `vicinity` text next to each attraction name, and on tooltip show the full detail including type category
- Use Google Places `types` array to generate a short "what" blurb (e.g., "Natural feature", "Point of interest", "Restaurant & café")

## Files to Change

| File | Change |
|------|--------|
| `src/components/embed/EmbedPortfolioMap.tsx` | Remove `mapId`; left-align labels with offset; enrich attraction InfoWindows and legend with vicinity/type details |

