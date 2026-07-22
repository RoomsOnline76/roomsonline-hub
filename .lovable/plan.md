
## Scope
Rework `src/pages/connect/ConnectIntegrations.tsx` (the page served at `connect.roomsonline.co.za/integrations`). No other files change.

## Removals
- **PMS cards:** NightsBridge
- **Distribution cards:** HyperGuest, HotelBeds, ProfitRoom
- Any copy elsewhere on the page referencing those four names.

## Additions
- **Benson** as a first-class PMS integration card (South African PMS, native ROL'OS sync of rates, availability, reservations, room types).

## New page structure

1. **Hero** — refreshed headline ("One API. Every PMS.") + intro emphasising the adapter pattern.
2. **How the Adapter Pattern Works** — keep the existing 4-step (Connect → Map → Sync → Build) block.
3. **Native PMS Integrations** grid (replaces current integration + distribution sections merged):
   - **ROL'OS Native** — Recommended, full feature set.
   - **Hostfully** — vacation rentals.
   - **Benson** — new; SA PMS, rates/availability/reservations sync, 45-day rolling window.
   - **Rentals United** — moved here from Distribution (XML adapter reaches 60+ rental channels).
   - **Custom Adapter** — build your own via the standardised interface.
4. **What You Get Through The Unified API** — new short feature strip (static content, rates & availability, bookings push, policies, payment methods, contacts) to replace the removed distribution section and reinforce the API value.
5. **CTA** — keep "Don't See Your PMS?" contact block.

## Visual/style
- Reuse existing tokens, `motion` fade-up, card styling, and Lucide icons already imported.
- Grid: 2-col on `sm`, 3-col on `lg` for the PMS grid to fit five cards cleanly (ROL'OS spans first slot with `Recommended` badge).
- No new dependencies, no route or nav changes.

## Out of scope
- No backend, adapter, DB, or nav changes.
- Other pages that still reference HyperGuest/HotelBeds/ProfitRoom/NightsBridge (admin, PMS ops, comparison tables) are untouched — the request is scoped to this marketing page.
