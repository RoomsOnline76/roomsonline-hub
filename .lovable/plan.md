## Goal
On the property Billing tab (admin view), when the PriceLabs add-on is enabled for a ROLOS property, give admin the same "Activate" + "Push to PriceLabs" controls that already exist in ROL'OS → Revenue → PriceLabs — so admins don't have to leave Billing to kick off the first push.

## Scope
Frontend only. Reuse the existing `pricelabs-api` edge function (`sync_property_to_pricelabs`) and the `properties.pricelabs_config` JSONB — no schema, no billing logic changes.

## Changes

1. **New component** `src/components/property/PriceLabsAdminPushCard.tsx`
   - Props: `propertyId`, `pricelabsAllowed` (from `property_billing_configs`).
   - Loads `properties.pricelabs_config` (`enabled`, `last_push_at`, `needs_repush`, `api_key_set`).
   - Renders states:
     - Not allowed → hidden.
     - Allowed, not activated → "Activate PriceLabs for this property" switch (writes `pricelabs_config.enabled = true`, same shape as `PMSPriceLabs.tsx`).
     - Activated → "Push to PriceLabs" button calling `supabase.functions.invoke("pricelabs-api", { body: { action: "sync_property_to_pricelabs", property_id } })`, plus a "Re-push recommended" alert when `needs_repush` is true. Shows `last_push_at`.
   - Reuses the same toast copy and mutation pattern from `PMSPriceLabs.tsx` (`pushProperty` mutation, lines ~212-216) so behaviour matches ROL'OS exactly.
   - Admin-only guard via `useAuth` (admin / dev / fearless_leader).

2. **Wire into `src/components/property/BillingConfigTab.tsx`**
   - Under the existing Revenue Add-ons area of the builder (after `pricelabs_enabled` toggle saves), render `<PriceLabsAdminPushCard>` when `config.pricelabs_allowed && isRolosPms`.
   - No changes to save/persist logic — the card mutates only `pricelabs_config`, independent of the builder form state.

3. **Small polish in `AdminOverviewTab.tsx` (optional, low risk)**
   - Update the PriceLabs Row `hint` from "surface in ROL'OS → Revenue" to note admin can also activate/push from the Billing tab now.

## Technical notes
- Push endpoint already exists and is idempotent; no new edge function work.
- `pricelabs_config` writes follow the exact JSONB merge pattern already in `PMSPriceLabs.tsx` `markConfig()` to avoid clobbering other keys (api_key metadata, etc.).
- Invalidates `["property-billing-summary", propertyId]` and `["property-pricelabs-config", propertyId]` after push so the AdminOverviewTab summary reflects activation state immediately.

## Out of scope
- Changing billing calculations, gating, or fee behaviour (already correct from prior turn).
- Any change to ROL'OS `PMSPriceLabs.tsx` — it keeps working exactly as today.
