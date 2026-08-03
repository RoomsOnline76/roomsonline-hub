# RU certification: complete Last-Minute & Long-Stay integration

Today the two discount endpoints work, but they work *twice, differently*:

- `push-property-to-ru` derives tiers from `ru_discounts` **plus** `property_specials`, using an old heuristic (`min_stay` for long stay, `book_from/book_until` arithmetic for last minute). It ignores the new wizard fields `deal_type`, `lead_days_min/max`, `lead_hours_max`, and only looks at specials whose `special_type = 'discount'`.
- `ru-cert-portal` (the certification suite) derives tiers from `ru_discounts` **only**, with fixed `nights_to = 999` / `days_to_arrival_from = 0`, and its verify steps only regex for `<LongStay` / `<LastMinute` in the RU echo.

So a Last-Minute or Long-Stay special authored in the Specials Wizard is never certified, and a certification pass does not prove what production actually pushes.

## What will be built

### 1. One shared discount resolver
New `supabase/functions/_shared/ruDiscounts.ts` — the single source of truth for RU discount tiers:

- Reads active `ru_discounts` rules (manual RU ladder) and active `property_specials`.
- Maps specials by `deal_type`, not by guesswork:
  - `long_stay` → `LongStay` tier: `Bigger = min_stay`, `Smaller = max_stay` (omitted when open-ended), stay window from `valid_from/valid_to`.
  - `last_minute` → `LastMinute` tier: `DaysToArrivalFrom = 0` (or `floor(lead_hours_max / 24)` lower bound when set), `DaysToArrivalTo = lead_days_max`, falling back to the existing `book_until` arithmetic only when no lead fields exist.
  - `advance_purchase` → `LastMinute` tier inverted: `DaysToArrivalFrom = lead_days_min`, `DaysToArrivalTo = lead_days_max ?? 365`.
  - `basic`/`rate_grid`/`package` → not RU discount endpoints; reported as "not mapped" with a reason, never silently dropped.
- Accepts percentage specials only (`special_type` in `discount`/`percentage`); fixed-amount / fixed-price specials are reported as unmappable (RU discounts are percentage-only).
- Room scoping preserved: per RU property/unit ID, filter by `applicable_room_ids`.
- Validation upgraded from duplicate-key checks to real RU rules: percentage 1–99, `from <= to`, ladder sorted ascending, and **overlap detection** on the same date window (RU rejects overlapping ranges).
- Returns `{ longStay, lastMinute, sources, warnings, unmapped }` so both callers can explain themselves.

### 2. `push-property-to-ru` switches to the resolver
Replaces its inline specials/rules mapping with the shared resolver, keeping existing push/verify/logging and the `sync_logs` skip record. Warnings and unmapped specials are added to `discount_errors`/metadata so they surface in the sync observability tab.

### 3. Certification suite certifies what production pushes
In `ru-cert-portal`:

- The `discounts` (and `full`) suite uses the same resolver, so cert pushes the real merged ladder.
- Adds explicit steps so the milestone matrix reflects both features separately: **Push long-stay discounts**, **Verify long-stay discounts**, **Push last-minute discounts**, **Verify last-minute discounts** (already present, but now source-aware in their step detail: "3 tiers — 1 manual rule, 2 specials").
- Verify steps stop being regex smoke tests: parse the RU echo attributes and assert every pushed tier is present with matching threshold and percentage; report the first mismatch as the failure detail.
- Skip reasons stay informative (no rules configured / endpoint not enabled by RU → excluded from the counter, per the existing disabled-endpoint handling).
- Preserves the existing `ruInvoke` pacing, 429 retry and wait-budget behaviour — no new unpaced calls.

### 4. Certification console: Discounts tab completed
`RuCertificationConsole.tsx` Discounts tab keeps the manual rule editor and gains:

- A dense **Derived ladder** table showing the tiers that will actually be pushed for the selected property, each row tagged `Manual` or the special's name, split into Long stay / Last minute.
- An **Unmapped specials** line listing specials that cannot go to RU and why (fixed amount, package, missing lead days) with a link to the Specials tab.
- Validation warnings (overlaps, out-of-range percentages) shown inline before pushing, so a push isn't attempted against rules RU will reject.
- The last RU echo per feature (from the most recent verify step) shown as a compact confirmed/mismatch badge.

## Technical notes

- Files touched: new `supabase/functions/_shared/ruDiscounts.ts`; edits to `supabase/functions/push-property-to-ru/index.ts`, `supabase/functions/ru-cert-portal/index.ts`, `src/components/integrations/RuCertificationConsole.tsx`.
- No schema change: `ru_discounts` and the already-extended `property_specials` columns cover everything.
- Wire format stays `snake_case` `RUDiscountEntry` as `rentalsunited-api` validates it; the XML builders in `rentalsunited-api` are unchanged (`Bigger`/`Smaller`, `DaysToArrivalFrom`/`DaysToArrivalTo`), except that `Smaller`/`DaysToArrivalTo` are now omitted when the tier is open-ended instead of being forced to `999`.
- Adapter-lock check: the RU XML builders and credential resolution are not modified, so no locked region is touched.
