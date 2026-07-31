## Goal

Contract wording must always reflect what the property (or sales rep) is actually billed: global billing defaults as the base, property/portfolio billing config as the override, and commercial terms / rep tier as the final override.

## Current state (verified)

- Three active templates exist: **Accommodation Listing & Distribution Agreement**, **ROL'OS PMS Partnership Agreement** (v1 active, v2 draft), **Referral Partner Agreement**.
- `src/lib/contractBillingVariables.ts` is the only billing→contract bridge. It reads **only** `property_billing_configs` (ignores `portfolio_billing_configs`) and exposes a narrow set of clauses. Portfolio-scoped properties therefore fall back to global defaults even when a portfolio config exists.
- It does not expose the newer billing fields at all: listing vs PMS commission split, widget flat (WBE) rate, PriceLabs fees, branding add-on, channel-manager per-unit fee, white-label setup fee / billing mode, enterprise custom fee.
- The Listing agreement uses `{{commission_percentage}}`, resolved in `ContractSign.tsx` from `property_commercial_terms` with a hardcoded `'ten percent (10%)'` fallback — it never falls back to `billing_global_defaults`.
- The Referral Partner Agreement's `{{first_year_rate}}`, `{{residual_rate}}`, `{{residual_duration}}`, `{{clawback_period}}`, `{{commission_tier_label}}` are **not populated anywhere** in the codebase; `billing_global_defaults.referral_*` and `sales_rep_tier_criteria_json` already hold those values, and `rep_contracts` exists with no UI writing to it.

## Plan

### 1. Make the billing→contract resolver portfolio-aware and complete
Rework `src/lib/contractBillingVariables.ts`:
- Resolve scope exactly like `useBillingConfig`: check `property_portfolio_members` → read `portfolio_billing_configs`, else `property_billing_configs`.
- Cascade per field: commercial term → property/portfolio config → `billing_global_defaults` (strategy-matched row via existing `pickGlobals` logic) → constant.
- Add variables: `listing_commission_rate`, `pms_commission_rate`, `widget_flat_commission_rate` + clauses, `pricelabs_clause`/fees, `branding_addon_clause`/fees, `channel_manager_clause` + per-unit fee, `white_label_setup_fee`, `white_label_billing_mode`, `enterprise_fee_clause`.
- Return a `source` map (`global_default` | `property` | `portfolio` | `commercial_term`) per value so the UI can show provenance.

### 2. Listing & Distribution Agreement — default from billing, override per property
Keep the template text unchanged. In `ContractSign.tsx` and `ContractManagementPanel.tsx`, replace the hardcoded `'ten percent (10%)'` with the resolver's listing rate, so the order is: active `property_commercial_terms` listing row → property/portfolio billing config `listing_commission_rate`/`commission_rate` → `billing_global_defaults`. Words-and-figures formatting stays as-is.

### 3. ROL'OS PMS Partnership Agreement — full billing alignment
- Publish a **v3** of the template that renders every applicable line item (commission split, subscription/tier fee, white-label, branding add-on, PriceLabs, channel manager per unit, payment facilitator vs BYO) using conditional `<!-- N/A -->` clause suppression already supported.
- Feed it from the reworked resolver so a ROLOS property's contract mirrors its Billing Config Builder settings exactly, including portfolio-shared configs.
- Snapshot the resolved figures into the contract record at signing so later billing changes don't retro-edit a signed agreement.

### 4. Referral Partner / Sales Rep Agreement — align with rep commission defaults
- New `src/lib/repContractVariables.ts`: given a `sales_reps` row, resolve `commission_tier` against `billing_global_defaults.sales_rep_tier_criteria_json` (base / accelerated / elite) with fallback to `referral_first_year_rate`, `referral_residual_rate`, `referral_residual_months`, `referral_clawback_days`.
- Populate `{{rep_name}}`, `{{rep_code}}`, `{{rep_email}}`, `{{commission_tier_label}}`, `{{first_year_rate}}`, `{{residual_rate}}`, `{{residual_duration}}`, `{{clawback_period}}` in the referral send/sign path, and store the resolved values in `rep_contracts.terms_snapshot` at signing.
- On `/admin/sales-reps`, show the resolved tier rates next to each rep so admins see exactly what a generated contract will say.

### 5. Visibility in the contract editor
In `ContractVariablesPanel.tsx`, list the new billing and rep variables with a live sample value and its source (global default vs property override vs commercial term), so an editor can tell which numbers are dynamic.

## Technical notes

- No schema change is needed for billing (`portfolio_billing_configs`, `billing_global_defaults`, `sales_rep_tier_criteria_json` already carry every field). A migration is only needed if we add a `terms_snapshot`-style column to property contracts for the ROLOS snapshot — will confirm against the existing `property_contracts` columns before writing it.
- Existing signed contracts are untouched; only newly generated/downloaded contracts use the new resolution.
