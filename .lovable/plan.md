# Align defaults, contracts, TOBI and Connect with the Gateway Schedule correction

The billing engine now treats the active gateway schedule (property → portfolio → global) as the only author of the card-processing rate; the legacy flat "facilitator surcharge %" is a fallback used only when no schedule exists. Four surfaces still speak the old language and can quote a rate the system will not bill.

## What changes

### 1. Contracts (the real risk)
`src/lib/contractBillingVariables.ts` still prefers the legacy per-property `transaction_fee_percentage` / global `default_transaction_fee` for the facilitator variables, and only falls back to the schedule when both are empty. That is now backwards: a property with 3.5% on the old field gets a contract quoting 3.5% while billing charges the schedule rate.

- Resolve the schedule first for ROL-processed properties, and use the resolved rate (including any negotiated `gateway_percentage_override`) for `payment_facilitator_fee`, `payment_facilitator_clause`, `billing_*` and `billing_schedule_clause`.
- Use the legacy flat percentage only when no schedule resolves at all.
- Keep the existing clause text, band summary and "negotiated rate agreed for this Property" sentence.

### 2. Property billing defaults (admin)
- `AdminBillingDefaults` (global presets): present the surcharge percentage as a fallback-only value with a note that live rates are managed under Gateway Schedules — same read-only mirror treatment already applied in `BillingConfigBuilder`.
- `BillingConfigTab` (per property): the surcharge field mirrors the resolved schedule instead of an editable rate; the payment-model choice (ROL / own gateway / none) stays editable.
- `StrategySummaryLine` and the `BillingConfigBuilder` summary line: stop printing "X% booking surcharge (ROL facilitator)" as the billed rate; say processing is charged on the active gateway schedule (naming the fallback only when no schedule exists).
- `usePropertyPayouts` estimated gateway fees: resolve from the schedule rather than the global flat percentage so admin estimates match statements.

### 3. TOBI (Connect assistant)
`supabase/functions/connect-assistant/index.ts` static billing block still lists "Payment Facilitator Surcharge — a % on ROL-processed payments". Replace it with schedule wording so the static text and the live `GATEWAY_SCHEDULE` block agree, and keep bring-your-own-gateway as the mutually exclusive alternative. The existing "never say at cost / free" rules stay.

### 4. Connect pages
Pricing and FAQ already read the live schedule. Remaining pass: make sure the "at cost" phrasing that survives refers only to third-party licences the client already holds (never to card processing), and state on Pricing and Get Started that the schedule rate — or a negotiated rate — is what appears in the signed contract.

## Technical notes
- No schema change and no migration; the two negotiated 2.5% properties already carry `gateway_percentage_override`.
- Frontend and edge resolvers stay behaviourally identical (`getEffectiveBillingRate`, `isBillableScheduleSource`); only precedence in contract variable resolution changes.
- Verify with the existing `src/lib/gatewayBillingRate.test.ts` suite plus a contract-variable check that a property with a stale `transaction_fee_percentage` now renders the schedule rate.
- `connect-assistant` redeploys after the prompt edit.
