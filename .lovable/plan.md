## Goal
Move PriceLabs enablement from ROLOS (owner-controlled) to Admin-only, with billing implications and portfolio-wide bulk enable.

## Data model (migration)

**`property_billing_configs`** — add:
- `pricelabs_allowed boolean DEFAULT false` — admin gate per property
- `pricelabs_monthly_fee numeric` — per-property PriceLabs add-on fee (nullable = use global default)

**`billing_global_defaults`** — add:
- `pricelabs_monthly_fee numeric` — global default add-on cost

**`property_portfolios`** — add:
- `pricelabs_monthly_fee numeric` — portfolio-wide add-on cost override (nullable)

No changes to `properties.pricelabs_config`; the per-property `enabled` inside that JSONB stays as the "actively syncing" flag, but the UI to flip it moves out of ROLOS. Actual gating for ROLOS visibility uses `pricelabs_allowed` on the billing config.

## /admin/edit property → Admin tab

**AdminOverviewTab.tsx** — new "Revenue Tools" row showing PriceLabs status (Allowed / Not allowed) with a Pencil shortcut to Billing tab.

**BillingConfigTab.tsx** — new "Revenue Add-ons" section (admin-only, mirrors the white-label block):
- Switch: **Allow PriceLabs** (writes `pricelabs_allowed`)
- Input: **Monthly fee** (writes `pricelabs_monthly_fee`, shows global default hint)
- Note: fee is billed monthly whether or not the owner has enabled sync inside ROLOS
- Button: **Enable for all properties in this portfolio** — visible when the property has an active portfolio; opens a confirm dialog and bulk-updates `pricelabs_allowed=true` + `pricelabs_monthly_fee` on every `property_billing_configs` row for portfolio members, and sets the portfolio-level `pricelabs_monthly_fee` for reference.

**AdminBillingDefaults.tsx** — add input for global `pricelabs_monthly_fee` under add-ons.

## Billing engine

`calculate-billing` edge function and `usePropertyPayouts` — when `pricelabs_allowed` is true, add the resolved fee (property override → portfolio override → global default) to the monthly SaaS/subscription line as a `pricelabs_addon` charge, similar to how `white_label_monthly_fee` is treated today.

## ROLOS side

**PMSRevenue.tsx** — only render the PriceLabs tab when `pricelabs_allowed` is true for the selected property (fetched alongside existing property data). Portfolio view: show the tab only when every selected property is allowed; otherwise show a small note listing the disallowed properties.

**PMSPriceLabs.tsx** — 
- Remove the "Enable PriceLabs / Enable now" toggle and its alert.
- Show a read-only status pill: "Enabled by admin" (green) or, if somehow reached without allowance, "Not enabled — contact admin".
- Keep the credential override, min/max floor/ceiling, rate-plan mapping, and Push/Pull actions. Push/Pull enabled purely on `pricelabs_allowed`, no longer on `pricelabs_config.enabled`.
- `pricelabs-api` edge function: treat `pricelabs_allowed` on the billing config as the authoritative gate; reject sync/pull actions with 403 when false.

## Files touched

- `supabase/migrations/<new>.sql` — schema additions above
- `src/components/property/BillingConfigTab.tsx` — new PriceLabs block + portfolio bulk button
- `src/components/property/AdminOverviewTab.tsx` — PriceLabs row
- `src/pages/AdminBillingDefaults.tsx` — global default input
- `src/hooks/useBillingConfig.ts` / `useBillingDefaults.ts` — surface new fields
- `src/hooks/usePropertyPayouts.ts` and `supabase/functions/calculate-billing/index.ts` — add PriceLabs add-on to the monthly total
- `src/pages/pms/PMSRevenue.tsx` — conditional tab
- `src/pages/pms/PMSPriceLabs.tsx` — remove owner enable toggle, show admin-controlled status, gate actions on `pricelabs_allowed`
- `supabase/functions/pricelabs-api/index.ts` — server-side gate check

## Out of scope
- Retroactive invoicing / proration for properties already using PriceLabs (fee starts from the next billing cycle after admin flips the switch).
- Automated Cloudflare-style provisioning inside PriceLabs; credentials stay as-is.