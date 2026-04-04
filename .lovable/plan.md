

# Fix HotelBeds Rates Not Reaching Checkout

## Problem
When a guest clicks "Book" on a HotelBeds property embed, rates show as zero or "On Request" in checkout. The root cause is a **room ID mismatch** between the database and the HotelBeds API response.

- The embed page passes the database UUID (e.g. `69c53acc-bfce-4bf9-...`) as the room identifier
- The HotelBeds API returns room codes (e.g. `DBT.DX-4`) as identifiers
- The checkout room-matching logic cannot link these two, so the rate data is never applied

This same pattern could affect any PMS adapter where the external room code differs from the database UUID.

## Fix

### Step 1: Pass `hostfully_room_id` to checkout (EmbedProperty.tsx)
Add the `hostfully_room_id` (which contains `hotelbeds:DBT.DX-4`) as a URL parameter when navigating to checkout, so the checkout page knows the PMS-native room identifier.

### Step 2: Bridge room matching in checkout (Booking.tsx)
In the `calculateCost` room-matching logic, add a new matching step that:
1. Reads the `hostfully_room_id` from the URL parameter
2. Strips the `hotelbeds:` prefix to get the raw PMS code
3. Matches against the `room_type_id` in the API response

This is a universal fix — it works for any adapter where `hostfully_room_id` stores the external identifier (Hostfully UIDs, HotelBeds codes, Benson IDs, etc.).

### Step 3: Also pass per-day rates from PMS cache to checkout (EmbedProperty.tsx)
Currently `effectiveRate` in `handleBookRoom` only checks `daily_rate` and ROL'OS rate plans. For PMS-backed properties, also check the `pmsCacheMap` for the selected room's rate on the check-in date, ensuring `embed_rate` is populated as a reliable fallback.

## Adapter Audit
| Adapter | Room ID format in API response | `hostfully_room_id` format | Match with fix? |
|---|---|---|---|
| HotelBeds | `DBT.DX-4` | `hotelbeds:DBT.DX-4` | Yes (strip prefix) |
| Hostfully | UUID | UUID (same) | Already works |
| Benson | numeric/slug | `benson:{id}` | Yes (strip prefix) |
| HyperGuest | code | `hyperguest:{id}` | Yes (strip prefix) |

## Files Changed
| File | Change |
|---|---|
| `src/pages/EmbedProperty.tsx` | Pass `hostfully_room_id` as URL param; resolve rate from `pmsCacheMap` |
| `src/pages/Booking.tsx` | Add `hostfully_room_id`-based room matching in cost calculator |

