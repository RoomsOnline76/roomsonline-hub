## What I found (verified in the database)

The Jongensfontein portfolio has 4 properties:

| Property | Custom provider allowed | Provider | Credentials |
|---|---|---|---|
| Fonteinhutte Self-Catering Chalets | yes | payfast | saved (merchant_id, merchant_key, passphrase) |
| Dassiesingel Self-catering Units | no | none | none |
| SEESIG Self Catering Chalets | no | none | none |
| Tidal Pools Self Catering Apartments | no | none | none |

So no inheritance exists today: the BYO provider flag, the selected provider, and the saved credentials are all stored strictly per property (`properties.payment_provider(s)`, `properties.allow_custom_payment_provider`, and one `integration_configs` row of type `payment_credentials` per property). Every payment gateway edge function looks credentials up by `property_id` only. Dassiesingel therefore falls back to the Rooms Online PayFast gateway.

## Plan

### 1. Portfolio becomes the source of truth (matching billing)
Add a `payment_*` section to the portfolio config, mirroring how billing already moved to `portfolio_billing_configs`:
- portfolio-level fields: whether custom payment providers are allowed, the selected provider list, and the credential payload (stored in the same `integration_configs` shape).
- a per-property "override portfolio payment settings" escape hatch, off by default, so one property can still be configured separately if ever needed.

### 2. Materialise to member properties so checkout keeps working
Rather than rewriting all 17 gateway edge functions, a database function will fan the portfolio config out to every member property that is not overriding:
- sets `allow_custom_payment_provider`, `payment_provider`, `payment_providers` on each member property;
- upserts each member's `payment_credentials` row in `integration_configs`.

It runs when the portfolio payment config is saved, and when a property is added to a portfolio, so new members inherit automatically.

### 3. Backfill Jongensfontein
Promote Fonteinhutte's existing PayFast BYO configuration to the portfolio, then fan it out to Dassiesingel, SEESIG and Tidal Pools. After this, all four properties check out through the portfolio's own PayFast merchant account.

### 4. UI
- **Admin → Portfolio management:** new "Payment provider" card — enable BYO for the portfolio, pick the provider, enter credentials once, and a visible list of which member properties are inheriting vs overriding.
- **Property Integrations (admin + ROLOS):** when a property inherits, show a read-only summary ("Inherited from Jongensfontein portfolio — PayFast") with a link to the portfolio, plus the admin-only override toggle. Properties not in a portfolio behave exactly as they do now.

### Technical notes
- New table `portfolio_payment_configs` (portfolio_id, allow_custom, providers, credentials jsonb, timestamps) with grants + RLS matching `portfolio_billing_configs`; credentials readable only by admin/dev/fearless_leader and service_role.
- New column `properties.payment_provider_override` (boolean, default false).
- Sync implemented as a `security definer` function plus triggers on `portfolio_payment_configs` and `property_portfolio_members`.
- No gateway edge function changes required; `useActivePaymentGateways` continues to resolve from the property row.
