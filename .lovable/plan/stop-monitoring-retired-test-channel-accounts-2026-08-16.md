# Stop monitoring retired test channel accounts

## What changes

The nightly reconciliation email currently treats **every** sub-account the channel returns as something that must be verified — including old test and archived accounts that nobody uses. That produced the "7 unverified accounts" warning.

New behaviour:

1. **Only monitored accounts count.** An account is monitored when it is bound to a ROL'OS property/portfolio *and* has stored, verified API keys. Today that is one account: `rooms@roomsonline.co.za` (OwnerID 741761). Everything else — the archived accounts, the API-test account, the demo owner and the TEST-portfolio owner (742004, no keys) — is out of scope.
2. **Unmonitored accounts never raise an alert.** They are excluded from the "Accounts that could not be verified" section and no longer make the run count as a disparity, so no more warning emails for them.
3. **The email states who *is* being monitored.** When a real disparity is sent, the email opens with an "Accounts monitored" table: channel account, OwnerID, listings found, and status (verified / could not be read). Genuine read failures on a monitored account still show as a warning — that is the case we do want to hear about.
4. **Out-of-scope accounts stay visible, quietly.** The run record keeps them under a separate "not monitored" list so the Channel Monitor page can still show them for reference, without counting them as problems.

## Technical notes

- `supabase/functions/channel-manager-entitlement/index.ts` (`reconcile` scope): each entry in `accountResults` already carries `bound` and `has_keys`. Add a derived `monitored` flag (`bound && has_keys`) so consumers no longer have to infer scope, and keep the existing fields unchanged.
- `supabase/functions/cron-channel-reconcile/index.ts`:
  - split `accounts` into `monitored` and `unmonitored`;
  - build `errored` only from monitored accounts, so `hasDisparity` ignores test-account read failures;
  - keep filtering orphans/duplicates by errored owners as today;
  - add the "Accounts monitored" table to `buildEmail`;
  - store `findings.unmonitored_accounts` alongside the existing findings, and keep `error_account_count` as the monitored-only count.
- No schema change, no changes to the reconcile logic that classifies listings.
