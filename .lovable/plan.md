## Goal

If a property belongs to a portfolio, billing is configured **once at the portfolio level** and inherited by every member property. The property-level Billing tab becomes read-only with a pointer to the portfolio; ROLOS shows the owner either single-property billing or a consolidated portfolio view.

## Current state (verified)

- `property_portfolios` (portfolio) and `property_portfolio_members` (join) exist. A property can belong to one portfolio.
- Billing lives in `property_billing_configs` per-property (39 columns: PMS tiers, WL, branding, PriceLabs, channel manager, gateway fees, WBE flat, enterprise custom, etc.).
- Admin edits at `src/components/property/BillingConfigTab.tsx` via `BillingConfigBuilder.tsx`. Estimator lives in `AdminOverviewTab.tsx`. ROLOS-side reads via `src/hooks/useBillingConfig.ts` / `PMSRevenue.tsx`.
- `property_portfolios` already has a few billing-ish columns (aggregator/PriceLabs) but no full config; there is no `portfolio_billing_configs` table.

## Design

### 1. Data model — new `portfolio_billing_configs`

Mirror the shape of `property_billing_configs` (same 30+ economic columns, minus `property_id`/`owner_id`) keyed by `portfolio_id`. One row per portfolio. Full GRANTs + RLS: admins/devs manage; portfolio owner + linked property owners can `SELECT`.

Keep `property_billing_configs` intact for standalone properties. Resolution rule: **if a property has a portfolio member row, portfolio config wins and property config is ignored**. A single `useResolvedBillingConfig(propertyId)` hook returns `{ source: 'property' | 'portfolio', config, portfolio? }`.

### 2. Admin — portfolio billing page

- New tab/section on `src/pages/admin/AdminPortfolios.tsx` (or a dedicated `AdminPortfolioBilling` route) that reuses `BillingConfigBuilder` bound to the portfolio row. Same presets, same tier logic (`billingTierResolver` already scales on property count — portfolios naturally use the total member count for tier selection).
- Enterprise custom fee, WL, branding, PriceLabs, PMS subscription, WBE flat, BYO gateway, etc. all set once here.

### 3. Admin — property Billing tab when portfolio-linked

`BillingConfigTab.tsx` detects portfolio membership:
- Hides the builder.
- Shows an info card: "This property is part of portfolio **{name}**. Billing is configured at the portfolio and applies to all {N} member properties." with a button "Open portfolio billing".
- Shows a compact read-only summary of the resolved config (strategy, monthly fee, add-ons).
- `AdminOverviewTab` "Estimated Client Cost" switches to a portfolio-wide estimate (sum PMS tier for total rooms across portfolio, single WL/branding/PriceLabs/enterprise fees, per-unit channel fees across all units) with a note "Portfolio-level total — shared across N properties".

### 4. ROLOS — owner-facing view

`PMSRevenue.tsx` (and any billing summary widget) via `useBillingConfig` -> `useResolvedBillingConfig`:
- Standalone property: unchanged single-property panel.
- Portfolio member: renders a **Portfolio Billing** panel — one consolidated card showing the portfolio's monthly fees, add-ons, and a table of member properties with room counts contributing to tier. No per-property duplication.

### 5. Migration & backfill

- Create `portfolio_billing_configs` with GRANTs + RLS.
- For each portfolio, if all member properties share an identical `property_billing_configs` row (or the portfolio owner has one), seed a portfolio config from the most representative property; otherwise seed defaults and flag the portfolio in an admin "needs review" list. No destructive changes to `property_billing_configs`.

### 6. Guardrails

- `PriceLabsAdminPushCard`, WL domain panel, contract billing variables (`contractBillingVariables.ts`), `calculate-billing` edge function all consume the resolved config via the new hook / a shared server-side resolver so contracts and invoices stay consistent.
- Portfolio-level toggles for WL/branding automatically propagate to all member properties (existing "WL on ⇒ branding free" rule preserved).

## Files touched

- New: `supabase/migrations/<ts>_portfolio_billing_configs.sql`, `src/hooks/useResolvedBillingConfig.ts`, `src/pages/admin/AdminPortfolioBilling.tsx` (or tab within `AdminPortfolios.tsx`), `src/components/property/PortfolioBillingNotice.tsx`.
- Updated: `BillingConfigTab.tsx`, `AdminOverviewTab.tsx` (estimator + PriceLabs push scope), `BillingConfigBuilder.tsx` (accept `scope: 'property' | 'portfolio'`), `useBillingConfig.ts`, `PMSRevenue.tsx`, `calculate-billing/index.ts`, `contractBillingVariables.ts`.

## Out of scope

- Splitting billing across multiple portfolios for one property (still 1:1).
- Changing how tiered pricing math works (only the input scope changes).
