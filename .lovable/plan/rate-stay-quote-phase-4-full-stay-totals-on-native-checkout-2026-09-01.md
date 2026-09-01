# Rate stay-quote Phase 4 — Full Stay totals on native checkout

Goal: the guest-facing accommodation subtotal matches what create/modify already charge for Full Stay plans, and availability quotes with the real party size instead of a hardcoded two adults. Nightly and LOS numbers stay byte-identical.

## 1. Orchestrator — `booking-orchestrator-api/index.ts`

- Accept optional `adults`, `teens`, `children`, `units` on the `fetch_availability` body; normalise once into an `occupancy` object with today's defaults (`2 / 0 / 0 / 1`) so callers that send nothing get exactly the current result.
- Thread `occupancy` into `resolveRolosRates` only (native path). Live-adapter and cache-first branches untouched.
- Replace the hardcoded `{ adults: 2, units: 1 }` in the `resolver.quoteStay` call (~L470) with the normalised occupancy.
- Add `stay_total: quote.stay_total` to the existing `stay_quote` block (~L561). The LOS rewrite rule is unchanged: only `los_nightly` rewrites the nightly series; Full Stay still only attaches the descriptor.

## 2. Shared helper — `src/lib/stayQuotedTotal.ts` (new)

`stayQuotedTotal(stayQuote, nightlySum)` returns the rounded `stay_total` when `shape === "full_stay"` and the total is positive, otherwise the nightly sum. Plus `src/lib/stayQuotedTotal.test.ts` covering: missing block → nightly sum, `los_nightly` → nightly sum, `full_stay` with a total → the total.

## 3. Booking page — `src/pages/Booking.tsx`

- Pass party size on the existing `fetch_availability` invoke (~L950), summed from the rooms being quoted (`adults` falls back to 2), inside the effect that already runs on room/date changes.
- In the PER ROOM block (~L1175), after the nightly sum, pass the sum through `stayQuotedTotal(rateType.stay_quote, totalRoomAmount)`. `unitPrice` stays total ÷ nights. No extra line item; voucher/extras/deposit math untouched. Per-person branch untouched.

## 4. Embed — `src/pages/EmbedProperty.tsx`

- Keep `stay_quote` on the rate object already built from the orchestrator response; no occupancy sent (no guest picker there, orchestrator default applies).
- `resolvedStayTotal` (~L694) becomes `stayQuotedTotal(rateTypeStayQuote, nightlySum)`. `embed_rate` stays `resolvedStayTotal / nights`; Journey `addStay` keeps using `resolvedStayTotal`. No layout changes.

## Out of scope

RU LOSS / `push_prices_fsp`, modify-booking, `rolModifyQuote.ts`, `roomsonline-pms-api`, live PMS adapters and the availability cache shape, Rate Plans editor, Calendar surfaces, `booking-widget-api`, per-person Full Stay display.

## Verification

- `deno test` on the shared engine tests (unchanged files), `bunx vitest run src/lib/stayQuotedTotal.test.ts`, `bunx tsgo --noEmit -p tsconfig.app.json`, build log clean.
- Manual: flags-off total unchanged; LOS 5-night rung matches create; Full Stay 7n × 2 subtotal equals `stay_quote.stay_total`; occupancy that misses the cell falls through to LOS then nightly; omitting occupancy reproduces the Phase 2 series.
- Empty diff for `ratePricing.ts`, `stayQuote.test.ts`, `modify-booking`, `rolModifyQuote.ts`, `push-property-to-ru`, `SeasonsCalendar.tsx`.

Commit: `feat(rates): show Full Stay totals on native checkout`.
