
# Fix: Payment Flow Failing Due to Parameter Name Mismatch

## Root Cause

The `multi-push-booking` edge function sends `bookingId` (camelCase) but `push-booking` expects `booking_id` (snake_case). This validation failure causes all bookings to be marked as `status: 'failed'` immediately after creation.

## The Fix

**File:** `supabase/functions/multi-push-booking/index.ts`

**Line 147** - Change from:
```typescript
body: JSON.stringify({ bookingId: booking.id })
```

To:
```typescript
body: JSON.stringify({ booking_id: booking.id })
```

## Technical Details

| Component | Current | Expected |
|-----------|---------|----------|
| Parameter sent | `bookingId` | `booking_id` |
| Validation | Fails (Zod schema expects snake_case) | Passes |
| Booking status | Set to `failed` | Set to `confirmed` (on success) |

## Expected Outcome

After this one-line fix:
1. Booking records stay `pending` until payment completes
2. PayFast payment modal opens correctly
3. After successful payment, ITN triggers `push-booking` with correct parameter
4. Booking status updates to `confirmed`

## Testing

1. Add a room to cart on any property
2. Fill guest details and click Pay
3. Complete test payment (card: 4000000000000002)
4. Verify booking shows as `confirmed` (not `failed`)
