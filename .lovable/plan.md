# Step A.1 sub-user creation — review against the channel spec

Verdict: the request itself is correct. The problems are on the response side, on field
lengths, and one missing optional field that likely explains the recurring API-key refusals.

## What is already right

- The request root, auth block and element order match the published example exactly:
  `FirstName`, `LastName`, `Email`, `Password` as direct children of the root (no `User`
  wrapper), and `Locations` containing at least one `LocationId`.
- The password rule is enforced before we call: 12+ characters, upper, lower, digit,
  special, and it must not contain the login email.
- Logins are capped at 50 characters before being offered as candidates, matching the
  channel's `Email String(50)` limit.
- Duplicate-login handling (adopt the existing sub-account, then slug fallbacks) is sound.

## Issues to fix

1. **We parse an ID the response never contains.** The documented create response returns
   only `Status` and `ResponseID` — no account id at all. Our code reads
   `<UserAccountId>` and also reads `created.owner_id`, which the API wrapper never
   returns. Both are always empty, so the OwnerID always comes from the roster fallback,
   while the code comments claim the create response supplies it.
   - Stop treating the create response as an identity source. Make the roster read
     (`Pull_ListMyUsers_RQ`) the single, explicit way Step A.1 resolves the new OwnerID.
   - Give that roster read a short paced retry (a few attempts, spaced) because the roster
     can lag a fresh create by seconds. Today a lagging roster saves the account row with a
     null OwnerID and Step A.2/A.3 then run against nothing.
   - Also accept the `UserAccountID` spelling used in the roster response, not only
     `UserAccountId`.

2. **First and last name are not length-capped.** The channel limits each to 50
   characters. Long owner or property names are sent unchanged and get rejected outright,
   the same class of failure the 50-character email cap already fixed. Truncate both to 50
   before sending.

3. **`PMSId` is never sent (optional field).** The channel offers `PMSId` to associate a
   created user with the PMS provider account, and the create method requires the
   `CreateUser` role granted by channel support. Our sub-accounts are consistently refusing
   automatic key creation with status `-4` ("API key creation not enabled"), which is
   exactly the symptom of a child account that is not associated with our provider. Add an
   optional configured `PMSId` to the create request, and record that this must be
   confirmed with channel support before we rely on it.

4. **Location filter rejects `LocationId` 1.** We drop any id that is not greater than 1,
   but 1 is a valid id in the channel's own example. Accept any positive integer and keep
   rejecting only zero/blank/non-numeric values.

## Technical notes

- `supabase/functions/rentalsunited-api/index.ts`
  - `buildCreateUserXml`: truncate `first_name`/`last_name` to 50; emit optional `PMSId`
    (from a `RU_PMS_ID` setting) between `Password` and `Locations`, per the documented
    element order.
  - `create_user` handler: relax the location filter to `n > 0`; stop returning a parsed
    `user_account_id` as if authoritative — return the raw status/response and let the
    caller resolve identity from the roster.
  - `extractUserAccountId`: match both `UserAccountId` and `UserAccountID`.
- `supabase/functions/ru-cert-portal/index.ts` (Step A create branch)
  - Remove the `created.user_account_id` / `created.owner_id` identity path and its
    misleading comment; after a successful create, resolve OwnerID via a paced roster
    re-read (e.g. 3 attempts, ~2s apart, cache-busting) before writing
    `ru_owner_accounts`.
  - If the roster still does not list the new login, return a clear partial-success result
    ("created at channel, identity not yet listed — re-run Step A") instead of persisting a
    row with a null OwnerID.
- No database migration and no UI change required. Both edge functions need redeploying.
