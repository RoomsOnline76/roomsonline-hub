## What's wrong

The gateway *type* resolution is fine — Dassiesingel is flagged `allow_custom_payment_provider = true` and its BYO PayFast credentials (merchant_id, merchant_key, passphrase) are saved in `integration_configs` (`integration_type = payment_credentials`, active).

The problem is in the backend: `supabase/functions/payfast-api/index.ts` reads the merchant credentials **only** from global environment secrets (`PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`). It never looks at the property's stored credentials. So every checkout — BYO or not — settles into the RoomsOnline PayFast account.

## Plan

### 1. Per-property credential resolver (payfast-api)
Add a `resolvePayfastCredentials(supabase, propertyId)` helper that returns the merchant set plus a `source` label:

1. If the property (or its portfolio parent via `portfolio_payment_configs` / `property_portfolio_members`) has `allow_custom_payment_provider = true` **and** an active `integration_configs` row of type `payment_credentials` with a non-empty `merchant_id` + `merchant_key` → use those (`source: "byo"`).
2. Otherwise fall back to the ROL environment secrets (`source: "rol"`).

Also resolve the sandbox/live mode from the stored config when present, otherwise from `PAYFAST_SANDBOX`.

### 2. Use it on every code path
`initiate_payment`, `initiate_onsite_payment`, `verify_payment` and the ITN handler must all use the resolved merchant/passphrase rather than the env values:
- Signature generation on initiate uses the resolved passphrase.
- ITN verification must use the **same** merchant account the payment was created with, so persist `merchant_id` and `credential_source` on the `payment_transactions` row at initiate time, then look them up (via `m_payment_id`) when the ITN arrives, and validate the signature with that merchant's passphrase. Reject the ITN when the posted `merchant_id` doesn't match the stored one.

### 3. Housekeeping in the same function
- Remove the debug logs that print the passphrase mask and its character codes (currently leaking credential shape into function logs).
- Log only `{ property_id, credential_source, merchant_id_last4 }` for traceability.

### 4. Make it visible to admins/owners
- In ROLOS → Integrations (`PropertyPaymentProviderSelect.tsx`) show a resolved-state badge: "Payments settle to: your PayFast account (BYO)" vs "RoomsOnline facilitator account", including inherited-from-portfolio wording.
- Add a lightweight `resolve_credentials` action to `payfast-api` that returns the source only (no secrets) so the badge reflects true backend behaviour, not just the DB flag.

### 5. Other gateways
The same env-only pattern exists in `yoco-gateway`, `paygate-api`, `ozow-gateway`, `stripe-gateway`, etc. Extract the resolver into `supabase/functions/_shared/paymentCredentials.ts` so PayFast uses it now and the other gateways can adopt it without duplicating logic. Only PayFast will be wired up in this change.

## Verification
- Re-run the Dassiesingel checkout link and confirm the PayFast page shows the property's merchant account, and that `payment_transactions` records `credential_source = "byo"`.
- Confirm a non-BYO property still initiates against the ROL account.
- Confirm the ITN callback marks both cases paid.

## Technical notes
Files touched: `supabase/functions/payfast-api/index.ts`, new `supabase/functions/_shared/paymentCredentials.ts`, `src/components/integrations/PropertyPaymentProviderSelect.tsx`. One small migration adds `merchant_id` / `credential_source` columns to `payment_transactions` (nullable, no backfill needed).
