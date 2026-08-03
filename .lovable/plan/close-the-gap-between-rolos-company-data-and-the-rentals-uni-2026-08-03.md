# Close the gap between ROLOS company data and the Rentals United profile

Comparing the two RU screens you exported (My Profile, Company Profile) against what ROLOS holds for
Jongensfontein and against the payload we actually sent on 3 Aug 21:56, four real misalignments show up.
Two are code bugs, one is a value-format bug, one is missing capture.

## What RU has vs what ROLOS holds

| RU field | On file at RU | In ROLOS | Verdict |
| --- | --- | --- | --- |
| VAT number | empty | `987654321` (all 4 properties) | **Bug** — never included in the push |
| Number of properties | "20 - 29" | we sent `4` | **Bug** — RU reads this as a range selector, not a count |
| Number of employees / Years in business | "Please select" | not captured | Missing capture (same range-selector issue) |
| Describe your business | empty (0/1000) | not captured | Missing capture |
| Manager Identification Number | empty | `property_registration = 1234567890` held, unmapped | **Bug** — available but not mapped |
| Phone | `+27000000000` | no phone captured anywhere | Placeholder leaking into RU |
| Contact first/last name, birthday | "Jongensfontein.com / Owner", 01/01/1990 | derived placeholders | Placeholder leaking into RU |
| Legal representative Region | empty | not captured (company Region = Western Cape) | Missing capture |
| Address, city, post code, country, time zone, region, legal rep block, locations | all correct | matches | Aligned |

## Root causes

1. **VAT is stored outside the block the push reads.** The RU push reads only
   `properties.amenities.ru_company_profile`. VAT lives on `amenities.vat_number` /
   `amenities.banking.vat_number` (the banking panel), so it is silently dropped even though the
   Company Information card shows it as a mandatory RU field.
2. **The three "how big are you" fields are RU range selectors, not integers.** We push
   `NumberOfProperties = 4` and RU displays "20 - 29" — RU is interpreting our number as the 4th
   range option. The ROLOS inputs are free-number fields labelled "Whole number", so every value we
   send lands on the wrong bucket.
3. **Placeholder fallbacks are sent as if they were real data.** When no phone/contact name/birthday
   exists we substitute `+27000000000`, the company name as first name, "Owner" as last name, and
   1990-01-01, and RU stores those permanently.
4. **A few RU-visible fields have no capture point at all** (employees, years in business, business
   description, legal-rep region, an explicit account contact person).

## Changes

### 1. Bridge VAT and registration into the RU payload
- In the company assembly (`ru-cert-portal`), resolve `vat_number` from
  `ru_company_profile.vat_number` → `amenities.vat_number` → `amenities.banking.vat_number`, and only
  when `has_vat` is true.
- Default `manager_identification_number` from `amenities.banking.property_registration` (company /
  business registration number) when the RU-specific field is blank; an explicit value still wins.

### 2. Turn the three range fields into RU-correct dropdowns
- Replace the free-number inputs for **Number of properties**, **Number of employees** and
  **Years in business** in the Company Information card with selects carrying RU's ranges
  (1-4, 5-9, 10-19, 20-29, 30-49, 50+ style buckets) and store the RU option ID.
- Migrate existing stored values: a bare integer is re-read as "the count" and mapped to the
  matching bucket, so Jongensfontein's 26 units resolve to "20 - 29" instead of sending `4`.
- Derive the default property/unit count from the **portfolio unit total**, not the member-property
  count, since RU's profile is account-wide.

### 3. Stop sending placeholders
- Capture a real **account contact person** (first name, last name, birthday) and **company phone**
  in the Company Information card, marked mandatory with the pink asterisk, pre-filled from the owner
  record where one exists.
- The push fails with a clear "complete Company Information first" message instead of substituting
  `+27000000000` / "Owner" / 1990-01-01. Legacy accounts already carrying placeholders are flagged in
  the completeness badge so they get corrected on the next push.

### 4. Add the remaining capture points
- **Describe your business** (0-1000 chars, already in the card) is included in the mandatory
  completeness counter, pre-fillable from the portfolio description.
- **Legal representative → Region** field added, defaulting to the company region.

### 5. Make the mismatch visible instead of invisible
- Add a "Last sent to Rentals United" comparison panel on the RU account view: the stored
  `ru_owner_accounts.company_payload` side-by-side with what ROLOS holds now, flagging every field
  that differs or that was sent as a placeholder. RU exposes no company-details pull, so the sent
  payload is the authoritative record — this is what makes the next drift obvious immediately.

## Technical notes

- Touched: `supabase/functions/ru-cert-portal/index.ts` (company assembly + gating),
  `supabase/functions/rentalsunited-api/index.ts` (range fields emitted as IDs),
  `src/components/property/CompanyInformationCard.tsx` (dropdowns, new fields, completeness),
  `src/pages/PropertyForm.tsx` (wiring), plus the RU account view for the comparison panel.
- No schema migration: the new values live inside `properties.amenities.ru_company_profile` and
  `ru_owner_accounts.company_profile`, which are already JSONB.
- After the changes: re-run **Complete company details** for Jongensfontein (OwnerID 741765) with the
  sub-user API keys, then re-export the RU Company Profile page to confirm VAT, ranges, manager ID and
  phone land correctly.
- Rate limiting and the existing sub-user API-key authentication path are untouched.

## Open question

RU's exact range labels for Number of properties / employees / years in business are read off the RU
dashboard dropdowns. If your RU account shows different buckets than the ones above, send a screenshot
of those three dropdowns and the option lists get matched exactly.
