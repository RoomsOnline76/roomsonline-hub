# Fix: Rentals United still publishes USD while ROLOS reports ZAR

## What is actually wrong

Two independent faults, both confirmed:

1. **The currency flip is sent as the master account, not the white-label sub-user.**
   Rentals United applies a location's currency per authenticating account. `push-property-to-ru`
   decides the currency (`decideRuCurrency`) *before* it resolves the sub-user's API keys, and calls
   `Push_ChangeCurrency_RQ` with no `owner_id` and no child keys. The adapter's strict child-auth
   guard only trips when `owner_id` is supplied, so the call silently goes out on master credentials.
   Result: the master account's Groot-Jongensfontein location is ZAR; the Jongensfontein sub-user's
   location is still USD — which is exactly what the RU multicalendar shows for RU IDs 5655615-5655618.

2. **The currency tracker is reporting our own assumption back to us.**
   The tracker reads `ru_locations.currency_iso`. That table has 80,098 rows and exactly **one** with
   a currency set: location 83272 = ZAR, written by our own upsert right after the flip. The RU
   dictionary endpoint (`Pull_ListCitiesAndCurrencies_RQ`) is not enabled for this integration, so
   nothing ever verified it. `decideRuCurrency` then short-circuits on that cached "ZAR" and records
   `flip_outcome = already_set` in `ru_currency_state` without calling RU at all — a self-confirming
   green light.

## Fix

### 1. Every currency call authenticates as the owning sub-user
- Move sub-user key resolution (`ruOwnerId` + `childAccessKey`/`childSecretKey`) **above** the
  currency decision in `push-property-to-ru`, and pass `childAuth` into `decideRuCurrency`.
- Pass the same child auth into the standalone location-flip loop (the bulk currency reconcile path)
  and into `refreshRuLocationsCache`.
- Make `push_change_currency` refuse master fallback outright: require child auth for it whenever a
  sub-account exists for the property, rather than only when `owner_id` happens to be present.

### 2. Currency state becomes an observation, not an assertion
- Stop treating our own post-flip upsert as evidence. Cache the location currency **per owner scope**
  so a master-account value can never mask a sub-user value.
- Add a read-back: after the flip, call `Pull_GetProperty_RQ` (child-scoped) for one RU ID per
  property and parse the `CurrencyID` RU actually holds. That value — not our cache — is what
  `ru_currency_state.published_currency_iso` records, alongside a new "verified against RU" timestamp.
- If read-back shows USD while we authored ZAR, mark the property amber/red with
  `flip_outcome = 'failed'` and the RU-reported ISO, so the tracker shows drift instead of "in sync".

### 3. Re-assert currency on the property after a successful flip
RU keeps a property's currency from creation, so flipping the location alone does not restate existing
listings. After a flip succeeds, re-push each affected RU property with `CurrencyID = 48`, then
read back to confirm. Report per-unit results.

### 4. Tracker UI
- `RuCurrencyPanel` gains an "RU-reported currency" column (from read-back) next to the authored
  currency, with the verification timestamp and a per-property **Re-verify** action.
- Unverified rows render as amber "not verified against RU", never green.

## Verification

After the change, run the currency reconcile for Jongensfontein and confirm:
- the flip request logs `auth_mode=child_api_keys` with owner 741765;
- read-back for 5655615-5655618 returns `CurrencyID 48` (ZAR);
- `ru_currency_state` shows `published_currency_iso = ZAR` with a fresh verified-at, and the tracker
  turns green only after that read-back.
If RU refuses ZAR for the sub-user location, the existing USD-with-margin fallback engages and the
tracker will say so explicitly instead of claiming ZAR.

## Technical notes

- Files: `supabase/functions/push-property-to-ru/index.ts` (ordering + child auth + re-push),
  `supabase/functions/_shared/ruCurrency.ts` (scoped cache, read-back, decision recording),
  `supabase/functions/rentalsunited-api/index.ts` (strict child auth for `push_change_currency`,
  expose `CurrencyID` on `get_property`), `src/components/.../RuCurrencyPanel.tsx`.
- Migration: add `owner_scope` to the location-currency cache and
  `ru_reported_currency_iso` + `verified_at` to `ru_currency_state`.
- RU rate limits: read-backs reuse the existing per-method pacing helper, one call per RU ID.
