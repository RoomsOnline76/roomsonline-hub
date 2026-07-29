## Goal

Three fixes: clean up the Jongensfontein test invoices, stop the cron creating a new invoice every day, and make every "Pay" link use the production domain instead of the Lovable preview URL.

## What I found

- All 9 invoices belong to the **Jongensfontein portfolio** (`22a7d374…`), all `activation`, ZAR 450, created daily at 06:00 (7 still `pending`, 2 already `cancelled`).
- `billing-subscription-cron` de-duplicates on `period_start = today`, so an activation invoice is created **fresh every day** (and twice on some days).
- The edge functions already build pay links from `SITE_URL` (correct production domain). The **frontend** is the problem: `SubscriptionInvoiceDownloadCenter.tsx` and `SubscriptionStatusPanel.tsx` build the pay URL with `window.location.origin`, which in preview is the `lovableproject.com` host — so Pay opens the Lovable domain, and PayFast/cancel round-trips stay there.

## Plan

**1. Cancel the test invoices (migration)**
- Set all `pending` `subscription_invoices` for portfolio `22a7d374-7e2e-4194-8d32-aa870813359e` to `cancelled`.
- Release any `subscription_charge_items` reserved against those invoices (`invoiced_on_invoice_id = null`) so they aren't lost.
- Set that portfolio's billing config to a non-billing state so the cron stops: clear `billing_start_date` and set `subscription_status = 'inactive'`.

**2. Add an explicit billing on/off switch**
- Add `billing_enabled boolean not null default false` to `property_billing_configs` and `portfolio_billing_configs`.
- Backfill `true` only where a subscription invoice has actually been paid; everything else stays off.
- Surface it as an admin-only "Billing active" toggle in the billing config UI, with a note that no invoices or reminder emails are issued while it's off.

**3. Stop duplicate invoice generation (cron fix)**
- Skip any entity where `billing_enabled` is false or `billing_start_date` is null.
- For activation invoices, de-duplicate on *any* existing pending/paid activation invoice for the entity rather than on `period_start = today`.
- Replace `.maybeSingle()` with an ordered `limit(1)` lookup so multiple pending rows can't throw.
- Add a DB unique partial index preventing more than one pending invoice per entity per `period_start`.

**4. Production-domain pay links (frontend)**
- Use `ADMIN_DOMAIN` from `src/lib/config.ts` instead of `window.location.origin` in `SubscriptionInvoiceDownloadCenter.tsx` and `SubscriptionStatusPanel.tsx`.
- Sweep the remaining `window.location.origin` link builders that generate shareable/payment URLs and point them at the config domains too.
- Confirm `payfast-api` return/cancel URLs for subscriptions resolve to `sleepinafrica.roomsonline.co.za` (they already default there; the Lovable host was only inherited from the frontend link).

## Technical notes

Files touched: `supabase/functions/billing-subscription-cron/index.ts`, `src/components/property/SubscriptionInvoiceDownloadCenter.tsx`, `src/components/property/SubscriptionStatusPanel.tsx`, the admin billing config builder, plus two migrations (invoice cancellation + `billing_enabled` column/index).
