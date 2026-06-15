# Consolidate Payment Facilitator + Custom Payment Provider

## Why
`BillingConfigTab` exposes a **Payment Facilitator** switch (= Rooms Online processes payments via PayFast and charges a transaction fee). The new **Payment Providers** sub‑tab exposes the inverse — `allow_custom_payment_provider` (= the property uses its own gateway). These two flags describe the same decision and can drift out of sync.

## Single source of truth
`properties.allow_custom_payment_provider` (admin-controlled, default `false`).

Derived rule everywhere:
```
payment_facilitator_enabled = !allow_custom_payment_provider
```
Default state: **Payment Facilitator ON**. It flips off only when an admin toggles "Allow custom payment provider" in the Payment Providers tab.

## Changes

### 1. `PaymentProvidersTab.tsx` (existing)
- On save, in addition to updating `properties.allow_custom_payment_provider`, also upsert `property_billing_configs.payment_facilitator_enabled = !next` so the billing engine stays in sync (no behavioural change for billing calculations).
- Add an inline note: "Turning this on disables the Rooms Online Payment Facilitator fee for this property."

### 2. `BillingConfigTab.tsx`
- Replace the editable **Payment Facilitator** `<Switch>` with a read-only status row:
  - Shows `ON (default)` / `OFF (custom provider enabled)`.
  - One-liner explainer + button **"Manage in Payment Providers"** that switches the Rates tab to `payment-providers`.
- Remove `paymentFacilitator` local state's setter from the UI (still read from `useBillingConfig` to render status; still persisted, but derived from the property flag on save).
- Keep the "This property will be charged X% per transaction" warning, but key it off the property flag (shown only when facilitator is ON and a fee is configured).

### 3. Tab navigation hook-up
`RateManagerTab` already controls the Tabs. Lift its tab state to a controlled value (`value`/`onValueChange`) and pass an `onSwitchTab` callback into `BillingConfigTab` so the new button can jump to `payment-providers`.

### 4. Sync existing rows (one-off)
Backfill `property_billing_configs.payment_facilitator_enabled` from `properties.allow_custom_payment_provider` so legacy records match the new derivation:
```sql
UPDATE public.property_billing_configs pbc
   SET payment_facilitator_enabled = NOT COALESCE(p.allow_custom_payment_provider, false)
  FROM public.properties p
 WHERE pbc.property_id = p.id;
```

### 5. No booking-flow change
`useActivePaymentGateway` already returns the RL default when the flag is off — that path matches "facilitator on", so guests keep checking out through the RL PayFast gateway exactly as today.

## Files touched
- `src/components/property/BillingConfigTab.tsx` — switch → read-only status + deep-link button; drop setter wiring.
- `src/components/property/PaymentProvidersTab.tsx` — also write `payment_facilitator_enabled`.
- `src/components/property/RateManagerTab.tsx` — controlled Tabs + pass `onSwitchTab` to `BillingConfigTab`.
- one migration to backfill `property_billing_configs.payment_facilitator_enabled`.

## Out of scope
- Removing the `payment_facilitator_enabled` column (kept for billing engine compatibility).
- Per-strategy fee configuration UI changes.
