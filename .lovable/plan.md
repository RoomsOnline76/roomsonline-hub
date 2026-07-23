# Consolidate billing into a single configurable "Strategy Builder" + saveable presets

## Goals
1. Retire `enterprise_white_label` as a distinct strategy (already covered by the white-label add-on).
2. Replace the six confusing strategy cards with **one** configurable card whose toggles compose any billing shape.
3. Let admins **save** a configuration as a named preset. Saved presets become the dropdown "quick-load defaults" for properties.
4. On a property, loading a preset seeds the fields but each toggle/field is still individually editable.
5. Remove the "Legacy payment facilitator % (deprecated)" input entirely (no legacy properties depend on it).

## New model (one config, many toggles)

A billing configuration is now the union of these independently toggleable components:

| Toggle | Fields it exposes |
|---|---|
| Listing commission | `commission_rate %` |
| Widget / WBE tiered commission | `tier_pricing_json` (volume tiers) |
| PMS subscription (ROL'OS) | `subscription_fee`, `channel_manager_per_unit_fee` |
| Per-unit volume tiers | `tier_pricing_json` (unit-based) |
| ROL payment facilitator surcharge | `transaction_fee %` |
| BYO payment gateway add-on | `byo_gateway_monthly_fee` |
| White-label add-on | `white_label_monthly_fee`, `_setup_fee`, `_billing_mode` |
| PriceLabs add-on | `pricelabs_monthly_fee` |
| Portfolio aggregator add-on (portfolio only) | existing aggregator fields |

At a property, any combination of toggles can be active. Estimated cost and contract tokens are already driven by these fields, so downstream math stays intact.

## Presets

`billing_global_defaults` becomes the preset library instead of a fixed enum of strategies.

- Add columns: `preset_name` (text), `preset_description` (text), `is_preset` (bool, default true), `sort_order` (int).
- Keep the existing `strategy` column as a stable **preset slug** for now (backfill: current rows keep their slugs; `enterprise_white_label` row deleted after any references migrate to `default` + white-label add-on).
- Admins can **Add preset**, edit, duplicate, delete. Each preset is just a saved snapshot of the toggles above.

Property side (`property_billing_configs.strategy`) keeps pointing at a preset slug for reporting, but the per-property fields (commission_rate, transaction_fee, byo_gateway_monthly_fee, white_label_*, etc.) remain the source of truth. Switching preset in the dropdown seeds those fields; the user can then toggle/edit any of them.

## UI changes

### `src/pages/AdminBillingDefaults.tsx`
- Replace `STRATEGY_LABELS` map + `.map(...StrategyCard)` list with:
  - A **preset list** (sidebar or accordion) showing `preset_name` + one-line `summarizeStrategy` summary.
  - A single **Configuration** panel = new `BillingConfigBuilder` component with the toggle rows listed above (reusing `FieldToggleRow`, `MonthlyAnnualSetup`, `WidgetTierEditor`, `TierCriteriaEditor`).
  - Header actions: **New preset**, **Duplicate**, **Delete**, **Save**.
- Remove the "Legacy payment facilitator % (deprecated)" block (line 123–128 area) and its state.
- Drop `enterprise_white_label` from any seed/UI list; delete the row via migration.
- Keep add-on defaults (Channel Manager per-unit, PriceLabs, Sales Rep tiers, Portfolio aggregator) as they already sit outside the strategy card.

### `src/components/property/BillingConfigTab.tsx`
- Dropdown now lists **presets** loaded from `billing_global_defaults` (name + summary).
- Selecting a preset calls a new `applyPreset(preset)` that fills the property config fields; a small "Preset applied — customize below" banner appears.
- Below the dropdown, render the same `BillingConfigBuilder` toggles so admins can turn on/off individual components per property.
- Remove legacy facilitator field references.

### `src/components/property/AdminOverviewTab.tsx` and `StrategySummaryLine.tsx`
- Update summary to describe the **active toggles**, not a single strategy name (e.g. "Commission 10% + White-label R2 500/mo + PriceLabs R250/mo").
- Preset name shown as a subtitle.

## Data migration

Single migration:
```sql
-- 1. Add preset metadata columns
ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS preset_name text,
  ADD COLUMN IF NOT EXISTS preset_description text,
  ADD COLUMN IF NOT EXISTS is_preset boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- 2. Backfill preset_name from existing strategy labels
UPDATE public.billing_global_defaults SET preset_name = COALESCE(preset_name, strategy);

-- 3. Retire enterprise_white_label preset
UPDATE public.property_billing_configs
   SET strategy = 'default'
 WHERE strategy = 'enterprise_white_label';
DELETE FROM public.billing_global_defaults WHERE strategy = 'enterprise_white_label';

-- 4. Drop legacy facilitator column (no historical dependency)
ALTER TABLE public.billing_global_defaults    DROP COLUMN IF EXISTS payment_facilitator_fee;
ALTER TABLE public.property_billing_configs   DROP COLUMN IF EXISTS payment_facilitator_fee;
```

(Grants unchanged — table already exists.)

## Out of scope
- Contract template tokens: no change (they read the underlying fields, not the strategy slug).
- `calculate-billing` edge function: no change (already field-driven, incl. portfolio aggregator and white-label).
- PriceLabs / Sales Rep / Portfolio aggregator UI blocks: unchanged.

## Files touched
- `src/pages/AdminBillingDefaults.tsx` — rewrite strategy list → preset library + builder.
- `src/components/admin/billing/BillingConfigBuilder.tsx` — new shared toggle-based editor.
- `src/components/property/BillingConfigTab.tsx` — preset dropdown + builder, remove legacy field.
- `src/components/property/AdminOverviewTab.tsx` — toggle-aware summary + estimated cost tweak.
- `src/components/admin/billing/StrategySummaryLine.tsx` — toggle-aware line.
- Migration as above.
