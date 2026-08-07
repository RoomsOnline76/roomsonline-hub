# Invoice Billing Party & Channel Attribution (ROL'OS)

## Why

Today a ROL'OS invoice only stores a free-text "Invoice To" name. There is no structured link to *who* is actually being billed (guest, company, travel agent/tour operator) and no record of *which channel* the booking arrived through on the invoice itself. That makes commission tracking and reconciliation manual.

Confirmed current state:
- `rolos_invoices` has `invoice_to` (text) and `reference` (text) only — no billing-party or channel columns.
- `bookings` already has `company_account_id`, `agent_account_id`, `source_account_id`, `booker_id`, `booking_channel`, `comm_channel` — but all 33 bookings currently have those account links empty.
- `crm_accounts` already supports `company`, `travel_agent`, `tour_operator`, `source` types with `vat_number`, address, `default_commission_rate`, `payment_terms_days`.
- Invoice generation happens in `pms-financial` → `generate_invoice`, and the only UI is the Account Summary panel on a booking card.

## What we'll build

### 1. Structured "Bill to" on every invoice
Each invoice gets an explicit billing party:
- **Guest** (default) — the in-house guest pays.
- **Company / Travel agent / Tour operator** — picked from CRM accounts; name, VAT number, address and payment terms pull through automatically onto the document.
- **Channel** — the invoice is raised against the distribution channel the booking came from (e.g. ROL'OS Channels, embed, itinerary, direct), for OTA/channel settlement.

The invoice stores the choice, the linked CRM account, the channel key, and the commission basis in effect at issue time, so a later change to the CRM record never rewrites history.

### 2. Bill-to selector in the Account Summary panel
Replace the single free-text "Invoice To" field with:
- Party type segmented control (Guest / Company / Agent / Channel)
- CRM account picker (reuses the existing account picker) when Company/Agent is chosen, with an inline "add account" path
- Channel dropdown when Channel is chosen, pre-selected from the booking's own channel
- Read-only preview line showing exactly what will print (name, VAT no., terms) plus the resolved commission % and amount

Defaults are smart: if the booking already has a company/agent linked, the invoice pre-selects it; otherwise Guest.

### 3. Commission & reconciliation
- When the billing party is a channel or an agent with a commission rate, the invoice records `commission_rate`, `commission_amount` and `net_payable`, and shows them as a distinct block on the printed document.
- New **Invoices & Recon** view (Revenue area) listing all invoices for the property/portfolio with filters by document kind, billing party type, account, channel, status and date. Columns: number, booking, billed to, channel, gross, commission, net, outstanding, paid.
- Group totals per account and per channel so an owner can tick off a channel statement or invoice an agent for a period.
- Existing invoices are backfilled as "Guest" with the current `invoice_to` name preserved, so nothing is lost.

### 4. Stamp the channel on bookings that lack it
Manual bookings created in ROL'OS get the channel and (optionally) the CRM account captured at creation, so invoices and reports have something to attribute to.

## Technical notes

- Migration (additive, nullable): `rolos_invoices` gains `bill_to_type text` (guest|company|agent|channel), `bill_to_account_id uuid → crm_accounts`, `bill_to_name`, `bill_to_vat`, `bill_to_address`, `channel_key text`, `commission_rate numeric`, `commission_amount numeric`, `net_payable numeric`. Backfill `bill_to_type='guest'`, `bill_to_name = invoice_to`. GRANTs mirror the table's existing policies; no RLS change needed since access stays folio/property scoped.
- `pms-financial → generate_invoice` accepts `bill_to_type`, `bill_to_account_id`, `channel_key`; resolution order becomes explicit selection → booking account links → guest. Commission resolves via the existing `commissionResolver` for channels and `crm_accounts.default_commission_rate` for agents. `invoice_to` keeps being written for backward compatibility with the emailer and existing PDFs.
- `generateInvoiceHTML` gains a Bill To block (name/VAT/address/terms) and, when commission applies, a Commission / Net payable summary.
- New `list_invoices` action in `pms-financial` (property or portfolio scope, filters, aggregates) powering the recon view.
- Frontend: extend `AccountSummaryPanel.tsx` with the bill-to selector, reusing `CrmAccountPicker`; new `PMSInvoices` page + route under Revenue in `PMSSidebar` / `PmsMobileBottomNav`; channel labels come from `channelVocabulary.ts` so no vendor names leak.
- No changes to rate resolution, booking totals or payment flows.
