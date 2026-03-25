

# Voucher Code Validation & Discount on Booking Page

## Problem
The booking page has a voucher input field but it does nothing — no validation, no discount application. No `promo_codes` table or validation API exists yet.

## What It Does
When a guest enters a voucher code and clicks "Apply", the system validates it against a new `promo_codes` table, displays validity/conditions (e.g. "15% off — non-refundable"), and applies the discount to the total price.

## Changes

### 1. New DB table: `promo_codes`
```sql
CREATE TABLE public.promo_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric NOT NULL,
  conditions jsonb DEFAULT '{}',  -- e.g. {"non_refundable": true, "min_nights": 2}
  description text,
  valid_from date,
  valid_until date,
  max_uses integer,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
-- RLS: public read for validation, owner write
-- Index on (code, property_id) for fast lookups
-- NULL property_id = global code, otherwise property-specific
```

### 2. New edge function: `validate-voucher`
- Accepts `{ code, property_id, check_in, check_out, subtotal }`
- Looks up the code in `promo_codes` (matching property_id OR global)
- Validates: is_active, date range, max_uses not exceeded
- Returns: `{ valid, discount_type, discount_value, discount_amount, conditions, description }` or `{ valid: false, reason }`

### 3. Modify: `src/components/booking/FluentGuestForm.tsx`
- Add an "Apply" button next to the voucher input
- Add props for voucher validation state: `voucherStatus` (idle/loading/valid/invalid), `voucherResult`, `onApplyVoucher`
- Show validation result inline: green check + description for valid, red X + reason for invalid
- Display conditions (e.g. "Non-refundable booking") as a warning badge

### 4. Modify: `src/pages/Booking.tsx`
- Add state: `voucherStatus`, `voucherResult`, `voucherDiscount`
- Add `handleApplyVoucher()` that calls `validate-voucher` edge function
- After voucher validation, apply discount to `totalCost`:
  - Percentage: subtract `subtotal * discount_value / 100`
  - Fixed: subtract `discount_value`
- Add a "Voucher Discount" line item to `costBreakdown` (negative amount)
- Pass voucher status/result props to `FluentGuestForm`
- Include voucher code in the booking submission payload

### 5. Admin: voucher management (future — out of scope for now)
- For now, codes are managed directly in the database
- Can be added to the property form later

## Display in Payment Summary
```text
Studio (2 guests)                    R 4,308.00
Tourism Levy (2%)                       R 86.16
───────────────────────────────────────
Voucher: NRdiscount (-15%)            - R 646.20
⚠️ This booking is non-refundable
───────────────────────────────────────
Total                               R 3,747.96
```

