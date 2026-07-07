# Room-Count Tiered Billing

Add an admin-editable tier table (rooms → monthly fee) to the **ROL'OS PMS** and **Volume Tiered** billing strategies. The applicable tier resolves automatically from the property's total room-type inventory (aggregated across portfolio when applicable) and appears in the owner contract as a single resolved rate.

## Default tiers (from screenshot)

| Rooms | Monthly |
|---|---|
| 0–9 | R350 |
| 10–19 | R450 |
| 20–50 | R600 |
| 51+ | R750 |

## Changes

### 1. Schema (migration)
- Add `tier_pricing_json jsonb` to `billing_global_defaults` — array of `{min_rooms, max_rooms|null, monthly_fee}` tiers. Seed defaults above for `rolos_pms` and `volume_tiered` strategies.
- Add to `property_billing_configs`:
  - `tier_pricing_json jsonb` — per-property/portfolio override (nullable → falls back to global).
  - `tier_scope text` — `'property'` | `'portfolio'` (default `'portfolio'` per user choice; keeps door open).
  - `room_count_override int` — nullable manual override.

### 2. Room-count resolver (`src/lib/billingTierResolver.ts`, new)
- `getPropertyRoomCount(propertyId)` — sums `hostfully_room_types.number_of_units` (+ equivalent for other PMS via `pms_room_types_cache.max_occupancy_units` / `rolos_room_types.total_units`). Uses whichever source has data.
- `getPortfolioRoomCount(propertyId)` — resolves portfolio via `property_portfolio_members`, sums across all members; falls back to property count if not in a portfolio.
- `resolveTier(rooms, tiers)` — returns matching `{min, max, monthly_fee}`.

### 3. Admin UI — `src/pages/AdminBillingDefaults.tsx`
- For `rolos_pms` and `volume_tiered` strategy cards only, render a **Tier Table editor**: add/remove rows, edit min/max/fee. Save through existing `useBillingDefaults.update` (persists to `tier_pricing_json`).
- Keep existing subscription/commission inputs; hide the flat "Subscription Fee" input on these two strategies since tiers replace it.

### 4. Per-property override — `src/components/admin/PropertyBillingConfigCard.tsx` (existing usage location)
- When strategy is `rolos_pms` or `volume_tiered`, show:
  - Live "Current tier: **R450 / month** (12 rooms across portfolio)" summary using the resolver.
  - Collapsible "Override tiers for this portfolio/property" editor writing to `property_billing_configs.tier_pricing_json`.
  - Optional manual `room_count_override` input.

### 5. Contract variable — `src/lib/contractBillingVariables.ts`
- Extend `BillingContractVariables` with:
  - `tier_monthly_fee` (e.g. `"450"`) 
  - `tier_room_count` (e.g. `"12"`)
  - `tier_clause` — rendered sentence, e.g. *"Based on a portfolio of twelve (12) rooms, the applicable monthly subscription is four hundred and fifty Rand (R450) per month."* Empty comment when strategy isn't tier-based.
- `resolveBillingContractVariables` calls the new resolver, picks tier from property override → global default.

### 6. `useBillingSummary` / display
- Update `useBillingSummary` to surface the resolved tier fee so dashboards show the correct monthly amount.

## Files touched
- **New:** migration; `src/lib/billingTierResolver.ts`
- **Edited:** `AdminBillingDefaults.tsx`, `useBillingDefaults.ts` (type only), `useBillingConfig.ts` (type only), `PropertyBillingConfigCard.tsx`, `contractBillingVariables.ts`, `useBillingSummary.ts`

## Out of scope
- Automated re-billing when room count crosses a tier boundary (flag noted; can be added via a scheduled function later).
- Changes to any PMS adapter (locked).
