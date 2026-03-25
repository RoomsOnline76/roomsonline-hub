

# Global Payment Gateway Adapter Layer

## Current State

- **2 active gateway edge functions**: `payfast-api` (1003 lines, SA onsite modal + ITN webhook) and `paygate-api` (492 lines, SA redirect + MD5 checksum)
- **14 providers defined in UI** (`PropertyPaymentProviderSelect.tsx`) with credential schemas — but only PayFast and PayGate have backend edge functions
- **`useActivePaymentGateway` hook** resolves property → global → default ("payfast") — already supports the routing pattern
- **`payment_transactions` table** already logs all transactions with `payment_provider` column
- **`pms-financial` gateway bridge** (`initiate_gateway_payment` action) already routes to payfast/paygate by name — this is the extension point
- **Credential storage** already in `integration_configs` table per property

The gap: 12 of 14 configured providers have no backend implementation. International gateways (Stripe, PayPal, Klarna, Affirm) are missing entirely.

## Architecture

```text
useActivePaymentGateway (property → global → default)
  │
  ▼
Booking UI (Booking.tsx / JourneyCheckout.tsx / InlineCheckoutPanel.tsx)
  │ selects gateway component
  ▼
┌─────────────────────────────────────────────┐
│ Gateway Component Router                     │
│ PayFast → PayFastOnsiteModal (existing)      │
│ PayGate → PayGateRedirect (existing)         │
│ Stripe  → StripeCheckout (NEW)               │
│ Yoco    → YocoInlineCheckout (NEW)           │
│ *others → GenericRedirectGateway (NEW)       │
└──────────────┬──────────────────────────────┘
               │ invoke edge function
               ▼
┌──────────────────────────────────────────────┐
│ Edge Functions (each isolated)               │
│ payfast-api (existing)                       │
│ paygate-api (existing)                       │
│ stripe-gateway (NEW)                         │
│ yoco-gateway (NEW)                           │
│ flutterwave-gateway (NEW)                    │
│ peach-gateway (NEW)                          │
│ dpo-gateway (NEW)                            │
│ ozow-gateway (NEW)                           │
│ snapscan-gateway (NEW)                       │
│ stitch-gateway (NEW)                         │
│ ikhokha-gateway (NEW)                        │
│ paypal-gateway (NEW – international)         │
│ klarna-gateway (NEW – international)         │
│ affirm-gateway (NEW – international)         │
└──────────────┬──────────────────────────────┘
               │ all write to
               ▼
         payment_transactions
```

## Phased Implementation

Given the scope (14+ gateways), this should be implemented in phases. **Phase 1** delivers the architectural pattern + the 3 highest-impact international gateways. Phase 2+ adds remaining SA gateways.

### Phase 1: Core Architecture + Stripe + PayPal + Flutterwave

#### 1. Shared Gateway Contract (`supabase/functions/_shared/payment-gateway-contract.ts`)

Standardized interface all gateway edge functions must implement:

```typescript
interface GatewayRequest {
  action: "initiate_payment" | "verify_payment" | "refund" | "health_check";
  booking_id?: string;
  amount: number;
  currency: string;
  guest_email: string;
  guest_name: string;
  return_url: string;
  cancel_url: string;
  metadata?: Record<string, unknown>;
}

interface GatewayResponse {
  success: boolean;
  gateway: string;
  payment_method: "redirect" | "inline" | "modal" | "qr";
  redirect_url?: string;      // for redirect gateways
  client_token?: string;       // for inline/modal (Stripe, Yoco)
  transaction_ref: string;
  amount: number;
  currency: string;
}
```

#### 2. Gateway Registry Table (migration)

Add `payment_gateway_registry` table to formalize supported gateways:
- `id`, `gateway_key` (unique), `display_name`, `payment_method` (redirect/inline/modal/qr), `supported_currencies` (text[]), `supported_countries` (text[]), `edge_function_name`, `is_active`, `is_international`, timestamps
- Seed with all 14 existing + 3 new international gateways
- RLS: public read, admin write

#### 3. Stripe Gateway Edge Function (`supabase/functions/stripe-gateway/index.ts`)

