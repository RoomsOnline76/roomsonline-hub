## Goal

When a property/portfolio's billing start date is due, automatically email the owner a "start your subscription" reminder with a payment link. Owner clicks → pays their first month via ROL PayFast → dashboards flip to **Active** and next-due date rolls forward one month. Cancel-anytime messaging included.

## Flow

```text
billing_start_date reached
   ↓ cron (daily)
send reminder email → subscription_invoices row (status=pending)
   ↓ owner clicks link
/subscribe/pay/:token  → initiate PayFast payment
   ↓ PayFast ITN webhook
mark paid, set current_period_end = now + 1 month, status=active
   ↓
dashboards (admin + ROLOS owner) show Active until <date>
   ↓ 5 days before current_period_end
send renewal reminder (same flow)
```

## Data model (new migration)

New table `public.subscription_invoices`:
- `id uuid pk`, `property_id`, `portfolio_id` (one required), `owner_id`
- `amount numeric`, `currency text default 'ZAR'`
- `period_start date`, `period_end date`
- `status text` — `pending | paid | failed | cancelled`
- `payfast_payment_id text`, `payfast_token text` (secure link token)
- `email_sent_at`, `paid_at`, `reminder_count int default 0`
- `created_at`, `updated_at`
- RLS: owners select own; admins manage; anon SELECT by token (for pay page).
- GRANTs for `authenticated`, `service_role`; `anon` limited SELECT via SECURITY DEFINER RPC `get_subscription_invoice_by_token(token)`.

Extend `property_billing_configs` + `portfolio_billing_configs`:
- `subscription_status text default 'pending'` — `pending | active | past_due | cancelled`
- `current_period_end date`
- `last_invoice_id uuid`
- `cancelled_at timestamptz`

## Edge functions

1. **`billing-subscription-cron`** (scheduled daily via pg_cron)
   - Finds configs where `billing_start_date <= today AND subscription_status='pending' AND no pending invoice today` → create invoice + email.
   - Finds `subscription_status='active' AND current_period_end - 5 days = today` → create renewal invoice + email.
   - Marks `past_due` after `current_period_end` passes without payment.

2. **`subscription-invoice-pay`** — POST `{token}` → generates PayFast signed form (reusing existing `payfast-api` helpers), returns redirect URL. Merchant ref = invoice id.

3. **`subscription-payfast-itn`** — public ITN webhook. Verifies signature, marks invoice paid, updates config `subscription_status='active'`, sets `current_period_end = period_start + 1 month`, writes `billing_transactions` row.

4. **`send-subscription-reminder`** — used by cron; calls existing `send-transactional-email`.

## Email template

New app-email template `subscription-reminder` in `supabase/functions/_shared/transactional-email-templates/`:
- Subject: "Activate your Rooms Online subscription"
- Body: amount, period, "Cancel anytime — no lock-in", CTA button → `https://<host>/subscribe/pay/<token>`.
- Second variant `subscription-renewal` for renewals.

## Frontend

- **New public route** `src/pages/SubscriptionPay.tsx` at `/subscribe/pay/:token`
  - Loads invoice via RPC, shows amount + period + Cancel-anytime note, button → calls `subscription-invoice-pay` → redirects to PayFast, plus "Cancel subscription" link that POSTs to a `subscription-cancel` edge fn (sets `cancelled_at`, status `cancelled`).
- **`BillingConfigTab.tsx`** — add a "Subscription status" panel: shows status badge, `current_period_end`, last invoice, "Send reminder now" (admin) and "Cancel subscription" buttons.
- **ROLOS owner dashboard** (`src/pages/pms/PMSDashboard.tsx` or the billing widget) — small card: "Subscription: Active until DD MMM YYYY" or "Payment due — Pay now" linking to pay page.
- **Admin overview** (`AdminOverviewTab.tsx`) — add status/next-due line under the cost estimator.

## PayFast reuse

Reuse existing `payfast-api` merchant credentials (ROL facilitator account). No new secrets needed unless a separate merchant ID is wanted for subscription revenue (leave as follow-up).

## Cron

Schedule `billing-subscription-cron` daily 06:00 UTC via `cron.schedule` in a migration.

## Out of scope (this pass)

- Recurring auto-debit tokenisation (owner clicks link each month; simplest and matches "cancel anytime"). Adding PayFast recurring tokens can follow if desired.
- SMS reminders.
- Portfolio-level split billing beyond a single invoice.
