# ROL Pulse → Cost Sharing (60/40) & Consolidated Statement

Adds a controlled 40/60 expense-split mechanism to Revenue Pulse → Accounting, tracking of funds contributed by Dawie and Carike, and a downloadable consolidated statement PDF in the same layout as the uploaded StarshipX invoice.

## 1. The split toggle (dev-only)

- New **Cost Sharing** tab inside Revenue Pulse → Accounting.
- A single config record holds: split active (on/off), RoomsOnline share (default 60%), Partner share (default 40%), and a "commissioning complete" flag.
- The toggle is only usable by `dev@roomsonline.co.za`. Everyone else with Pulse access sees the split read-only. When commissioning is marked complete the split stops applying to new periods and the toggle switches off.

## 2. Contributions capture

- Capture contributed funds with: contributor (Dawie / Carike), date, amount, currency (ZAR/USD/EUR), method, reference, note, optional document attachment (same private storage pattern as bill documents).
- Contributions list with edit/delete, plus per-contributor totals.

## 3. Split accounting logic

- **Accumulative spend** = all bills ever loaded, converted to ZAR (all-time), plus the spend for the selected period.
- Allocation: RoomsOnline/Carike 60%, Partner/Dawie 40% of consolidated total.
- Dawie's 40% is treated as **settled** — all invoices to date were paid by him in full.
- Carike's contributions are deducted from her 60% allocation; the remainder is her **outstanding balance**.
- Any contribution by Dawie above his 40% is shown as a credit against Carike's outstanding.
- Summary cards: accumulative spend, 60% allocation, contributions received, outstanding.

## 4. Consolidated statement PDF

Downloadable from the Cost Sharing tab, replicating the uploaded document:

- Header: StarshipX issuer block, Bill To (RoomsOnline), statement number (auto: `Sx-ROL-<YYYYMMDD>`), statement date, reference line naming the settlement basis (60/40 split).
- **Constituent breakdown table** for the *selected period*: date, receipt no., description, source-currency amount, ZAR amount.
- Consolidated totals in source currency and ZAR, with the FX rate used shown (editable per statement, defaults to the current stored rate).
- Allocation blocks: RoomsOnline 60% less payments received = outstanding; Partner 40% less funds paid = nil; Total allocation 100%.
- **All-time summary at the bottom**: total funds spent to date, total contributed by each party, total outstanding.
- Notes section and signature block (Dawie J Erasmus, contact details).

## Technical notes

- Migration: `rol_cost_share_config` (single-row config, `updated_by`) and `rol_contributions`; GRANTs for `authenticated`/`service_role`; RLS restricting reads to dev/fearless_leader and writes/toggle to the `dev@roomsonline.co.za` account via an `auth.email()` check. Adds an optional `receipt_number` column to `invoices` so the statement's Receipt No. column is real data (falls back to blank where absent).
- Split maths lives in a new `src/lib/costSharing.ts` (pure functions, reusing `invoiceZar`/FX helpers from `src/lib/burnRate.ts`) so figures on screen and in the PDF cannot diverge.
- PDF built with the already-installed `jspdf` + `jspdf-autotable` in `src/lib/costShareStatementPdf.ts`; brand colours from existing tokens.
- New UI: `src/components/insights/CostSharingPanel.tsx`, `AddContributionModal.tsx`, wired as a tab in `AccountingDashboard.tsx` (receives the existing `dateRange`).
