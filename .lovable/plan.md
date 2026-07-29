## Problem

Saving BYO payment provider credentials in Edit Property → Integrations fails with "Failed to save credentials".

Verified cause (two issues on the `integration_configs` table, where these credentials are stored):

1. **No Data API grants exist at all** on `integration_configs` — a query of the table grants returns zero rows for `authenticated`, `anon`, or `service_role`. Every read/insert/update from the app is rejected with a permission error before row-level rules are even evaluated. This is why the save silently fails.
2. **Role parity gap** — the four access policies allow only `admin` and `dev` (plus property owners). `fearless_leader`, which per project rules has parity with admin/dev, is not included, so that role would still be blocked after the grants are fixed.

## Fix

**1. Database migration**
- Grant `SELECT, INSERT, UPDATE, DELETE` on `public.integration_configs` to `authenticated`, and `ALL` to `service_role` (no `anon` — every policy is auth-scoped).
- Recreate the four policies to add `has_role(auth.uid(), 'fearless_leader')` alongside admin/dev.

**2. Frontend error surfacing** (`src/components/integrations/PropertyPaymentProviderSelect.tsx`)
- The credentials mutation's `onError` currently discards the real message. Show the actual error text in the toast so future permission/validation failures are diagnosable instead of appearing as a generic failure.
- Same treatment for the provider-selection mutation's error handler.

## Verification

After the migration, run an authenticated round-trip against `integration_configs` for the current property to confirm insert and update succeed, then re-check the Integrations tab save.

## Technical notes

Credentials are stored as a JSON blob in `integration_configs.config` keyed by `property_id` + `integration_type = 'payment_credentials'`. No schema change to that shape is proposed — only permissions and error reporting.
