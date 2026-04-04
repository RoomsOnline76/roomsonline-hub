

# Fix Announcements, Packages & Specials on Checkout Page

## Root Causes

### 1. Announcements: Not rendered on Booking.tsx
The `AnnouncementBanner` component exists and is used on PropertyShowcase and EmbedProperty, but is **never imported or rendered** on the checkout page (`Booking.tsx`).

### 2. Package "Winter Special": Field name mismatch
The Latter Days package stores dates as `periodFrom` / `periodTo`, but the checkout code looks for `valid_from` / `start_date` and `valid_until` / `end_date`. It also stores `minimumStay` but the code checks `min_nights` / `min_stay`. The `pricingType: "discount"` is present but no `discount_percentage` field exists — the package type implies a discount but the code never maps `pricingType` to an actual percentage.

**DB data**: `periodFrom: 2025-12-31`, `periodTo: 2026-12-30`, `minimumStay: 4`, `pricingType: "discount"` — none of these field names match the code.

### 3. Early Bird Special: Wrong column names in query
The specials query uses `valid_until` (doesn't exist — actual column is `valid_to`) and checks `discount_type` / `discount_value` (don't exist — actual columns are `special_type`, `discount_percent`, `fixed_amount`, `fixed_price`).

## Changes

### File: `src/pages/Booking.tsx`

**A. Add AnnouncementBanner to checkout page**
- Import `AnnouncementBanner` from `@/components/showcase/AnnouncementBanner`
- Render it at the top of the checkout content when `property.amenities?.announcements` has entries

**B. Fix package field name resolution** (lines ~1471-1500)
- Map all known field names: `periodFrom` / `valid_from` / `start_date` → start; `periodTo` / `valid_to` / `end_date` → end
- Map `minimumStay` / `min_nights` / `min_stay` → minStay
- Map `pricingType === "discount"` to a configurable percentage (use a default like 10% or read from a `discountPercent` / `discount_percentage` field)
- Also check `discount` field from package data

**C. Fix specials query column names** (lines ~1527-1533)
- Change `.gte("valid_until", ...)` → `.gte("valid_to", ...)`
- Map `special_type` → discount logic: `"discount"` uses `discount_percent`, `"fixed_amount"` uses `fixed_amount`, `"fixed_price"` uses `fixed_price`
- Remove references to non-existent `discount_type` / `discount_value`

**D. Fix room ID matching for specials** (lines ~1542-1548)
- The Early Bird special has `applicable_room_ids: [1, 1772973704081]` — these are legacy timestamp IDs from the frontend. The checkout passes UUID `roomTypeId`. Need to also match against the room's `linked_rolos_id` or amenities-based room identifiers, or match by checking both the UUID and the amenities room ID.

### Summary of field mappings

```text
PACKAGES (amenities JSON):
  periodFrom / valid_from / start_date  →  period start
  periodTo   / valid_to   / end_date    →  period end
  minimumStay / min_nights / min_stay   →  min nights
  pricingType:"discount" + discountPercent / discount_percentage  →  % off

SPECIALS (property_specials table):
  valid_from, valid_to          (NOT valid_until)
  special_type                  (NOT discount_type)
  discount_percent              (NOT discount_value, for percentage)
  fixed_amount                  (for fixed $ off)
  fixed_price                   (for fixed total price)
```

