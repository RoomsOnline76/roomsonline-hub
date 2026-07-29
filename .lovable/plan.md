## Problem

On the Jongensfontein/Dassiesingel booking pages, text sitting **on top of the dark blue brand surfaces** (property header bar, the calendar header row with "Room Type / WED 29 JUL") renders in a low-contrast grey/blue instead of white.

Confirmed from the code: `src/lib/brandOverride.ts` computes `--primary-foreground` / `--secondary-foreground` / `--accent-foreground` with `autoForeground()`, but `--muted-foreground` (and any explicit `bodyTextColor` / `mutedTextColor` / legacy `fontColor`) is derived **only against the page background**, never against the brand-coloured surfaces. Components render subtitles, weekday labels and helper text with `text-muted-foreground` inside `bg-primary` / `bg-accent` blocks, so a dark navy or grey muted colour lands on a dark navy bar. The existing "dynamic contrast safety" block only runs when no explicit foreground is set, so branded properties (which do set colours) bypass it entirely.

## What to build

### 1. Surface-aware contrast engine (`src/lib/brandOverride.ts`)

- Add exported helpers: `bestForegroundFor(bgHex)` (returns near-white or near-black, whichever wins the ratio) and `enforceContrast(fgHex, bgHex, min)` reusing existing `ensureReadable`.
- For **every** branded surface (primary, secondary, accent, card/light bg, dark bg) compute and emit a matched foreground pair, always enforcing ≥ 4.5:1 — even when the user supplied an explicit font colour. If the user's colour fails on that surface, the surface pair uses the corrected value while the page-level `--foreground` keeps their choice.
- Emit new tokens for muted/secondary text on brand surfaces:
  - `--primary-foreground-muted`, `--secondary-foreground-muted`, `--accent-foreground-muted` (~75% opacity-equivalent tint of the surface foreground, still ≥ 3:1).
- Keep `--primary-text-safe` as-is.

### 2. Use the tokens where the bug shows

Audit and update the booking/embed surfaces that currently place `text-muted-foreground` (or unqualified text) inside branded bars:
- Property header bar in `src/pages/Booking.tsx` (name + location subtitle, promo-code button).
- Rate-calendar header row (weekday/date labels, "Room Type" cell) and month-nav buttons.
- Equivalent blocks in `src/pages/EmbedProperty.tsx` and `src/pages/EmbedPortfolio.tsx`.

Replace with `text-[hsl(var(--primary-foreground))]` / `--primary-foreground-muted` (via small semantic utility classes added to `index.css`, e.g. `.on-primary` / `.on-primary-muted`) so nothing is hardcoded and non-branded pages are unaffected.

### 3. Rigorous examples in the branding editors

In `src/components/property/BrandingTab.tsx`, `src/pages/pms/PMSBranding.tsx`, and the portfolio branding card in `src/pages/admin/AdminPortfolios.tsx`, replace the current small swatch/badge check with a shared `BrandReadabilityPanel` component that renders **live miniature replicas** of the real surfaces using the entered colours:
- Booking header bar (logo block, title, subtitle, promo button)
- Rate calendar header + one price row + Book button
- Room card on light background
- Checkout summary panel with totals and muted fine print
- Footer / dark accent band

Each replica shows a pass/fail ratio badge on the exact text pairs that appear in production.

### 4. Auto-correct proposal the user accepts

Add `src/lib/brandAutoCorrect.ts`:
- `proposeBrandFixes(brand): BrandFix[]` where each fix = `{ field, label, current, proposed, reason, ratioBefore, ratioAfter }`.
- Rules: force white/near-white surface foregrounds on dark brand colours; nudge muted text lightness until it clears 4.5:1 (3:1 for large/secondary text); darken/lighten primary when used as text on the page background; correct light-bg vs body-text pairs; fall back to `#FFFFFF` / `#1A1A2E` when a hue nudge can't reach the threshold.
- The proposals preserve hue — only lightness/saturation move — so brand identity stays intact.

UI: a "Readability auto-correct" card appearing above the palette whenever any fix exists, listing each proposed change as a before/after swatch row with the reason and ratio improvement, with per-row checkboxes plus **Accept proposed changes** and **Dismiss** actions. Accepting writes the values into the form state (still requires the normal Save), and shows the preview replicas re-rendering with the corrected palette.

### 5. Runtime safety net

The engine change in step 1 means even un-corrected legacy palettes render readable text on branded surfaces, so existing live properties are fixed without anyone editing their branding.

## Technical notes

- No schema changes; all new tokens are CSS variables computed client-side, and accepted fixes save into the existing brand colour columns.
- `BrandReadabilityPanel` and `brandAutoCorrect` live in `src/components/branding/` and `src/lib/` so property, portfolio and PMS editors share one implementation.
- Verification: load `/embed/property/dassiesingel?wl=1` and the portfolio embed via Playwright, screenshot the header and calendar header, and assert computed contrast ≥ 4.5:1 on the previously failing text nodes.
