
# Fix: Journey Checkout RLS Policy Issue

## Problem Identified
The `403 Forbidden` error occurs because the `.insert(...).select('id')` operation in `JourneyCheckout.tsx` requires both:
1. **INSERT permission** - which exists via "Anyone can create bookings" policy with `WITH CHECK (true)`
2. **SELECT permission** - to return the `id` column after insertion

Current SELECT policies for `bookings` table:
- "Admins and devs can view all bookings" - requires admin/dev role
- "Owners can view bookings for their properties" - requires property ownership
- "Users can view own bookings" - requires `auth.uid() = user_id`

**Anonymous users fail all SELECT policies** because:
- They're not admin/dev
- They don't own the property
- The `user_id` column is NULL in the insert (not being set)

## Solution

**Option A (Recommended): Set user_id in the booking insert**

Modify `JourneyCheckout.tsx` to include `user_id: session.user.id` in the booking insert. This allows the existing "Users can view own bookings" policy to work.

```typescript
// Line ~205-221 in JourneyCheckout.tsx
const { data: tempBooking, error: bookingError } = await supabase
  .from('bookings')
  .insert({
    property_id: firstStay.property_id,
    user_id: session.user.id,  // ADD THIS LINE
    guest_name: guestName,
    // ... rest of fields
  })
  .select('id')
  .single();
```

**Why this works:**
- Anonymous users get a valid `auth.uid()` from `signInAnonymously()`
- Setting `user_id` to this value allows the "Users can view own bookings" policy (`auth.uid() = user_id`) to match
- No database migration needed - uses existing policy

---

## Technical Details

**Current code issue (lines 205-223):**
```typescript
const { data: tempBooking, error: bookingError } = await supabase
  .from('bookings')
  .insert({
    property_id: firstStay.property_id,
    // user_id is missing!
    guest_name: guestName,
    guest_email: guestEmail,
    // ...
  })
  .select('id')  // This SELECT fails RLS
  .single();
```

**Fix:**
Add `user_id: session.user.id` to the insert object. The session is already confirmed to exist at this point in the code (line 160-162 validates session exists).

## Alternative Option B (Database Migration)

If for some reason we don't want to set `user_id`, we could add a new SELECT policy:

```sql
CREATE POLICY "Anyone can view recently created bookings" 
ON public.bookings 
FOR SELECT 
TO public
USING (created_at > now() - interval '5 minutes');
```

However, this is less secure and not recommended.

## Files to Modify

1. `src/pages/JourneyCheckout.tsx` - Add `user_id: session.user.id` to the booking insert object

## Verification Steps

After implementing:
1. Navigate to `/journey/checkout` with items in cart
2. Fill in guest details
3. Click "Pay & Confirm Booking"
4. Verify booking is created without 403 error
5. Verify PayFast modal opens successfully
