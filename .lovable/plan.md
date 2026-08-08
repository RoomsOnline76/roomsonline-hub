# Cancel subscription (with grace period, then suspension)

Jongensfontein's subscription is now active, so the "Start subscription" button must become **Cancel subscription**, available to the owner as well as admin / dev / fearless leader. Cancelling never cuts service immediately: the account keeps working until the last day already paid for, then it is suspended pending reactivation.

## Behaviour

1. **Active subscription** — the card shows status, monthly fee, paid-through date (`current_period_end`) and a "Cancel subscription" action.
2. **Cancel confirmation dialog** — a clear warning before anything happens:
   - The account will be **suspended pending reactivation**.
   - Service continues until the last paid day (`current_period_end`), shown explicitly.
   - After that date, ROL'OS access and functionality are restricted (no channel pushes, no rate/inventory management, no new reservations); data is retained.
   - Requires explicit confirmation; typing is not required, but the primary button is destructive and labelled "Cancel subscription".
3. **After cancelling** — status becomes `cancelling` (scheduled): the card shows "Cancels on <paid-through date>" with a **Keep subscription** (undo) action while the paid period is still running. Renewal invoices stop being raised.
4. **On the day after the paid-through date** — the daily billing cron flips the account to `suspended`: restricted access, and a reactivation call-to-action on the ROL Account page.
5. **Reactivation** — owner sees "Reactivate subscription" (raises a fresh subscription invoice, same two-payment style flow); admin / dev / fearless leader can reactivate or lift suspension directly.
6. **Suspended account restrictions** — a single shared gate: ROL'OS operational surfaces become read-only with a banner ("Subscription suspended — reactivate to restore functionality"), channel/ARI cron jobs skip suspended entities, and the public booking engine stops accepting new bookings for those properties. Owner still reaches ROL Account, invoices and reactivation.

## Emails

- On cancellation: confirmation to the owner (with paid-through date and how to reactivate) and a copy to staff.
- On suspension day: notice to the owner that access is now restricted.

## Technical notes

- **Schema:** add `cancel_at_period_end boolean default false`, `cancel_effective_date date`, `suspended_at timestamptz` to `property_billing_configs` and `portfolio_billing_configs`. `subscription_status` gains the values `cancelling` and `suspended` alongside existing `pending` / `active` / `past_due` / `cancelled`.
- **`subscription-billing-actions`:** new actions `cancel_subscription` (owner or staff; sets `cancel_at_period_end`, `cancel_effective_date = current_period_end`, status `cancelling`, `cancelled_at`), `resume_subscription` (undo while still in the paid period), `reactivate_subscription` (from `suspended`/`cancelled` — clears suspension and raises a new activation invoice). Authorisation reuses the existing staff check plus the owner-of-entity resolution already in the function; `summary` returns `status`, `paid_through`, `cancel_at_period_end`, `suspended_at` and which actions the caller may take.
- **`billing-subscription-cron`:** skip renewal for `cancel_at_period_end = true`; add a step that sets `subscription_status = 'suspended'`, `suspended_at = now()` once `current_period_end < today` and cancellation was scheduled; send the suspension email.
- **Frontend:** `AccountTwoPaymentCard.tsx` swaps the start button for the cancel/undo/reactivate action set driven by the summary, with an AlertDialog carrying the warning copy. `SubscriptionStatusPanel.tsx` gains `cancelling` and `suspended` badge states. A new `useSubscriptionAccess` hook (property or portfolio scope) exposes `{ suspended, paidThrough }` for the read-only gate, consumed by the ROL'OS shell to render the banner and disable mutating actions.
- Existing `cancel_subscription_by_token` (used on the public pay page) is aligned with the same grace-period semantics rather than cancelling outright.
