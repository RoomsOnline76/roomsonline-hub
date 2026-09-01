# Phase 2 — native stays priced through stayQuote

Wire the finished stay-quote engine into the two native ROL'OS money paths. Plans with both ladder flags off keep exactly the totals they produce today; no channel push, widget, or adapter changes.

## Scope

1. `quoteStay` on the rate resolver — a thin wrapper over the pure `stayQuote`.
2. Native availability: length-of-stay ladders adjust the published nightly series.
3. Native booking: length-of-stay and full-stay ladders decide the stored stay total.

Out of scope (untouched): channel pushes, Rentals United price builders, widgets/embeds, modify and cancel booking, live PMS adapters, the calendar grid, authoring UI, help copy.

## 1. Resolver wrapper

`supabase/functions/_shared/rateResolution.ts` already loads the ladders into `pricingInputs.losRungs` / `pricingInputs.fspCells` and exposes `pricingInputs` and `ratePlans` on the resolver, so the wrapper is pure plumbing:

- Add `quoteStay(unit, stay): StayQuote` to the `RateResolver` interface and return it from `createRateResolver`, next to `resolveDays`.
- It looks the plan up by `unit.linked_rolos_id` and calls `stayQuote(pricingInputs, unit, plan, stay)`. No plan, flags off, or no matching row → `stayQuote` already returns the nightly result.
- `resolveDays`, `coverage`, and `unlinkedUnits` are not modified.

New test file `supabase/functions/_shared/rateResolution.quoteStay.test.ts` covering: flags off equals the summed nightly total, matching length-of-stay rung yields `los_nightly`, matching full-stay cell yields `full_stay` with `nightly === null`, unpriced night yields total 0 with shape `nightly`.

## 2. Native availability (length-of-stay only)

`supabase/functions/booking-orchestrator-api/index.ts`, inside `resolveRolosRates` where each synthetic room type is built (the `dailyRates` loop ends around line 507):

- After the raw nightly series exists, and only when a resolver and a ROL'OS plan are present, call `quoteStay` for the same window (`startDate` → `addDaysIso(endDate, -1)`) with a dummy occupancy of 2 adults, 1 unit.
- If the quote is `los_nightly` and its nightly array length matches `dailyRates`, overwrite each `room_amount` with the adjusted nightly. Per-person published amounts continue to derive from the (now adjusted) nightly.
- If the quote is `full_stay`, leave the nightly series alone — availability must still paint a nightly number; full stay is applied at book time.
- Attach an additive `stay_quote` block (`shape`, `nights`, `source`, `display_per_night`) on the rate type. No `stay_total` on availability, because the request carries no guest count.
- Flags-off plans: numbers byte-identical, only the additive `stay_quote` block appears.
- `resolveWizardRates`, the cache-first live adapter paths, and the voucher action are untouched. `adults` is not added to `fetch_availability`.

## 3. Native booking total

`supabase/functions/roomsonline-pms-api/index.ts`, `handleCreateReservation` (the `totalAmount` loop around line 1112 currently sums cached `room_amount` per room type):

- Build a resolver for the property over the stay window (`audience: "direct"`), reusing the unit records the handler already resolves from `hostfully_room_types` so each booked line has a `linked_rolos_id`.
- Per booked room line, call `quoteStay` with real occupancy (adults, teens, children, unit count) and `to = departure_date - 1 night`; the line total becomes `quote.stay_total`. `total_amount` is the sum of line totals, used for both `pms_reservations` and `rolos_reservations`.
- Persist shape without a migration: add `stay_shape`, `stay_quote_source`, `stay_total` alongside `adults` in the `rooms[]` JSON already written to `pms_reservations`.
- Fail closed: if the resolver cannot be built (no linked units — wizard/cache-only properties) keep the existing `room_amount` sum; if a quote returns 0 because of an unpriced night, keep today's zero/reject behaviour. No gap-filling and no invented prices.
- Folio, deposit, and charges-breakdown math are not touched; they sit on top of the total.

## Verification

- `deno test` for `stayQuote.test.ts`, `ratePricing.test.ts`, `ratePricingGate.test.ts`, plus the new resolver test — all green with zero edits to the existing files.
- Confirm an empty diff for `ratePricing.ts`, `stayQuote.test.ts`, `adapter-contract.ts`, `push-property-to-ru`, `rentalsunited-api`, `Booking.tsx`, `EmbedProperty.tsx`, `SeasonsCalendar.tsx`.
- Manual checks: flags-off plan quotes yesterday's number; a 3-night rung at −10% inside its season shows 90% nightlies on availability and a matching booking total; a pinned 7 nights × 2 guests full-stay cell leaves availability nightlies untouched and stores the pinned total at book time, while the same stay with 3 guests falls back to nightly/length-of-stay.

Commit: `feat(rates): quote native stays through stayQuote (LOS on availability, FSP at book)`
