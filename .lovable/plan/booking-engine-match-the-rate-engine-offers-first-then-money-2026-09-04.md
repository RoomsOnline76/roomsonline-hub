# Booking engine: match the rate engine (offers first, then money)

The rate engine now knows far more than the booking engine asks it. It resolves, per rate plan and per unit: nightly rates, LOS ladders, Full Stay totals, plan-scoped daily overrides, minimum and maximum stay, no-arrival / no-departure windows and unit scope. The guest booking flow uses a slice of that for display and then re-computes the price it actually charges in the browser.

Confirmed today:

- The offer list is built server-side per plan, but the reason a plan was excluded (no-arrival, no-departure, wrong unit) is dropped, and only six offers per unit survive.
- Minimum and maximum stay are shown as text on the offer cards. Nothing blocks a booking that breaks them.
- No-arrival / no-departure never reaches the browser at all, so the date picker cannot grey those days out.
- The availability payload is restored from saved page state (`Booking.tsx:646`), so a guest can shorten a stay and still hold an offer that no longer qualifies.
- The charged total is computed a second time in the browser and written straight to the booking; the payment function then charges that stored number as-is (`payfast-api/index.ts:1378`). No server step re-derives it.
- Three unrelated discount systems exist: legacy `amenities.packages` JSON and `property_specials` in guest checkout, and `rolos_packages` in PMS tools only. Packages an operator builds in ROL'OS never reach a guest.

Plan: fix the offer list first, keep the current look, then make the server the single author of money, then fold specials and packages into rate plans. No feature flags — each phase ships when its tests pass.

## Phase 1 — Offers that tell the truth

- Publish the full eligibility verdict per plan (kept plans and rejected plans with their reason) instead of silently omitting rows, and remove the six-offer cap in favour of the plan's own sell priority ordering.
- Publish no-arrival and no-departure dates for the searched window so the date picker can grey them out.
- Enforce minimum stay, maximum stay and no-arrival / no-departure at the point of booking, not just as label text. A stay that breaks the selected plan's rules cannot be submitted; the guest is told which rule and offered the nearest valid option.
- Treat a restored/cached availability payload as stale whenever dates, unit or guest counts change: re-resolve before the offer chooser is trusted.
- No visual redesign. Existing offer cards gain a reason line and disabled dates only.

## Phase 2 — One authoritative total

- Add a server quote action that returns the complete priced stay: accommodation by shape (nightly, LOS, full stay), charges, discounts and the final total, using the same pure engine the availability card uses.
- Fix the LOS gap where a stay quoted as an LOS ladder falls back to summing nightly rates when a night was priced outside the resolver, which loses or double-counts the ladder.
- Move the per-person / guest-tier arithmetic that currently lives only in the browser into the shared engine so both paths agree by construction.
- Booking creation and modification take the total from that quote. The browser displays it and no longer authors it.
- The payment step re-derives (or re-verifies) the amount against the stored quote before charging, so a tampered or stale client total cannot be collected.

## Phase 3 — Specials and packages become rate plans

- Represent specials and packages as first-class rate plans / plan modifiers so they resolve through the same engine, obey the same minimum-stay, date-window and unit scoping, and compose predictably with LOS and Full Stay pricing.
- One-time conversion of existing `property_specials` rows and legacy `amenities.packages` JSON into plan-shaped records, with the originals kept read-only for reference until the conversion is verified per property.
- `rolos_packages` / `rolos_package_components` become guest-visible through the same path, so a package built in ROL'OS sells online.
- Retire the two legacy discount code paths in guest checkout once the converted plans reproduce today's prices.

## Phase 4 — Guardrails

- Golden-price tests: a fixed set of stays (1, 2, 3, 7 nights; event weekend; per-person unit; full-stay unit; special applied; package applied) asserted identical across resolver, quote action and persisted booking.
- Divergence alarm: when a submitted total differs from the server quote, the booking is refused and the mismatch is recorded for review.
- Verification pass on SeaLion first, then the rest of the portfolio.

## Technical notes

- Engine stays pure: `_shared/ratePricing.ts` (math), `_shared/rateResolution.ts` (loader), `_shared/rateOffers.ts` (eligibility). Phase 2 adds the quote surface in `booking-orchestrator-api`, which currently implements only `validate_voucher` and `fetch_availability`.
- Phase 1 changes: `_shared/rateOffers.ts` verdict pass-through, `booking-orchestrator-api/index.ts` (`buildRoomType` and the offers loop), `src/pages/Booking.tsx` offer chooser + submit guard + stale-payload invalidation, `src/lib/pmsLiveAvailability.ts` type widening.
- Phase 2 changes: `src/lib/stayQuotedTotal.ts` (`los_nightly` handling), `Booking.tsx` `calculateCost` becomes a renderer of the server quote, `payfast-api` amount derivation.
- `_shared/ruLosPricing.ts` and `_shared/ruFspPricing.ts` are channel-push only and stay untouched.
- Phase 3 needs a migration (plan-shaped special/package records plus a link back to the source row); Phases 1, 2 and 4 need none.
- `booking-orchestrator-api` is under adapter lock, so each phase posts its diff scope for approval before the edit.
- `NO_BOOKING_FROM_CACHE` holds throughout: checkout always re-resolves live.
