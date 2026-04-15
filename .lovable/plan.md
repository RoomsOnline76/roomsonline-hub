

## Push ROL'OS Specials as RU Long Stay & Last Minute Discounts

### Mapping Logic

ROL'OS `property_specials` → RU discount types:

- **Long Stay Discounts**: Specials with `special_type = 'discount'` and `min_stay > 0` — these are percentage discounts triggered by length of stay. Maps `min_stay` → `NightsFrom`, `max_stay` → `NightsTo`, `discount_percent` → `Percentage`.

- **Last Minute Discounts**: Specials with `special_type = 'discount'` and `book_from`/`book_until` set (booking window specials with no min_stay requirement, or where the booking window implies urgency). The days-to-arrival is calculated from the booking window dates. Maps to `DaysToArrivalFrom`/`DaysToArrivalTo` and `Percentage`.

Both types require `valid_from`/`valid_to` for the `DateFrom`/`DateTo` attributes. Only active, percentage-based specials are synced (RU only supports percentage discounts for these APIs).

### Changes

**1. `supabase/functions/push-property-to-ru/index.ts` — Add `pushDiscounts` function**

After `pushARI` completes, add a new `pushDiscounts` step:
- Query `property_specials` for the property where `is_active = true`, `special_type = 'discount'`, and `discount_percent > 0`
- Classify each special:
  - Has `min_stay > 0` → Long Stay discount
  - Has `book_from`/`book_until` but no `min_stay` → Last Minute discount (calculate days-to-arrival from today relative to `valid_from`)
- Build discount entry arrays and call `rentalsunited-api` with `push_long_stay_discounts` and `push_last_minute_discounts`
- Add `long_stay_discounts_pushed` and `last_minute_discounts_pushed` to the response

For multi-unit properties, push discounts per RU property ID (each room type has its own RU property).

**2. `supabase/functions/cron-push-all-properties-to-ru/index.ts` — Already covered**

No changes needed — the cron calls `push-property-to-ru` which will now include discounts automatically.

### Files to Update
- `supabase/functions/push-property-to-ru/index.ts` — add specials → RU discounts mapping and push calls

### What Does NOT Change
- `rentalsunited-api/index.ts` — XML builders and action handlers already exist
- `property_specials` table — no schema changes
- No UI changes — syncing happens automatically on push
- Cron schedule unchanged

