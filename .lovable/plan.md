# Breakfast / F&B Revenue Stream Split (ROL'OS v1)

Goal: report true net accommodation revenue by tagging every charge line with a revenue stream, and splitting breakfast out of rate-inclusive room revenue — without changing guest totals, payments or commissions.

## What operators will see

- Each charge (property charge definition and posted folio/booking line) carries a stream: Accommodation, F&B, or Other. Everything existing stays Accommodation.
- A rate plan can be flagged "Breakfast included" with an amount (per person/night or fixed per stay). When a booking on that rate posts charges, the folio shows two lines: accommodation (rate total minus breakfast) and F&B (breakfast portion). The booking total is unchanged.
- Booking folio tab gets a stream badge per line plus an All / Accommodation / F&B filter.
- Revenue pages gain "Net accommodation revenue" and "F&B revenue" cards next to existing Total/GBV, with ADR/RevPAR/forecast switching to the accommodation base when split data exists.

## Commit 1 — Migration + types

Migration:
- `property_charges`: add `revenue_stream text not null default 'accommodation'` (check in accommodation/fnb/other) and `is_included_in_rate boolean not null default false`.
- `rolos_booking_charges` and `rolos_folio_transactions`: add the same `revenue_stream` column with default `'accommodation'`.
- `rolos_rate_plans`: add `breakfast_included boolean not null default false`, `breakfast_amount numeric`, `breakfast_basis text` (`per_person_per_night` | `per_stay`), `breakfast_charge_id uuid references property_charges(id)`.
- Backfill is implicit via defaults; explicit `UPDATE ... SET revenue_stream='accommodation' WHERE revenue_stream IS NULL` guard for safety. No new tables, so no new GRANTs needed; existing table grants/RLS unchanged.

Types: extend `PropertyCharge` in `src/components/charges/ChargeCalculator.ts` with `revenue_stream: RevenueStream` and `is_included_in_rate: boolean`; add `RevenueStream` type and rate-plan breakfast fields to `src/types/pmsTypes.ts`.

## Commit 2 — ChargeCalculator + charge editor

- `ChargeCalculator.ts`: keep `ChargeCategory` untouched. Charges with `is_included_in_rate = true` are calculated but excluded from `ChargeTotals.total` / grouped add-on totals; expose them separately as `includedCharges` plus `streamTotals` (accommodation / fnb / other) so callers can report the split without changing what guests pay.
- `ChargeEditor.tsx`: revenue-stream select (default Accommodation) and an "Included in rate (split only, not added on top)" toggle with helper text.
- `AdditionalChargesManager.tsx`: show stream badge on the charge rows; included-in-rate rows visually marked and excluded from the added-total footer. `CopyChargesModal` carries the new fields through.

## Commit 3 — Posting path

- `roomsonline-pms-api` `handleApplyServiceCharges`: read the booking's rate plan; if breakfast is included, compute the breakfast portion (per person/night or per stay, capped at the rate total), then post an accommodation line for `rate total − breakfast` and an F&B line for the breakfast portion, both into `rolos_folio_transactions` + `rolos_booking_charges` with the correct `revenue_stream`. Skip charges with `is_included_in_rate` from the add-on loop (they only drive the split). Existing idempotency check retained.
- Same stream propagation in `pms-financial` manual charge posting and night-audit/invoice transaction inserts (default `'accommodation'`, breakfast lines `'fnb'`).
- Properties with no breakfast config and no included charges take the exact current code path.

## Commit 4 — Folio UI

`BookingFolioTab.tsx`: include `revenue_stream` in the fetched shapes, add a stream badge next to the category badge, and a segmented All / Accommodation / F&B filter that also drives the displayed subtotal. No change when every line is accommodation (filter hidden).

## Commit 5 — Metrics

- `PMSRevenue.tsx`: alongside the current `total_price` GBV, aggregate posted `rolos_booking_charges` by stream for the same booking set; derive `fnbRevenue` and `netAccommodation = total − fnb`. Add two KPI cards and a view toggle (Total / Accommodation) that swaps the base used by ADR, RevPAR and the forecast table. Falls back to today's behaviour when no split rows exist.
- `ROLRevenuePulse.tsx`: add the same Net accommodation and F&B figures, shown only when split data exists.

## Technical notes

- `bookings.total_price`, payment records, commission resolution and invoice totals are untouched; the split is purely a classification of folio/charge lines.
- No calendar, booking-flow, or other PMS adapter changes. NightsBridge ingest mapping to `revenue_stream` is deliberately deferred.
- Rounding: breakfast portion rounded to 2 decimals, accommodation line takes the remainder so the two lines always re-sum to the rate total exactly.

## Out of scope

Restaurant/POS, guest-facing invoice layout changes beyond line clarity, commission base changes.
