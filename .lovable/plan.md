# Fix portfolio loading errors

## Outcome
The Jongensfontein portfolio URL will stop requesting prices for properties that are not currently eligible for public listing, removing the repeated forbidden console errors.

## Changes
- Make the portfolio service apply the same contract-backed public-listing rule as booking and availability.
- Return only eligible portfolio properties before rate, review, specials, or enrichment work begins.
- Make the browser fallback read the same public property source instead of active-but-unlisted properties.
- Preserve the portfolio's white-label branding even when it currently has no eligible properties.

## Verification
- Deploy the portfolio service.
- Open the supplied Jongensfontein URL as a signed-out visitor.
- Confirm there are no forbidden availability requests, no console errors, and the Jongensfontein branding remains active.
