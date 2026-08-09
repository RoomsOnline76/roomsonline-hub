# Carry the three-way payment model into contracts and invoicing

The billing config now stores an explicit choice: **ROL processes payments**, **Owner's gateway**, or **None (reservation only)**. That choice currently stops at the billing screen. Contracts and the recurring invoices still infer payment handling from whichever fee happens to be filled in, so a reservation-only property can be given a gateway clause in its agreement and be billed a gateway add-on it never asked for.

## What is wrong today (verified)

- `_shared/recurringBilling.ts` adds the "Own payment gateway integration" line whenever a gateway fee value exists on the config **or on the global defaults** — it never looks at the property's payment model. Any property inheriting a global gateway fee gets billed, including ROL-processed and reservation-only ones.
- `contractBillingVariables.ts` emits the BYO gateway clause whenever the facilitator is off and a gateway fee is resolvable — so a reservation-only property's contract reads as if it uses its own gateway.
- There is no reservation-only clause or variable at all, so an agreement for such a property says nothing about how the guest actually pays (EFT against a pro forma, property confirms payment in ROL'OS).
- The stored state can already disagree with itself: SEESIG Self Catering Chalets has `payment_mode = rol` while its billing config has the facilitator disabled, and the gateway choice is only inferred from "monthly fee > 0", which cannot distinguish "owner's gateway at no add-on" from "reservation only".

## What to build

### 1. One canonical payment model

Add an explicit `payment_model` column (`rol` / `byo` / `reservation_only`) to `property_billing_configs` and `portfolio_billing_configs`, written by the billing config selector alongside the existing fee fields, and backfilled from the current combination of `properties.payment_mode`, `payment_facilitator_enabled` and the gateway fee. A small shared resolver returns the model for a property (property config → portfolio config → property flag), so contracts, invoices and checkout all read the same answer instead of re-deriving it.

The property's `payment_mode` stays the operational switch used by checkout; the billing config column is the commercial record the contract and invoices quote.

### 2. Contracts

- Gate the existing clauses on the model: facilitator clause only for **ROL**, gateway clause only for **owner's gateway**.
- Add `payment_model_label` and `reservation_only_clause` variables, and render a payment-handling clause for reservation-only agreements: no online payment is processed, the guest receives banking details on a pro forma invoice, the property confirms settlement in ROL'OS, and commission is invoiced monthly rather than deducted at source.
- Show the model as its own row in the contract billing summary and expose the new variables in the contract variables panel.
- Existing signed contracts are untouched; new versions pick the clauses up.

### 3. Billing and invoicing

- Recurring charge generation only adds the gateway add-on when the resolved model is **owner's gateway**; reservation-only and ROL-processed properties never get that line.
- The per-booking facilitator surcharge is only applied for **ROL**.
- Expected-billing previews (ROL Account, admin billing tables) use the same resolver so the quoted monthly total matches what the cron actually invoices.
- Commission for reservation-only bookings continues to be invoiced monthly — that path already exists and is left as is.

### 4. Reconciliation

A one-off data pass aligns the three stored signals per property and flags any property whose contract quotes a different model than its billing config, surfaced on the property billing tab so staff can correct it before the next invoice run.

## Technical notes

- Migration: `payment_model text` with a check constraint on both billing config tables, defaulting from existing data; no table creation, so no new grants needed.
- New shared helper for the model resolution, used by `src/lib/billingExpected.ts`, `src/lib/contractBillingVariables.ts`, `supabase/functions/_shared/recurringBilling.ts` and `generate-property-invoices`.
- Edge functions to redeploy: `billing-subscription-cron`, `subscription-billing-actions`, `generate-property-invoices`, `calculate-billing`.
- Verification: for one property per model, confirm the generated charge lines and the rendered contract clauses match the selector, and that switching a property to reservation-only removes the gateway line from the next preview.
