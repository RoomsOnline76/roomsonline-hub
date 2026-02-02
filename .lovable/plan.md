
# Fix: Booking Creation RLS Policy Failure

## Problem Analysis

The payment flow fails with "Failed to create booking" due to an RLS (Row Level Security) violation when inserting into the `bookings` table. Investigation confirms:

1. **Itinerary saves successfully** - Same user/session can insert into `itineraries` table
2. **Booking insert fails** - Postgres logs show: "new row violates row-level security policy for table 'bookings'"
3. **Policy exists** - `Anyone can create bookings` policy has `WITH CHECK (true)` for INSERT

## Root Cause

The existing INSERT policy was created with default `TO public` which in PostgreSQL means "applies to all roles". However, Supabase clients connect using `anon` and `authenticated` roles specifically. While this typically works, there may be an edge case or token context issue.

The fix is to **explicitly specify the roles** the policy applies to (`anon` and `authenticated`), matching the pattern used for working tables like `itineraries`.

## Solution

### Database Migration

Create a new migration that:
1. Drops the existing INSERT policy
2. Recreates it with explicit `TO anon, authenticated` specification

```sql
-- Fix: Explicitly allow anon and authenticated roles to insert bookings
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;

CREATE POLICY "Anyone can create bookings" 
  ON public.bookings 
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);
```

## Technical Details

| Aspect | Current State | After Fix |
|--------|---------------|-----------|
| Policy Target | `TO public` (implicit) | `TO anon, authenticated` (explicit) |
| Policy Action | `WITH CHECK (true)` | `WITH CHECK (true)` (unchanged) |
| Behavior | Should allow all inserts | Explicitly allows guest and logged-in user inserts |

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | New migration with policy fix |

## Expected Outcome

- Booking creation succeeds for both anonymous guests and authenticated users
- PayFast payment flow proceeds without "Failed to create booking" error
- No change to existing booking read/update policies

## Testing

After migration:
1. Open a property page as a guest (not logged in)
2. Add room to cart
3. Fill checkout form with guest details
4. Click "Pay" button
5. Verify PayFast modal opens (booking record created successfully)
