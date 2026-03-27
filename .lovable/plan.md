

# Fix Booking Flow Circles, White-Label RoomShowcase & Gallery

## Issues Identified

1. **RoomShowcase still shows ROL footer** — uses `PublicLayout` without checking `brand_override_enabled`. Needs same white-label logic as PropertyShowcase.

2. **RoomShowcase gallery is flat grid** — should be collapsible/carousel like the PropertyShowcase BuildingGallery, not a full grid of thumbnails always visible.

3. **PropertyShowcase map location** — InvitationMap already exists at bottom. Clarification: user may want it higher or more prominent. Will keep as-is since it's already there.

4. **Bottom-right "Select Dates" button → opens date picker but dates don't carry over** — When the AIConciergePanel floating button is clicked, it opens the BottomSheetDatePicker. After selecting dates, the `handleDatesChange` fires and for single-room properties auto-adds to cart. The problem is the button always says "Select Dates" even when dates exist, and clicking "Book Now" in the collapsed strip calls `handleBookNowClick` which re-opens the date picker if no dates (but dates ARE in context — the check uses `checkInDate`/`checkOutDate` from MobileBookingContext which should be set). Need to add a **"Continue" / "Next"** button after dates are selected so the user can proceed without prompting TOBI.

5. **BookingSidebar date button re-opens calendar after dates are set** — clicking the dates row in the desktop sidebar always opens BottomSheetDatePicker. After dates are selected, clicking "Book Now" calls `onBook` → `handleBookProperty` → dispatches `openConciergeDatePicker` again (circular!). The issue: `handleBookProperty` always goes to the AI concierge path which opens the date picker, even when dates are already selected. Fix: when dates already exist, skip date picker and go straight to room selection/booking.

6. **"Too many circles"** — The flow is: sidebar date button → calendar → select dates → close → click "Book Now" → opens date picker again via concierge event. Fix the `handleBookProperty` to check if dates are already set and skip to the next step.

## Plan

### 1. RoomShowcase White-Label Layout (`src/pages/RoomShowcase.tsx`)
- Import `WhiteLabelLayout` 
- Fetch `brand_override_enabled`, `brand_primary_color`, `brand_logo_url` from `public_properties` (already using `select("*")`)
- Add `isWhiteLabel` check like PropertyShowcase
- Use `WhiteLabelLayout` instead of `PublicLayout` when branded
- Hide ROL footer/header for branded properties

### 2. RoomShowcase Gallery Collapse (`src/pages/RoomShowcase.tsx`)
- Replace the flat thumbnail grid (lines 1040-1064) with a collapsible carousel/turnstile
- Show 4-5 thumbnails in a horizontal scroll with expand toggle
- Use Collapsible component — collapsed by default, showing just a strip of thumbnails

### 3. Fix Booking Flow Circles (`src/pages/PropertyShowcase.tsx`)
- In `handleBookProperty`: when AI concierge is active AND dates are already selected, skip the date picker dispatch. Instead:
  - For single-room properties: auto-add to cart and trigger checkout
  - For multi-room properties: scroll to rooms section
- This eliminates the circular "Book Now → opens date picker again" issue

### 4. AIConciergePanel: Add "Continue" Button (`src/components/booking/AIConciergePanel.tsx`)
- When dates are already selected (checkInDate && checkOutDate exist), show a "Continue →" / "Next" button instead of (or alongside) the date picker trigger
- Clicking "Continue" should:
  - For single-room: auto-add to cart
  - For multi-room: scroll to rooms or show room selector
- The floating button (bottom-right) should show "Book Now" instead of "Select Dates" when dates are already set
- After date picker closes with dates selected, auto-proceed (don't require another click)

### 5. BookingSidebar: Smart CTA After Dates (`src/components/showcase/BookingSidebar.tsx`)
- When dates are selected, the "Book Now" button click should proceed to booking, not reopen the calendar
- The `onBook` callback already handles this — the issue is in PropertyShowcase's `handleBookProperty` (fix in step 3)

## Files

| Action | File |
|--------|------|
| Modify | `src/pages/RoomShowcase.tsx` — white-label layout + collapsible gallery |
| Modify | `src/pages/PropertyShowcase.tsx` — fix `handleBookProperty` circular flow |
| Modify | `src/components/booking/AIConciergePanel.tsx` — "Continue" button, smart floating CTA |

No database changes needed.

