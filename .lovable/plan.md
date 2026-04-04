

# Fix Portfolio Map Property Markers

## Issues
1. **Label centered on pin** — the name label shares the same `position` as the pin, so they stack on top of each other
2. **Label styling is black/white** — `rgba(0,0,0,0.75)` background with white text looks dull; should use the portfolio's `brandColor`

## Changes — `src/components/embed/EmbedPortfolioMap.tsx`

### 1. Offset label below pin
Change the label's `AdvancedMarkerElement` to not sit directly on the pin. Wrap the label `div` in a container with a top margin/padding to push it visually below the pin. Since `AdvancedMarkerElement` anchors at center by default, we need to shift the label down using a wrapper with explicit offset — either via a container div with `transform: translateY(24px)` or by adjusting the label position slightly south in lat.

### 2. Style label with brandColor
Replace `background: rgba(0,0,0,0.75)` with `background: ${brandColor}` (the portfolio brand color). Keep white text. Add slight opacity (`opacity: 0.9`) for subtlety.

### 3. Pin styling
The pin circle already uses `brandColor` (line 78) — this is correct. No change needed there.

## Summary of edits (single file)

| Line | Current | New |
|------|---------|-----|
| 90-101 | `background: rgba(0,0,0,0.75); color: white;` label centered | `background: ${brandColor}; color: white;` label wrapped in container with `transform: translateY(24px)` to offset below pin |

