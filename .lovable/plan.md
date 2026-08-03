# One rate hierarchy for every ARI push: calendar first, rack rate as fallback

## The rule to enforce everywhere

1. **Calendar season rate** (seasons + per-unit season rates set in the admin/ROLOS calendar) — always the first choice for any date.
2. **Rack rate** — the Rate Manager rate plan linked to that unit (`base_rate`), used only for dates no season/rate covers.
3. **Unit daily rate** — last resort if no rate plan is linked.

## Where this holds today, and where it doesn't

- **ROL booking engine** (`booking-orchestrator-api`) already resolves rates in exactly this order, day by day. No behaviour change needed — it becomes the reference implementation.
- **Rentals United ARI push** (`push-property-to-ru`) reads *only* the calendar seasons and their rates. If a unit has no season rate, or seasons don't cover the full 365-day window, it aborts the whole price push with `RU_NO_REAL_RATES` instead of falling back to the rack rate. Uncovered tail dates are filled with the "last known" season rate rather than the rack rate.
- **Channel push** (`pms-channel-sync`, Booking.com / Airbnb / generic adapters) pushes a single flat rate-plan `base_rate` per rate plan and never consults the calendar at all — so channels can receive rack pricing on dates the calendar prices differently.

Note: Tidal Pools does have three seasons with periods covering the 365-day window, so its "Pricing 365d" result depends on what RU currently holds — this change removes the gap/abort class of failure rather than diagnosing that single property.

## What will be built

**1. Shared rate resolver** — a new `supabase/functions/_shared/rateResolution.ts` that, for a property and date window, returns a per-day rate per unit using the hierarchy above, plus the source of each rate (`calendar_season` | `rack_rate` | `unit_daily_rate`). It loads seasons and season rates from the property, and rack rates from the Rate Manager rate plans linked to each unit, reusing the key-matching logic that already works (amenity room id, linked ROLOS id, room name).

**2. Rentals United push** — replace the seasons-only price builder with the shared resolver:
- Build day-level rates for today..+365, then compress consecutive equal-priced days into RU `Season` blocks (RU's price format), so gaps disappear.
- Dates without a calendar rate now carry the unit's rack rate instead of triggering `RU_NO_REAL_RATES`; the abort remains only when a unit has neither a calendar rate nor a rack rate.
- The push result and `sync_logs` record how many days came from the calendar vs the rack rate, so the readiness panel can show it.

**3. Channel push** — `pms-channel-sync` `push_rates` builds per-date rate amounts from the shared resolver for the connection's sync window instead of one flat `base_rate`, keeping each adapter's existing message shape (Booking.com OTA rate messages, Airbnb daily price updates).

**4. Readiness surface** — the *Pricing 365d* check keeps its pass/fail rule, but its detail line names the rate source coverage (for example "365/365 days priced — 280 calendar, 85 rack rate") so it is clear when rack-rate fallback is doing the work.

**5. ROLOS booking engine** — refactored to call the shared resolver so all four consumers stay in step. Resolution order and prices stay identical.

## Technical notes

- Calendar rates continue to come from `properties.amenities.seasons` / `season_rates`; rack rates from `rolos_rate_plans.base_rate` via `rolos_rate_plan_room_types`, with `hostfully_room_types.daily_rate` as the final fallback.
- Rate-plan stop-sell dates (`rolos_rate_plan_stop_sell`) stay a closure signal, not a price: closed days are pushed as unavailable, not as a zero price.
- No database changes.
- Functions redeployed: `push-property-to-ru`, `pms-channel-sync`, `booking-orchestrator-api`, `ru-cert-portal`.
