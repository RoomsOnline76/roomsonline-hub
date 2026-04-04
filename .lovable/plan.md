

# Surface Announcements, Specials, Packages, Add-ons & Checkout Enhancements

## Problem Summary

Currently, several data types configured in PropertyForm (stored in `amenities` JSON) are **never rendered** on the public-facing pages:

1. **Announcements** — saved to `amenities.announcements` but not shown on EmbedProperty or PropertyShowcase
2. **Specials** — `property_specials` table is only surfaced on the **portfolio** page, not on individual property embed or showcase pages
3. **Packages** — saved to `amenities.packages` but not shown anywhere public; also reported as not saving correctly (editing issue was fixed but may need verification)
4. **Add-ons** — saved to `amenities.addons` but never offered during checkout
5. **Checkout date adjustment** — the date picker only shows when no dates are selected; users cannot change dates once set. The availability-aware picker exists but is not accessible for modification.

## Plan

### 1. Show Announcements on EmbedProperty + PropertyShowcase

**Files**: `src/pages/EmbedProperty.tsx`, `src/pages/PropertyShowcase.tsx`

- Read `property.amenities.announcements` (already fetched)
- Filter to `enabled === true` and optionally check date range if announcements have `validFrom`/`validTo`
- Render a dismissible banner/card at the top of the content area (below hero, above rooms)
- Style: alert-style card with the announcement title, message, and optional link

### 2. Show Specials on EmbedProperty + PropertyShowcase

**Files**: `src/pages/EmbedProperty.tsx`, `src/pages/PropertyShowcase.tsx`

- Fetch from `property_specials` table for the current property (active, within date range)
- Render a "Current Specials" section with discount badges — similar pattern already exists in EmbedPortfolio
- On room cards, show a "Special" badge if a special applies to that room (via `applicable_room_ids`)
- Optionally apply the discount in the cost calculation on checkout

### 3. Show Packages on EmbedProperty + PropertyShowcase

**Files**: `src/pages/EmbedProperty.tsx`, `src/pages/PropertyShowcase.tsx`

- Read `property.amenities.packages` (already fetched)
- Filter to packages within their configured date range
- Render a "Packages" section with cards showing package name, description, included stays, pricing, and images
- Add a "Book Package" CTA that navigates to checkout with pre-filled params

### 4. Add-ons in Checkout

**File**: `src/pages/Booking.tsx`

- Read `property.amenities.addons` from the already-fetched property data
- Filter addons by applicable day-of-week (if configured) and offering type
- Add an "Extras & Add-ons" section between Step 1 (Your Stay) and Step 2 (Your Details)
- Each addon shows name, description, price, and a quantity stepper (or toggle for flat-fee items)
- Selected addons are added as line items in the cost breakdown
- Pass selected addons in the booking creation payload (metadata or dedicated field)

### 5. Date Adjustment in Checkout with Availability

**File**: `src/pages/Booking.tsx`

- When dates ARE already selected, make the date display clickable to open the `BottomSheetDatePicker`
- The picker already receives `calendarAvailability` (availability map) — it will show rates and blocked dates
- After date change, trigger cost recalculation (already wired via existing effects)
- Move the date picker rendering outside the `(!checkIn || !checkOut)` conditional so it's always available

### 6. Verify Package Saving

- The edit flow was recently fixed; verify that packages array correctly round-trips through save/load in `amenities.packages`

## Files to Create/Change

| File | Change |
|------|--------|
| `src/pages/EmbedProperty.tsx` | Add announcements banner, specials section, packages section |
| `src/pages/PropertyShowcase.tsx` | Add announcements banner, specials section, packages section |
| `src/pages/Booking.tsx` | Add add-ons selector, make dates always editable with availability picker |
| `src/components/showcase/AnnouncementBanner.tsx` | **Create** — reusable announcement display |
| `src/components/showcase/SpecialsBanner.tsx` | **Create** — reusable specials display for single-property views |
| `src/components/showcase/PackageCards.tsx` | **Create** — reusable packages display |
| `src/components/booking/AddOnSelector.tsx` | **Create** — checkout add-on picker with quantity steppers |

