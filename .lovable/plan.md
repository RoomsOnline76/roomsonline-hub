
## Goal

Make subscription invoices reflect what's actually due:
- **First invoice** = monthly fee + all applicable once-off fees (white-label setup, branding setup, PriceLabs setup, enterprise setup).
- **Subsequent invoices** = monthly fee + any once-off charges added since the last paid invoice (running balance).
- **Monthly amount** on renewals only carries the recurring fee.
- **After payment**, generate a branded PDF invoice and email it to the owner as an attachment.

## Data model

**New table `subscription_charge_items`** (pending charges ledger per property/portfolio):
- `kind` (setup_whitelabel, setup_branding, setup_pricelabs, setup_enterprise, adjustment, note)
- `description`, `amount`, `currency`
- `status` (pending, invoiced, waived)
- `invoiced_on_invoice_id` (nullable FK)
- `created_at`, `invoiced_at`

**Extend `subscription_invoices`**:
- `subscription_amount` (monthly portion)
- `once_off_amount` (sum of once-off items on this invoice)
- `line_items JSONB` (rendered snapshot for the PDF/email)
- `pdf_url` (nullable — stored in the `invoices` storage bucket after payment)
- `invoice_number` (human-readable, e.g. `RO-2026-000123`)

**Trigger `detect_once_off_activations`** on `property_billing_configs` and `portfolio_billing_configs`:
When a fee toggles from 0/off to > 0, enqueue a matching row in `subscription_charge_items` (dedup by `kind` + entity while status=pending).

## Cron changes (`billing-subscription-cron`)

When building an invoice:
1. Compute `subscription_amount` from tier resolver.
2. Sum all `pending` `subscription_charge_items` for the entity → `once_off_amount`, capture snapshot in `line_items`.
3. `amount = subscription_amount + once_off_amount`.
4. Insert invoice, then mark those charge items `invoiced` and set `invoiced_on_invoice_id`.
5. Renewals with zero pending once-offs simply pass the monthly fee.

## Payment completion (`payfast-api` ITN handler)

After marking `subscription_invoices.status = 'paid'`:
1. Assign next `invoice_number` from a Postgres sequence.
2. Invoke new edge function `generate-subscription-invoice-pdf` with `invoice_id`.
3. That function:
   - Loads the invoice, entity name, owner details, line items.
   - Renders a PDF using `pdf-lib` (Deno-compatible) with Rooms Online branding (pink #E91E8C headings, ivory body).
   - Uploads to `invoices` storage bucket at `subscriptions/<owner_id>/<invoice_number>.pdf`.
   - Signs a 30-day URL and stores it in `subscription_invoices.pdf_url`.
   - Emails the owner via Resend with the PDF attached, using the same brand tokens as the reminder email.
4. If the PDF/email step fails, the payment is still recorded — a `subscription_invoice_events` log row captures the error for admin retry.

## UI touch-ups

- **`SubscriptionStatusPanel`**: split the latest-invoice row into "Monthly" + "Once-off", show a link to the stored PDF once available.
- **`SubscriptionPay` page**: show the same breakdown (monthly vs once-off) with a per-line list so the owner sees exactly what they're paying for.
- **`BillingConfigTab` (admin)**: small "Pending once-off charges" list with a "Waive" action for admins, so mistakes can be reversed before invoicing.

## Non-goals / assumptions

- Currency stays ZAR (matches existing config).
- Invoice numbering is a shared sequence across property + portfolio subscriptions.
- Only the four defined once-off fees are auto-tracked; free-form adjustments go through the admin "Add adjustment" action on the pending list.
- No changes to WBE / commission logic — this only touches subscription billing.

## Technical details

- Use `pdf-lib` (`npm:pdf-lib@1.17.1`) in the new edge function; embed the Rooms Online logo via a base64 asset stored in the function.
- Storage: reuse existing `invoices` bucket (already hardened per prior security fix). Signed URLs only, no public listing.
- Email: existing Resend setup, `billing@notify.sleepinafrica.roomsonline.co.za` sender, brand-consistent HTML with PDF attachment (base64).
- Trigger safety: `detect_once_off_activations` is `SECURITY DEFINER`, `search_path=public`, and skips inserts when a pending row of the same `kind` already exists.
- Cron reuses the existing 06:00 UTC schedule — no new job needed.
