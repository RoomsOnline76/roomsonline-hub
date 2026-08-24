# Billing Estimator on the Billing Defaults page

Add an interactive "what will this cost?" configurator at the top of `/admin/billing-defaults` (above the tabs) that turns the configured defaults into a live cost breakdown for a prospective client: free first 60 days vs steady-state billing from day 61.

## Inputs (top card)

- Preset selector — which saved billing preset the estimate resolves from (defaults to the `default` preset).
- Number of properties, and units/rooms per property (one row per property, add/remove rows, or a quick "same for all" shortcut).
- Estimated monthly booking volume (number of bookings) and estimated monthly booking value.
- Add-on tick boxes, each prefilled with the configured default price: PMS subscription/tier, Channel Manager (per unit), Branding Pack, White Label, PriceLabs, HubSpot owner CRM (fee-free), BYO gateway vs ROL-processed payments.

All inputs are local UI state — nothing is written to the database, and no preset values are changed.

## Output (dynamic table)

Two side-by-side columns for the same set of line items:

| Line item | Days 1–60 | From day 61 (monthly) |
|---|---|---|
| Booking commission | payable | payable |
| Card processing (if ROL-processed) | payable | payable |
| PMS subscription (room-count tier) | R0 — free | tier fee |
| Channel Manager (units x per-unit) | R0 — free | fee |
| Branding / White Label / PriceLabs | R0 — free | fee |
| HubSpot owner CRM | R0 | R0 |
| Setup fees | invoiced on signature | — |

Rules the table must follow (matching the live billing engine and the Connect pricing story):

- The 60-day free window covers the full stack of subscriptions and add-ons only. Commission on bookings made through the platform is always payable, and card processing is always payable when ROL processes payments.
- Card processing resolves from the active gateway schedule (percentage + per-transaction fixed fee, volume-banded on the estimated monthly value) — never a flat legacy field. If no schedule is published, fall back to the preset's fallback percentage and say so.
- PMS subscription resolves from total room count through the existing tier resolver, not property count.
- Setup fees are shown separately as upfront-on-signature, not inside either monthly column.
- Per-property expandable rows plus a portfolio total, so multi-property groups can see both.
- A one-line plain-language summary under the table ("First 60 days: about RX/month, all of it bookings and card processing. From day 61: about RY/month plus bookings.").

Every number recomputes instantly as inputs change. No persistence, no export in this pass.

## Technical notes

- New component `src/components/admin/billing/BillingEstimator.tsx`, rendered at the top of `src/pages/AdminBillingDefaults.tsx` in a collapsible card (open by default).
- New pure module `src/lib/billingEstimate.ts` holding the calculation: takes preset row + estimator inputs + resolved gateway schedule, returns typed line items for both periods. Unit-tested (`billingEstimate.test.ts`) for: free-period exclusions, commission always payable, room-count tier selection, gateway hybrid/volume banding, setup-fee separation.
- Reuses existing helpers rather than re-deriving rules: `resolveTier`/`normalizeTiers` from `billingTierResolver`, `getEffectiveBillingRate`/`listGatewaySchedules`/`normalizeVolumeTiers` from `gatewayBillingRate`, `DEFAULT_FREE_PERIOD_DAYS` from `billingSchedule`, and the preset row from `useBillingDefaults`.
- Read-only: no mutations, no schema changes, no edge function changes.
