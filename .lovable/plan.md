
## Goal

Clarify two overlapping fields that have confused admins, and rewrite every strategy card description so intent is obvious at a glance.

## Concept correction

Today both fields are stored as percentages and look interchangeable. They aren't:

- **Default Transaction Fee (Facilitator Fallback %)** — ROL handles the money via its PayFast facilitator. This is a **per-booking surcharge %** applied to every booking the property takes through ROL's payment rails. Always relevant unless the owner brings their own gateway.
- **Payment facilitator fee (contract display %)** — Misnamed. This should be a **flat monthly add-on fee (ZAR/mo)** charged to owners who opt to plug in their **own** payment provider (Stripe/Peach/etc.), because we no longer handle their money but still carry integration/support cost. It is not a percentage of anything.

So: the % lives with ROL-facilitated bookings; the flat fee lives with BYO-gateway properties. They are mutually exclusive per property.

## Changes

### 1. Data model
- Rename semantic of `billing_global_defaults.payment_facilitator_fee` (currently numeric %) → repurpose as **ZAR/mo flat add-on** (`byo_gateway_monthly_fee`). Add the new column, backfill from existing value only if it looks like a ZAR amount (>20), otherwise null. Keep the old column readable for one release; new UI writes to the new column.
- Add `property_billing_configs.byo_gateway_monthly_fee` (nullable numeric) so admins can override per property.
- `default_transaction_fee` and `transaction_fee_percentage` stay as-is (they were already correct in intent).

### 2. Admin Billing Defaults (`src/pages/AdminBillingDefaults.tsx`)
- Split into two clearly labeled `FieldToggleRow`s:
  - **"Booking surcharge % (ROL payment facilitator)"** — unit `%`, tooltip: "Added to every booking taken via ROL's PayFast facilitator. Not charged if the owner uses their own payment provider."
  - **"BYO payment provider add-on"** — unit `ZAR/mo`, tooltip: "Flat monthly fee when the owner connects their own gateway (Stripe, Peach, PayGate, etc.). ROL does not handle the money."
- Remove any wording that implies both fees stack on the same booking.

### 3. Per-property Billing tab (`src/components/property/BillingConfigTab.tsx`)
- Show the % field only when `facilitatorActive` (ROL handles money).
- Show the BYO monthly add-on field only when `allow_custom_payment_provider` is on.
- Info banner near the toggle: "Choose one — ROL facilitates payments (per-booking %) OR the owner brings their own gateway (flat monthly add-on)."
- Update the yellow summary line at the bottom accordingly.

### 4. Admin Overview & payout math
- `AdminOverviewTab.tsx` estimated-cost card: include the BYO monthly add-on in the recurring bucket when custom provider is enabled, drop the % from recurring in that case.
- `usePropertyPayouts.ts`: apply `transaction_fee_percentage` only when `payment_facilitator_enabled` is true (already correct — verify no double-count with the new field).

### 5. Contract variables (`src/lib/contractBillingVariables.ts`)
- `payment_facilitator_fee` (contract token) resolves to the per-booking %.
- Add `byo_gateway_fee` token resolving to the flat monthly ZAR value + clause block. Existing contracts keep the old token functioning.

### 6. Strategy card copy — rewrite all six

| Strategy | New description |
|---|---|
| Default (Commission) | Property is listed on ROL and paid via ROL's payment facilitator. ROL earns a % commission per booking; owner pays no monthly fee. |
| Widget — Tiered Commission | Bookings taken through the ROL booking widget. Commission % steps down as monthly booking volume grows. No subscription. |
| ROL'OS PMS — Subscription | Full PMS + channel manager. Monthly base fee + R60 per active unit. Reduced 2% booking commission. Optional PriceLabs & white-label add-ons. |
| Enterprise White-Label | Fully branded, own-domain deployment. Flat monthly licence + once-off setup. Zero booking commission — owner keeps 100% of revenue. |
| Volume Tiered (Per Unit) | Pure per-unit monthly fee that slides with total active units. No booking commission, no transaction %. |
| Payment Facilitator Only | No listing or PMS fees. Owner uses ROL only as a payment facilitator; ROL earns the per-booking surcharge %. |

Portfolio Aggregator (hidden legacy strategy) — no copy change.

### 7. Contract-facing text
Update any ContractSign / templates that read `payment_facilitator_fee` to make clear it is a per-booking surcharge, not a monthly line item. Add optional inline BYO gateway clause.

## Technical details

- Migration: add `byo_gateway_monthly_fee numeric` to both `billing_global_defaults` and `property_billing_configs`; conditional backfill; no destructive drops.
- No changes to `calculate-billing` transaction-fee branch — it already models the per-booking % correctly. Add a subscription-line emitter for the BYO add-on when `allow_custom_payment_provider` is true.
- Types regenerate after migration approval; UI wiring lands in the follow-up build turn.
- Files touched: `AdminBillingDefaults.tsx`, `BillingConfigTab.tsx`, `AdminOverviewTab.tsx`, `useBillingConfig.ts`, `useBillingDefaults.ts`, `contractBillingVariables.ts`, `calculate-billing/index.ts`, plus the strategy-label constants in `AdminOverviewTab`, `BillingConfigTab`, and `StrategySummaryLine.tsx`.
