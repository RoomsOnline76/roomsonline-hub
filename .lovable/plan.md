## What's wrong

The previous readability/auto-correct work only covered the public property and booking pages. The ROLOS PMS interface uses a **separate, mode-blind branding path**, so dark mode breaks.

Confirmed in the code and data:

- `src/contexts/PMSBrandContext.tsx` → `applyPmsBrand()` writes brand colours as **inline styles on `document.documentElement`**. Inline styles beat the `.dark` class rules in `index.css`, so the dark theme is effectively cancelled for every branded token.
- It maps the owner's colours straight onto core tokens with no contrast check:
  - `brand_font_color` → `--foreground`, `--card-foreground`, `--popover-foreground`
  - `brand_secondary_color` → `--secondary` **and** `--muted` / `--muted-foreground`
  - `brand_accent_color` → `--accent`, `--sidebar-accent`
- Jongensfontein's stored palette (verified in the database) is light-mode-only:
  - Fonteinhutte: font `#1a1a2e`, secondary `#F5A623`
  - Dassiesingel: font `#00377F`, secondary `#DDAA00`
  - SEESIG: font `#1B7FAD`, secondary `#F5A623`

  So in dark mode `--foreground` becomes near-black text on a near-black background (exactly the unreadable screen in the screenshot), and `--muted` becomes a bright amber slab.
- `applyPmsBrand` never re-runs when the theme is toggled — it only reacts to the `?property=` id.
- The readability panel / auto-correct engine (`brandAutoCorrect.ts`) is wired into the property and portfolio branding editors for the *booking* surfaces; nothing evaluates or corrects the **PMS UI** surfaces (sidebar, dashboard grid, headers, cards).

## The fix

**1. Make PMS brand application theme-aware**

Rewrite `applyPmsBrand` into a mode-aware token builder used by `PMSBrandContext`:

- Read the active mode from `next-themes` (`useTheme().resolvedTheme`) and re-apply whenever it changes.
- Keep **brand identity tokens** always on (`--primary`, `--ring`, `--chart-1`, `--sidebar-primary`, logo, fonts) — the property still feels like its own software in both modes.
- Never overwrite **structural surface tokens** (`--background`, `--card`, `--popover`, `--foreground`, `--muted`, `--border`) with raw owner colours. In dark mode these stay on the theme's dark values; the brand colour is only used as an accent on top.
- Run every derived token through the existing contrast helpers in `brandOverride.ts` (`contrastRatio`, `enforceContrast`, `mixHex`, `surfaceForegroundPair`) against the *actual* mode surface:
  - Primary that is too dark for the dark surface gets lightened (hue preserved) until it clears 4.5:1; too light for the light surface gets darkened.
  - `--primary-foreground` / `--accent-foreground` / `--sidebar-accent-foreground` are computed from the corrected colour, not the raw one.
  - `brand_font_color` is applied only when it clears contrast in the current mode; otherwise the theme's own foreground is kept.
- Add a shared `buildPmsBrandVars(palette, mode)` helper so the logic is testable and reused by the preview in PMS Branding.

**2. Extend the readability review to the ROLOS UI**

- Add PMS surfaces (sidebar, dashboard grid rows, stat cards, table headers) to the surface list evaluated by `brandAutoCorrect.ts`, scored in **both** light and dark.
- Show the existing `BrandReadabilityPanel` with an explicit "ROLOS interface" section alongside the booking-page section in both the property branding editor and the portfolio branding editor, so the same accept-the-fix flow covers the admin UI.

**3. Portfolio parity**

- Resolve the portfolio palette (Jongensfontein.com) the same way as the property palette in the PMS context, so portfolio-mode dashboard views get identical mode-aware treatment and don't fall back to a property's light-only colours.

**4. Verify**

- Load `/pms?property=<Fonteinhutte>` and the Jongensfontein portfolio view in both light and dark, capture screenshots, and confirm: readable text everywhere, brand primary still visible on buttons/active nav, calendar rate rows legible, sidebar active state correct.

## Technical notes

- Files touched: `src/contexts/PMSBrandContext.tsx` (main rewrite), `src/lib/brandOverride.ts` (mode-aware helper), `src/lib/brandAutoCorrect.ts` (PMS surfaces), `src/components/branding/BrandReadabilityPanel.tsx`, `src/pages/pms/PMSBranding.tsx`, `src/pages/PropertyForm.tsx` and `src/pages/admin/AdminPortfolios.tsx` (panel labelling only).
- No database or edge function changes; stored palettes stay as they are and are corrected at render time, with the auto-correct panel offering to persist better values.
- Public booking/embed branding behaviour is left unchanged apart from the shared helper refactor.
