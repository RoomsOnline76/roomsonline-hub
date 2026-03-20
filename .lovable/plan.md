
# Fluent-Inspired Booking Flow Redesign

## Status

### Phase 1: Property Showcase Simplification ✅ COMPLETE
- **RunwayHero.tsx** — Simplified to Fluent-style: 70-80vh gallery with nav arrows, dot indicators, property info overlay + price badge. No parallax.
- **BookingSidebar.tsx** (new) — Sticky sidebar (desktop 340px) / bottom bar (mobile). Dates, guests, price estimate, promo code, CTA. Replaces StickyBookingCTA + FloatingDateGuestPicker.
- **RoomCollection.tsx** — Horizontal cards (image left, details right) with "Select →" button.
- **CategoryCollection.tsx** — Same horizontal card treatment for Hostfully categories.
- **PropertyShowcase.tsx** — 2-column layout: content left + sidebar right (desktop). Mobile gets bottom bar.

### Phase 2: Inline Checkout ✅ COMPLETE
- **InlineCheckoutPanel.tsx** (new) — Slide-in right panel (desktop) with 3 numbered steps: Your Stay → Your Details → Payment. Full booking creation + PayFast/PayGate payment integration. Deduplication, anonymous auth, itinerary persistence.
- **PropertyShowcase.tsx** — "Book Now" and SmartCart now open InlineCheckoutPanel instead of navigating to /journey/checkout. Checkout stays on-page.
- **Booking.tsx** — Preserved as fallback for direct links, embed flows, and white-label integrations.

### Phase 3: Embed/Widget Alignment — TODO
### Phase 4: Confirmation & Email Polish — TODO
### Phase 5: Mobile Optimization — TODO
