

# Fix: Hostfully Checkout Shows "On Request" Instead of Rates

## Root Cause

The recent performance optimization (sessionStorage preloading) broke Hostfully rate calculation.

**What happens:**
1. PropertyShowcase preloads `avail_preload_{id}` into sessionStorage — but it only fetches **today's single date** from `pms_availability_cache`
2. Booking page reads this preloaded data and calls `transformCacheToAvailability` — producing an availability object with rates for **only today**
3. The cost calculator filters rates by `checkIn <= date < checkOut` — today's date likely doesn't fall in the booking range, so **zero rates match**
4. Because `availability` is now set (non-null), the code **skips the live Hostfully API call** that would have fetched proper multi-day rates
5. Result: `runningTotal = 0`, checkout shows "On Request"

**This is the third time this has broken** because each fix attempt didn't address the preload path short-circuiting the live PMS fetch.

## Fix

### File: `src/pages/Booking.tsx` (~lines 648-663)

The preloaded sessionStorage data should **not** be used for PMS-connected properties (Hostfully, Benson, HotelBeds, HyperGuest) because it only contains today's snapshot, not the full date range. The preload optimization only makes sense for cache-based properties where the same cache query runs on both pages.

Change the preload block to skip when `externalSystem` is a live-API PMS:

```
if (!availability && property?.id) {
  const skipPreload = ['hostfully', 'benson', 'hotelbeds', 'hyperguest'].includes(externalSystem || '');
  if (!skipPreload) {
    // ... existing sessionStorage preload logic
  }
}
```

This ensures Hostfully (and other live-API PMS systems) always go through their dedicated API fetch path, while cache-based and wizard properties still benefit from the preload optimization.

## Files

| Action | File |
|--------|------|
| Modify | `src/pages/Booking.tsx` — skip sessionStorage preload for live-API PMS systems |

No database changes needed. Single targeted fix.

