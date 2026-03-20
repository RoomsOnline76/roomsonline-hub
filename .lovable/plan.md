

# ROLOS PMS: Service Charges + Checkout Refund Processing

## Summary

Two interconnected features: (1) Auto-apply property-level service charges (cleaning fees, deposits, taxes, surcharges) to booking folios, and (2) Process refundable deposit returns during checkout.

## Current State

- **Property Charges** already exist (`property_charges` table + `ChargeCalculator.ts`) — configured per property with categories (tax, fee, deposit, surcharge, custom) and calculation methods (flat, per night, per person, percentage, etc.)
- **Folios** exist (`rolos_folios` + `rolos_folio_transactions`) — manual charge/payment recording via `BookingFolioTab`
- **Refunds** exist (`rolos_refunds` table + `process_refund` action in `pms-financial`) — but only for payment-level refunds, not deposit returns
- **Checkout** (`handleCheckOut` in `roomsonline-pms-api`) marks rooms dirty, creates cleaning tasks, closes folio — but does NOT process refundable deposits
- **Gap**: No bridge between `property_charges` and folios. Charges are never auto-applied. No refund-on-checkout flow.

## Plan

### 1. New DB table: `rolos_booking_charges`
Snapshot of applied service charges per booking, linking `property_charges` to `rolos_folio_transactions`.

```sql
CREATE TABLE rolos_booking_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id),
  charge_id UUID REFERENCES property_charges(id),  -- source charge template
  folio_transaction_id UUID REFERENCES rolos_folio_transactions(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,  -- tax, fee, deposit, surcharge, custom
  calculation_method TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  is_refundable BOOLEAN DEFAULT false,
  refund_timing TEXT,  -- on_checkout, after_inspection, manual
  refund_status TEXT DEFAULT 'pending',  -- pending, processed, waived
  refund_transaction_id UUID REFERENCES rolos_folio_transactions(id),
  breakdown TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE rolos_booking_charges ENABLE ROW LEVEL SECURITY;
-- RLS: staff with property access
```

### 2. Edge function: `apply_service_charges` action (in `roomsonline-pms-api`)
New action that:
- Fetches active `property_charges` for the property
- Uses `ChargeCalculationContext` logic (nights, rooms, adults, children, subtotal) to calculate amounts
- Creates `rolos_folio_transactions` for each applicable charge
- Records snapshots in `rolos_booking_charges`
- Skips if charges already applied (idempotent via `rolos_booking_charges` check)

### 3. Edge function: `process_checkout_refunds` action (in `roomsonline-pms-api`)
New action (also triggered automatically during `check_out`) that:
- Queries `rolos_booking_charges` where `is_refundable = true AND refund_timing = 'on_checkout' AND refund_status = 'pending'`
- Creates negative `rolos_folio_transactions` (credit) for each
- Updates `refund_status` to `'processed'`
- Updates folio balance

### 4. Modify `handleCheckOut` in `roomsonline-pms-api`
Before closing the folio, call the refund processing logic for `on_checkout` deposits. Existing flow remains intact.

### 5. UI: Enhanced `BookingFolioTab.tsx`
- Add "Apply Service Charges" button (calls `apply_service_charges`)
- Show applied charges with category badges and refundable indicators
- Add "Process Refund" button for individual refundable charges (manual timing)
- Show refund status on deposit line items

### 6. UI: Checkout confirmation enhancement in `PMSDashboard.tsx`
- When clicking "Check Out", show a confirmation dialog listing:
  - Outstanding balance
  - Refundable deposits that will be returned
  - Net settlement amount
- Confirm triggers the checkout + auto-refund flow

### 7. Auto-apply on check-in (optional trigger)
During `check_in` action, auto-apply service charges to the folio if not already applied. This ensures charges are visible during the stay.

## Files to Create/Modify

| File | Action |
|------|--------|
| DB migration | Create `rolos_booking_charges` table + RLS |
| `supabase/functions/roomsonline-pms-api/index.ts` | Add `apply_service_charges` action, `process_checkout_refunds` action, modify `handleCheckOut` |
| `src/components/pms/BookingFolioTab.tsx` | Add service charge application UI, refund processing, charge badges |
| `src/components/pms/CheckoutConfirmationDialog.tsx` | New — confirmation dialog with refund summary |
| `src/pages/pms/PMSDashboard.tsx` | Wire checkout confirmation dialog before `check_out` action |

## Technical Details

- Charge calculation logic will be replicated in the edge function (server-side) rather than importing from `ChargeCalculator.ts` (client-side only). Same algorithm, different runtime.
- Idempotency: `apply_service_charges` checks `rolos_booking_charges` before inserting to prevent duplicates.
- Refund flow creates a negative folio transaction (credit), NOT a payment reversal — keeping folio accounting clean.
- The `on_checkout` refund is automatic; `after_inspection` and `manual` require explicit staff action.

