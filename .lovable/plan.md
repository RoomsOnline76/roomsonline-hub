

# Multi-Gateway Payment Provider Selection

## Problem

Currently `properties.payment_provider` is a single `text` column — each property can only have one active gateway. The request is to allow multiple gateways per property, group them by SA/International in the selector UI, and let guests choose their preferred payment method at checkout.

## Database Change

**Migration**: Add `payment_providers text[] DEFAULT '{}'` column to `properties` table. Keep the existing `payment_provider` (singular) column for backward compatibility — the hook will check the array first, fall back to the singular column.

No junction table needed — a simple array of gateway keys (e.g. `{"payfast","stripe","paypal"}`) is sufficient for this use case and avoids join complexity.

## Architecture

```text
Admin sets multiple providers → properties.payment_providers = ["payfast","stripe","ozow"]
                                        │
Guest at checkout ──→ useActivePaymentGateways (returns array)
                                        │
                    ┌───────────────────┴──────────────────┐
                    │  PaymentMethodSelector (new)          │
                    │  Shows enabled gateways as cards      │
                    │  Guest picks one → PaymentGatewayRouter│
                    └──────────────────────────────────────┘
```

## Changes

### 1. Migration
- Add `payment_providers text[] DEFAULT '{}'` to `properties`
- Migrate existing `payment_provider` values into the array

### 2. Update `PropertyPaymentProviderSelect.tsx`
- Replace single `<Select>` with a multi-select checkbox list
- Group providers into **South African** (PayFast, PayGate, Peach, Yoco, Ozow, DPO, AddPay, Payflex, Stitch, iKhokha, SnapScan, Zapper) and **International** (Stripe, PayPal, Flutterwave, Klarna, Affirm) with section headers
- Save selected array to `properties.payment_providers`
- Credential management stays per-provider (show credential fields for each selected provider)

### 3. Update `useActivePaymentGateway.tsx`
- Add new export: `useActivePaymentGateways()` returning `PaymentGateway[]`
- Reads `payment_providers` array from property, falls back to singular `payment_provider`, then global default
- Keep existing single-gateway hook for backward compat (returns first from array)

### 4. Create `PaymentMethodSelector.tsx`
- Shown at checkout when property has 2+ enabled gateways
- Displays enabled gateways as selectable cards/radio buttons with logos and labels
- Guest picks one, that gateway key is passed to `PaymentGatewayRouter`
- If only 1 gateway enabled, auto-selects (no selector shown)

### 5. Update checkout pages
- `Booking.tsx`, `JourneyCheckout.tsx`, `InlineCheckoutPanel.tsx`: use `useActivePaymentGateways()` (plural)
- If multiple gateways, render `PaymentMethodSelector` before payment step
- Selected gateway passed to `PaymentGatewayRouter` as before

## Files

| Action | File | Purpose |
|--------|------|---------|
| Migration | SQL | Add `payment_providers text[]`, migrate existing data |
| Modify | `src/components/integrations/PropertyPaymentProviderSelect.tsx` | Multi-select with SA/International grouping |
| Modify | `src/hooks/useActivePaymentGateway.tsx` | Add `useActivePaymentGateways()` returning array |
| Create | `src/components/booking/PaymentMethodSelector.tsx` | Guest-facing gateway picker at checkout |
| Modify | `src/pages/Booking.tsx` | Integrate PaymentMethodSelector |
| Modify | `src/pages/JourneyCheckout.tsx` | Integrate PaymentMethodSelector |
| Modify | `src/components/booking/InlineCheckoutPanel.tsx` | Integrate PaymentMethodSelector |

