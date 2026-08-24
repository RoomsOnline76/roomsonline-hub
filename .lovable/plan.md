# Cost estimator — compact two-column layout

Rework the Cost estimator card on Billing Defaults so everything fits on one screen: controls on the left, live costs on the right, and each tickable add-on shows its own Day 1–60 and Day 61+ figure on the same row it is toggled on.

## Layout

```text
┌ Cost estimator ─────────────────────────────────────────────────────────┐
│ Setup strip (top, compressed): preset · properties · units · bookings/mo │
│ · booking value · widget vol/value · widget mode · gateway toggle        │
├───────────────── CONFIGURABLES (left) ──┬── COST (right) ──────────────┤
│ ☑ ROL'OS PMS      room tier             │  free      R 2 400            │
│ ☑ Channel Manager per unit              │  free      R 1 800            │
│ ☐ Branding pack   monthly + setup       │  free      R   750            │
│ ☑ White label     incl. branding        │  free      R 1 500            │
│ ...                                     │                               │
│ Commission & transaction fees (always payable)                          │
│   OTA commission 10%                    │  R 15 000  R 15 000           │
│   Widget commission                     │  R  3 000  R  3 000           │
│   Card processing                       │  R  2 100  R  2 100           │
├─────────────────────────────────────────┴───────────────────────────────┤
│ Transaction subtotal · Recurring subtotal · Monthly total  (sticky)     │
│ Setup fees on signature · per-property split (collapsed)               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Changes

1. **Compressed setup strip** — the preset select, properties/units editor, booking volume/value, widget volume/value/mode and gateway toggle move into one dense grid at the top (6 columns on desktop, 2 on mobile, `h-7` inputs, inline labels). Properties become compact chip rows (`name · units · remove`) that wrap, plus "Add property" / "Same units for all" as small icon buttons. Totals (`n properties · m units`) stay inline in the header.
2. **Merged configurable/cost grid** — the separate add-on checkbox grid and breakdown table become one table. Each add-on row carries its checkbox and label on the left and its own Day 1–60 / From day 61 amounts on the right, so ticking updates that row in place. Unticked add-ons show a dimmed "—" (or their would-be price in muted text) instead of disappearing.
3. **Transaction rows** stay in the same table under a "Commission & transaction fees" band, labelled as payable from day one, since they are driven by the volume inputs rather than checkboxes.
4. **Sticky summary footer** — transaction subtotal, recurring subtotal and monthly total pinned at the bottom of the card, with the narrative summary and gateway note collapsed to one small line each.
5. **Setup fees** and **per-property split** collapse into small disclosure rows so they no longer consume vertical space by default.

## Technical notes

- Presentation-only change in `src/components/admin/billing/BillingEstimator.tsx`; `src/lib/billingEstimate.ts` calculation logic and its tests stay untouched.
- Estimate line keys already match the add-on keys (`pms`, `channel_manager`, `branding`, `white_label`, `pricelabs`, `hubspot`), so each checkbox row can look up its line by key for the inline amounts.
- White label continues to bundle the branding pack: branding stays disabled and shows "free with white label" with a zero recurring amount.
- Keep semantic tokens only (no hardcoded colour utilities) and preserve the existing collapsible card shell.
