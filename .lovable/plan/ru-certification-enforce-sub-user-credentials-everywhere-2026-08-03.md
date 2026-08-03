# RU Certification: enforce sub-user credentials everywhere

## What is happening

The discount push (`Push_PutLastMinuteDiscounts_RQ`) came back with **"You are not the owner of the apartment."** That is Rentals United saying the authenticated account does not own the apartment ID we sent.

Two things confirmed in the code and data explain how this can happen, and both need fixing:

1. **Silent master-account fallback.** In the RU adapter, child-scoped actions (property push, ARI push, discount push, read-backs) look up the sub-user's API keys and, if the lookup returns nothing usable (missing keys, or a secret that fails to decrypt), they quietly continue with the **master** credentials instead of stopping. RU then rejects the call with exactly this "not the owner" message. There is no signal in the run telling us which credentials were used.
2. **Discounts are pushed against a single apartment ID.** All RU IDs for these properties live on the units (Tidal Pools has 4 unit IDs: 5655615–5655618; the property row only carries a building ID, 48103). Availability and price read-backs already probe every unit, but the two discount steps still use one arbitrarily picked unit ID, so discounts are neither verified nor applied across the property.

## What will change

### 1. Never fall back to the master account for sub-user work
- Any RU action that touches one sub-user's inventory returns a clear `RU_CHILD_AUTH_REQUIRED` error when the sub-user's own AccessKey/SecretKey cannot be resolved, instead of calling RU as master.
- The same rule applies to the owner-scoped actions currently authenticating as master: building list/read/push, quality-check ordering, and currency change.
- Distinguish "no keys stored" from "stored secret could not be decrypted" in the message, so the fix is obvious (re-save the keys vs. generate them).

### 2. Make the credential used visible in every certification step
- Each child-scoped step records `auth_mode` (`child_keys` / `child_password` / `master`) in its detail line and diagnostics.
- A run that used master credentials for a sub-user listing is flagged red with an actionable message rather than a bare RU error.

### 3. Audit every certification suite step for correct scope
- Cross-check every action fired by the read-only, mandatory, discounts and full suites against the child-scoped list and pass the bound OwnerID for all of them (including building reads, quality check and currency).
- Account-level steps that intentionally use master credentials (connectivity, reservations, leads, composition rooms, cities/currencies, RLNM handler, location lookups) stay master and are labelled as such in the step list, so master usage is always deliberate.
- Pre-flight check at the start of a property-scoped run: resolve the bound OwnerID and its keys once; if keys are missing, mark all sub-user steps as skipped with the "save the keys in Portfolios → RU accounts" instruction instead of letting each one fail against RU.

### 4. Push and verify discounts per apartment
- Long-stay and last-minute pushes iterate every mapped unit RU ID (same pattern the ARI probe uses), sequentially and rate-limit paced.
- The verification step compares RU's echo per unit and reports `n/m units echoed`, listing any unit that failed.
- If a property has no unit RU IDs, the step is skipped with "push this property to RU first" rather than firing a bad ID.

## Technical notes

- `supabase/functions/rentalsunited-api/index.ts`: add a hard guard after `resolveChildAuth` for `CHILD_SCOPED_ACTIONS`, extend that set with `list_buildings`, `get_building`, `push_building`, `order_mcq`, `push_change_currency`, swap those handlers from `creds` to `scopedCreds`, and return `auth_mode` on all of them.
- `supabase/functions/ru-cert-portal/index.ts`: extend `CERT_CHILD_SCOPED_ACTIONS` to match, surface `auth_mode` in `CertStep.detail`, and rework the two discount steps into a per-unit loop reusing `unitRuIds` and `ruInvoke` pacing.
- No schema changes. Both functions redeployed, then a discounts suite re-run on Tidal Pools to confirm the RU echo per unit.
