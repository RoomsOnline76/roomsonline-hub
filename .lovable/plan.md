

# Fix Charge Preview Doubling + Room Type Selector

## Problem 1: Preview Shows Duplicate Charges
The "Guest Preview" panel calls `calculateCharges` without a `roomTypeId`, so the applicability filter at line 97-101 passes **all** charges through. Result: both the "All Rooms" Cleaning Fee (R1,190) and the room-specific Cleaning Fee (R455) appear simultaneously — doubling up.

## Problem 2: Linen Fee Not Showing on Compact Studio Booking
The Linen Fee is configured with `room_type_ids` containing only "Studio" (per screenshot). When booking a Compact Studio, `isChargeApplicable` correctly excludes it. **This is working as designed** — if you want the Linen Fee on Compact Studio, add that room to the charge's room assignment. No code bug here.

## Solution

### 1. Add room type dropdown to ChargePreview (`ChargePreview.tsx`)
- Accept a `roomTypes: { id: string; name: string }[]` prop
- Add a `Select` dropdown at the top: "Preview as: [All Rooms ▼] / Studio / Compact Studio / ..."
- Default to the first room type (not "all") so the preview is realistic
- Pass the selected `roomTypeId` into the `ChargeCalculationContext`
- This eliminates doubling because room-specific charges only show when their room is selected, and "All Rooms" charges always show

### 2. Pass room types into ChargePreview from the charges tab
- The parent component that renders `ChargePreview` already has access to room types (from the same query used in the charge editor)
- Pass `roomTypes` prop down

### 3. No changes to ChargeCalculator.ts or Booking.tsx
The calculation engine and booking flow are working correctly. The only issue was the preview not specifying a room context.

## Files
| Action | File |
|--------|------|
| Modify | `src/components/charges/ChargePreview.tsx` — add room type selector dropdown |
| Modify | Parent component that renders ChargePreview — pass roomTypes prop |

No database changes needed.

