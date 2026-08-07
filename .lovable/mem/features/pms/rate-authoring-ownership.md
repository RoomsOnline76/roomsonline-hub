---
name: Rate authoring ownership
description: Calendar owns season dates; Rate Plans owns commercial rates and unit links. Rate compatibility shims must stay until every property is on unified mode.
type: feature
---
**The rule (state it in these words everywhere):** Calendar = seasons only (when). Rate Plans = commercial rates and unit links (what it costs).

- `/pms/rate-plans` is the single rate configurator for ROL'OS properties. Season dates render read-only there; they are painted only in the Calendar.
- Admin → Edit Property → Rates & Pricing is **read-only** for ROL'OS properties (summary + "Manage Rate Plans in ROL'OS" deep link); legacy Rate Types / Seasons / Rate Breakdown sub-tabs are hidden. Non-ROL'OS properties get the same configurator fully editable, legacy sub-tabs intact.
- Rate resolution is an adapter boundary: all consumers get `{ rate, tier, restrictions }` from one resolver backed by the pure engine `supabase/functions/_shared/ratePricing.ts`. New pricing behaviour goes into the engine as a new tier, never into a consumer.
- Kill switch: `properties.rate_resolution_mode`, default `legacy`, read per request. Rollback = one UPDATE, no deploy. Never roll back a pricing problem by deleting data.
- **Do not remove any rate compatibility shim** (legacy resolver tiers, `rolos_rate_prices` mirror, `amenities.pms_rate_types` trigger pair, shadow parity logging) until every property is `unified`. Preconditions in `docs/rates-shim-inventory.md`.
- `rolos_v_effective_rates` is a verification-only artifact — never wire application code to it.
- Reference docs: `docs/architecture/rate-plans-adapter-note.md`, `docs/verification/rate-plans-merge-gate.md`, `docs/rates-shim-inventory.md`.
