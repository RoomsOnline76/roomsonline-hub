# Referral Commission Statements — enterprise rebuild

## Decision: one surface, not two

Merge everything into **Admin → Commission Reports**, renamed **Commission Statements**, and remove the "Commission Payouts" sub-tab from Admin → Payments. Payments keeps a single read-only KPI card ("Rep commissions awaiting payout") that links across. Two half-views of the same money is the current problem; the payout page is for money owed to *properties*, this page is for money owed to *referrers*.

## What is broken today (verified)

- The engine reads `billing_global_defaults` filtered on `strategy = 'default'`. That row does not exist (the only row is `rolos_pms`), so every run silently falls back to hardcoded 20/5 and ignores the rates configured in Billing Defaults.
- Tier rates for accelerated/elite are hardcoded in the edge function and disagree with the tier criteria the admin edits in Billing Defaults.
- `property_referrals` already carries `first_year_rate_override`, `residual_rate_override`, `residual_months_override` — the engine never reads them.
- The revenue base is `billing_transactions`, which is empty. Actual ROL revenue now lives in the payout statement ledger and in subscription invoices, so commissions would compute as zero even with live reps.
- A statement is only a total and a row count: no per-property paysheet, no reference number, no banking snapshot, no PDF, no email.
- There are currently 0 reps, 0 referrals and 0 commission rows, so this can be rebuilt cleanly with no data migration risk.

## The statement model

One statement per rep per month, immutable once finalised, mirroring the property payout statement design.

```text
COMMISSION STATEMENT   ROL-COM-<REPCODE>-YYYYMM-NN
Rep: name / code / tier      Period: 1–30 Nov 2026

Per property (one block per referred property)
  Property        Since     Type         ROL revenue   Rate    Commission
  Dassie Single   Mar 2026  First year      12 400.00   20.0%     2 480.00
    · booking commission (14 bookings)      10 900.00
    · platform subscription                  1 500.00
  Fonteinhutte    Jan 2025  Residual         8 000.00    5.0%       400.00
  ------------------------------------------------------------------
  Gross commission                                              2 880.00
  Clawback / adjustments                                         -150.00
  NET PAYABLE                                                   2 730.00

Paid to: bank / masked account / holder      Reference: ROL-COM-…
Basis note: commission is earned on ROL net revenue only — guest
payments, payment-gateway fees, facilitator surcharges and pass-through
costs are excluded.
```

Statement lifecycle: **draft → pending approval → approved → paid** (or *void*). Draft can be regenerated freely; approval snapshots rates, revenue and banking so later data changes cannot rewrite a signed-off paysheet. Anything that arrives after approval lands in the next period as an adjustment line.

## Revenue base (the "sum of revenue ROL generated")

Commissionable revenue per property per period, all excluding pass-through money:

1. Booking commission ROL actually earned — from the payout statement ledger (`commission_amount` on booking and recovery lines), so the rep paysheet reconciles line-for-line with the property payout statements.
2. Platform/subscription revenue — paid subscription invoices for that property in the period.
3. Explicit adjustments/clawbacks captured by an admin.

Excluded: guest gross, transaction fees, BYO gateway fees, facilitator surcharge, PriceLabs and white-label pass-through surcharges.

## Rate resolution (single cascade, one source of truth)

`referral override → rep tier criteria (Billing Defaults) → billing_global_defaults referral_* → platform constants`, with first-year vs residual chosen from months since the referral converted, and the residual window ending the entitlement. Each line records the rate **and** where the rate came from, shown in the UI and on the PDF. This cascade is implemented once in a shared module used by both the edge function and the UI, so admin preview and generated statement can never disagree.

Clawback: if a property churns inside its clawback window, the affected commission is reversed as a negative line on the next statement with a reason, rather than deleting history.

## Page layout — Admin → Commission Statements

- **Header KPIs**: commissionable revenue this period, gross commission, awaiting approval, approved & unpaid.
- **Run panel**: pick a month → *Preview* (calculates, writes nothing) → *Generate drafts* → per-rep review.
- **Statement list**: rep, period, reference, properties, revenue, commission, status, actions.
- **Statement detail drawer**: per-property blocks with expandable revenue components, rate + rate source, clawbacks, net payable, banking, and an audit trail (generated / approved by / paid at).
- **Actions**: Approve, Mark paid (with payment reference + date), Void with reason, **Download PDF**, **Email statement to rep** (uses the existing branded mailer used for payment advices; a warning shows if the rep has no verified banking).
- **Rep-facing**: the sales rep dashboard shows their own statements with the same PDF download, read-only.

## Technical notes

- Migration: add snapshot/lifecycle columns to `rep_commission_reports` (`statement_reference`, `period_start`, `period_end`, `total_revenue`, `gross_commission`, `adjustments_total`, `net_payable`, `bank_snapshot`, `terms_snapshot`, `finalized_at`, `paid_reference`, `void_reason`, `emailed_at`) plus a reference counter and sequential minting function, and extend `rep_commission_entries` with `report_id`, `revenue_breakdown` jsonb, `line_kind` (`commission` / `adjustment` / `clawback`), `rate_source`, `notes`. GRANTs and RLS follow the existing rep/admin pattern: admins and `fearless_leader` full access, reps read-only on their own rows.
- New `src/lib/commissionStatement.ts` (types, rate cascade, revenue aggregation, totals) and `src/lib/commissionStatementPdf.ts` (jsPDF, matching the payout statement house style).
- Rewrite `supabase/functions/calculate-rep-commissions/index.ts` as a preview/generate/finalize engine (idempotent per rep+period, correct globals lookup, overrides honoured, payout-ledger revenue base), and add statement emailing to the existing mailer function.
- Rewrite `src/pages/AdminCommissionReports.tsx` around the run panel + detail drawer; extend `src/hooks/useRepCommissions.ts`; trim the commissions tab out of `src/pages/AdminPayments.tsx`; extend the rep view in `src/components/dashboard/SalesRepDashboard.tsx`.
