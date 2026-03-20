

# Fluent-Inspired Booking Flow Redesign

## Current State vs Target

**Current ROL flow**: Editorial "Paris Fashion Week" showcase with AI Concierge, SmartCart, StickyBookingCTA, separate Booking.tsx checkout page (2,300+ lines), JourneyCheckout, BookingConfirmation -- powerful but complex, spread across many pages and components.

**Target**: A Fluent Living-inspired flow that is **clean, linear, and simple** while preserving ROL's unique strengths (AI Concierge, multi-PMS support, property branding, journey/itinerary, PayFast payment). The result should feel like a polished Hostfully-powered booking site with property-specific branding.

**Key Fluent patterns to adopt:**
- Sticky booking sidebar (desktop) / sticky bottom bar (mobile) with dates + guests + price -- always visible
- Inline availability calendar on the property page (not hidden in a drawer)
- Unit type cards with immediate "Check Availability" action (no separate room detail page required)
- Clean single-column checkout form with live price summary
- Promo code banner visible early (not buried in checkout)
- Minimal page navigation -- keep user on one page as long as possible

**ROL strengths to keep:**
- AI Concierge (as an enhancement, not a gate)
- Property brand override system
- Multi-PMS cost calculation engine
- PayFast/PayGate payment integration
- White-label/embed support
- Smart Cart for multi-property journeys
- Editorial hero and property storytelling

---

## Phased Implementation Plan

### Phase 1: Property Showcase Simplification (High Impact)

**Goal**: Replace the current editorial-heavy showcase with a cleaner, booking-focused layout while keeping the visual appeal.

**Files to modify:**
- `src/pages/PropertyShowcase.tsx` -- restructure layout
- `src/components/showcase/RunwayHero.tsx` -- simplify to Fluent-style hero (full-width image gallery, property name + location overlay, no parallax)
- `src/components/showcase/RoomCollection.tsx` -- replace masonry grid with clean horizontal cards, each with "Check Availability" button
- `src/components/showcase/CategoryCollection.tsx` -- same treatment for Hostfully categories
- `src/components/showcase/StickyBookingCTA.tsx` -- replace with Fluent-style sticky booking sidebar

**Changes:**
1. **Hero**: Keep full-viewport image slider but simplify -- remove parallax, add property name/location/rating as clean overlay. Add a visible "From R X,XXX/night" price badge.

2. **New: Sticky Booking Sidebar** (desktop right column, mobile bottom bar):
   - Date picker (inline, not popover)
   - Guest counter
   - Live price display ("R X,XXX total")
   - "Check Availability" / "Book Now" CTA
   - Promo code input (collapsible)
   - This replaces both `StickyBookingCTA` and `FloatingDateGuestPicker`

3. **Room Cards**: Clean horizontal layout with image, name, capacity icons, price, and "Select" button. Clicking "Select" adds to sidebar (no navigation to RoomShowcase unless user explicitly wants detail).

4. **Simplify sections**: Keep QuietFacts and ProseFacilities but make them more compact. Move reviews inline (not a separate "act").

### Phase 2: Inline Checkout (Eliminate Page Navigation)

**Goal**: When user clicks "Book Now" in the sidebar, expand checkout inline on the same page (accordion/drawer) instead of navigating to `/booking/:id`.

**Files to modify/create:**
- `src/components/booking/InlineCheckoutPanel.tsx` -- new component, replaces the 2,300-line Booking.tsx for inline use
- `src/pages/PropertyShowcase.tsx` -- add inline checkout state
- `src/pages/Booking.tsx` -- keep as fallback for direct links / embed flow, but simplify

**Changes:**
1. **Checkout as slide-in panel** (desktop: right sidebar expands; mobile: full-screen drawer):
   - Guest details form (name, email, phone)
   - Cost breakdown (from existing calculation engine)
   - Special requests / voucher (collapsed by default)
   - "Confirm & Pay" button
   - Payment modal (PayFast/PayGate, unchanged)

2. **Preserve existing cost calculation logic** -- extract from Booking.tsx into a shared hook `useBookingCost.ts` that both InlineCheckoutPanel and Booking.tsx can use.

