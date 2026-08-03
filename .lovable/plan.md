# Rentals United currency: keep ZAR, convert to USD only as a last resort

## What is happening now

Rates are authored in ZAR but appear in Rentals United as USD.

Confirmed from the code and the live data:

- The property push does send a currency (`CurrencyID 48 = ZAR`) and all four RU-connected properties are mapped with currency 48. But in RU, currency is owned by the **location**, not the property, so the property-level value is inherited/overridden by whatever the location holds.
- A location-currency mechanism already exists (`Push_ChangeCurrency` plus a `reconcile_ru_location_currency` routine), but it only flips a location when it can read that location's current currency from the `ru_locations` cache. **That table is completely empty (0 rows)** — including for the locations our properties use (44967, 83272). So the comparison never fires and the flip never runs. This is the root cause of ZAR never sticking.
- No admin screen calls the reconcile or currency-sync actions, so there is no way to run or even see this today.
- There is no currency conversion anywhere in the RU pipeline: prices go out as raw ZAR numbers, and inbound RU reservations are stored with no currency field at all.

## What will be built

### 1. Make the ZAR path actually work (primary fix)

- Populate and keep fresh the RU location/currency cache (`list_cities_and_currencies`), so each location's real currency is known. Add a scheduled daily refresh and a manual refresh action.
- Resolve currency in this order: **RU location currency (authoritative) → property's authored currency → country default**, and stop assuming ZAR silently.
- On every property push: if the location's currency is not ZAR, attempt the location currency flip, re-verify by reading back, then push. Log the outcome per property.
- Surface the reconcile routine in the admin Rentals United page (per-property and bulk, with dry-run) so this is operable instead of buried.

### 2. USD fallback with live rate + 3%

Engages **only** when ZAR cannot be held for a location (flip refused, or the location is shared/master-owned).

- Daily ZAR→USD rate fetched from a public FX feed and cached; the rate used on a push is stored with a timestamp.
- A 3% safety margin is applied on top so FX movement never underprices a night. Converted prices are rounded up to whole units.
- The conversion is recorded per property per push: rate, margin, effective rate, and which nights were converted.
- Inbound RU reservations for a converted property are converted back to ZAR at the stored effective rate, and the original USD amount is retained on the record so nothing is lost.
- If FX data is unavailable, the price push is blocked with a clear reason rather than sending an unconverted number.

### 3. Owner disclosure on the ROLOS Channel Manager page

At the top of `/rolos/channel manager`, a currency notice appears **only** when USD conversion is in force for that property:

- Plain wording: rates are published in USD because Rentals United cannot hold ZAR for this location.
- The effective rate used, the 3% margin, and when the rate was last refreshed.
- A short sample table drawn from that owner's own actual nightly rates, showing ZAR authored → USD published (e.g. their next high-season and low-season nights).
- A note that payouts and booking values are converted back to ZAR on arrival.

When ZAR is in force, nothing is shown.

## Technical notes

- `ru_locations` gains a refresh path via `rentalsunited-api` (`list_cities_and_currencies` already exists) plus a cron job.
- Currency resolution moves into a shared helper (`_shared/ruCurrency.ts`) used by `push-property-to-ru`, the cert portal, and the reservation handler: resolve → attempt flip → verify → decide ZAR vs USD-converted.
- A new small table stores the FX rate history and the per-property "conversion in force" state (effective rate, margin, decided_at, reason), read by both the edge functions and the Channel Manager banner.
- Price conversion is applied to `priceEntries` (nightly + extra-guest amounts) in `pushARI`, after rate resolution, so the calendar-first hierarchy is untouched.
- `ru-reservation-handler` converts inbound totals back to ZAR when the property is flagged as converted, storing both amounts.
- New component `RuCurrencyNotice.tsx` rendered at the top of `src/pages/pms/PMSChannels.tsx`, with sample rates pulled from the property's resolved rates.
