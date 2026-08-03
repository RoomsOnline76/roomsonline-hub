# Company Information on every property + a real RU location register

## What changes for you

1. **"Business Registration" becomes "Company Information"** on the Identity & Location tab of every property (Edit Property and ROLOS Setup Property). It absorbs the Rentals United company profile fields that today live in a separate dialog at Portfolios → RU accounts, without repeating anything already captured elsewhere on the tab.
2. **The RU company profile dialog is retired.** Portfolios → RU accounts keeps a read-only summary of what will be pushed, with a link through to the property's Company Information frame.
3. **RU locations become a real, searchable register.** We pull Rentals United's full location tree (`Pull_ListLocations_RQ`) into ROLOS and add a location picker so a property, the company address and the legal representative each carry a genuine RU LocationID that pushes as-is — no more name-guessing at push time.

## Company Information frame — final field list

Kept from today: Registered business name, Mobile number, Key representative, Postal address.

Added (migrated from the RU dialog): Merchant name, Manager identification number, Time zone, Region / province, Number of properties, Number of employees, Years in business, Describe your business, and a collapsible **Legal representative** block (first/last name, email, address, city, post code, region, date of birth, nationality, country of residence — the last two as RU location pickers).

Not duplicated (already on the tab / banking frame, and read from there at push time): street address, suburb, city, country, postal code, telephone, website URL, VAT number, registration number, contact first/last name, currency.

## RU location register

- Add a `list_locations` action to `rentalsunited-api` issuing `Pull_ListLocations_RQ` with the sub-user AccessKey/SecretKey envelope, parsing `LocationID`, name, `ParentLocationID` and `LocationTypeID` (country / region / city / neighbourhood).
- Extend `ru_locations` with `parent_id`, `location_type_id`, `path` (e.g. "South Africa › Western Cape › Cape Town") and `depth`; a seed/refresh action upserts the whole tree in chunks. The existing city/currency refresh keeps working and now enriches the same rows.
- New `RuLocationPicker` component: type-ahead over the cached tree, filterable by location type, showing the full path plus the LocationID and RU's assigned currency for that location.
- Mount it for: the property's RU location (Identity & Location, next to the address), the company location, and the legal representative's nationality / country of residence.
- `push-property-to-ru` and `ru-cert-portal` prefer the explicitly selected LocationID over name resolution, and fall back to the current name lookup only when nothing is selected.

## Where the data lives

Company Information persists on the property (same `properties.amenities` JSONB the current frame already uses, under a `ru_company_profile` key) plus a new `properties.ru_location_id` column. `ru-cert-portal`'s company push reads the property-level profile first and keeps `ru_owner_accounts.company_profile` as a legacy fallback, so nothing already pushed regresses. For a portfolio-scoped RU sub-user the profile is taken from the portfolio's anchor property, and the RU accounts tab names which property it read from.

## Technical notes

- `rentalsunited-api` is under adapter lock for the auth builders and `fill_company_details`; this plan touches `fill_company_details`'s field merge and adds a new read-only action — approving the plan is the approval for that.
- Migration: new `ru_locations` columns (nullable, backfilled by the first seed), `properties.ru_location_id`, and GRANTs matching each table's existing policies.
- `Pull_ListLocations_RQ` is rate-limited like the other pulls, so the seed runs through the existing `ruInvoke` pacing helper and stores `last_synced_at` per row; the picker reads only the cache, never RU live.
- The frame is rendered from one shared component so Edit Property and ROLOS Setup Property stay identical. `src/components/property/GeneralTab.tsx` currently holds a dead copy of the Business Registration card (nothing imports it) — it gets updated or removed rather than left to drift.
- Sub-user auth rules, key redaction and existing readiness checks stay unchanged.

## Not yet verified

Whether Rentals United has `Pull_ListLocations_RQ` enabled for this integration (the city/currency dictionary is not, and `ru_locations` is currently empty — 0 rows). Step one of the build is a live probe; if RU has it disabled we surface it the same way as the other excluded endpoints and seed the tree from `Pull_GetLocationByName_RQ` lookups instead, so the picker still ends up with real LocationIDs.
