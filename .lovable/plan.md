

# Fluent Booking Flow Unification

## Problem
The "Fluent-Inspired Booking Flow Redesign" was only applied to `PropertyShowcase.tsx`. Two critical surfaces still use the old pre-Fluent design:

1. **`EmbedProperty.tsx`** (564 lines) — Uses raw inline `style={}` objects, no motion, no Fluent components. This is what owners embed on their websites via widgets, iframes, booking bar, direct links, and Elementor.

2. **`Booking.tsx`** (2329 lines) — Traditional Card-based checkout form with dropdowns and grids. No numbered steps, no motion, no editorial feel. This is the main checkout page for `book.sleepinafrica.roomsonline.co.za` AND the page embed widgets redirect to for checkout.

The Fluent showcase flow is: **RunwayHero → RoomCollection → BookingSidebar → InlineCheckoutPanel** (3-step numbered flow: Your Stay → Your Details → Payment).

The embed and booking pages completely bypass this design language.

## Changes

### 1. Redesign `EmbedProperty.tsx` — Fluent embed widget
Replace raw inline styles with Tailwind + Fluent design patterns:
- **Header**: Use the same clean brand bar but with Tailwind classes and motion entrance
- **Date Controls**: Replace raw inputs with the `EmbedDatePicker` + expanding snake motif already imported
- **Availability Grid**: Keep `EmbedAvailabilityGrid` but wrap in Fluent card styling with `framer-motion` reveal
- **Room Cards**: Replace the flat property info card with a mini `RoomCollection`-style layout — horizontal cards with images, capacity badges, rate, and "Book" CTA
- **Property Info**: Use editorial prose style (similar to `QuietFacts` / `BuildingIntro`) instead of raw divs
- **Gallery**: Add motion fade transitions between images (currently just swaps `src`)
- **Footer/Reviews**: Wrap in Fluent card containers with subtle shadows
- Keep all existing functionality (postMessage, resize observer, rate resolution, availability overrides)

### 2. Redesign `Booking.tsx` — Fluent checkout page
This is the biggest change. Transform the 2329-line traditional form into a Fluent stepped checkout:
- **Replace the 3-column Card layout** with the same numbered-step pattern used by `InlineCheckoutPanel`: Step 1 (Your Stay summary), Step 2 (Guest Details), Step 3 (Payment)
- **Property header**: Add a mini hero banner with property image, name, dates, and guest count (similar to the confirmation card in InlineCheckoutPanel)
- **Room selection**: Replace the Select dropdown + stepper grid with `LuxuryRoomCard`-style horizontal cards (already exists in `/components/booking/`)
- **Guest details**: Clean single-column form with motion reveal, matching InlineCheckoutPanel's styling
- **Cost summary**: Sticky sidebar on desktop / collapsible bottom sheet on mobile, matching `BookingSidebar` aesthetic
- **Mobile**: Full bottom-sheet pattern with sticky CTA, matching the Fluent mobile booking bar
- **Motion**: Add `framer-motion` entrance animations for each section
- Preserve ALL business logic: cost calculation, availability checking, PMS push, payment gateway routing, date reselection dialog, deduplication, embed rate passthrough

### 3. Create shared Fluent booking primitives
Extract reusable pieces to avoid duplication:
- **`FluentStepIndicator`** — The numbered step dots (1 · 2 · 3) with active/completed states, reusable across InlineCheckoutPanel and Booking.tsx
- **`FluentBookingHeader`** — Mini property banner (image + name + dates + guests) used at top of checkout pages
- **`FluentGuestForm`** — The guest details form (name/email/phone) with consistent styling, used by both Booking.tsx and InlineCheckoutPanel

### 4. Update embed → booking handoff
When `EmbedProperty.tsx` calls `handleBookRoom()` and redirects to `/booking/{slug}`, ensure the Booking page detects the `integration` param and renders in the Fluent white-label mode with the same brand colours passed through.

## Files
1. **Create** `src/components/booking/FluentStepIndicator.tsx` — Shared step indicator
2. **Create** `src/components/booking/FluentBookingHeader.tsx` — Mini property hero for checkout
3. **Create** `src/components/booking/FluentGuestForm.tsx` — Shared guest form component
4. **Rewrite** `src/pages/EmbedProperty.tsx` — Fluent embed with Tailwind + motion
5. **Rewrite** `src/pages/Booking.tsx` — Fluent stepped checkout (preserve all business logic)

## Scope Note
This is a large visual overhaul of two core pages. All existing business logic (PMS integration, payment gateways, cost calculation, availability checking, deduplication, embed rate passthrough, white-label branding) will be preserved exactly — only the presentation layer changes. The plan prioritizes using existing Fluent components (`LuxuryRoomCard`, `BookingSidebar` patterns, `InlineCheckoutPanel` step pattern) rather than creating new design systems.

