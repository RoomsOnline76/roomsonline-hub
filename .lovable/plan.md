## Goal
Restrict the **PriceLabs add-on** to properties whose PMS is ROL'OS. Admin still configures the price/allowance in Billing Defaults + per-property Billing config, but the actual **on/off activation moves back into the ROL'OS PriceLabs tab** — only usable once admin has "allowed" it.

## Changes

### 1. `src/components/admin/billing/BillingConfigBuilder.tsx`
- Relabel the PriceLabs ToggleRow:
  - Title: *"PriceLabs revenue management (ROL'OS only)"*
  - Description: *"Allow this property to enable PriceLabs from the ROL'OS revenue tab. Only applicable when PMS = ROL'OS. Fee bills only after the client activates in ROL'OS."*
- Add a small helper caption under the fee input: *"Charged only once the property activates PriceLabs in ROL'OS."*
- (No hard-disable here — the builder is also used to author generic presets. Property-level gating happens in `BillingConfigTab`.)

### 2. `src/components/property/BillingConfigTab.tsx`
- Read `pms_system` from the property record.
- Compute `isRolos = pms_system === 'rolos'`.
- Pass a new `disabledAddons={{ pricelabs: !isRolos }}` prop into `BillingConfigBuilder`, and when disabled, force `pricelabs_enabled` off on save and render the toggle as disabled with an inline note *"Available only when PMS is ROL'OS."*
- `BillingConfigBuilder` gains an optional `disabledAddons` prop and applies `disabled` to the switch + fee input for any listed add-on.

### 3. `src/pages/pms/PMSPriceLabs.tsx` — client-side activation
- Current state: `pricelabsAllowed` (admin gate) is read, but there's no user-side on/off. Add a **"Enable PriceLabs for this property"** switch shown only when `pricelabsAllowed === true`.
- Switch is bound to `properties.pricelabs_config.enabled` (already in the `PriceLabsConfig` type, currently unused). Toggling writes via the existing `saveConfig` mutation.
- When `pricelabsAllowed` is false → show the existing "Not enabled by admin" alert (already present).
- When `pricelabsAllowed` is true but `cfg.enabled !== true` → show a soft banner *"PriceLabs is available for this property. Enable it to start pulling suggestions."* and gate the Push / Pull / apply actions behind `cfg.enabled === true`.
- Add an outbound note in the header: fee (`R{pricelabs_monthly_fee}/mo`) begins on activation.

### 4. Billing emission — `supabase/functions/calculate-billing/index.ts`
- Existing `pricelabs_fee` emission currently keys off `config.pricelabs_allowed` + `pricelabs_monthly_fee`. Change to require BOTH:
  - `config.pricelabs_allowed === true` AND
  - `properties.pricelabs_config.enabled === true`
- Also skip emission if `properties.pms_system !== 'rolos'` (belt-and-braces).
- Fetch `pms_system` and `pricelabs_config` alongside the existing property read (single extra column pair).

### 5. `src/components/property/AdminOverviewTab.tsx` — Estimated Client Cost
- PriceLabs recurring/setup lines: only include when `pricelabs_allowed` AND the property's `pricelabs_config.enabled` AND `pms_system === 'rolos'`. Otherwise show a muted "PriceLabs — allowed, awaiting client activation" note under the surcharge/add-ons list (no rand amount added to total).

## Out of scope
- No schema changes (uses existing `properties.pricelabs_config` JSONB and `property_billing_configs.pricelabs_allowed`).
- No changes to the `pricelabs-api` edge function or the suggestions data flow — the gate is purely on activation + billing emission.
- No changes to Sales Rep commission logic (PriceLabs fee remains in `baseRevenue` per the current preset behaviour).
