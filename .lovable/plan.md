## Assessment: the argument is sound

Looking at what `portfolio_aggregator` actually does today:

- **Billing engine** (`calcPortfolio` in `supabase/functions/calculate-billing/index.ts`): identical to `default` — one `commission_rate` on the booking amount, with a 5% fallback instead of 10%. No portfolio membership check, no blending across properties, no shared subscription. The label promises "shared subscription / blended commission" but the code does neither.
- **UI**: it forces the property into a single strategy slot, which prevents mixing (e.g. a portfolio containing one `rolos_pms` property and one `widget` property — perfectly legitimate — currently can't be represented cleanly).
- **Concept overlap**: portfolio grouping is already modelled by `property_portfolios` + `property_portfolio_members`, and revenue-sharing between owners is already handled by `portfolio_revenue_share_config` / `portfolio_share_invoices`. The billing strategy adds nothing on top.

So conceptually the "aggregator" is a **listing / grouping capability**, not a pricing model. Each member property should keep its own strategy; the portfolio itself is what gets billed for existing as an aggregated listing.

## Plan

1. **Reframe as a portfolio-level add-on** (no schema migration needed for the toggles — reuse existing billing add-on plumbing):
   - Add two portfolio-level fields on `property_portfolios`: `aggregator_billing_mode` (`none` | `monthly` | `once_off`), `aggregator_fee` (numeric).
   - Add matching global defaults on `billing_global_defaults`: `portfolio_aggregator_monthly_default`, `portfolio_aggregator_setup_default`.

2. **Admin UI — global defaults** (`src/pages/AdminBillingDefaults.tsx` → Add-ons tab):
   - New "Portfolio Aggregator Listing" card with mode toggle + monthly fee + once-off setup fee inputs, mirroring the White-Label add-on pattern.

3. **Admin UI — per portfolio** (`src/pages/PMSPortfolios.tsx` / portfolio edit dialog and/or `PMSIntegrations` portfolio view):
   - Admin-only "Aggregator billing" panel: mode select + fee override (falls back to global default).

4. **Billing engine** (`supabase/functions/calculate-billing/index.ts`):
   - Delete `calcPortfolio` and the `portfolio_aggregator` branch.
   - Add a new `portfolio_aggregator_fee` add-on evaluator: on `subscription` events, emit one line per portfolio with `aggregator_billing_mode = 'monthly'`; on portfolio creation/first-activation, emit a one-time `setup` line for `once_off` mode. Ledger type: `add_on`.
   - Member properties continue to be billed on their own strategy.

5. **Migrate away from the strategy enum value**:
   - Any property currently on `portfolio_aggregator` is switched to `default` (keeps existing `commission_rate`) via a data update inside the migration.
   - Hide `portfolio_aggregator` from the strategy dropdown in `BillingConfigTab.tsx`, `AdminOverviewTab.tsx` and `AdminBillingDefaults.tsx`.
   - Leave the enum value in place (don't drop it — Postgres enum removal is disruptive); mark as deprecated in comments.

6. **AdminOverviewTab cost estimate**:
   - Drop `portfolio_aggregator` from the strategy list.
   - When the property is a portfolio member and the portfolio has `aggregator_billing_mode = 'monthly'`, surface the portfolio's share of the monthly fee (or the full fee at portfolio level) in the estimate breakdown.

7. **Contract variables** (`src/lib/contractBillingVariables.ts`): add tokens for aggregator fee / mode so contracts can reference them if the owner is billed for their portfolio membership.

## Out of scope

- Removing the enum value itself (kept for historical `billing_transactions` metadata).
- Splitting the aggregator fee across member owners — assume the portfolio owner pays it. A separate "cost-share" pass can come later if wanted.
