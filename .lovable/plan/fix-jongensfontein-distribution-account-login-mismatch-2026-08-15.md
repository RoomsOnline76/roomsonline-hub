# Fix Jongensfontein distribution account login mismatch

## What is happening

The Jongensfontein portfolio (Tidal Pools, Seesig, Dassiesingel, Fonteinhutte) has one live distribution sub-account registered at the channel under **[rooms@roomsonline.co.za](mailto:rooms@roomsonline.co.za)** (owner id 741765) — that is correct and is what the Channel Manager card shows.

However, Tidal Pools' property record now carries the owner email **[connect@roomsonline.co.za](mailto:connect@roomsonline.co.za)**, an internal ROL login. Verified by reading the property row and the account row. Two consequences:

- The wizard reports the sub-user as "stale" and asks to re-create it, because it compares the live login against the property/portfolio owner emails and `rooms@` is no longer one of them.
- Creating/refreshing the account returns 422 `NO_OWNER_EMAIL`, since internal logins (`connect@`, `dev@`) are rejected as sub-account logins and no other usable email is found.

## Fix

1. **Data correction** — restore the real owner email on the Jongensfontein properties that were overwritten with `connect@roomsonline.co.za`, setting them to `rooms@roomsonline.co.za` (the actual owner of the portfolio and of the live distribution account). Also set the portfolio's owner email to the same value so it is the single authority. the owner was changed and up dated to use connect@roomsonine.co.za. This was intentional. 
2. **Make the live account its own authority** — in the phase gate, treat the login of an already-provisioned, channel-verified sub-account as a valid authority email. A live sub-user is only flagged stale when a *real* (non-internal) owner email differs from it, never merely because someone typed an internal ROL address into the property record.
3. **Ignore internal logins when deciding authority** — internal prefixes (`dev@`, `connect@`, `admin@`, `info@`, `support@`, `accounts@`, `hello@`) are excluded from the expected-email set, so they can neither become a sub-account login nor trigger a false mismatch. NEGATIVE: they are used as testing acocunts and can be used. 
4. **Surface the login clearly** — the Channel Manager distribution card keeps showing the actual sub-account login (`rooms@roomsonline.co.za`) and, when a property's owner email differs from it, shows an advisory note instead of a blocking "stale sub-user" error.

## Technical notes

- Data fix via the insert/update tool on `properties.owner_email` and `property_portfolios.owner_email` for portfolio `Jongensfontein.com`.
- `supabase/functions/_shared/ruPhaseGate.ts`: add internal-prefix filtering to `addAuthority`, and add the bound account's `ru_login_email`/`owner_email` to the authority set when `ru_owner_id` is present and last verification succeeded; keep the stale blocker only for genuine non-internal mismatches.
- `supabase/functions/ru-cert-portal/index.ts`: the existing-account email fallback added earlier stays; the owner resolution keeps rejecting internal logins for *new* account creation.
- No schema change required.