
Goal: make portfolio embeds use a system-wide live ARI path for every eligible property, not a one-off fix.

What I found
- The current portfolio list is not live at all:
  - `supabase/functions/booking-portfolio-api/index.ts` builds `starting_rate` from `hostfully_room_types.daily_rate`, which is static/local data.
- The property embed is also not truly system-wide:
  - `src/pages/EmbedProperty.tsx` never checks `external_system` and never calls a live PMS adapter.
  - It only reads `pms_availability_cache`, with Hostfully-specific matching via `hostfully_room_id`.
- Fluent Living evidence:
  - All portfolio members are Hostfully properties.
  - They all have Hostfully room IDs.
  - At least one property (`ONE46 ON M`) has zero cache rows, so cache-only logic will fail there even though the property is valid.
- So yes: the current behavior is cache/property-path dependent, not a proper portfolio-wide live ARI implementation.

Implementation plan

1. Make portfolio API return the data needed for live resolution
- Update `booking-portfolio-api` to include real `property.id` and `external_system` in each property record.
- Keep static `starting_rate` only as a fallback placeholder for fast initial render.

2. Add a shared PMS-aware live availability/rate resolver
- Create a small shared helper that:
  - maps `external_system` to the correct edge function
  - sends the right date parameter format
  - normalizes returned room/rate data
- Support the same live PMS types already used elsewhere in the app, rather than hardcoding a single property or one PMS path.

3. Fix `EmbedProperty` to use live ARI generically
- Extend the property query to include `external_system`.
- Keep cache-first rendering for speed, but then always refresh from the live PMS adapter for supported properties.
- Replace the Hostfully-only cache assumption with normalized room matching that works from PMS identifiers first, then safe name/id fallbacks.
- Ensure the “Book now” handoff uses the best live-resolved rate when available.

4. Fix `EmbedPortfolio` to resolve live “from” rates for all member properties
- After loading portfolio properties, fetch live ARI per property for supported PMS-backed properties.
- Update each card’s `starting_rate` from live data, with fallback to the static API value if live fetch fails.
- Do this per property/card so one bad property does not break the whole portfolio.

5. Keep performance controlled
- Render immediately with current API data.
- Refresh live rates in background and patch cards in place.
- Avoid blocking the page on all PMS calls completing.
- Reuse short-lived in-memory/client caching where helpful so repeated portfolio visits do not spam adapters.

Files likely to change
- `supabase/functions/booking-portfolio-api/index.ts`
- `src/pages/EmbedPortfolio.tsx`
- `src/pages/EmbedProperty.tsx`
- likely one new shared helper such as `src/lib/...` for PMS live-rate resolution/normalization

Technical notes
- No database migration should be needed.
- Root issue is architectural: portfolio cards use static rates, and embed property uses cache-only logic.
- The fix should be system-wide for portfolio members on live PMS integrations, not just for Fluent Living and not just for one property.
- This will also make missing/stale cache less harmful, because live ARI becomes the source of truth for portfolio-driven booking flows.

Expected outcome
- Any supported PMS-backed property added to a portfolio will attempt live ARI automatically.
- Portfolio cards will show live “from” pricing where available.
- Opening a property from a portfolio will use the same live-rate behavior consistently across all portfolio members.
