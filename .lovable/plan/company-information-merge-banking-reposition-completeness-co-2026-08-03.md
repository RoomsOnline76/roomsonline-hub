# Company Information: merge banking, reposition, completeness counter, fix RU location refresh

## 1. Merge Banking Details into Company Information

Today Identity & Location renders two separate collapsibles: `CompanyInformationCard` and a standalone "Banking Details" card (VAT toggle, VAT #, Reg #, Bank, Branch, Holder, Account #, Type, SWIFT, Bitcoin). These merge into one card with three labelled sections:

- **Legal entity** — Registered Business Name, Key Representative, Mobile, Postal Address, VAT registered toggle + VAT number, Registration number, business size/description, time zone, region.
- **Banking (contract / payouts)** — Bank, Branch, Account holder, Account number, Account type, SWIFT.
- **Rentals United** — RU LocationID picker + legal representative block.

Duplicate handling:
- VAT is captured once (the existing `has_vat` / `vat_number` form fields). The RU profile's separate "VAT number" input is dropped; the RU push reads the single form value.
- "Reg #" stays as the company registration number; RU's "Manager ID number" keeps its own field since RU treats them as different values.
- Bitcoin toggle and wallet field are no longer rendered. Stored values are left untouched so nothing is lost on save.

## 2. Position

Company Information moves out of its current spot (after Property Surroundings) to sit directly under the address/GPS card and above the full-width map strip. The standalone Banking card is removed from its old position.

## 3. Incomplete counter

The card header gets a badge: green "Complete" or amber/red "N missing", with the missing field names listed inside the card when expanded.

Mandatory set (everything that can lock RU into the wrong currency or block a company/property push):
- Registered Business Name, Key Representative, Mobile
- Country, Region / province, City
- RU LocationID (the field that owns currency in RU)
- Time zone
- VAT number when VAT registered is on
- Legal representative: first name, last name, email, **nationality**, country of residence

Nationality and country of residence use RU LocationIDs with `LocationTypeID = 2`, per the RU spec — the pickers are corrected to that filter (they currently filter type 1).

## 4. Fix "Refresh RU location register" failing

Confirmed: `public.ru_locations` is empty, so no register has ever seeded.

Cause of the visible failure: `push-property-to-ru` / `seed_ru_location_tree` calls `rentalsunited-api` with `list_locations`; when RU answers with any non-zero status the adapter replies `success:false` (HTTP 200) and the wrapper converts it into a **502**, which `supabase.functions.invoke` surfaces only as "Edge Function returned a non-2xx status code" — the real RU status/message and diagnostics are discarded. Which RU status is being returned is not yet known.

Changes:
- `seed_ru_location_tree` returns HTTP 200 with `success:false`, the RU status id/message and diagnostics passed through, so the actual RU refusal becomes visible in the UI toast and logs.
- Add a fallback chain when `Pull_ListLocations_RQ` is unavailable for the integration: fall back to the existing `list_cities_and_currencies` action to populate the register (ids, names, currency), and keep the "endpoint not enabled — locations resolved by name at push time" informational path for the genuinely disabled case.
- Surface the returned message verbatim in `RuLocationPicker`'s toast instead of the generic fallback text.
- Re-run the refresh after deploying and report the RU status if it still refuses.

## Technical notes

- Files: `src/components/property/CompanyInformationCard.tsx` (merge + counter, new banking props), `src/pages/PropertyForm.tsx` (move mount point, pass banking form fields, delete standalone Banking card and Bitcoin block), `src/components/property/RuLocationPicker.tsx` (type filter + error surfacing), `supabase/functions/push-property-to-ru/index.ts` (seed error passthrough + fallback), redeploy `push-property-to-ru`.
- No schema change: banking already persists under `amenities.banking`, RU extras under `amenities.ru_company_profile`, and `properties.ru_location_id` exists.
