

## Plan: Fix Booking Bar Embed Size + Rate Calculation in Embeds and Booking Page

### Two Distinct Issues

**Issue 1: Booking Bar is an iframe with full booking engine — should be a simple bar**
The BookingBarTab currently generates the same full-page URL as FullEmbedTab, resulting in a cramped full booking engine in a tiny space. The booking bar should be a pure HTML snippet (date pickers + Book button) that redirects — no iframe needed. The existing snippet is actually correct HTML, but the description/URL suggests it might be getting embedded as an iframe somewhere. The booking bar snippet itself is fine — it's self-contained HTML.

**Issue 2: Rates don't flow from embed → Booking page for ROL'OS properties**
When a user clicks "Book" in the embed (`EmbedProperty.tsx`), they navigate to `/booking/${slug}?room_type=${room.id}`. The Booking page (`Booking.tsx`) then:
1. Fetches the property — gets `external_system` (which is null/none for ROL'OS properties like Latter Days)
2. Tries to build availability from `amenities.room_types` (wizard rooms) or `pms_availability_cache`
3. For ROL'OS properties with rates in `rolos_rate_plans`, neither source has the data — rates are only in `rolos_rate_plans` which Booking.tsx never queries

The EmbedProperty page correctly resolves rates via `rolos_rate_plan_room_types` → `rolos_rate_plans`, but this data is never passed to the Booking page.

### Root Cause
`Booking.tsx` has no fallback path for ROL'OS properties that use `rolos_rate_plans`. It only checks:
- PMS API calls (Benson, Hostfully, HotelBeds)
- `pms_availability_cache` 
- `amenities.room_types` (wizard rates)

ROL'OS properties store their rates in `rolos_rate_plans` + `rolos_rate_plan_room_types`, which is never queried by the Booking page.

### Changes

#### 1. Fix EmbedProperty.tsx — pass rate data via URL params
When the Book button is clicked, include the resolved rate and pricing model in the URL so the Booking page can use it immediately.

Also pass the `linked_rolos_id` (the rolos_room_type ID) as the room identifier instead of the `hostfully_room_types` UUID, since that's what the rate plan maps to.

**File:** `src/pages/EmbedProperty.tsx` — update Book button onClick

#### 2. Add ROL'OS rate plan fallback in Booking.tsx
For properties where `is_rol_property = true` and no external PMS, add a new code path in `calculateCost` that:
1. Queries `rolos_rate_plans` + `rolos_rate_plan_room_types` for the property
2. Queries `hostfully_room_types` to get room type info (name, linked_rolos_id)
3. Builds synthetic availability with daily rates from the rate plans
4. Falls back to `daily_rate` on `hostfully_room_types` if no rate plan exists

This mirrors what `EmbedProperty.tsx` already does but feeds it into the cost calculator format.

**File:** `src/pages/Booking.tsx` — add ROL'OS rate resolution in calculateCost, before the wizard-rates fallback

#### 3. Fix Booking.tsx room initialization for embed-originated bookings  
The embed passes `room_type` as a URL param but Booking.tsx reads `roomTypeId`. Add support for the `room_type` param and resolve the hostfully_room_types UUID to the correct room type ID for matching.

**File:** `src/pages/Booking.tsx` — read `room_type` from searchParams, add to room initialization

#### 4. No changes needed to BookingBarTab
The booking bar snippet is pure HTML (no iframe). It correctly generates a redirect URL. The issue the user sees is likely on the property page itself where rates don't calculate — which is the same root cause as issue 2.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/EmbedProperty.tsx` | Pass rate + pricing_model + proper room ID in Book button URL |
| `src/pages/Booking.tsx` | Add ROL'OS rate plan query fallback; support `room_type` URL param from embed |

