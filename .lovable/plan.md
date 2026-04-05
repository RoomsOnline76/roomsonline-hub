
## Fix the branding contrast system so it works in real UI, not only in theory

### What is actually wrong
The issue is real: the current “dynamic contrast” logic only adjusts a few global tokens, but the checkout page still contains UI patterns that rely on:
- `text-primary`
- `bg-primary/5`
- `border-primary/30`
- `text-muted-foreground`

Those combinations are not being recalculated against the actual branded surface. So when a portfolio/property brand is light or low-contrast, the promo cards and helper text can become unreadable even though the brand override technically “applied”.

Your screenshot confirms this: the selected text is visible, but the normal rendered text is too faint/low-contrast. That means the theme tokens are being set, but the token relationships are wrong.

### Files to update
- `src/lib/brandOverride.ts`
- `src/pages/Booking.tsx`
- `src/pages/pms/PMSBranding.tsx`
- `src/pages/admin/AdminPortfolios.tsx`
- optionally `src/components/showcase/SpecialsBanner.tsx` for consistency

### Implementation plan

#### 1) Make the branding engine surface-aware
In `src/lib/brandOverride.ts`, replace the current simplistic light/dark fallback with proper token derivation based on:
- page/card background
- primary brand color
- contrast ratio between foreground and background

Build safer derived tokens for:
- `--foreground`
- `--card-foreground`
- `--popover-foreground`
- `--muted-foreground`
- `--primary-foreground`
- `--secondary-foreground`
- `--accent-foreground`
- `--border`
- `--input`

Key rule:
- muted/help text must be derived from the actual surface background, not from `secondaryColor`
- foreground tokens must meet readable contrast on `background/card/popover`
- if the chosen brand color is too light for “primary text”, auto-fallback to a darker readable value for text usages

#### 2) Stop using fragile primary-tinted promo styling in checkout
In `src/pages/Booking.tsx`, the applied promotions block currently uses:
- `bg-primary/5`
- `border-primary/30`
- `text-primary`
- `text-muted-foreground`

That is exactly where the failure is visible.

Refactor that block to use a safer semantic style, for example:
- base surface: `bg-card`
- readable border: `border-border`
- use a small primary accent chip/icon instead of making the whole card depend on translucent primary color
- force promo title/description/amount to use surface-safe tokens

This keeps branding visible, but removes the unreadable washed-out state.

#### 3) Audit other checkout blocks that depend on `text-primary` as body text
Also review the same page for sections where `text-primary` is used as normal copy instead of accent only, especially:
- date-selection hint card
- step highlights
- promo discount labels
- helper labels inside branded cards

Keep `text-primary` for badges/icons/CTAs, not for low-emphasis explanatory text on tinted backgrounds.

#### 4) Add real contrast guardrails to branding setup
In:
- `src/pages/pms/PMSBranding.tsx`
- `src/pages/admin/AdminPortfolios.tsx`

extend the current branding setup so users get warnings when combinations are unsafe in actual usage patterns, not just in isolated swatches.

Add checks for:
- primary text on light background
- muted text on light background
- white text on primary button
- primary-colored text on pale primary-tinted surface

If a combination fails, show:
- warning badge
- recommended fallback color
- note that the system will auto-correct runtime tokens for readability

#### 5) Keep portfolio/property continuity, but make runtime correction authoritative
Do not change the portfolio/property override behavior itself. Keep the current brand propagation logic.
But once the brand reaches checkout, the runtime contrast engine should be the final authority for readable text tokens.

That means:
- portfolio branding can still flow through
- property override can still replace it when enabled
- but neither should be able to create unreadable text on checkout

### Technical detail
Current root issue:
```text
brand colors are passed through correctly
but semantic tokens are not derived from the real rendered surfaces

Result:
primary-tinted card + primary text + muted text
can collapse into low contrast
```

Desired model:
```text
brand inputs
  -> derive safe semantic tokens
  -> use semantic tokens in checkout UI
  -> reserve raw primary color for accents/buttons only
```

### Expected result
After this change:
- checkout text remains readable under light, dark, or saturated property/portfolio brands
- promo/special/package cards remain branded without washing out text
- muted/help text stays legible
- branding setup screens warn about dangerous combinations before they go live
- the system behaves dynamically in the actual UI, not only in a color-picker preview
