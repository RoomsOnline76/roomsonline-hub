

# Room-Level Charges: Add Room Type Selector to Charge Editor

## Current State
The `property_charges` table already has `applies_to_all_rooms` (boolean) and `room_type_ids` (string array) columns. The `ChargeCalculator.ts` already filters charges by `roomTypeId` at booking time. **However, the UI never lets users pick which rooms a charge applies to** — the "Applies to All Rooms" toggle exists but turning it off shows nothing.

## Changes

### 1. Modify `ChargeEditor.tsx` — Add room type multi-select
When `applies_to_all_rooms` is toggled OFF, show a checkbox list of the property's room types (fetched from `rolos_room_types` for the given `propertyId`). Each checked room type populates `room_type_ids`. Also allow per-room **amount overrides** via an optional amount field next to each room type.

- Fetch room types: `supabase.from('rolos_room_types').select('id, name').eq('property_id', propertyId)`
- Render checkboxes with room name + optional override amount input
- Pass `propertyId` is already a prop

### 2. Add `room_charge_overrides` column to `property_charges`
New JSONB column to store per-room amount overrides:
```sql
ALTER TABLE public.property_charges 
ADD COLUMN room_charge_overrides jsonb DEFAULT '{}';
-- Format: { "room-type-uuid": 150.00, "other-room-uuid": 200.00 }
```

### 3. Update `ChargeCalculator.ts` — Use room-specific amounts
In `calculateChargeAmount()`, check if `charge.room_charge_overrides[context.roomTypeId]` exists. If so, use that amount instead of `charge.amount` for the calculation.

### 4. Update `PropertyCharge` type
Add `room_charge_overrides?: Record<string, number> | null` to the interface.

### 5. Update `AdditionalChargesManager.tsx` — Show room scope in table
Add a small indicator in the charges table showing "All Rooms" vs "X rooms" badge, so admins can see at a glance which charges are room-specific.

### 6. Update `usePropertyCharges.tsx` — Include new field in copy
Add `room_charge_overrides` to the field list in `copyCharges` mutation.

## No other changes needed
- The booking engine (`Booking.tsx`) already passes `roomTypeId` in the charge context
- RLS policies remain unchanged
- The `validate-voucher` edge function is unaffected

