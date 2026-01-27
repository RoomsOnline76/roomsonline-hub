
# Fix Calendar Overflow and Add Infants/Pets for Hostfully Bookings

## Summary

Three issues to address:
1. **Calendar dates spilling out of frame** - The two-month calendar exceeds its container width
2. **Missing Infants field** - Infants are already in the URL params but need to be displayed on the pre-booking calendar summary
3. **Missing Pets field** - Need to add pets count for Hostfully properties (requires database update + UI + API)

---

## Issue 1: Calendar Overflow

### Root Cause
The `RoomAvailabilityCalendar` component displays a 2-month calendar on desktop within a grid that only allocates `lg:col-span-2` of 3 columns. The fixed day cell widths (`w-12 sm:w-12`) combined with the two-month layout exceeds the available container width.

### Solution
Add `overflow-x-auto` to the calendar container and constrain the calendar wrapper. This allows horizontal scrolling if needed while keeping the layout intact.

**File: `src/components/RoomAvailabilityCalendar.tsx`**
- Wrap the `DayPicker` in a scrollable container with `overflow-x-auto`
- Add `min-w-0` to prevent flex items from overflowing

---

## Issue 2: Missing Infants Display on Calendar Summary

### Current State
The `RoomAvailabilityCalendar` booking summary section only shows Adults and Children for non-Benson properties (lines 821-859). Infants are tracked in state but not displayed.

### Solution
Always show Infants input in the booking summary when the property allows infants (using the same pattern as Benson properties).

**File: `src/components/RoomAvailabilityCalendar.tsx`**
- Add Infants stepper to the non-Benson properties section (after Children)

---

## Issue 3: Add Pets Count for Hostfully Bookings

This requires multiple changes across the stack:

### A. Database Migration
Add `pets` column to the `bookings` table:
```sql
ALTER TABLE bookings ADD COLUMN pets integer DEFAULT 0;
```

### B. Frontend Changes

**1. RoomBooking Interface (`Booking.tsx`)**
Add `numberOfPets` field to the `RoomBooking` interface

**2. Checkout Form (`Booking.tsx`)**
Add Pets stepper in the "Rooms & Guests" section (conditionally shown when property has `pets_allowed`)

**3. Create Booking Mutation (`Booking.tsx`)**
Include pets count when saving to database

**4. URL Parameters (`Booking.tsx`)**
Parse and handle `pets` from URL search params

**5. Availability Calendar (`RoomAvailabilityCalendar.tsx`)**
- Add `pets` to guest state
- Add Pets stepper to booking summary (only for properties where pets are allowed)
- Pass pets count to booking URL

### C. Backend Changes

**File: `supabase/functions/push-booking/index.ts`**
Add `petCount` to the Hostfully `guestInformation` payload:
```typescript
guestInformation: {
  // ... existing fields
  petCount: booking.pets || 0,
}
```

---

## Technical Implementation

### File Changes Summary

| File | Changes |
|------|---------|
| `src/components/RoomAvailabilityCalendar.tsx` | Add overflow container, add Infants/Pets steppers to summary |
| `src/pages/Booking.tsx` | Add `numberOfPets` to interface, add Pets stepper, include in booking mutation |
| `supabase/functions/push-booking/index.ts` | Add `petCount` to Hostfully payload |

### Database Migration
```sql
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pets integer DEFAULT 0;
```

---

## Detailed Code Changes

### 1. Calendar Overflow Fix (RoomAvailabilityCalendar.tsx)

Wrap the DayPicker in an overflow container:

```tsx
<div className="overflow-x-auto min-w-0">
  <DayPicker
    // ... existing props
  />
</div>
```

### 2. Add Infants to Non-Benson Properties (RoomAvailabilityCalendar.tsx)

After the Children stepper (line ~859), add Infants stepper:

```tsx
{/* Infants - for all properties that allow infants */}
{roomTypeData?.allow_infants && (
  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-muted-foreground" />
      <div>
        <span className="text-sm font-medium">Infants</span>
        <p className="text-xs text-muted-foreground">Under 2</p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Button onClick={() => setGuests(g => ({ ...g, infants: Math.max(0, g.infants - 1) }))} ... />
      <span>{guests.infants}</span>
      <Button onClick={() => setGuests(g => ({ ...g, infants: g.infants + 1 }))} ... />
    </div>
  </div>
)}
```

### 3. Add Pets Field (Multiple Files)

**RoomBooking Interface (Booking.tsx):**
```typescript
interface RoomBooking {
  // ... existing fields
  numberOfPets: number;
}
```

**Guest state (RoomAvailabilityCalendar.tsx):**
```typescript
const [guests, setGuests] = useState({ adults: initialGuests, children: 0, teens: 0, infants: 0, pets: 0 });
```

**Pets UI (both files):**
```tsx
{/* Pets - only for properties that allow pets */}
{petsAllowed && (
  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
    <div className="flex items-center gap-2">
      <PawPrint className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">Pets</span>
    </div>
    {/* stepper controls */}
  </div>
)}
```

### 4. Push-Booking Edge Function

Add `petCount` to Hostfully payload:

```typescript
guestInformation: {
  firstName: firstName,
  lastName: lastName,
  email: booking.guest_email,
  phoneNumber: booking.guest_phone || '',
  adultCount: booking.adults || 1,
  childrenCount: booking.children || 0,
  infantCount: booking.infants || 0,
  petCount: booking.pets || 0,  // ← NEW
  countryCode: countryCode,
},
```

---

## Expected Results

1. **Calendar**: Two-month view no longer spills outside its container; horizontal scroll available if needed on narrow screens
2. **Infants**: Visible and adjustable in the calendar booking summary for all properties (not just Benson)
3. **Pets**: 
   - New Pets stepper appears for properties with `pets_allowed = true`
   - Pet count stored in database
   - Pet count sent to Hostfully API in booking payload

---

## Dependencies

- **Icons**: Import `PawPrint` from `lucide-react` for pets icon
- **Database**: Migration adds `pets` column (integer, default 0)
- **Property Data**: Uses existing `amenities.pets_allowed` boolean
