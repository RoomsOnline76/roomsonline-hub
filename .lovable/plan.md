

## Plan: Fix RU Country & Currency Resolution

### Root Causes

**Issue 1 — Currency is never sent to RU.**
`buildPushPropertyXml` in `supabase/functions/rentalsunited-api/index.ts` emits no `<CurrencyID>` element. RU's property schema requires it (e.g. ZAR = `48`, USD = `144`, NAD = `91`). Without it, RU falls back to the **master account's default currency**, which is why LekkeSlaap reports "ZAR currency not met" — the property silently inherits the wrong currency regardless of what we configured locally.

**Issue 2 — Country derives from `DetailedLocationID`, which falls back to `1`.**
RU has no `<CountryID>` field — country is implied by `DetailedLocationID`. Today:
- `resolveLocationId(lat, lng)` calls `Pull_GetLocationByCoordinates_RQ`.
- On any failure (missing coordinates, RU silent miss, network error) it returns **`1`** — that is RU's "Andorra/test" location, not South Africa.
- Properties pushed with `DetailedLocationID=1` are tagged as the wrong country → fail LekkeSlaap's "ZA or NA" eligibility check.

**Issue 3 — No persistence of the resolved LocationID.**
Every push re-resolves location at runtime. If RU's coord lookup is flaky we silently regress to `1` even on properties we previously pushed correctly.

### Fixes

| # | Task | File |
|---|------|------|
| T1 | Add `<CurrencyID>` element to `Push_PutProperty_RQ`, positioned per RU XSD (after `OwnerID`, before `DetailedLocationID`). Update memory's strict element order accordingly. | `rentalsunited-api/index.ts` (`buildPushPropertyXml`) |
| T2 | Extend `RUPropertyPayload` interface with `currency_id: number` (mandatory, non-zero). Add `validatePropertyPayload` guard rejecting `currency_id <= 0`. | same |
| T3 | Build `mapCurrencyToRUId()` helper with the RU currency dictionary (ZAR=48, USD=144, NAD=91, EUR=47, GBP=49, BWP=24, plus common fallbacks). Source from `amenities.banking.currency` first, then `amenities.currency`, defaulting to `48` (ZAR) for ZA/NA properties. | `push-property-to-ru/index.ts` |
| T4 | Harden `resolveLocationId`: never return `1`. If RU lookup fails or coords missing → fall back to a per-country **default city LocationID lookup table** (ZA→Cape Town, NA→Windhoek, etc.) keyed by `property.country`. If that also fails, **abort the push with a clear validation error** rather than tagging the property with the wrong country. | `push-property-to-ru/index.ts` |
| T5 | Persist resolved `detailed_location_id` and `currency_id` to a new `pms_mappings.metadata` JSON block (keys: `ru_location_id`, `ru_currency_id`, `ru_country`). On subsequent pushes, prefer the stored value over re-resolving — re-resolve only when coordinates change or `metadata.ru_location_id` is missing. | `push-property-to-ru/index.ts` + new migration if needed (likely just JSON, no schema change) |
| T6 | Add a one-shot **back-fill action** (`reconcile_ru_country_currency`) that iterates all properties with `rentalsunited_property_id`, re-resolves their location + currency from local data, and re-pushes them so RU records are corrected for LekkeSlaap and other channel checks. | `push-property-to-ru/index.ts` |
| T7 | Add a small validation banner in the property activation readiness check (`check-activation-readiness`) for RU-distributed properties: blocker if no resolvable RU LocationID, warning if currency is unmapped. | `check-activation-readiness/index.ts` |
| T8 | Update `mem://integrations/pms/rentals-united-xml-adapter` — append CurrencyID requirement, the country-default city fallback table, and the persistence rule. | memory |
| T9 | Verification: push Steenbok end-to-end → call RU `Pull_GetProperty` → confirm `CurrencyID=48` and `DetailedLocationID` resolves to a ZA city. Document the new `Push_PutProperty_RS` ResponseID in `RU-Response-QA.md`. | edge function curl + doc |

### Currency dictionary (T3 reference)

| ISO | RU CurrencyID |
|-----|--------------|
| ZAR | 48 |
| USD | 144 |
| EUR | 47 |
| GBP | 49 |
| NAD | 91 |
| BWP | 24 |

### Country → default city LocationID fallback (T4 reference)

| Country | RU LocationID (city) |
|---------|---------------------|
| South Africa | TBD via `Pull_ListLocations_RQ` (Cape Town) |
| Namibia | TBD (Windhoek) |
| Botswana | TBD (Gaborone) |

These IDs will be fetched once via `list_locations` and hard-coded in a tiny dictionary; coordinates remain the primary source.

### Out of scope
- No UI for picking RU CurrencyID — derived from existing `amenities.banking.currency` set in the General tab (Banking Details → Currency, already in place per memory `mem://features/property-management/banking-details-currency`).
- No changes to availability / pricing / discount builders — all confirmed Status 0.
- Not touching `building_id` / `unit_type_object_id` linkage.

### Verification
After T9, expected:
```xml
<Push_PutProperty_RS>
  <Status ID="0">Success</Status>
  <PropertyID>4707752</PropertyID>
</Push_PutProperty_RS>
```
+ subsequent `Pull_GetProperty_RQ` confirms `CurrencyID=48` and `DetailedLocationID` resolves to a South African city. LekkeSlaap eligibility check should then flip to "1/1 properties ready".

