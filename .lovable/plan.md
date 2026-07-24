## Goal

In the billing config, the "Widget — tiered commission" section becomes two mutually-exclusive options:

- **Widget — flat commission** (new): single % applied to every WBE booking, regardless of volume.
- **Widget — tiered commission** (existing): monthly-volume tiers from the global WidgetTierEditor.

Rules:
- At most one can be enabled at a time.
- Both can be off (no WBE-specific commission — the standard Listing commission still applies if enabled).
- Enabling one auto-disables the other; turning one off leaves both off.

## Changes

### 1. `src/components/admin/billing/BillingConfigBuilder.tsx`
- Add fields to `BillingConfigValue`:
  - `widget_flat_enabled: boolean`
  - `widget_flat_rate: string`
- Default them off / empty in `emptyBuilderValue()`.
- Insert a new **"Widget — flat commission"** `ToggleRow` immediately above the existing tiered row.
  - Numeric % input, placeholder e.g. `10`.
  - `onToggle`: when turning on, also set `widget_tiers_enabled: false`.
- Update the tiered row's `onToggle`: when turning on, also set `widget_flat_enabled: false`.
- Update `summarizeBuilderValue` to emit `X% widget commission (flat)` when flat is on.

### 2. Persistence layer (preset + property scope)
- Read/write the new fields wherever `BillingConfigValue` is (de)serialised for `billing_global_defaults` and `property_billing_configs`. Reuse existing columns where possible:
  - Map `widget_flat_enabled` + `widget_flat_rate` to a dedicated pair. Preferred: add `widget_flat_commission_rate numeric` to both `billing_global_defaults` and `property_billing_configs` via a single migration (nullable = disabled). Include the required `GRANT` statements for both tables.
- Update `useBillingDefaults` / `useBillingConfig` types and the loaders/savers in `AdminBillingDefaults.tsx` and the property Admin tab to round-trip the new field.

### 3. Summaries & downstream
- `StrategySummaryLine.tsx`: when a defaults row has widget flat set, print `X% widget commission (flat)` instead of / in addition to the tiered line, mirroring the mutual-exclusion rule.
- `calculate-billing` / `calculate-commission` edge functions and `billingTierResolver`: when computing WBE commission, prefer `widget_flat_commission_rate` if present; otherwise fall through to widget tiers; otherwise no WBE commission. No change to sales-rep / facilitator logic.

### 4. UX polish
- Small helper text under both widget rows: "Flat or tiered — pick one, or leave both off."
- The two rows share a light visual grouping (thin left border or subtle heading) so it's obvious they're paired.

## Out of scope
- Global "Listing commission" (unchanged; can coexist with either widget option — that's how it already behaves).
- Sales rep commission rules (unchanged — still excludes facilitator surcharge).
- No UI wording change to the connect/pricing marketing page.

## Verification
- Toggle flat on → tiered auto-disables; save; reload; state persists.
- Toggle tiered on → flat auto-disables; save; reload.
- Turn both off → save; loader returns both disabled.
- Admin summary line and property Admin tab reflect the correct one-liner in each state.
