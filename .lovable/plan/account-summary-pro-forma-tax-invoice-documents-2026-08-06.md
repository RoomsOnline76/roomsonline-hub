# Account Summary: Pro Forma & Tax Invoice Documents

Bring the booking "Account" view in line with the NightsBridge-style Account Summary: a pro forma invoice that can be generated/downloaded before the stay (and attached to the confirmation email), and a final tax invoice that can only be generated after check-out.

## What the user gets

In an open booking → Invoice/Account tab, a new **Account Summary** panel:

- **Details**: account status (Uninvoiced / Pro Forma issued / Invoiced / Closed), "Invoice To" name (defaults to guest, editable for company billing), and a free-text Reference field.
- **Pro Forma** row: number (blank until generated), **Generate** and **View / Download** buttons. Available at any time, including before arrival. Re-generating replaces the current pro forma.
- **Final Invoice** row: number, **Generate** and **View / Download**. Disabled until the departure date has passed (or the booking is checked out); tooltip explains why. Titled "Tax Invoice" when the property is VAT-registered, otherwise "Invoice".
- **Totals** column: Accommodation, Extras, Payments, Outstanding — reusing the existing folio/gateway maths already in the invoice view.
- **Send to guest**: emails the currently issued document (pro forma before stay, tax invoice after).
- **Confirmation email**: when a booking confirmation is sent and no payment has settled the full amount, a pro forma is generated automatically and its download link is included in the email (replacing the current "an invoice will be issued in due course" note). Paid bookings keep the existing behaviour.

Existing Folio tab (charges, payments, refunds) stays as is; the Account Summary sits above the current invoice preview.

## Technical notes

- **Schema**: extend `public.rolos_invoices` with `document_kind` (`pro_forma` | `tax_invoice`, default `tax_invoice`), `booking_id`, `invoice_to`, `reference`, and a unique partial index so one live pro forma and one final invoice exist per booking. Add GRANTs/RLS in line with the existing table's policies.
- **`pms-financial` edge function**: parameterise `generate_invoice` with `document_kind` + `booking_id` + `invoice_to`/`reference`; number series `PF-…` for pro forma and `INV-…` for final. Reject `tax_invoice` when `check_out_date > today` and the booking is not checked out. Keep the current VAT/refundable-deposit maths; render pro forma HTML with a "PRO FORMA INVOICE — not a tax invoice" banner and no VAT reclaim wording. Add a `get_booking_invoices` action for the panel to list issued documents.
- **Frontend**: new `src/components/pms/booking/AccountSummaryPanel.tsx` (Details / Pro Forma / Final Invoice / Totals, wired to `callPmsApi`), rendered in the booking Invoice tab in `PMSDashboard.tsx` and linked from the Account column in `BookingDetailsGrid.tsx`. Totals logic factored out of `BookingInvoice.tsx` into a small shared helper so both views agree.
- **Email**: in `send-booking-email`, for unpaid confirmations call the pro forma generator (idempotent per booking) and inject a branded "Download your pro forma invoice" block; document sends from the panel reuse the same function with a `document_kind` argument.
- Signed storage URLs stay 7 days; the panel refreshes the link on demand rather than persisting a stale one.
