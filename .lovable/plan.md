

# Update ROL'OS PMS Partnership Agreement for Complex Billing

## Problem

The current "ROL'OS PMS Partnership Agreement" has a simplistic Section 3 that only mentions a single `{{commission_rate}}` variable. The billing model is now much richer — properties can have different strategies (default, widget, SaaS, portfolio, enterprise, volume-tiered), optional white-label fees, payment facilitator fees, subscription fees, and custom overrides. The contract doesn't reflect any of this.

The "Accommodation Listing & Distribution Agreement" (standard listing contract) is fine as-is — it covers simple commission-only relationships. The PMS agreement needs the overhaul.

## What Changes

Create a **new draft version (v2)** of the ROL'OS PMS Partnership Agreement with a completely rewritten **Section 3: Commercial Terms** that uses conditional variable blocks to handle all billing scenarios. The rest of the contract (Parts A, B, C) stays largely the same with minor polish.

### New Section 3 Structure

```text
## 3. COMMERCIAL TERMS

### 3.1 Billing Model
The Property's billing arrangement is: **{{billing_strategy_label}}**

### 3.2 Commission
{{commission_clause}}
- Commission of **{{commission_rate}}** on bookings via RoomsOnline channels
- Calculated on total accommodation value excluding extras
- Invoiced monthly, payable within 14 days

### 3.3 Subscription Fee (if applicable)
{{subscription_clause}}
- Monthly subscription fee: **R{{subscription_fee_monthly}}**
- Billed on the 1st of each month

### 3.4 White-Label Branding (if applicable)
{{white_label_clause}}
- Monthly white-label fee: **R{{white_label_monthly_fee}}**
- Includes custom domain, branded booking pages, removal of ROL branding

### 3.5 Payment Facilitator (if applicable)
{{payment_facilitator_clause}}
- Transaction processing fee: **{{payment_facilitator_fee}}%** per booking
- ROL collects guest payments and remits to Property less fees

### 3.6 Volume-Tiered Pricing (if applicable)
{{volume_tier_clause}}
- Tier structure as per Schedule A attached
```

### New Variables Schema

Add these variables to the template version (all with `required: false` except `commission_rate` and `billing_strategy_label`):

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `billing_strategy_label` | string | yes | Human-readable billing model name |
| `commission_rate` | percentage | yes | Commission percentage |
| `subscription_fee_monthly` | currency | no | Monthly subscription amount |
| `white_label_monthly_fee` | currency | no | Monthly white-label charge |
| `payment_facilitator_fee` | percentage | no | Transaction processing fee % |
| `commission_clause` | string | no | Full commission paragraph (pre-rendered) |
| `subscription_clause` | string | no | Subscription paragraph or empty |
| `white_label_clause` | string | no | White-label paragraph or empty |
| `payment_facilitator_clause` | string | no | Payment facilitator paragraph or empty |
| `volume_tier_clause` | string | no | Volume tier description or empty |

### Contract Generation Logic Update

When generating a contract for a property, the system reads `property_billing_configs` and `billing_global_defaults` to populate these variables. The `*_clause` variables are pre-rendered server-side — if a feature isn't enabled for a property, the clause variable is set to empty string so the section doesn't appear.

This requires a small update to the contract generation edge function to resolve billing config into clause text.

### Also: Fix the Default Commission Rate Label

The current contract says `default: 10%` for commission_rate but global defaults show `8%`. The new version will not hardcode a default — it will always be populated from the property's billing config.

## Implementation

1. **Insert new version v2** (draft) of the ROL'OS PMS Partnership Agreement via the insert tool with the full rewritten markdown content and expanded variables schema
2. **Update contract generation** in the edge function that populates contract variables — add billing config resolution logic to build the clause variables
3. **No schema changes needed** — all billing data already exists in `property_billing_configs` and `billing_global_defaults`

## Files

| Action | File |
|--------|------|
| DB Insert | New row in `contract_template_versions` — v2 draft with billing-aware content |
| Modify | Edge function that generates/populates contract variables (to resolve billing clauses) |

