## Goal

1. Property contracts state exactly what the property is actually billed (all active fees), not hardcoded text.
2. Sales reps sign one agreement covering the default commission terms, with the option to record negotiated rates per referred property; commission runs then use those rates.

## Current state (verified)

- `src/lib/contractBillingVariables.ts` reads only `property_billing_configs` and picks a **single arbitrary** `billing_global_defaults` row (`.limit(1)`, no strategy match). It exposes commission, subscription, white-label, payment-facilitator, BYO and tier clauses only.
- Newer billing fields are not represented at all: PriceLabs monthly/setup, channel-manager per-unit fee, branding add-on, white-label setup fee & billing mode, portfolio aggregator fees, widget flat commission, listing vs PMS commission split, enterprise custom fee. Portfolio-scoped configs (`portfolio_billing_configs`) are never consulted.
- `src/lib/contractAgreementText.ts` hardcodes "ten percent (10%)" in the static fallback contract (2 places).
- No sales-rep contract exists: `contract_templates` has no kind/category column, `sales_reps` has no contract fields.
- `supabase/functions/calculate-rep-commissions/index.ts` hardcodes accelerated (25 / 7.5 / 18) and elite (30 / 10 / 24) tiers, ignoring `billing_global_defaults.sales_rep_tier_criteria_json` which the admin Billing Defaults page already edits.

## Part 1 — Property contract ⇄ billing alignment

Rework `resolveBillingContractVariables`:

- Resolve scope properly: portfolio billing config (when the property belongs to a portfolio with a config) overrides property config, then strategy-matched global defaults (reuse the field-by-field cascade style already in `commissionResolver.pickGlobals`), then constants.
- Reuse `resolveCommissionType` semantics so the contract states both rates where relevant: listing/marketplace rate and PMS/direct (white-label, widget, API) rate, or the widget flat rate when that model is on.
- Add variables + auto-rendered clauses, each suppressed (`<!-- N/A -->`) when the fee is inactive:
  - `listing_commission_rate`, `pms_commission_rate`, `widget_flat_commission_rate`
  - `subscription_clause` / tier clause (already present, keep)
  - `white_label_setup_fee`, `white_label_billing_mode`
  - `branding_addon_*`, `pricelabs_monthly_fee` / `pricelabs_setup_fee`
  - `channel_manager_per_unit_fee` (× unit count → monthly total)
  - `portfolio_aggregator_*`, `enterprise_custom_fee`
  - existing payment-facilitator / BYO gateway clauses, made mutually exclusive from the real config
- Add a generated **Annexure A – Fee Schedule** variable (`fee_schedule_table`) that renders one HTML table row per active charge, so any template gets a complete, accurate fee list even if it doesn't reference each variable.
- Replace the hardcoded 10% strings in `contractAgreementText.ts` with the resolved commission variables (falling back to the resolved default, not a literal).
- Surface all new variables in `ContractVariablesPanel` so editors can insert them.

## Part 2 — Sales rep agreement

Schema (one migration):
- `contract_templates.kind text not null default 'property'` (`'property' | 'sales_rep'`) so the existing template editor/versioning is reused for a rep agreement template.
- New `rep_contracts` table: `rep_id`, `template_version_id`, `status`, `sent_at`, `signed_at`, `signature_data`, `signed_html`, `signed_pdf_url`, `terms_snapshot jsonb` (the tier rates/residual/clawback in force at signature), plus grants + admin/dev/fearless_leader RLS and rep-can-read-own.
- `property_referrals` gains nullable overrides: `first_year_rate_override`, `residual_rate_override`, `residual_months_override`, `override_notes` — the "negotiated rate for this property" case.

Flow:
- Admin → Sales Reps: "Send agreement" on a rep. Terms are pulled from `billing_global_defaults` (`sales_rep_tier_criteria_json` for the rep's tier, plus residual months and clawback days) and injected as `{{rep_first_year_rate}}`, `{{rep_residual_rate}}`, `{{rep_residual_months}}`, `{{rep_clawback_days}}`, `{{rep_tier_label}}`, `{{rep_target}}`.
- Rep signs via the existing signing page pattern (new `/rep-contract/:token` route reusing the current signature canvas + PDF generator). On signature we store the signed HTML/PDF and freeze `terms_snapshot`.
- Rep card shows contract status badge; unsigned reps are flagged on the commission report screen.
- `ReferralSection` (property) gains an optional "Negotiated rates differ from default" block writing the three override fields, showing the defaults inline for comparison.

## Part 3 — Commission engine alignment

In `calculate-rep-commissions`:
- Drop the hardcoded tier table; read `sales_rep_tier_criteria_json` for base/accelerated/elite, falling back to the `referral_*` default columns, then current constants.
- Precedence per entry: referral override → rep's signed `terms_snapshot` → current billing defaults for the tier.
- Store the resolved source on each entry (`rate_source`) so the commission report can show why a rate applied.

## Technical notes

- All rate resolution stays data-driven; no new hardcoded percentages anywhere.
- Contract clause rendering keeps the existing `<!-- N/A -->` suppression convention so old templates don't break.
- Rep contract UI follows the existing property contract components (status badge, signature canvas, version history) rather than new patterns.
