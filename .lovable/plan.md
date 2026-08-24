# Sales rep commission section in the Cost estimator

Add a collapsed "Sales rep / referral commission" section at the bottom of the Cost estimator card that shows what a referring rep would earn on the estimated property, side by side for all three tiers.

## Layout

Collapsed by default (same disclosure style as the setup-fees and per-property rows). When opened:

```text
Revenue line              Base            Accelerated     Elite
                          1st yr / resid  1st yr / resid  1st yr / resid
Booking commission        R 3 000  R 750   R 3 750  R1 125  R 4 500  R1 500
Widget commission         ...
PMS subscription          ...
Channel Manager           ...
Branding / White label    ...
PriceLabs                 ...
--------------------------------------------------------------------
Monthly rep earnings      R X      R Y     ...
First 12 months total     R 12X
Residual total (n months) R ...
```

- One row per commissionable revenue line, taken straight from the estimate the card already computes: booking commission, widget commission, and each recurring subscription/add-on (PMS, Channel Manager, Branding, White Label, PriceLabs).
- Card processing is excluded (pass-through cost, not ROL revenue) and the fee-free owner CRM shows R0.
- Each tier column shows two figures per row: first-year monthly and residual monthly, using that tier's rates.
- Footer rows: monthly rep earnings per tier, first 12 months total, and residual total over the configured residual months.
- A small note states the earnings basis (steady-state day-61 revenue; nothing is earned on add-ons while they are waived in the first 60 days) and where the rates come from.

## Rates used

Per tier: `sales_rep_tier_criteria_json[tier].first_year_rate` / `residual_rate` from the selected billing preset, falling back to `referral_first_year_rate` / `referral_residual_rate`, then to the platform tier defaults (Base 20/5, Accelerated 25/7.5, Elite 30/10). Residual months come from `referral_residual_months` (default 24). This is the same cascade the rep contracts already use, so the estimator and the signed agreement agree.

## Technical notes

- New pure helper `buildRepCommissionEstimate(estimate, globals)` in `src/lib/billingEstimate.ts` (or a sibling `repCommissionEstimate.ts`): reuses `resolveRepTerms`-style resolution from `src/lib/repContractVariables.ts` and the existing `EstimateLine[]`, returning per-tier rows and totals. Unit tests cover rate cascade, exclusion of card processing, and totals.
- New presentational component `src/components/admin/billing/RepCommissionPanel.tsx` rendered inside `BillingEstimator.tsx` behind a collapsible toggle.
- Read-only: no schema changes, no mutations; semantic tokens only.
