

## Plan: Seed RU Locations + Force-Set Currency at Location Level

### Why the previous fix didn't move the needle

RU's data model: **currency is owned by the LocationID, not by the property.** A property's `<CurrencyID>` is only honoured when the parent location's currency matches. Fonteinhutte's coords resolved to RU LocationID `83272` (a real Stilbaai locality) — but that location is configured as **USD** in RU. So our push succeeds, RU stores `CurrencyID=48` against the property, then silently overrides it back to the location's USD on read. That's also why `Pull_GetProperty` keeps returning USD even after Status 0 pushes.

We never used the three RU endpoints that actually solve this:
- `Pull_GetLocationByName_RQ` — find the right LocationID by name (better than coords for ambiguous spots).
- `Pull_ListCitiesAndCurrencies_RQ` — see which currency RU has for each city.
- `Push_ChangeCurrency_RQ` — flip a location's currency (one-time per location).

### Fix path

| # | Task | File |
|---|------|------|
| L1 | Add three new actions to `rentalsunited-api`: `get_location_by_name`, `list_cities_and_currencies`, `push_change_currency`. Each is a thin XML wrapper. | `rentalsunited-api/index.ts` |
| L2 | Add a one-shot **seed script** action `seed_ru_locations` in `push-property-to-ru`: pulls `Pull_ListCitiesAndCurrencies_RQ` (filtered to ZA / NA / BW country IDs), upserts results into a new lightweight table `ru_locations (id PK, name, country, currency_iso, currency_ru_id, last_synced_at)`. Used as the source of truth for resolution and as a cache to avoid re-pulling. | `push-property-to-ru/index.ts` + migration |
| L3 | Upgrade `resolveLocationId` to a 4-step chain: (1) cached `pms_mappings.metadata.ru_location_id` if coords stable → (2) coords lookup → (3) **name lookup** via `Pull_GetLocationByName_RQ` using `property.city`/`property.suburb` filtered to the property's country → (4) country-default city. Each successful resolution checks `ru_locations.currency_iso` and warns if mismatched. | `push-property-to-ru/index.ts` |
| L4 | Add `reconcile_ru_location_currency` (replaces / extends `reconcile_ru_country_currency`). For each property: (a) resolve the *correct* LocationID via L3, (b) compare `ru_locations.currency_iso` to the property's expected ISO (ZAR/NAD/BWP), (c) if mismatched call `Push_ChangeCurrency_RQ` to flip that location, then (d) re-push the property. Sequential, with a per-location lock so we don't double-flip. | `push-property-to-ru/index.ts` |
| L5 | Targeted Fonteinhutte fix: run `reconcile_ru_location_currency` for property `00015d06-…`. Expected effect: location `83272` (or whichever ZA locality its coords/name resolve to) gets currency flipped from USD → ZAR; all 9 units re-push and `Pull_GetProperty` then returns `Currency="ZAR"`. | runtime invocation |
| L6 | Surface a new readiness blocker in `check-activation-readiness`: if `ru_locations` row for the resolved LocationID has `currency_iso !== expected`, block distribution with a clear "RU location currency mismatch — reconcile required" message. | `check-activation-readiness/index.ts` |
| L7 | Update `RU-Response-QA.md` Section E with: the three new endpoint examples, the discovered platform behaviour (location-owns-currency), and the verification ResponseIDs from L5. | doc |
| L8 | Update memory `mem://integrations/pms/rentals-united-xml-adapter` with the location-owns-currency rule and the new resolution chain. | memory |

### New table (L2)

```sql
CREATE TABLE public.ru_locations (
  id           integer PRIMARY KEY,           -- RU LocationID
  name         text NOT NULL,
  country      text NOT NULL,
  currency_iso text,                          -- 'ZAR' | 'USD' | 'NAD' | …
  currency_ru_id integer,                     -- 48 / 144 / 91 …
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ru_locations (country);
CREATE INDEX ON public.ru_locations (lower(name));
-- RLS: read for authenticated, write only via service role.
```

### XML snippets to add (L1)

```xml
<!-- get_location_by_name -->
<Pull_GetLocationByName_RQ>
  {auth}
  <LocationName>{name}</LocationName>
</Pull_GetLocationByName_RQ>

<!-- push_change_currency -->
<Push_ChangeCurrency_RQ>
  {auth}
  <Location>{ru_location_id}</Location>
  <Currency>{ISO}</Currency>
</Push_ChangeCurrency_RQ>
```

### Verification (success criteria)

After L5 for Fonteinhutte:
1. `Push_ChangeCurrency_RS` returns Status 0 (or 339 "already set" — both acceptable).
2. `Pull_GetProperty` for all 9 RUIDs returns `Property Currency="ZAR"`.
3. LekkeSlaap eligibility flips to ready.

### Out of scope
- No UI for browsing RU locations (admin-only edge action).
- Not flipping currencies for non-ZA/NA/BW locations.
- Building/UnitTypeID linkage (still pending RU on Q5/C2/C3).

