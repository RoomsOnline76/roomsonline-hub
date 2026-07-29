## Context

- PayFast "Onsite Payments" (in-page card capture) is an opt-in merchant feature. Property-owned (BYO) accounts generally don't have it, which is what produced the 404 on `/onsite/process/<uuid>`.
- The hosted redirect flow requires no merchant opt-in and is the correct default for BYO.
- ITN already works for BYO: `notify_url` always points at our own `payfast-api` function, and the handler resolves the originating merchant from `payment_transactions.m_payment_id` before verifying the signature with that account's passphrase. No change needed to how success is detected.

## What to change

**1. BYO defaults to hosted redirect — no onsite round-trip**

In `payfast-api`, treat onsite as available only for the RoomsOnline facilitator account. When the resolved credential source is `byo`, go straight to the signed hosted-checkout payload (the existing `respondWithRedirectCheckout` path) instead of requesting an onsite UUID and pre-flighting it. Keep the pre-flight as a safety net for the ROL account only.

Optionally allow an explicit per-property opt-in (`onsite_supported: true` saved in the property's payment config) for owners who *have* enabled Onsite in their PayFast dashboard.

**2. Confirm payment server-side, not just by signature**

The ITN handler currently has PayFast's server-side validation call commented out. Enable it: after signature + source-IP checks pass, POST the ITN payload back to the correct host (`sandbox.payfast.co.za` or `www.payfast.co.za`) `/eng/query/validate` and only mark the booking paid on a `VALID` response. This matters more for BYO, where several merchant accounts share one notify endpoint.

Also verify `amount_gross` against the booking total before marking paid, and log a mismatch rather than confirming.

**3. UI wording**

In the ROLOS payment provider card, replace the "enable Onsite Payments in the PayFast dashboard" hint with a plain statement that guests are sent to PayFast's secure hosted checkout, and that payment confirmation returns automatically via ITN. Remove the implication that the owner must change anything in their PayFast dashboard.

## Technical notes

- Files: `supabase/functions/payfast-api/index.ts`, `supabase/functions/_shared/paymentCredentials.ts`, `src/components/integrations/PropertyPaymentProviderSelect.tsx`, `src/components/booking/PayFastOnsiteModal.tsx` (the 8-second watchdog stays as a fallback but should rarely fire once BYO skips onsite).
- No database migration required; `onsite_supported` continues to live in the property's `integration_configs` payment config.
- ITN merchant-mismatch guard, IP allow-list, and per-account passphrase resolution stay exactly as they are.
