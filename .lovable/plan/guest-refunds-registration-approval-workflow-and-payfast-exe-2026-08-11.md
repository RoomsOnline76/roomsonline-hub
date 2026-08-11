# Guest refunds: registration, approval workflow and PayFast execution

## Can PayFast do it via API?

Yes — Payfast exposes a merchant Refunds API (`POST https://api.payfast.co.za/refunds/{pf_payment_id}` with `merchant-id`, `version`, `timestamp` and a passphrase-signed `signature`, body carrying the amount in cents plus a reason), and it can refund partially or in full against an original payment. Two conditions apply and must be confirmed on the live account before we depend on it:

1. Refund permission has to be switched on for the merchant account by Payfast support (it is not on by default).
2. The merchant account needs sufficient available balance at the moment the refund runs, otherwise the call is rejected.

What we already have in place: `payfast-api` stores the Payfast `pf_payment_id` on every settled payment (transaction metadata and `payment_reference`), which is exactly the handle the refund endpoint needs. So a real gateway refund is possible for card payments we collected. Payments collected outside our gateway (channel-paid `paid_externally`, EFT, BYO gateways other than PayFast) will be recorded as manual/EFT refunds instead — approval and audit identical, execution by hand.

## What exists today (and why it isn't enough)

- A `rolos_refunds` table with `status` of `pending | approved | processed | rejected`, `approved_by` and `gateway_refund_id` — the right shape, currently unused for approvals.
- `pms-financial` action `process_refund` writes the refund straight in as `processed`, with no approval step, no gateway call, no `approved_by`, and no link to the booking.
- Cancellation flows (operator and guest self-service) compute forfeiture from the cancellation policy but never open a refund record, so a refund owed to a guest is invisible unless someone remembers it.

## What I'll build

**1. Refund register**
Every refund becomes a tracked record against a booking and a payment: amount requested, policy-computed entitlement, reason and reason category, requester, channel of payment, and a full status trail (`pending → approved → processed`, or `rejected`, plus `failed` for gateway errors). Nothing is refunded without a record.

**2. Approval workflow**
- Property owner / operator raises a refund request from the booking or folio.
- Approval sits with ROL admin (dev / fearless leader / admin) when the money is in the ROL account; for a property on its own gateway the property owner-manager approves their own, since the funds are theirs.
- Optional auto-approve threshold per property (e.g. anything at or below the policy entitlement and below a rand cap) so routine, policy-compliant refunds don't stall — configurable, default off.
- Rejection requires a note. Approvals and rejections are captured with user id and timestamp; the existing audit trigger on `rolos_refunds` keeps the history.

**3. Execution against PayFast**
On approval, a refund executor calls the Payfast Refunds API with the stored `pf_payment_id`, records `gateway_refund_id`, and moves the record to `processed`. Failures land on `failed` with the gateway message and stay actionable — never silently swallowed. If the account lacks refund permission or balance, the record is flagged as "gateway refund unavailable — settle manually" rather than pretending success.

**4. Consequences kept honest**
When a refund is processed, the booking payment status reflects it (`refunded` / `partially_refunded`), the folio gets a matching negative transaction, and refunded value is excluded from revenue, commission and payout figures — so a refunded booking does not keep counting as income. Payouts already hold funds 48h; a pending refund also blocks that portion from being paid out.

**5. Monitoring surface**
A Refunds view (ROLOS financial area, plus an admin-wide roll-out list) showing pending approvals, approved-but-not-executed, processed, and failed, with amounts, ageing, property and channel. Email notification to the requester and approver on each state change.

## Technical notes

- Verification first: a `refund_capability_check` action on `payfast-api` doing a signed, sandbox/testing call to confirm the account's refund permission before the UI advertises gateway refunds.
- Schema: extend `rolos_refunds` with `booking_id`, `requested_by`, `requested_amount`, `entitled_amount`, `reason_category`, `gateway`, `gateway_error`, `rejected_reason`, `approved_at`; add `failed` to the `refund_status` enum; GRANTs and RLS scoped by existing `can_access_property` / role helpers so owners see only their property and admins see all.
- New `supabase/functions/refunds-api` (or new actions on `pms-financial`) for `request_refund`, `approve_refund`, `reject_refund`, `execute_refund`; `payfast-api` gains a `refund` action implementing the signed Payfast call, used only server-side.
- Cancellation paths (`cancel-booking`, `guest-cancel-booking`, and the channel cancel path) auto-raise a `pending` refund when the resolved policy leaves a refundable amount, using the entitlement from `src/lib/cancellationPolicy.ts` — no invented amounts.
- Revenue/payout integration through `src/lib/revenueStatuses.ts` and `usePropertyPayouts` so refunded and refund-pending amounts are netted off.
- Frontend: `useRefunds` / `useProcessRefund` in `src/hooks/usePmsFinancial.ts` extended to the request→approve→execute lifecycle; new `RefundsPanel` in the ROLOS financial area and an admin refunds tab.
