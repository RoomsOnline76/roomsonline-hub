## Goal

Commission on the Payments page must be what the billing config actually says — resolved per booking, per its origin — instead of one flat property rate applied to total gross.

## Current behaviour (verified)

- `usePropertyPayouts` reads only `property_billing_configs.commission_rate` and multiplies it by the property's whole gross. It ignores `portfolio_billing_configs` entirely (Jongensfontein's rates live there), ignores the billing strategy (widget flat, rolos_pms, volume tiered, enterprise), and ignores where the booking came from.
- The billing engine (`calculate-billing`) already resolves a two-way commission type: `listing` (10% default) vs `pms` (2% default), from `bookings.integration_type` / `booking_channel` / `source_url`, and prefers an active `property_commercial_terms` row for that type. That resolution is the source of truth and is not used by the payout page.
- `bookings.calculated_commission` / `commission_rate_applied` / `commission_type` exist but are null on all current rows (the engine only writes them when it is invoked for a booking).
- Portfolio config resolution already exists in `useBillingConfig` (member → `portfolio_billing_configs`, else property row).

## What will change

### 1. Shared commission resolver (`src/lib/commissionResolver.ts`, new)

One module used by the payout page and reusable elsewhere:

- `resolveCommissionType(booking)` — mirrors the edge function: `pms` when `integration_type`/`booking_channel` is direct/widget/embed/api/rolos/wordpress or `source_url` looks like a widget/embed/WordPress host; otherwise `listing`.
- OTA rule: reservations that synced in from an external channel (Booking.com, Expedia, Airbnb, Lekkeslaap, Vrbo, Google — i.e. `booking_channel`/`integration_type` matching a channel-manager source, with no ROL payment transaction) get **0% commission**. Bookings placed on `book.sleepinafrica…` are `listing` and get the listing rate.
- Rate cascade per booking: `bookings.calculated_commission` (when present) → active `property_commercial_terms` row matching the commission type and check-in date → billing config rate for that type → global default → hardcoded 10% listing / 2% PMS.

### 2. Two rates in the billing config

Add `listing_commission_rate` and `pms_commission_rate` to `property_billing_configs`, `portfolio_billing_configs` and `billing_global_defaults` (nullable; existing `commission_rate` stays as the shared fallback so nothing breaks). Resolution order stays: portfolio config → property config → global default → hardcoded.

### 3. Payout page fix (`usePropertyPayouts`)

- Fetch each booking's origin fields alongside the transaction, resolve commission **per booking**, and sum.
- Resolve billing config portfolio-first: load `property_portfolio_members` for the properties in the result set and prefer the matching `portfolio_billing_configs` row, falling back to `property_billing_configs`.
- Honour the strategy for the rate choice (widget flat commission, rolos_pms, volume-tiered, enterprise 0%) rather than assuming `commission_rate`.
- Show a blended effective rate (commission ÷ gross) in the summary row, and per-booking commission + type in the drill-down detail table.

### 4. Billing UI

Surface the two rates (Listing / marketplace vs PMS · white-label · direct · widget) in the Billing Config Builder for both property and portfolio scope, with the inherited/blank state showing the fallback that will apply. Include them in the Estimated Client Cost calculator.

### 5. Edge function alignment

Update `calculate-billing` to read the new per-type rates and to fall back to the portfolio config when the property has no own row, so live billing and the payouts view produce identical numbers.

## Technical notes

- One migration adds three nullable numeric columns per table; no data backfill needed (nulls inherit today's behaviour).
- No change to how transactions are collected or settled — this only affects how commission is computed and displayed.
- Verification: compare the Payments summary against a manual per-booking calculation for Fonteinhutte and Dassiesingel (portfolio-scoped, 10% listing / 2% PMS) before and after.
