# Show settlement status for once-off fees on Billing Config Overview

The "Estimated Client Cost" card currently shows the contracted once-off setup total (R 2 150 for Jongensfontein) with no indication that it has already been paid. It should reflect real settlement state, and re-open a balance only when fees are added or increased after payment.

## What changes

On the Overview tab card:

1. **Once-off setup header** becomes settlement-aware:
   - Fully settled: `R 2 150` with a `Paid` badge and the payment date ("Paid 8 Aug 2026").
   - Partly settled after a config change: shows the outstanding balance as the headline plus a smaller note, e.g. `R 500 due · R 2 150 of R 2 650 already paid`.
   - Nothing paid yet: unchanged from today.
2. **Per-line badges** next to each `once` line: `paid` when that fee kind appears on a paid once-off invoice, `due` when it is new or increased since the last payment.
3. A short footer line when a balance re-opened: "Setup fees changed after payment — balance of R X invoiced separately."

Commission, monthly recurring and every other line stay exactly as they are.

## How settlement is determined

Reuse the same reconciliation the ROL Account already applies, so the two screens can never disagree:

- Read `subscription_invoices` for the billing scope entity (portfolio when billing is portfolio-level, otherwise property) where `invoice_kind = 'once_off'`.
- Paid total = sum of `amount` on rows with `status = 'paid'`; last paid date = latest `paid_at`.
- Outstanding = contracted setup total (already computed on the card) minus paid total, floored at zero.
- Per-line matching uses the normalised setup key (`white_label`, `branding`, `pricelabs`) taken from paid invoice `line_items[].kind`, mirroring the `setupKey` normaliser in `subscription-billing-actions` so the two spellings (`setup_pricelabs` / `pricelabs_setup`) both match. A line is marked `paid` when its key appears on a paid invoice for at least its current amount; otherwise `due`.

Jongensfontein's paid once-off invoice `ROL-SET-JON-202608-003` (R 2 150, paid 8 Aug 2026, covering white-label setup R 1 500 and PriceLabs setup R 650) will therefore render both lines as `paid` and the header as fully settled.

## Technical notes

- New small helper `src/lib/setupSettlement.ts`: normalised setup key + `resolveSetupSettlement(contractedLines, onceOffInvoices)` returning `{ paidTotal, outstanding, lastPaidAt, byKey }`. Pure function, unit-testable, shared with any future surface.
- `src/components/property/AdminOverviewTab.tsx`: add a react-query fetch of once-off invoices scoped by `scope.source` (`portfolio_id` vs `property_id` from `useBillingConfig`), feed it plus the existing once-off cost lines into the helper, and render the badges/notes. No write paths, no billing logic changes.
- No database migration and no edge function change; the invoicing behaviour for re-opened balances already exists.