- Uses Stripe Checkout Sessions API (redirect-based, no SDK needed)
- Reads credentials from `integration_configs` per property
- Actions: `initiate_payment` (creates checkout session), `verify_payment` (retrieves session), `webhook` (handles `checkout.session.completed`), `refund`, `health_check`
- Supports multi-currency (USD, EUR, GBP, ZAR, etc.)
- Logs to `payment_transactions`

#### 4. PayPal Gateway Edge Function (`supabase/functions/paypal-gateway/index.ts`)

- Uses PayPal Orders API v2 (REST, redirect-based)
- Actions: `initiate_payment` (create order → approve URL), `verify_payment` (capture order), `webhook`, `refund`, `health_check`
- Multi-currency support
- Credentials: `client_id`, `client_secret` from `integration_configs`

#### 5. Flutterwave Gateway Edge Function (`supabase/functions/flutterwave-gateway/index.ts`)

- Uses Flutterwave Standard API (redirect-based)
- Key for pan-African payments (NGN, KES, GHS, UGX, TZS, ZAR)
- Actions: `initiate_payment`, `verify_payment`, `webhook`, `health_check`

#### 6. Expand `useActivePaymentGateway` + Provider Type

- Add PayPal, Klarna, Affirm to `PaymentGateway` union type
- Update resolution logic to map gateway key → edge function name

#### 7. Gateway Component Router (`src/components/booking/PaymentGatewayRouter.tsx`)

Single component that replaces the scattered if/else in Booking.tsx, JourneyCheckout.tsx, InlineCheckoutPanel.tsx:

```tsx
<PaymentGatewayRouter
  gateway={activeGateway}
  bookingId={bookingId}
  amount={amount}
  onSuccess={handleSuccess}
  onCancel={handleCancel}
/>
```

Internally routes to:
- `PayFastOnsiteModal` for payfast
- `PayGateRedirect` for paygate
- `StripeCheckout` (new) for stripe — renders Stripe Checkout redirect
- `GenericRedirectGateway` (new) for all redirect-based gateways (PayPal, Flutterwave, DPO, Ozow, etc.)

#### 8. Update `pms-financial` Bridge

Extend `initiate_gateway_payment` action to route to any registered gateway edge function (not just payfast/paygate).

#### 9. Extend `PropertyPaymentProviderSelect`

Add PayPal, Klarna, Affirm to the provider definitions with credential fields.

#### 10. Update Booking Pages

Replace the PayFast/PayGate if/else blocks in `Booking.tsx`, `JourneyCheckout.tsx`, and `InlineCheckoutPanel.tsx` with `<PaymentGatewayRouter />`.

## Files

| Action | File | Purpose |
|--------|------|---------|
| Migration | SQL | `payment_gateway_registry` table + seed data |
| Create | `supabase/functions/_shared/payment-gateway-contract.ts` | Shared types for all gateways |
| Create | `supabase/functions/stripe-gateway/index.ts` | Stripe Checkout Sessions |
| Create | `supabase/functions/paypal-gateway/index.ts` | PayPal Orders API v2 |
| Create | `supabase/functions/flutterwave-gateway/index.ts` | Flutterwave Standard API |
| Create | `src/components/booking/PaymentGatewayRouter.tsx` | Unified gateway component router |
| Create | `src/components/booking/StripeCheckout.tsx` | Stripe inline/redirect component |
| Create | `src/components/booking/GenericRedirectGateway.tsx` | Generic redirect handler |
| Modify | `src/hooks/useActivePaymentGateway.tsx` | Add international gateways to type + resolution |
| Modify | `src/components/integrations/PropertyPaymentProviderSelect.tsx` | Add PayPal, Klarna, Affirm providers |
| Modify | `src/pages/Booking.tsx` | Replace if/else with PaymentGatewayRouter |
| Modify | `src/pages/JourneyCheckout.tsx` | Replace if/else with PaymentGatewayRouter |
| Modify | `src/components/booking/InlineCheckoutPanel.tsx` | Replace if/else with PaymentGatewayRouter |
| Modify | `supabase/functions/pms-financial/index.ts` | Extend gateway bridge to all registered gateways |

## Phase 2 (Future)

Remaining SA gateways: Yoco (inline JS SDK), Peach, DPO, Ozow, Stitch, iKhokha, SnapScan (QR), Payflex (BNPL), Klarna, Affirm — each as an isolated edge function following the same contract.

