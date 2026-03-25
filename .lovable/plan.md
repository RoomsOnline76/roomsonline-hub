

# Fix Font Readability Preview: Short Hex & Contrast Fallback

## Root Cause

`getLuminance()` returns `0` when the hex string is shorter than 6 characters (e.g. `#fff`, `#FFF`). Zero luminance is treated as pure black, producing a 21:1 contrast ratio against white — completely wrong. The browser, however, correctly renders `#fff` as white, so the text is invisible while the badge says "AA Pass".

The same bug exists in `hexToRgb()` (used for the RGB input fields).

## Fix (single file: `src/components/property/BrandingTab.tsx`)

### 1. Add a hex normaliser function
Expand 3-digit hex (`#abc`) to 6-digit (`#aabbcc`) before any parsing:
```typescript
function normalizeHex(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return "#" + clean[0]+clean[0] + clean[1]+clean[1] + clean[2]+clean[2];
  }
  return "#" + clean;
}
```

### 2. Use normaliser in `getLuminance` and `hexToRgb`
Call `normalizeHex()` at the top of both functions so all downstream parsing works with 6-digit values.

### 3. Add automatic fallback colour in `FontPreviewCard`
When contrast ratio is below AA (< 4.5), compute and display a suggested fallback:
- If bg is light → suggest dark font (e.g. `#1a1a2e`)
- If bg is dark → suggest light font (e.g. `#ffffff`)
- Show the fallback as a second preview line: "Suggested fallback: [swatch] #1a1a2e (ratio X:1)"

### 4. Visual indicator for failing previews
When contrast fails, add a subtle warning border and show the fallback text alongside the original, so the user can see both and optionally adopt the better colour.

## Impact
- Fixes the 21:1 false positive for short hex values
- Adds actionable guidance when contrast is poor
- No new files, no database changes

