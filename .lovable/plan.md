

## Enhance Push_PutPrices_RQ: Extra Guest Pricing + 365-Day Coverage

### What's Already Working
- `push_prices` action and XML builder exist in `rentalsunited-api` — already supports `<ExtraGuestPrice>` in the XML.
- `pushARI` in `push-property-to-ru` already pushes prices per season with gap-filling to 365 days.
- Daily cron refresh is already configured.

### What's Missing

**1. Extra guest pricing is never sent**
`resolveUnitRateKey` returns only `roomAmount` (a single number). The `season_rates` entries also contain `adultAmount` (per-adult rate for guests above `StandardGuests`), but this value is never extracted or passed to `push_prices`. The `extra_guest_price` field in the XML builder is always `undefined`.

**2. No fallback pricing when seasons have no rates**
If no season rates resolve (all rates are 0 or missing), zero price entries are pushed. RU requires pricing for the next 365 days with price > 0.

### Changes

**`supabase/functions/push-property-to-ru/index.ts`**

1. **Change `resolveUnitRateKey` to return an object** instead of just a number:
   - Return `{ price: number; extra_guest_price?: number }` containing both `roomAmount` and `adultAmount` (if > 0).
   - The `adultAmount` field in `season_rates` represents the per-person nightly rate — this maps directly to RU's `ExtraGuestPrice`.

2. **Update price entry construction** in `pushARI`:
   - Change the `priceEntries` type to include `extra_guest_price?: number`.
   - When building entries from resolved rates, include the `extra_guest_price` from the rate object.
   - Legacy single-unit path: also extract `adultAmount` alongside the lowest `roomAmount`.

3. **Add fallback pricing** for 365-day coverage:
   - If after processing all seasons `priceEntries` is still empty, push a single fallback entry from today → today+365 with `price: 1` (minimum valid price for RU compliance). Log a warning so it's visible in diagnostics.

### Files to Update
- `supabase/functions/push-property-to-ru/index.ts` — rate resolution + price entry construction + fallback

### What Does NOT Change
- `rentalsunited-api/index.ts` — XML builder already handles `ExtraGuestPrice` correctly
- No schema or UI changes
- No changes to cron schedule (already daily)

