# Automatic subscription renewal (no more "please pay" for active plans)

## What is happening today

Verified in the code and the live billing records:

- There is no recurring mandate anywhere. Every month the cron raises a fresh `subscription_invoices` row and emails a manual pay link (`/subscribe/pay/<token>`). `payfast_token` on the invoice is our own link token, not a PayFast mandate.
- `payfast-api` only ever creates a **once-off** checkout (`initiate_subscription_payment`). PayFast's recurring/tokenised fields (`subscription_type`, `recurring_amount`, `frequency`, `cycles`) are listed in the signature order but never sent.
- Billing configs have no column to store a mandate token.
- Jongensfontein.com is currently `subscription_status = cancelling`, `cancel_at_period_end = true`, covered to **2026-09-14**, with a **pending fee of ZAR 2460 effective 2026-09-15**. So the reminder in the screenshot asked for money on a period that is already covered and on a plan that is being closed and re-opened at a new amount — exactly the case that must never generate a payment demand.

## What to build

### 1. A real recurring mandate
- On the **first** subscription payment, send the PayFast checkout as a tokenised subscription (`subscription_type=2`, recurring amount, monthly frequency, indefinite cycles) instead of a once-off sale.
- Store the returned mandate token and its state on the billing config (new columns: mandate token, mandate status, mandate amount, mandate created/cancelled timestamps, last auto-charge result).
- Every following month the renewal is **charged automatically** by the cron against the stored token (PayFast ad-hoc charge on the mandate), reusing the existing merchant-API signing helper in `payfast-api`.

### 2. Renewal becomes silent when it works
- Cron flow per config: mandate active and amount unchanged → charge automatically, mark the invoice paid from the ITN, roll `current_period_start/end`, then email the owner a **paid tax invoice** (thank-you, no payment request).
- Only when there is genuinely nothing to collect against do we ask a human:
  - no mandate yet (first activation),
  - mandate cancelled/expired/declined by the bank,
  - subscription not activated (`pending`) or suspended.
- `send_due_reminder` gets a hard guard: skip whenever the period is already covered, whenever `cancel_at_period_end` is set, and whenever an active mandate exists. The current fallback that invents a monthly amount from `fee` is removed for the non-preview path.

### 3. Amount changes = cancel and re-open (PayFast cannot repriced a live mandate)
- When the monthly fee changes, write it to `pending_monthly_fee` / `pending_effective_date` as today, and additionally: cancel the existing mandate at period end and flag the config as needing re-authorisation.
- At the effective date the owner gets one clear "confirm your new monthly amount" email with a single link that creates a new mandate at the new amount. Until they confirm, status stays `awaiting_mandate` — no dunning emails, no service cut mid-period.
- Failed auto-charge: retry twice over 5 days, then fall back to the existing manual reminder + `past_due`.

### 4. Visibility
- ROL Account and the admin billing panel show mandate state (Automatic renewal on / Awaiting authorisation / Cancelled at 2026-09-14) plus the next auto-charge date and amount.
- Every auto-charge attempt is logged to `subscription_invoice_events` / `billing_config_change_log` for audit.

### 5. Jongensfontein sanity pass
Confirm no reminder is generated for the covered period, and that the 2026-09-15 re-open at ZAR 2460 arrives as a mandate-authorisation email rather than a payment demand.

## Technical notes

- `supabase/functions/payfast-api/index.ts`: new `initiate_subscription_mandate` (tokenised checkout), `charge_subscription_mandate` (ad-hoc), `cancel_subscription_mandate`; ITN handler extended to capture the token on the first payment and to settle ad-hoc charges.
- `supabase/functions/billing-subscription-cron/index.ts`: renewal branch attempts the auto-charge before any invoice-and-remind path.
- `supabase/functions/subscription-billing-actions/index.ts`: reminder guards, mandate actions for staff/owner, re-authorisation link.
- Migration: mandate columns on `property_billing_configs` and `portfolio_billing_configs` (+ GRANTs unchanged, RLS already in place).
- No changes to commission or setup-fee streams; setup fees stay once-off.
