

# Performance Optimization — Faster Page Loads & Availability

## Problem Analysis

The pages are slow because of **waterfall data fetching** — each page makes multiple sequential requests:

1. **PropertyShowcase**: Fetches property → then cache availability → then live PMS availability → then calendar availability (3-4 sequential calls)
2. **RoomAvailabilityCalendar**: Fetches room type data → then property amenities (fallback) → then availability (2-3 sequential calls, each waiting for the previous)
3. **Booking page**: Fetches property → room types cache → rate types cache → then calculates cost by calling edge functions for live availability (4+ sequential calls)
4. **Hostfully/HotelBeds**: Every page visit calls the live PMS API via edge function (~3-8s round trip) instead of reading from cache

## Fix Strategy: Parallel Fetching + Cache-First + Preloading

### 1. Parallel data fetching on PropertyShowcase

**File: `src/pages/PropertyShowcase.tsx`**

Currently `fetchPropertyData` does:
- Fetch property (await) → then fetch today's cache availability (await) → then in separate effects: fetch live PMS, fetch calendar availability

Change to: Fire property + cache availability in parallel using `Promise.all`. Then fire live PMS + calendar availability in parallel (they only need `property.id`).

### 2. Parallel data fetching on Booking page

**File: `src/pages/Booking.tsx`**

Currently loads property → then (sequentially) cached room types → cached rate types → then calculates cost by fetching availability again.

Change to:
- Add `staleTime: 5 * 60 * 1000` to property, room types, and rate types queries so React Query caches them across navigations
- Run `calculateCost` with the **already-fetched availability from PropertyShowcase** passed via `sessionStorage` or URL, avoiding a redundant edge function call
- Preload availability data: when dates are selected on PropertyShowcase, cache the full availability response in `sessionStorage` keyed by `property_id + dates`. On Booking page, read from this cache first before hitting the API.

### 3. Cache-first availability on RoomAvailabilityCalendar

**File: `src/components/RoomAvailabilityCalendar.tsx`**

Currently for Hostfully properties, every month navigation calls the live edge function (3-8s). Change to:
- First read from `pms_availability_cache` (instant, ~100ms)
- Show cached data immediately
- Then fire live PMS call in background and merge any updates
- This gives perceived instant load with eventual consistency

### 4. Preload availability from PropertyShowcase to Booking

**File: `src/pages/PropertyShowcase.tsx`**

When a user selects dates and clicks "Book Now", the availability data is already fetched. Store it in `sessionStorage` so the Booking page can use it immediately instead of re-fetching.

**File: `src/pages/Booking.tsx`**

In `calculateCost`, check `sessionStorage` for pre-fetched availability before making any API calls.

### 5. Add staleTime to all property-related React Query calls

Currently the property query on Booking has no `staleTime`, so every mount re-fetches. Add `staleTime: 5 * 60 * 1000` (5 min) to:
- Property booking query
- Cached room types query
- Cached rate types query

### 6. Prefetch room types and rate types alongside property

**File: `src/pages/Booking.tsx`**

The room types and rate types queries wait for `property?.id` to be set. Change to use React Query's `enabled` more aggressively — fire them as soon as we have the property ID from URL (even before the full property object loads) by doing a quick ID resolution.

## Expected Impact

| Current | After |
|---------|-------|
| PropertyShowcase: ~8-15s full render | ~3-5s (parallel fetch, cached availability) |
| Calendar: ~10s per month | ~1-2s (cache-first, background refresh) |
| Booking page: ~10-15s to show total | ~3-5s (preloaded availability, cached queries) |
| Page-to-page navigation: full refetch | Near-instant (React Query staleTime caching) |

## Files

| Action | File |
|--------|------|
| Modify | `src/pages/PropertyShowcase.tsx` — parallel fetches, preload availability to sessionStorage |
| Modify | `src/pages/Booking.tsx` — read preloaded availability, add staleTime, parallel queries |
| Modify | `src/components/RoomAvailabilityCalendar.tsx` — cache-first with background PMS refresh |

No database changes needed.

