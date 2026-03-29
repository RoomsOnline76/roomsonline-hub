

# Consolidate Commission into Billing Tab + Remove Duplicate Toggle + Show Extra Charges

## Changes

### 1. Merge Commission tab into Billing tab
The Commission sub-tab (under Rates) and Billing sub-tab currently live side by side but manage related financial config. Embed the `CommissionTab` component directly inside `BillingConfigTab` as a collapsible section below the strategy/commission-rate fields. Then remove the separate "Commission" tab trigger from `PropertyForm.tsx`.

### 2. Remove "Enable Property Branding" toggle from Branding tab
The `brand_override_enabled` toggle in `BrandingTab` does the same thing as the `white_label_allowed` toggle in `BillingConfigTab`. Remove the toggle card from `BrandingTab.tsx` (lines 278–305). Keep the toggle only in the Billing tab. When `white_label_allowed` is saved in billing, it should also write `brand_override_enabled = true` on the property record (they're the same concept — keep them in sync).

### 3. Show applicable extra charges when White-Label or Payment Facilitator is toggled on
When the user toggles on White-Label or Payment Facilitator, display a highlighted info card showing the charge that will apply:
- **White-Label ON**: Show "This property will be charged **R{fee}/month** for white-label branding" (reading from `globalDefaults.white_label_monthly_fee` or the property override)
- **Payment Facilitator ON**: Show "This property will be charged **{fee}%** per transaction as payment facilitator fee" (reading from `globalDefaults.payment_facilitator_fee` or the property override)

Use an amber/warning-style card so it's visually distinct.

## Files

| Action | File |
|--------|------|
| Modify | `src/components/property/BillingConfigTab.tsx` — embed CommissionTab, add charge info cards for toggles |
| Modify | `src/components/property/BrandingTab.tsx` — remove brand_override_enabled toggle card (lines 278–305) |
| Modify | `src/pages/PropertyForm.tsx` — remove Commission tab trigger and TabsContent, keep only Billing |
| Modify | `src/hooks/useBillingConfig.ts` — sync `white_label_allowed` → `brand_override_enabled` on property record |

