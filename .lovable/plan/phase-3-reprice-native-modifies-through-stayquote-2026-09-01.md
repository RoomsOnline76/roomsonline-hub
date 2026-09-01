# Phase 3 — reprice native modifies through stayQuote

Goal: a date or guest change on a ROL'OS-native booking is repriced with the same contract used at create. Length-of-stay ladders and full-stay cells now apply on modify; a plan with both flags off produces exactly today's number.

## Scope

One edge function: `supabase/functions/modify-booking/index.ts`, function `recalculateRolPrice` (currently lines 161–247), plus the shape keys stamped on the stay's `rooms` JSON. Plus one small pure helper and its test.

Untouched: `ratePricing.ts`, `stayQuote.test.ts`, `rateResolution.ts`, booking-orchestrator-api, roomsonline-pms-api, push-property-to-ru, rentalsunited-api, Booking.tsx, EmbedProperty.tsx, SeasonsCalendar.tsx, CalendarAccommodation.tsx. No migration, no new columns, no route changes.

## 1. Pure helper

New `supabase/functions/_shared/rolModifyQuote.ts` (~25 lines):

```
rolModifyQuote(resolver, unit, stay, planId)
  -> { total, rate_plan_id, nightly, source, shape } | null
```

- Calls `resolver.quoteStay(unit, stay)`.
- Returns `null` when `!(quote.stay_total > 0)` — an unpriced night keeps the existing "cannot reprice" behaviour, no rack gap-fill before quoting.
- Otherwise rounds `stay_total` to cents, returns `display_per_night` as `nightly`, plus `source` and `shape`.

Keeping it out of `index.ts` means it can be unit-tested without importing the handler.

## 2. `recalculateRolPrice`

Return type gains `shape: "nightly" | "los_nightly" | "full_stay"`.

Inside the existing `try` block, once the resolver and unit are resolved, replace the `resolveDays` + rack-pad + `stayTotalForModel` path with `rolModifyQuote(resolver, unit, { from: checkIn, to: addDays(checkOut, -1), adults, teens, children, units: roomCount }, plan.id)`.

- Success → return that result (rounded total, nightly, source, shape). Parity log keeps firing with `resolved_tier = quote.source` and `shape` added to `notes`; logging still never throws.
- `quoteStay` returns a zero total → `return null` (existing `NO_RATE_FOR_STAY` path).
- `createRateResolver` throws, or no unit matches the booking's room type → keep today's rack-pad + `stayTotalForModel` fallback verbatim, with `shape: "nightly"`. Wizard/unlinked properties keep working.

`countNights`, `resolveBookingRatePlan`, the operator `accommodation_total` / `total_price` override branch, the preview branch at ~L433, charges, deposit and the RU `modifyRuStay` call are all unchanged — they still sit on top of `newTotalPrice`.

Flags off, or no matching rung/cell: `quoteStay` returns the nightly shape over the same resolved series, so the total equals the pre-Phase-3 figure. That is the regression guard.

## 3. Persist the shape on the stay

In S8, when the reprice produced a shape:

- If `modifications.rooms` is present, map each line and stamp `stay_shape`, `stay_quote_source`, `stay_total` (same keys Phase 2 writes at create).
- Otherwise, if `booking.rooms` is already an array, clone it and stamp the same three keys on each line.
- Never invent a `rooms[]` array a booking never had. No new columns.

## 4. Tests

New `supabase/functions/_shared/rolModifyQuote.test.ts` covering: flags off → nightly total matching `stayTotalForModel`; matching LOS rung → `los_nightly`; matching FSP cell → `full_stay` with the cell total; unpriced night → `null`. It reuses the fake-supabase resolver pattern from the existing `rateResolution.quoteStay.test.ts`.

Run: `deno test --allow-read --allow-env supabase/functions/_shared/*.test.ts`, then deploy `modify-booking`.

## Acceptance

- Flags-off modify total identical to today, shape `nightly`.
- LOS plan crossing a rung uses the highest matching threshold, shape `los_nightly`.
- FSP plan whose nights + guests still match the cell stores the cell total, not the nightly sum; a pax change that misses the cell falls through to LOS then nightly.
- Unpriced night → `null` → existing 422 message.
- Operator total still wins and skips `quoteStay`.
- Empty diff for ratePricing.ts, stayQuote.test.ts, booking-orchestrator-api, push-property-to-ru, Booking.tsx, EmbedProperty.tsx.

Commit: `feat(rates): reprice native modifies through stayQuote`