3. **Three steps visible as numbered sections** (not separate pages):
   - 1. Your Stay (dates, room, guests -- already selected)
   - 2. Your Details (form)
   - 3. Payment (summary + confirm)

### Phase 3: Embed/Widget Alignment

**Goal**: Make the ROL'OS embed widget (`EmbedProperty.tsx`) match the new Fluent-style design language.

**Files to modify:**
- `src/pages/EmbedProperty.tsx` -- adopt same card/sidebar layout
- `src/components/embed/EmbedAvailabilityGrid.tsx` -- align styling
- `src/components/embed/EmbedDatePicker.tsx` -- align styling

**Changes:**
1. Match the property card and date picker styling to the main booking flow
2. Ensure brand color override works consistently
3. Keep the "expanding snake" calendar engine but restyle to match

### Phase 4: Confirmation & Email Polish

**Goal**: Clean confirmation page matching the new design language.

**Files to modify:**
- `src/pages/BookingConfirmation.tsx` -- simplify, match new style
- `src/pages/JourneyConfirmation.tsx` -- align

**Changes:**
1. Clean success card with booking summary
2. Consistent typography and spacing with new showcase design
3. "Add to Calendar" and "Share" actions

### Phase 5: Mobile Optimization

**Goal**: Ensure the entire flow is thumb-friendly and fast on mobile.

**Files to modify:**
- All components from Phases 1-4

**Changes:**
1. Sticky bottom bar: price + "Book Now" (replaces current StickyBookingCTA)
2. Full-screen date picker (bottom sheet, already exists)
3. Guest stepper as bottom sheet
4. Checkout as full-screen overlay (not a separate page)
5. Swipeable image gallery in hero

---

## Technical Details

### New shared hook: `src/hooks/useBookingCost.ts`
Extract the ~250 lines of cost calculation from Booking.tsx into a reusable hook. Both InlineCheckoutPanel and Booking.tsx import it.

### Component removal/deprecation:
- `FloatingDateGuestPicker.tsx` -- absorbed into new sidebar
- `StickyBookingCTA.tsx` -- replaced by new sidebar/bottom bar
- `FloatingBookingSummary.tsx` -- replaced by sidebar
- `LuxuryRoomCard.tsx` -- replaced by new room card design

### Components preserved:
- `AIConciergePanel.tsx` -- kept as enhancement (accessible via chat icon)
- `SmartCart.tsx` -- kept for multi-property journeys
- `QuickBookDrawer.tsx` -- simplified, used for single-room properties
- `PayFastOnsiteModal.tsx` -- unchanged
- `PayGateRedirect.tsx` -- unchanged
- `BottomSheetDatePicker.tsx` -- kept for mobile
- `GuestCountStepper.tsx` -- kept, restyled

### Key design tokens (Fluent-inspired):
- Clean sans-serif typography (Inter, already in use)
- Generous whitespace, 8px base grid
- Rounded corners (12px cards, 8px buttons)
- Muted backgrounds with clear hierarchy
- Property brand colors applied via existing `useBrandOverride`

### Files changed summary (~20 files):
- **Modified**: PropertyShowcase.tsx, RunwayHero.tsx, RoomCollection.tsx, CategoryCollection.tsx, StickyBookingCTA.tsx (or replaced), Booking.tsx (simplified), BookingConfirmation.tsx, EmbedProperty.tsx, embed components
- **New**: InlineCheckoutPanel.tsx, useBookingCost.ts
- **Deprecated**: FloatingDateGuestPicker.tsx, FloatingBookingSummary.tsx, LuxuryRoomCard.tsx

### Estimated scope per phase:
- Phase 1: ~8-10 messages (showcase restructure)
- Phase 2: ~5-7 messages (inline checkout + cost hook extraction)
- Phase 3: ~3-4 messages (embed alignment)
- Phase 4: ~2-3 messages (confirmation polish)
- Phase 5: ~3-4 messages (mobile optimization)

**Recommended deployment**: Phase 1 + 2 together (they're tightly coupled), then Phase 3, then 4+5.

