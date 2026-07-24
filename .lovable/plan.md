## Goal
When an admin enables **White-label** on a property (or in global defaults), the **Basic Branding** add-on should automatically switch on and its fee should be forced to **R 0** (branding is included free with white-label).

## Behaviour rules
- `white_label_allowed = true` → force `branding_addon_enabled = true`, `branding_addon_monthly_fee = 0`, `branding_addon_setup_fee = 0`.
- While white-label is on:
  - Branding toggle is shown as **On (included)** and disabled so it can't be turned off or re-priced.
  - Fee inputs for branding are disabled and display `R 0`.
- Turning white-label **off** restores branding to whatever the admin sets (falls back to the global default fee). It does not silently keep the R 0 override.
- Billing calculation must not double-charge: when white-label is active, the branding line item is R 0 (or omitted) in the estimated client cost and in `calculate-billing`.

## Where to change

Frontend (UI + state):
- `src/components/admin/BillingConfigBuilder.tsx` — coerce branding fields whenever `white_label_allowed` flips on; disable the branding controls; show an "Included with White-label" hint.
- `src/components/property/AdminOverviewTab.tsx` (estimated client cost) — treat branding as R 0 when white-label is on.
- `src/pages/AdminBillingDefaults.tsx` — same coercion for global defaults tab.

Backend:
- `supabase/functions/calculate-billing/index.ts` — if `white_label_allowed`, zero out the branding add-on line before summing.

No schema change needed — we're only constraining existing fields.

## Out of scope
- No change to white-label pricing, PriceLabs, BYO gateway, or tier logic.
- No change to the `/connect/pricing` public page (branding add-on there stays as-is; it's shown independently of white-label bundling).
