# Close the silent RU push fallbacks

Every value the push currently invents is either removed or turned into a blocker, so nothing reaches the channels as a guess that the scorecard reports as a pass.

## What changes, fallback by fallback

**Commercial terms (highest risk today)**
- Payment methods: the `[1, 2]` substitution stops passing. When no payment method is configured the check `payment_methods_authored` fails and the push is blocked.
- Cancellation policy: the `0–30 days / 100%` substitution stops passing. `cancellation_policies_authored` fails when the property has authored no policy.

**Currency and property type**
- Currency: the ISO map stays. The country guesses (South Africa/Namibia/Botswana) and the unconditional ZAR final fallback become blocking — `currency_authored` fails unless a currency is set on the property, and the push refuses rather than sending an assumed one.
- Property type: the `12 = Chalet` substitution (unit level and the building-level reuse) becomes blocking — `object_type_authored` fails when the ROL'OS unit type does not map to a channel type.

**Location, beds, changeover, rates**
- LocationID: the country-default city (Cape Town 1611 and siblings) stops satisfying the location check. `ru_location_authored` is promoted from advisory to mandatory, so the owner must pick the Channel Manager location explicitly. Refusing LocationID 1 stays as is.
- Beds: the default double (RU 61) for an unmapped bed string, and the building-level "one double per bedroom" composition, both become blocking — `beds_authored` fails and names the bed strings that could not be mapped.
- Changeover: the hard-coded code `3` becomes blocking — `changeover_authored` fails unless a changeover rule is set on the unit or the property.
- Rates: the "lowest rate found in the season" substitution and the `min_stay 1` gap filler stop being silent. Any open date that would be priced from a fallback (or has no price at all) is reported as a failing pricing check with the dates listed.

## How this lands without stranding live inventory

- The **static content push** (`Push_PutProperty_RQ` and the onboarding gate) refuses when any of the above fails. That is the correct place to stop a guess — nothing reaches the channel.
- The **ARI push** keeps sending the dates that are genuinely priced and available, and refuses only the fallback-derived ones instead of publishing an invented rate or `min_stay 1`. Withholding a whole calendar would close live inventory for dates that are correctly priced, so those dates still go out and the skipped ones are reported.
- Properties already published with a guessed value will fail their next static push until the real value is captured. The push error names each gap and the exact screen to fix it, and the same gaps appear in the onboarding wizard, the Requirement legend counts and the Certification console — so an owner sees them before attempting a push.

## Technical notes

- `supabase/functions/_shared/ruReadiness.ts` — consume the flags that are already computed but unread (`payment_methods_is_default`, `cancellation_policies_is_default`) as mandatory checks; promote `ru_location_authored` to `mandatory: true`; add mandatory checks for the new flags below. Detail strings name the offending value and the fix location.
- `supabase/functions/push-property-to-ru/index.ts`:
  - `mapPaymentMethods` / `mapCancellationPolicies` keep returning their `isDefault` shape (the flags now block instead of being ignored).
  - `mapCurrencyToRUId` returns `{ id, isDefault }`; the country and ZAR branches set `isDefault: true` and feed a new `currency_is_default` validation flag.
  - `resolveBedAmenityId` callers record unmapped bed strings into `beds_unmapped: string[]`; the building-level composition sets `beds_are_default`.
  - `PROPERTY_TYPE_MAP` misses set `object_type_is_default`; same for the building-level reuse at the end of the file.
  - `resolveLocationId` marks the country-default branch as unauthored so the promoted check fails.
  - `resolveChangeoverRules` returns `defaultIsAssumed` when neither the unit nor the property sets a changeover.
  - ARI: `resolveUnitRateKey`'s lowest-rate branch and the `min_stay 1` filler record the affected date ranges into `pricing_fallback_days` / `min_stay_fallback_days`; those dates are skipped in the payload and reported.
- `src/config/propertyFieldRequirements.ts` and `src/lib/channelMandatoryFields.ts` — map the new check ids (`payment_methods_authored`, `cancellation_policies_authored`, `currency_authored`, `object_type_authored`, `beds_authored`, `changeover_authored`) to the existing field keys so the wizard counts them, the legend totals match, and "Fix in section" deep-links land on the right tab and unit. Currency maps to the banking/currency field, changeover to the unit's Rate Manager rules.
- No schema or storage change; `ruPhaseGate.ts` and `ru-cert-portal` pick the new checks up automatically because they read `summarizeReadiness`.
- Deploy `push-property-to-ru`, `ru-cert-portal`, and any other function importing the shared scorer after the change.
