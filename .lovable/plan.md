

# RoomsOnline Billing Engine — Implementation Plan

## Current State

The platform already has foundational billing infrastructure:
- **`property_commercial_terms`** table with listing/pms commission types and per-property rates
- **`calculate-commission`** edge function that resolves commission type (listing vs pms) and applies rates from commercial terms or defaults (10%/2%)
- **`CommissionTab`** in property form for admin commission management
- **`payout_ledger`** + **`rol_bank_export_batches`** tables with full bank export pipeline
- **`BankExportDashboard`** with ledger summary, batch management, CSV generation
- Contract system with `{{commission_rate}}` variable substitution

The proposed billing engine extends this into a multi-strategy system. Given the scale, this should be phased.

---

## Phase 1 — Database Foundation (Migration)

### New enum
```sql
CREATE TYPE billing_strategy AS ENUM (
  'default', 'widget', 'rolos_pms', 'portfolio_aggregator',
  'enterprise_white_label', 'volume_tiered', 'payment_facilitator'
);
```

### New tables

**`property_billing_configs`** — one row per property, stores strategy + rates + toggles. References `properties(id)` (unique). `owner_id` references profiles, not `auth.users`. Includes `commission_rate`, `subscription_fee_monthly`, `transaction_fee_percentage`, `payment_facilitator_enabled`, `white_label_allowed`, `volume_tier_json`, `billing_start_date`, `linked_contract_id`, `custom_overrides`.

**`billing_transactions`** — immutable ledger of all billing events (commission, subscription, transaction_fee, payout). References property and owner. Includes `type`, `amount`, `currency`, `reference_id`, `calculated_by`.

**`owner_invoices`** — monthly invoice records per owner. Includes `period_start/end`, totals, `status` (draft/sent/paid), `pdf_url`.

**`billing_mappings`** — extensibility table for strategy-specific configuration (tier thresholds, widget volume brackets).

### RLS policies
- Owners can SELECT their own configs, transactions, invoices (matched via `is_property_owner` or owner email)
- Admins/devs have full access
- `billing_transactions` and `owner_invoices` are insert-only from edge functions (service role)

### Seed migration
- Insert `property_billing_configs` for all existing properties with `billing_strategy = 'default'` and `commission_rate = 10`

---

## Phase 2 — Edge Functions (Adapter Pattern)

### 2a. `calculate-billing` (Router)
- Replaces/wraps the existing `calculate-commission` function
- Fetches `property_billing_configs` for the property
- Routes to the correct strategy calculator
- Logs result to `billing_transactions`
- Falls back to `default` strategy if no config exists (backwards compatible)

### 2b. Strategy calculators (7 functions)
Each receives `{ property_id, booking_id?, event_type, amount }` and returns `{ amount, type, metadata }`:

| Function | Logic |
|----------|-------|
| `billing-calc-default` | 10% listing / 2% pms (current behavior, extracted) |
| `billing-calc-widget` | Tiered commission from `billing_mappings` |
| `billing-calc-rolos-pms` | Monthly subscription + per-booking fee |
| `billing-calc-portfolio` | Aggregate across portfolio properties, reduced rate |
| `billing-calc-enterprise` | Flat monthly fee, 0% commission |
| `billing-calc-volume-tiered` | Rate from `volume_tier_json` based on unit count |
| `billing-calc-payment-facilitator` | Transaction fee only |

### 2c. `generate-monthly-invoices` (cron)
- Runs 1st of month via pg_cron
- Aggregates `billing_transactions` per owner for the period
- Creates `owner_invoices` row
- Calls `send-invoice` to email PDF

### 2d. `send-invoice`
- Generates PDF (reuse `generate-itinerary-pdf` pattern)
- Sends via Resend to owner email

---

## Phase 3 — UI Components

### 3a. `BillingConfigTab` in Property Form
- New sub-tab under the Rates main tab (alongside existing Commission tab)
- Admin/dev only visibility
- Dropdown for billing strategy selection
- Conditional fields based on strategy (commission rate, subscription fee, transaction %, etc.)
- Volume tier JSON editor for `volume_tiered` strategy
- Contract link selector
- Saves to `property_billing_configs`

### 3b. `BillingPulse` card on Owner Dashboard
- New card in `ROLRevenuePulse` or separate dashboard section
- Hook: `useBillingSummary()` fetching aggregated `billing_transactions`
- Shows: pending commission, upcoming fees, last invoice, download link
- Reuses existing card/chart patterns

### 3c. Contract variable extension
- Add `{{billing_strategy}}`, `{{subscription_fee}}` to contract template variable schema
- Fetch from `property_billing_configs` during contract generation

### 3d. Onboarding wizard step (future)
- Add "Billing Profile" step to wizard builder using existing `onboarding_fields` infrastructure
- Populates `property_billing_configs` on submission

---

## Phase 4 — Documentation

- Update `llm-context.json` with billing strategy descriptions and new edge functions
- Update `llm-actions.md` with billing config and invoice generation actions

---

## Files Summary

| Action | File | Purpose |
|--------|------|---------|
| Migration | SQL | 1 enum, 4 tables, RLS, seed existing properties |
| Create | `supabase/functions/calculate-billing/index.ts` | Router function |
| Create | `supabase/functions/billing-calc-default/index.ts` | Default commission calc |
| Create | `supabase/functions/billing-calc-widget/index.ts` | Widget tiered calc |
| Create | `supabase/functions/billing-calc-rolos-pms/index.ts` | SaaS + per-booking |
| Create | `supabase/functions/billing-calc-portfolio/index.ts` | Portfolio aggregator |
| Create | `supabase/functions/billing-calc-enterprise/index.ts` | Enterprise flat fee |
| Create | `supabase/functions/billing-calc-volume-tiered/index.ts` | Volume tier calc |
| Create | `supabase/functions/billing-calc-payment-facilitator/index.ts` | Transaction fee calc |
| Create | `supabase/functions/generate-monthly-invoices/index.ts` | Monthly cron invoicing |
| Create | `supabase/functions/send-invoice/index.ts` | PDF + email delivery |
| Create | `src/components/property/BillingConfigTab.tsx` | Admin billing config UI |
| Create | `src/hooks/useBillingConfig.ts` | CRUD hook for billing configs |
| Create | `src/hooks/useBillingSummary.ts` | Owner billing summary hook |
| Create | `src/components/dashboard/BillingPulseCard.tsx` | Owner billing dashboard card |
| Modify | `src/components/property/PropertyForm.tsx` | Add Billing sub-tab |
| Modify | `src/components/dashboard/ROLRevenuePulse.tsx` | Add BillingPulse card |
| Modify | `supabase/functions/calculate-commission/index.ts` | Delegate to calculate-billing |

## Implementation Order
1. Database migration (tables + enum + RLS + seed)
2. Router edge function + default calculator (backwards compatible)
3. Remaining strategy calculators
4. BillingConfigTab UI + hook
5. BillingPulse card + hook
6. Monthly invoice generation + send
7. Contract variable extension
8. Documentation updates

