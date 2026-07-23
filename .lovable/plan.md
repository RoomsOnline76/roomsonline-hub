
## Goal

For the **Widget — Tiered Commission** strategy the commission % is defined entirely by the configurable volume tiers. Showing a separate flat "Commission rate (% of booking)" field is misleading and duplicative. Remove it from the widget strategy in both admin and property UIs, and reflect the tiers wherever commission is summarised. White-label and BYO gateway add-ons remain available and layer on top unchanged.

## Changes

**1. `src/pages/AdminBillingDefaults.tsx`**
- Hide the "Commission rate (% of booking)" `FieldToggleRow` when `item.strategy === "widget"`.
- Keep the field visible for `default` and `rolos_pms` (fixed % strategies).
- The Widget Tier Editor (`WidgetTierEditor`) already renders below and remains the single source of truth for widget commission.

**2. `src/components/property/BillingConfigTab.tsx`**
- Update `showCommission` to exclude `widget`:
  ```
  const showCommission = ["default", "rolos_pms"].includes(strategy);
  ```
  (Volume-tiered is per-unit fee only — already conceptually excluded; keeping current behaviour for it.)
- For `strategy === "widget"`, render a read-only informational block in place of the input that says commission is defined by the volume tiers configured in Admin → Billing Defaults, and lists the current effective tier if resolvable (reuse `resolvePropertyTier` pattern already used for volume-tiered), otherwise a short "Tiers configured centrally" hint.

**3. `src/components/property/AdminOverviewTab.tsx`**
- In the summary rows: when `billing_strategy === "widget"`, suppress the flat "Commission %" row and instead show "Commission: tiered (see Widget tiers)".
- Estimated Client Cost: no numeric change (widget commission is volume-dependent and already excluded from monthly recurring estimate).

**4. `src/components/admin/billing/StrategySummaryLine.tsx`**
- For `widget`, drop the `commission_rate` chunk from the summary and append "tiered by monthly volume" instead.

**5. Descriptions**
- Update the Widget strategy description in `STRATEGY_LABELS` / `STRATEGY_OPTIONS` (both `AdminBillingDefaults.tsx` and `BillingConfigTab.tsx`) to: *"Property uses ROL's booking engine (WBE) on their own site. Commission is tiered by monthly booking volume — configure the tiers in Admin → Billing Defaults. Optional white-label domain and/or BYO gateway add-ons can layer on top."*

## Out of scope

- No schema changes — `commission_rate` column is retained (still used by `default` and `rolos_pms`).
- No changes to how widget tiers are stored or evaluated.
- Contract variables: `{commission_rate}` token will resolve to the effective tier % for widget properties via the existing `resolvePropertyTier` path used for tier clauses; no template edits required unless a follow-up asks for it.
