## Goal

Align the ROLOS PMS monthly base subscription with the `/connect/pricing` tiers, driven primarily by **property count**:

- **Starter — R1,500/mo**: 1 property
- **Professional — R4,500/mo**: up to 3 properties
- **Enterprise — custom**: more than 3 properties. No default fee; admin must set a custom monthly amount per client (portfolio/property) before billing can run.

Room caps stay as a secondary display detail (10 / 50 / unlimited) on the marketing page but are no longer the primary gate for the subscription base fee.

## Changes

### 1. Tier resolver (`src/lib/billingTierResolver.ts`)

- Change `DEFAULT_TIERS` so the gate is property-count first:
  - Starter: `max_properties: 1`, `monthly_fee: 1500`
  - Professional: `max_properties: 3`, `monthly_fee: 4500`
  - Enterprise: `max_properties: null`, `monthly_fee: null` (custom, must be provided)
- Extend `PricingTier.monthly_fee` type to `number | null` and add an optional `label` ("Starter" / "Professional" / "Enterprise").
- Update `resolveTier` to select purely on property count when `max_properties` is defined (rooms only used as a soft display value, not as a blocker).
- Extend `ResolvedTierInfo` with:
  - `tierLabel: "starter" | "professional" | "enterprise"`
  - `requiresCustomFee: boolean` (true when the resolved tier has `monthly_fee == null` and no override is set)
  - `effectiveMonthlyFee: number | null` (the custom override when present, otherwise the tier fee)
- In `resolvePropertyTier`, read a new `enterprise_custom_fee` field from `property_billing_configs` (falls back to `billing_global_defaults` value if set) and expose it as `effectiveMonthlyFee` when the resolved tier is Enterprise.

### 2. Database migration

Add nullable numeric columns for the admin-set custom Enterprise fee:

- `property_billing_configs.enterprise_custom_fee numeric`
- `billing_global_defaults.enterprise_custom_fee numeric` (optional global fallback, generally unused since Enterprise is client-specific)

No RLS changes needed — existing policies cover the columns.

### 3. Admin Billing UI (`src/components/admin/billing/BillingConfigBuilder.tsx` + `AdminBillingDefaults.tsx`)

- In the tier editor, render the three tiers as fixed rows labelled Starter / Professional / Enterprise. Starter and Professional fees remain editable numeric inputs (defaulting to 1500 / 4500). The Enterprise row shows "Custom — set per client" and hides the fee input in Global Defaults.
- On the per-property Billing Config tab, when the resolved tier is Enterprise, render an **Enterprise Monthly Fee** input bound to `enterprise_custom_fee`. Show a validation warning banner when the property is on Enterprise and the field is empty ("Billing will fail until an Enterprise monthly fee is set").
- Update `StrategySummaryLine.tsx` to display the resolved tier label + `effectiveMonthlyFee`, and the "requires custom fee" warning when unset.
- Update `useBillingDefaults.ts` and `useBillingConfig.ts` to read/write the new field.

### 4. Billing edge function (`supabase/functions/calculate-billing`)

- Replace the raw `monthly_fee` lookup with `effectiveMonthlyFee` from the resolver.
- When the tier is Enterprise and `enterprise_custom_fee` is null, skip the base subscription line and attach a warning (`enterprise_fee_missing`) to the billing run so admin sees it in the dashboard instead of silently charging R0.

### 5. Contract generation & Admin Overview estimator

- `AdminOverviewTab.tsx` "Estimated Client Cost" card and any contract templates that print the base subscription should use the resolver's `effectiveMonthlyFee` and label. When Enterprise + unset, show "Custom (to be set)".

## Out of scope

- Marketing page `/connect/pricing` — copy already matches (Starter / Professional / Enterprise with the "Custom" Enterprise card) and doesn't need edits.
- Room-count gating for feature access (channel manager, API, etc.) — unchanged; only the base subscription fee logic moves to property-count.

## Technical notes

- Backwards compatibility: existing rows with `monthly_fee: 0` on the Enterprise tier will be re-normalized to `null` inside `normalizeTiers` when the row's `max_properties` is null, so previously-stored tier JSON keeps working.
- Portfolio scope: property counting already goes through `getPortfolioPropertyCount` — a 4-property portfolio triggers Enterprise for every member property, and the custom fee is stored once on the portfolio's primary property (existing convention).
