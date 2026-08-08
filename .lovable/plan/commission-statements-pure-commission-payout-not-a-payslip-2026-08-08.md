# Commission statements: pure commission payout, not a payslip

Rewrite the referral commission statement so it reads as an independent commission payout, and update the Referral Partner Agreement so the tax position (SARS) sits correctly with the referrer.

## 1. Wording: stop calling it a payslip

Today the statement is described internally and in the UI as a "paysheet" and shows only "Net payable". Employment-flavoured language is removed everywhere:

- Admin → Commission Statements page copy, statement detail panel, run panel, hook and library comments: "paysheet"/"earnings" become "commission statement" / "commission payout".
- PDF title stays **COMMISSION STATEMENT** but gains a subtitle line: *Referral commission payout — not remuneration. No employment relationship exists.*
- Money labels: "Net payable" becomes **Net commission payout**; the header block adds **Payout reference** next to it.
- Recipient label changes from "Statement to" to **Referral partner (independent contractor)**.

## 2. Tax / SARS position stated on the document

A standing declaration block is added to the PDF, the email, and the on-screen detail:

> This is a commission payout to an independent referral partner. No PAYE, UIF or SDL is withheld. The partner is solely responsible for declaring this income to SARS, for their own provisional/income tax, and for VAT where they are a registered vendor.

VAT handling becomes explicit rather than silent:
- If the partner is **not** a VAT vendor: the payout is stated as a non-VAT commission amount.
- If the partner **is** a VAT vendor: the statement shows the commission exclusive amount, VAT at the current rate, and the total payout, and notes that a valid tax invoice from the partner is required before payment.

To do that, the partner record needs tax identity fields (see Technical notes). Where a partner's tax status has not been captured, the statement shows an explicit "tax status not confirmed" warning and the VAT block is omitted rather than guessed.

## 3. Payout reference to the referrer

Every issued statement already mints `statement_reference` on approval. That becomes the single, prominent **payout reference**:

- Shown large in the payout block of the PDF, in the email subject and header, and in the statements list.
- The bank payment reference defaults to the statement reference so the referrer can match the deposit; a manual `paid_reference` still overrides it and both are shown when they differ.

## 4. Referral Partner Agreement — legal alignment

The active "Referral Partner Agreement" template is superseded by a new version (existing signed contracts are untouched — versioning already supports this). Changes:

- **New clause: Independent contractor status.** No employment, agency, partnership or joint venture; the partner controls their own manner of work, supplies their own means, and is not subject to ROL's control as an employee. Explicitly not remuneration under the Labour Relations Act / Basic Conditions of Employment Act.
- **New clause: Tax and statutory compliance.** Commission is paid gross of the partner's own taxes. ROL withholds no PAYE, UIF or SDL. The partner warrants they are registered with SARS as required, will declare all commission income, and will indemnify ROL against any SARS claim arising from their non-compliance.
- **New clause: VAT.** Where the partner is a registered VAT vendor they must supply their VAT number and issue a valid tax invoice; VAT is then payable in addition to commission. Where not registered, no VAT is payable and the partner must notify ROL within 14 days of becoming registered.
- **New clause: Invoicing and records.** The ROL commission statement serves as a reconciliation document; it is not a payslip and creates no employment record. The partner keeps their own records for SARS purposes.
- Payment terms clause reworded from "payments" to "commission payouts", with the payout reference named.
- Existing clauses that read as employment-like ("Partner shall not represent themselves as an employee") are kept and strengthened.

## 5. Where it shows up

- `Admin → Commission Statements`: list, detail, download PDF, email to partner.
- `Admin → Sales Reps`: new tax identity capture on the partner record, plus a validation badge when tax status is missing so statements are not issued blind.
- `Admin → Contracts`: the new agreement version, ready to preview and activate.

## Technical notes

- **Migration:** add to `sales_reps` — `entity_type` (`individual`/`company`), `trading_name`, `tax_reference_number`, `vat_registered` (bool), `vat_number`. Add to `rep_commission_reports` — `tax_snapshot jsonb` so the tax status, VAT rate and VAT amount are frozen onto the statement at approval, and `vat_amount numeric`.
- **Files:** `src/lib/commissionStatement.ts` (labels, new `COMMISSION_PAYOUT_TAX_NOTE`, VAT maths helper), `src/lib/commissionStatementPdf.ts` (subtitle, payout block, declaration, VAT rows), `src/components/commission/CommissionStatementDetail.tsx`, `src/components/commission/CommissionStatementRun.tsx`, `src/pages/AdminCommissionReports.tsx`, `src/hooks/useCommissionStatements.ts`, `src/pages/AdminSalesReps.tsx` (tax identity fields).
- **Edge functions:** `supabase/functions/send-commission-statement` (wording, declaration, VAT block, reference in subject) and `calculate-rep-commissions` (write `tax_snapshot`/`vat_amount` at generation).
- **Contract template:** new `contract_template_versions` row for template `Referral Partner Agreement`, activated as `current_version_id`; existing `{{rep_name}}`, `{{rep_code}}`, rate and clawback placeholders are reused, with `{{vat_status_clause}}` added and resolved from the partner record via `src/lib/repContractVariables.ts`.
- VAT rate comes from the existing `VatSettings` used by payout statements — no new source of truth.

## Not included

- No change to how commission is calculated or to the rate cascade.
- No withholding tax deduction logic; ROL does not withhold, by design.
- This is drafting support, not legal advice — the new agreement version should be signed off by the user's attorney before activation.
