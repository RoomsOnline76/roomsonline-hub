# Breakfast / F&B Split — Findings Review and Fix Plan

I checked each item in your list against the code. Some are real, some are already correct.

## Not actually broken (verified)

- **breakfast_basis mismatch / dead `per_room_night`** — the rate-plan editor only offers `per_person_per_night` and `per_stay`, and save/load normalise to exactly those two values. This matches the DB constraint and the shared helper. No mismatch, no dead option.
- **CopyChargesModal** — it only lists target properties and counts existing charges; it does not itself select or write charge columns, so there is nothing to carry through there. (The copy write path should still be confirmed as part of item 4 below.)
- **Guest totals / commissions** — split is carved out of the same total, so both remain correct.

## Real gaps to fix

1. **Manual folio charges have no stream** — `pms-financial` never writes `revenue_stream`; every manual charge, adjustment and refund posts as default accommodation. Add stream to the manual charge/refund payload and UI (default accommodation, selectable F&B/other), so operator-posted breakfast lands in F&B.

2. **No split at booking creation** — split only happens in `handleApplyServiceCharges` and night audit. Room revenue posted at reservation creation stays 100% accommodation until audit runs. Resolve the breakfast config and split the room line at first folio post, using the same shared helper.

3. **`breakfast_charge_id` is dead schema** — the FK exists but nothing reads or writes it. Decision needed (see question below): either wire it as the canonical F&B definition, or drop the column.

4. **Rate-plan cards don't show breakfast** — plan list shows min stay/deposit only. Add a "Breakfast included · R<amount> <basis>" badge so operators get at-a-glance confirmation.

5. **Weak resolution when `rolos_booking_rooms.rate_plan_id` is missing** — falls back to a single property-level F&B charge. Extend the resolver to also look at the booking's room type → linked rate plan before falling back, and log when nothing resolves.

6. **No backfill for open stays** — existing in-house folios stay fully accommodation. Add an admin-triggered re-split for open folios that have a resolvable breakfast config (idempotent: skip folios that already carry an F&B line).

7. **Revenue view toggle is only a relabel** — ADR flips label when a split exists, but forecast and other KPIs still use gross `total_price`. Add an explicit Total vs Accommodation toggle on the Revenue page that drives ADR, net revenue and the forecast series consistently.

## Deferred (confirm scope)

- **NightsBridge / external ingest mapping** of inclusive rates → stream.
- **Guest-facing invoice/document line clarity** (accommodation vs F&B lines on pro-forma / tax invoice).

## Suggested order

Manual-charge stream → split at create → resolver hardening → cards + revenue toggle → `breakfast_charge_id` decision → backfill → deferred items.

## Technical notes

- All split maths stays in `supabase/functions/_shared/revenueStreams.ts`; no new copies of the logic.
- Backfill runs as an action on an existing PMS function rather than a migration, so it is repeatable and property-scoped.
- No schema change is needed for items 1, 2, 4, 5, 7; item 3 needs either a small migration (drop column) or wiring only.
