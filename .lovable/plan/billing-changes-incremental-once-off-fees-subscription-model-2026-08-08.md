# Billing changes: incremental once-off fees + subscription model switch

When a property's (or portfolio's) billing configuration is edited, the system should react automatically instead of leaving reconciliation to staff.

## Behaviour to build

### 1. Once-off (setup) fees — bill only the new balance
- On save, compare the newly contracted once-off fees (white-label setup, branding add-on setup, PriceLabs setup, and any future setup lines) against what has already been invoiced or paid for that same fee type.
- Raise a fresh once-off invoice for the **difference only**. Nothing already paid is ever re-billed.
- Newly added fee types are added in full.
- If a fee is reduced or removed and the old amount was already paid, no automatic credit is issued — the change is logged and flagged for staff to raise a credit note manually.
- If the delta is zero, nothing is invoiced.

### 2. Subscription model change — cancel and re-activate
- If the monthly model changes (strategy, tier, room-count override, or any recurring add-on that changes the monthly total), the current subscription is scheduled to **cancel at the end of the period already paid for** — service is never cut mid-period.
- The new model is stored as *pending*, with an effective date equal to the day after the paid period ends.
- The owner activates the new subscription themselves, and the activation button only unlocks inside the existing 7-day window before it becomes due (same rule as the first activation today).
- If the owner does nothing, the account follows the existing cancel → suspend path on the effective date, and can be reactivated onto the new model at any time.
- If there is no active subscription yet (still in the free period, or pending/suspended), the new model simply replaces the old one with no cancellation ceremony.

### 3. Email notification on every change
For each billing change, email the owner and copy the internal billing admins:
- "Billing updated — additional once-off fee due" (with the itemised delta and a pay link), and/or
- "Subscription plan change scheduled" (old monthly amount, new monthly amount, date the current plan runs to, date the new plan starts, and that the owner activates it from the ROL Account).
Both use the existing branded billing email styling and the verified sending domain.

## Technical notes

**Database (one migration)**
- New table `billing_config_change_log`: entity (property/portfolio), scope column, changed_by, change type (`setup_delta`, `subscription_model`, `both`), before/after snapshot JSON, computed setup delta, old/new monthly fee, resulting invoice id, notification status, timestamps. RLS: staff full access, owners read their own; grants for `authenticated` + `service_role`.
- New columns on `property_billing_configs` and `portfolio_billing_configs`: `pending_monthly_fee`, `pending_model_json`, `pending_effective_date`, `plan_change_reason`.
- Reuse existing `cancel_at_period_end` / `cancel_effective_date` / `subscription_status` lifecycle rather than inventing a second one.

**Edge functions**
- New action `apply_config_change` in `supabase/functions/subscription-billing-actions/index.ts`: takes the before/after config, reuses `configSetupLines()` + `setupKey()` to compute the setup delta against `subscription_charge_items` / `subscription_invoices`, enqueues only the delta charge items, raises the once-off invoice via the existing `ensureSetupInvoice()` path, applies the subscription-model branch, writes the change-log row, and sends both emails through `_shared/billingAdminRecipients.ts`.
- New action `activate_pending_plan` for the owner-driven switch, gated by the existing `START_WINDOW_DAYS` check (staff may override).
- `billing-subscription-cron`: when a pending plan's effective date arrives, use the pending monthly fee for the renewal/activation invoice and clear the pending fields; keep the existing suspend behaviour when the owner never activates.

**Frontend**
- `src/hooks/useBillingConfig.ts`: keep the pre-save config in memory and, after a successful upsert, invoke `apply_config_change` with before/after; surface the returned summary in the success toast (e.g. "Additional R1,200 once-off invoiced; plan change scheduled for 2026-09-30").
- `src/components/property/BillingConfigTab.tsx`: show a confirmation dialog before saving when the change will trigger an extra invoice or a plan switch, listing exactly what will happen.
- `src/components/account/AccountTwoPaymentCard.tsx`: show a "Plan change scheduled" state with the old/new monthly amounts and an "Activate new plan" button that is disabled until the 7-day window opens.
- No change to commission billing — plan changes stay out of commission statements.
