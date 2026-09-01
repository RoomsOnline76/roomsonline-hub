# Phase 6 — Rentals United Full Stay matrix (opt-in)

A property whose operator has explicitly opted in publishes its year to the channel as a Full Stay
price matrix (nights x guests per date) instead of nightly seasons with a length-of-stay ladder.
Nothing changes for any property that has not opted in.

## Gate

Both must be true, per unit:

- `properties.amenities.ru_push_fsp === true` (operator opt-in, set manually for now)
- the unit's rate plan has `fsp_enabled === true`

Either missing → today's Phase 5 path (`push_prices` with `<Season>` + `<LOSS>`). The building-level
fallback push (no unit, multi-unit property) never takes the Full Stay path. Nothing in this scoop
sets the flag automatically, and there is no UI toggle.

## New pure helper

`supabase/functions/_shared/ruFspPricing.ts`

- `fspSeasonForNight({ date, parentNightly, cells, calendarSeasonId, unitRolosId, rounding })`
  → `{ date, default_price, rows: [{ nr_of_guests, prices: [{ nr_of_nights, price }] }] }` or `null`
  when the parent nightly is not positive.
- Window rule and unit scoping reuse `windowCoversRung` from `ruLosPricing.ts` with
  `dateFrom = dateTo = date`; an empty `room_type_id` is global.
- Cell total: pinned → `pinned_total` when > 0; otherwise
  `applyDerivation(parentNightly * cell.nights, type, value, rounding)` — the same stay-total
  formula the native quote uses. Non-finite or non-positive totals are dropped.
- Surviving cells grouped by `nr_of_guests`; one price per `nr_of_nights` inside a row, a pin
  beating a derived value on the same key; rows and prices sorted ascending.
- `default_price` is that night's parent nightly, so a night with no matching cell still sells at
  the nightly rate. A season is emitted for every priced date, even with no rows.
- `convertFspSeasons(seasons, effectiveRate)` applies the existing `convertAmount` to
  `default_price` and every cell price. `convertPriceEntries` is left alone.

Tests in `ruFspPricing.test.ts`: no cells → default only; pinned 7 nights x 2 guests; derived cell
matches the engine derivation; season mismatch omits the cell but keeps the default; FX helper scales
default and cells.

## Price push branch

In `push-property-to-ru` `pushARI`, after the coverage and currency checks that already run (an
unpriced night still aborts with `RU_PRICE_COVERAGE_INCOMPLETE` before either action):

- opted in → build one season per priced night in the 365-day window from `dayRates` and
  `resolver.pricingInputs.fspCells[linked_rolos_id]`, FX-convert when conversion is in force, hash
  `{ window, mode: "fsp", seasons }`, skip the write when the hash is unchanged and prices are not
  forced, chunk 30 dates per call, and invoke `push_prices_fsp`. `push_prices` is not called.
  `result.prices_payload = { mode: "fsp", seasons, bytes, chunks }`.
- If the builder produced no seasons, log the reason and fall through to the Season path — an empty
  matrix is never sent.
- Full Stay pushes skip the Season-shaped read-back and verification (it compares `<Season>` rows);
  the push result records that the read-back is not applicable in this mode. A transport failure is
  reported as a failure rather than "recovered" through a Season comparison.
- The Season path, including the Phase 5 ladder, is untouched.

## One supporting change outside the helper

`validateFspSeason` in `rentalsunited-api` currently rejects a season with no rows, which would
reject a legitimate DefaultPrice-only night. It will be relaxed to allow an empty `rows` array while
keeping every other check. `buildPushFspPricesXml` itself is not modified.

## Untouched

`ratePricing.ts`, `stayQuote.test.ts`, `ruLosPricing.ts`, `Booking.tsx`, `EmbedProperty.tsx`,
`modify-booking`, `booking-orchestrator-api`, `SeasonsCalendar.tsx`, `CalendarAccommodation.tsx`,
`ruDiscounts.ts`, the Rate Plans editor. No migration, no new route, no default-on behaviour.

## Verification

Shared engine tests plus the new helper test, a type check of both edge functions, and dry-run
pushes: flags-off property still shows `<Season>` with an unchanged hash; flag on with
`fsp_enabled` false still shows `<Season>`; both on shows only `push_prices_fsp` with one
`FSPSeason` per window night and the parent nightly as `DefaultPrice`.
