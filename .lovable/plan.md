

# Add Property Charges to Booking Checkout

## Problem
The booking checkout page (`Booking.tsx`) calculates room rates but never fetches or applies property charges (taxes, fees, deposits, surcharges). All the infrastructure exists — `useChargesForBooking` hook, `calculateCharges()` engine, and types — but none of it is wired into the booking flow.

## Changes

### File: `src/pages/Booking.tsx`

1. **Import** `useChargesForBooking` from `@/hooks/usePropertyCharges` and `calculateCharges`, `getChargeTotals` from `@/components/charges/ChargeCalculator`

2. **Fetch charges** using `useChargesForBooking(property?.id)` at the component level

3. **Apply charges after room cost calculation** (after line ~1164 where `setCostBreakdown` / `setTotalCost` are set):
   - Build a `ChargeCalculationContext` from the booking data (subtotal, nights, rooms count, adults, children, infants, roomTypeId)
   - Call `calculateCharges(charges, context)` to get applicable charges
   - Append each calculated charge as a `CostLineItem` to the breakdown
   - Add charge totals to `runningTotal`

4. **Display charges in the Payment step** (lines ~1874-1895):
   - Charges already appear as line items in `costBreakdown` — they'll render automatically
   - Add a subtle separator or label between room rates and charges for clarity (e.g., a thin divider with "Taxes & Fees" heading when charges exist)
   - Show refundable deposit amounts with a small "(refundable)" tag

5. **Include charges in the booking submission** — ensure `totalCost` sent to payment includes charges, and snapshot the charges in the booking's `ai_metadata` or a dedicated field for the confirmation page

### New state
- `chargesTotal` (number) — stored separately so the summary can show "Accommodation: X" + "Taxes & Fees: Y" = "Total: Z"

### Charge display in Step 3 (Payment)
```text
Studio (2 guests)                    R 4,308.00
──────────────────────────────────────
Tourism Levy (2%)                       R 86.16
Cleaning Fee                            R 350.00
Security Deposit (refundable)           R 500.00
──────────────────────────────────────
Total                               R 5,244.16
```

