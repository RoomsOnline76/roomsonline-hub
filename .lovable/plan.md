# Plan: Fix Latter Days Booking Flow - COMPLETED ✅

## Summary of Changes Implemented

### 1. ✅ Fixed Rate Retrieval for Manual Properties
**File: `src/pages/PropertyShowcase.tsx`**
- Updated `getLowestRateForRoom()` to prioritize:
  1. Linked rate types from wizard data (`linkedRateTypes` → `pms_rate_types`)
  2. Direct room rate (`baseRate`, `base_rate`, `daily_rate`)
  3. Availability cache (existing fallback)
  4. PMS rates (final fallback)

### 2. ✅ Improved Calendar Blocked Date Visibility
**File: `src/components/booking/BottomSheetDatePicker.tsx`**
- Blocked/unavailable dates now show `bg-muted/60 line-through` styling
- Past dates show `bg-muted/40 text-muted-foreground/30`
- Added visual legend: "Available" (white) vs "Unavailable" (grey with strikethrough)
- Prevented selection of blocked dates in `handleDateClick()`

### 3. ✅ Minimizable AI Concierge Panel
**File: `src/components/booking/AIConciergePanel.tsx`**
- **Desktop**: Added minimize button (X) in header → collapses to floating Sparkles icon in bottom-right
- **Mobile**: Compact booking strip (Date range | Guests) always visible, floating AI icon to expand chat
- Better UX: Less screen real estate consumed when not actively chatting

### 4. ✅ Fixed "You Might Also Love" R0 Rates
**File: `src/components/booking/PropertyRecommendations.tsx`**
- Added `getPropertyRate()` helper that extracts rates from:
  1. `price_per_night` if non-zero
  2. `amenities.pms_rate_types[0].baseRate`
  3. `amenities.room_types[0].baseRate`
- Shows "Inquire for rates" if no rate found instead of R0

### 5. ✅ Intelligent "The Experience" Prose
**File: `src/lib/editorialUtils.ts`**
- Rewrote `composeAmenitiesProse()` with category-based sentence composition
- Categories: wellness, dining, comfort, convenience
- Example output: "Revive with the pool and the gym, then savor restaurant or bar."
- No more awkward "Awaken to gym and breakfast included" text

### 6. ✅ Map Display Improvements
**File: `src/components/showcase/InvitationMap.tsx`**
- Removed property pin (attractions are the focus)
- Added permanent text labels to attraction/eatery markers with emoji prefix (🍽️)
- Click on marker shows detailed InfoWindow with rating and "View on Maps →" link

### 7. ✅ Single-Room Property CTA
**File: `src/components/showcase/StickyBookingCTA.tsx`**
- Added `roomCount` prop
- For single-room properties, CTA shows "Select Dates" instead of "Add to Journey"
- Better UX for properties like "Latter Days" with only 1 room type

---

## Testing Checklist

- [ ] Visit `/property/latter-days`
- [ ] Verify room card shows rate (R2,650)
- [ ] Open date picker from floating button
- [ ] Verify blocked dates (Feb 9-13) appear greyed out with line-through
- [ ] Select available dates
- [ ] Verify AI concierge can be minimized (desktop: X button, mobile: floating icon)
- [ ] Verify "You Might Also Love" shows actual rates
- [ ] Verify "The Experience" text is natural prose
- [ ] Verify map shows attraction labels without property pin
