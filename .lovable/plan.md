

# Update Help System & TOBI with Billing & Commission Knowledge

## What Needs Updating

Three systems need billing/commission knowledge:

1. **Help Articles** (database) — New articles for owners and admins about billing, commissions, and sales rep management
2. **TOBI Generic/PMS** (`help-assistant`) — System prompts need billing context; PMS mode should fetch billing data per property
3. **TOBI Connect** (`connect-assistant`) — System prompt needs updated pricing/billing info for prospects

## Changes

### 1. Migration: Insert New Help Articles

**Admin-targeted articles** (section: `billing_finance`):
- "Billing Strategies Explained" — Overview of 7 strategies, when to use each
- "Setting Global Billing Defaults" — How to use `/admin/billing-defaults`
- "Per-Property Billing Overrides" — How the 3-tier resolution works (property → global → fallback)
- "Sales Rep Commission Structure" — Tiers (Base/Accelerated/Elite), rates, clawback, monthly cycle
- "Managing Sales Reps & Commission Reports" — Using `/admin/sales-reps` and `/admin/commission-reports`

**Owner-targeted articles** (section: `owner_billing`):
- "Understanding Your Billing" — What owners see, how fees are calculated
- "Your Monthly Invoice" — What's included, statuses, payment cycle
- "White-Label & Add-On Fees" — What additional services cost

### 2. Update `HelpContext.tsx` — Add New Sections

Add `billing_finance` to `ADMIN_SECTIONS` and `owner_billing` to `OWNER_SECTIONS`. Add labels to `SECTION_LABELS` and `SECTION_ORDER`.

### 3. Update `help-assistant` Edge Function

**Generic system prompt** — Add billing knowledge block:
- Billing strategies overview
- Commission structure (global defaults → per-property overrides)
- Sales rep commission tiers and monthly cycle
- Admin navigation: `/admin/billing-defaults`, `/admin/sales-reps`, `/admin/commission-reports`

**PMS system prompt** — Add:
- Billing config section in navigation guide (Billing tab in property form)
- Financial concepts: billing strategies, white-label fees, commission resolution

**PMS property context** — Fetch `property_billing_configs` and `property_referrals` data to include in context when available.

### 4. Update `connect-assistant` Edge Function

Add to system prompt:
- Billing model overview for prospects (commission-based, subscription, enterprise flat-fee)
- Updated pricing that references billing strategies
- Sales/partner program mention for referral leads

## Files

| Action | File | Purpose |
|--------|------|---------|
| Migration | SQL | Insert ~8 help articles across 2 new sections |
| Modify | `src/contexts/HelpContext.tsx` | Add `billing_finance` + `owner_billing` sections |
| Modify | `supabase/functions/help-assistant/index.ts` | Add billing knowledge to both prompts + fetch billing data in PMS mode |
| Modify | `supabase/functions/connect-assistant/index.ts` | Add billing model info for prospects |

