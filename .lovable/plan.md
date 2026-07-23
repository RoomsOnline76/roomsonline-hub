## Rework `/admin/billing-defaults` + align per-property billing UI

Goal: turn Billing Defaults into a single, opinionated source-of-truth screen that (a) drives sane per-property defaults for every fee we bill, (b) makes zero-value fields collapse behind an "Enable" toggle, and (c) exposes the same shape in the property Admin tab and the ROLOS overview.

### 1. Schema additions

New migration on `billing_global_defaults` and `property_billing_configs` (mirror both, so per-property override always exists):

- `white_label_setup_fee` numeric — once-off
- `white_label_billing_mode` text: `"monthly" | "annual"` (defaults to monthly)
- `branding_addon_allowed` boolean (non-white-label branding pack)
- `branding_addon_monthly_fee` numeric
- `branding_addon_setup_fee` numeric
- `branding_addon_billing_mode` text
- `pricelabs_setup_fee` numeric  *(PriceLabs stays per-property, flat — never portfolio-scaled)*
- `channel_manager_per_unit_fee` numeric (default R60) on defaults
- On `property_billing_configs`: `channel_manager_enabled` boolean, `channel_manager_per_unit_fee` numeric (override)
- On `billing_global_defaults`: `sales_rep_tier_criteria_json` jsonb — stores the Base / Accelerated / Elite definitions (thresholds + rate overrides), single row on the `default` strategy or a dedicated `sales_rep_config` singleton row.

Grants + timestamps handled per project rules.

### 2. `AdminBillingDefaults.tsx` rework

Convert from "grid of near-identical strategy cards" to a **tabbed page**:

```text
┌ Summary ─ Strategies ─ Add-ons ─ Sales Reps ─ Notes ┐
```

**Strategies tab** — one card per strategy, but each fee row uses a `<FieldToggleRow>`:
- If value is 0/null → collapsed to a switch "Enable {field}".
- Toggling on reveals the numeric input pre-filled with the platform suggested default.
- Fields per strategy stay the same set (commission, subscription, transaction, tier table) — irrelevant ones are hidden per existing `showX` logic.
- ROLOS PMS card gets a new **Channel Manager per-unit fee** field (default R60/unit/month) with the same toggle pattern.

**Add-ons tab** — global defaults for cross-strategy modules, each with monthly/annual/setup + toggle:
- White-Label (monthly OR annual + setup fee)
- Branding pack (non-white-label look-and-feel override) — monthly/annual + setup
- PriceLabs — flat per-property monthly + optional setup. Copy explicitly states: *"Applied per activated property regardless of owner/portfolio size — no volume scaling."* Remove/hide the sliding-scale UI here.
- Channel Manager per-unit (mirror of ROLOS PMS card for quick reference)

**Sales Reps tab** — existing First-Year / Residual / Duration / Clawback fields, plus a new `TierCriteriaEditor` with three rows (Base / Accelerated / Elite). Each row: min properties signed, min monthly recurring, first-year rate override, residual override, notes. Persisted to `sales_rep_tier_criteria_json`.

**Summary tab** — replaces today's dense grid. Presented as a plain-language digest, grouped:
- *"How we make money"*: one sentence per active strategy (e.g. "Widget: 10% on the first R50k GMV/mo, dropping to 5% above.").
- *"Platform add-ons"*: three lines (White-Label R… + setup, Branding R…, PriceLabs R…).
- *"ROL'OS PMS"*: subscription + per-unit channel manager fee.
- *"Sales rep economics"*: current default first-year %, residual %, months, clawback, and tier thresholds.
- Each block has an "Edit" button jumping to the relevant tab.

**Notes tab** — merged free-text notes per strategy (kept for internal ops).

Shared components introduced under `src/components/admin/billing/`:
- `FieldToggleRow.tsx` — the "zero → toggle" pattern.
- `MonthlyAnnualSetup.tsx` — three-input combo for add-ons.
- `TierCriteriaEditor.tsx` — sales-rep tier grid.
- `StrategySummaryLine.tsx` — natural-language line per strategy.

### 3. Per-property parity

`src/components/property/BillingConfigTab.tsx`:
- Add PropertyLevel toggles for White-Label (monthly + setup), Branding add-on, Channel Manager per-unit enable, PriceLabs — all seeded from `getDefaultsForStrategy(...)` or the new add-on defaults.
- Reuse `FieldToggleRow` and `MonthlyAnnualSetup` so the property screen looks identical to the defaults screen.
- Remove the existing "Apply to portfolio" checkbox for PriceLabs (feature is per-property by policy).

`src/components/property/AdminOverviewTab.tsx`:
- Extend "Revenue Add-ons" and "White-Label" rows to show setup fee, billing mode, and branding pack status.
- Add new "Channel Manager" row (fee/unit × active units estimate).

### 4. ROLOS mirror

`src/pages/pms/PMSPropertySetup.tsx` (and any owner-facing billing summary) reads the same `property_billing_configs` fields via the existing `useBillingConfig` hook — no owner-editable controls, just a read-only mirror of what admin enabled. Update `useBillingConfig` / `BillingConfig` type to include the new columns.

### 5. Billing engine

`supabase/functions/calculate-billing/index.ts` (and `contractBillingVariables.ts` for the contract template):
- Line-item any of the new fees when their enable flag is true.
- Channel Manager fee = `per_unit_fee × active_room_count` for ROLOS PMS properties.
- Setup fees emitted only in the first billing period after `billing_start_date`.

### Technical notes
- `useBillingDefaults` and `useBillingConfig` types extended; no breaking rename of existing columns.
- Sales-rep tier JSON shape: `{ base:{min_props,min_mrr,first_year_rate,residual_rate}, accelerated:{…}, elite:{…} }`.
- All new numeric fields default to `null`, matching the "zero → hidden with toggle" UX (null = disabled).
- No changes to PMS adapters or booking flow.

### Out of scope
- No changes to invoicing/PDF layout beyond adding new line items.
- Sales-rep payout calculation refactor (separate task) — this only stores criteria + rates.
