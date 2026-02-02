
# Fix Double Reservations in Admin Dashboard & Revenue Pulse

## Problem Summary

The booking flow for journeys is creating **duplicate reservations** for the same transaction:

| Booking | Created At | Payment Status | Role | Linked to Itinerary |
|---------|------------|----------------|------|---------------------|
| `afbfc5dc` | 06:18:34 | **paid** | Placeholder for PayFast | ❌ Only via `ai_metadata` |
| `2f86eda8` | 06:18:50 | unpaid | Created by `multi-push-booking` | ✅ Via `itinerary_bookings` |

**The root cause:** `JourneyCheckout.tsx` creates a placeholder booking for PayFast. Then, when payment succeeds, `multi-push-booking` creates a **second** booking per stay instead of using the existing one.

---

## Flow Analysis

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                         CURRENT (BROKEN) FLOW                              │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  JourneyCheckout.tsx                                                       │
│  ├─ saveToDatabase() → Creates itinerary                                   │
│  └─ INSERT booking A (placeholder)                                         │
│       └─ booking_channel: 'rol_itinerary'                                  │
│       └─ ai_metadata.itinerary_id: xxx                                     │
│       └─ status: 'pending_payment'                                         │
│                     ↓                                                      │
│  PayFast ITN (on payment success)                                          │
│  ├─ UPDATE booking A → payment_status: 'paid', status: 'confirmed'         │
│  └─ INVOKE multi-push-booking(itinerary_id)                                │
│                     ↓                                                      │
│  multi-push-booking                                                        │
│  └─ INSERT booking B (NEW booking for each stay) ← DUPLICATE!              │
│       └─ Links B to itinerary_bookings                                     │
│                                                                            │
│  RESULT: 2 bookings for 1 transaction (A=paid, B=unpaid)                   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Solution Options

### Option A: Modify `multi-push-booking` to REUSE Existing Booking (Recommended)

For single-stay itineraries, the placeholder booking already has all the data. `multi-push-booking` should:
1. Check if a placeholder booking already exists for the itinerary
2. For single-stay journeys: update the existing booking instead of creating a new one
3. For multi-stay journeys: create additional bookings only for stays 2, 3, etc.

### Option B: Delete Placeholder After Payment

When `multi-push-booking` creates the "real" bookings, delete the placeholder booking. This is cleaner but loses the payment linkage.

### Option C: Skip Placeholder Creation Entirely

Don't create a booking in `JourneyCheckout`. Instead, pass itinerary_id to PayFast and let `multi-push-booking` create all bookings. This requires significant PayFast integration changes.

**Recommendation: Option A** - cleanest solution, preserves payment linkage

---

## Implementation Plan

### 1. Modify `multi-push-booking` to Detect & Reuse Placeholder

**File:** `supabase/functions/multi-push-booking/index.ts`

```typescript
// Before processing stays, find if there's an existing placeholder booking
const { data: existingPlaceholder } = await supabase
  .from("bookings")
  .select("id, property_id, payment_status")
  .eq("booking_channel", "rol_itinerary")
  .eq("status", "confirmed")
  .contains("ai_metadata", { itinerary_id })
  .single();

// For first stay, reuse placeholder if it matches
if (existingPlaceholder && existingPlaceholder.property_id === stays[0].property_id) {
  // Don't create new booking, just link existing one to itinerary_bookings
  // ...
}
```

### 2. Update Bookings Dashboard Deduplication

**File:** `src/pages/Bookings.tsx`

Add logic to identify and dedupe itinerary bookings:
- If two bookings share the same `ai_metadata.itinerary_id`, show only the one with `payment_status: 'paid'`
- Or mark the placeholder with a flag to exclude it from display

### 3. Fix Revenue Pulse to Not Double-Count

**File:** `supabase/functions/revenue-pulse-api/index.ts`

The current query already filters by `payment_status === 'paid'`, but if both get marked as paid (bug), they'd both count. Add deduplication:

```typescript
// Only count unique itinerary bookings once
// Group by ai_metadata->itinerary_id if present, take one with paid status
```

### 4. Add Display Logic for Journey vs Booking Reference

**File:** `src/pages/Bookings.tsx`

Currently shows both booking ref and journey ref in the "Ref" column. Should:
- For itinerary bookings: show ONLY the journey ref (J) badge
- Hide the booking ref to avoid confusion

---

## Technical Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/multi-push-booking/index.ts` | Check for existing placeholder, reuse instead of creating duplicate |
| `src/pages/Bookings.tsx` | Dedupe bookings by itinerary_id, prefer `paid` booking |
| `supabase/functions/revenue-pulse-api/index.ts` | Ensure unique counting for itinerary bookings |

---

## Data Cleanup

After deploying fixes, run a cleanup query to mark duplicate placeholder bookings:

```sql
-- Mark duplicate placeholders as 'superseded' or delete them
UPDATE bookings 
SET status = 'superseded'
WHERE booking_channel = 'rol_itinerary'
  AND ai_metadata->>'itinerary_id' IS NOT NULL
  AND id NOT IN (
    SELECT booking_id FROM itinerary_bookings
  );
```

---

## Verification

After fix:
1. Complete a journey checkout
2. Confirm only ONE booking appears in Admin Reservations
3. Confirm Revenue Pulse counts only once
4. Journey ref (J) badge links to the single unified booking
