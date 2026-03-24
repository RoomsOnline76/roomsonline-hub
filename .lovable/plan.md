

# Global Billing Defaults & Per-Property Override System

## The Gap

Right now there is **no global defaults table** and **no admin page** for the fearless leader to set platform-wide billing rates. Every property gets hardcoded fallbacks (10% commission, 2% PMS, etc.) baked into the edge function. There's also no pricing model for add-ons like white-label — the toggle exists but has no associated fee.

The `billing_mappings` table exists but is empty and has no UI.

## Design

### Two-tier resolution: Global → Property

```text
┌──────────────────────────────┐
│  billing_global_defaults     │  ← Fearless Leader sets once
│  (one row per strategy)      │
│  default_commission: 10%     │
│  white_label_fee: R500/mo    │
│  pms_booking_fee: 2%         │
└──────────┬───────────────────┘
           │ fallback
           ▼
┌──────────────────────────────┐
│  property_billing_configs    │  ← Per-property override (negotiated)
│  commission_rate: 7%         │  ← NULL = use global default
│  white_label_fee: NULL       │  ← NULL = use global default
└──────────────────────────────┘
```

The edge function resolves: **property override → global default → hardcoded fallback**.

## Changes

### 1. New table: `billing_global_defaults`

```sql
CREATE TABLE billing_global_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy billing_strategy NOT NULL UNIQUE,
  default_commission_rate numeric(5,2),
  default_subscription_fee numeric(10,2),
  default_transaction_fee numeric(5,2),
  white_label_monthly_fee numeric(10,2) DEFAULT 0,
  payment_facilitator_fee numeric(5,2) DEFAULT 2.5,
  notes text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);
```

RLS: Only `fearless_leader` and `dev` can write. All authenticated can read.

Seed with current hardcoded values (e.g., default strategy → 10% commission, white_label_fee → 0).

### 2. Add `white_label_monthly_fee` column to `property_billing_configs`

Currently white-label is just a boolean toggle with no associated cost. Add a nullable `white_label_monthly_fee` column — NULL means "use global default", a value means "negotiated override".

### 3. New page: `/admin/billing-defaults`

- Restricted to `fearless_leader` and `dev` roles
- Shows a card per billing strategy with editable default rates
- Each card displays: default commission %, subscription fee, transaction fee, white-label fee, payment facilitator fee
- Save updates `billing_global_defaults`
- Add to Administration menu in navigation config

### 4. Update `BillingConfigTab` (per-property)

- Show global defaults as placeholder values in each input field
- When a field is empty/null, display "(using global: X%)" helper text
- Add white-label monthly fee field (shown when white-label toggle is on)
- Make it clear which values are overrides vs defaults

### 5. Update `calculate-billing` edge function

Change resolution order:
1. `property_billing_configs` value (if not null)
2. `billing_global_defaults` for the strategy
3. Hardcoded fallback

Also: when `white_label_allowed = true`, add a separate `billing_transactions` entry for the white-label monthly fee (type: `white_label_fee`).

### 6. Add to navigation

Add "Billing Defaults" item under Administration section, gated to `fearless_leader` + `dev`.

## Files

| Action | File | Purpose |
|--------|------|---------|
| Migration | SQL | `billing_global_defaults` table + `white_label_monthly_fee` column + seed |
| Create | `src/pages/AdminBillingDefaults.tsx` | Global defaults management page |
| Create | `src/hooks/useBillingDefaults.ts` | CRUD hook for global defaults |
| Modify | `src/components/property/BillingConfigTab.tsx` | Show global defaults as placeholders, add white-label fee field |
| Modify | `supabase/functions/calculate-billing/index.ts` | 3-tier resolution + white-label fee logging |
| Modify | `src/config/navigation.ts` | Add Billing Defaults nav item |
| Modify | `src/App.tsx` | Add route |

