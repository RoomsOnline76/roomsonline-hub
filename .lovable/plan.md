## Problem (confirmed)

Dassiesingel Self-catering Units has `external_system = 'roomsonline'` (ROLOS native, no external PMS).

The activation quality gate (`supabase/functions/check-activation-readiness/index.ts`) only recognises the literal string `'rol'` as internally managed. `'roomsonline'` falls through to the `default` branch of `getPMSPropertyCode`, which returns `null`, so the gate emits:

> PMS Integration — "roomsonline connected but no External Property ID linked" (severity: **blocker**)

That is the single blocker preventing activation. The frontend alias list already defines the correct set (`src/lib/pmsIdentity.ts` → `ROLOS_PMS_ALIASES = ["roomsonline", "rolos", "rol_os", "rolos_pms"]`), but the edge function never got it.

## Fix

In `check-activation-readiness`:

1. Add a local alias set for native ROLOS management: `rol`, `rolos`, `roomsonline`, `rol_os`, `rolos_pms` (mirroring `ROLOS_PMS_ALIASES` plus the legacy `rol`).
2. In `checkPMSConflicts`, match `external_system` against that set (case-insensitive) and return a passing `info` result — "ROLOS-managed property (internal inventory)" — before the external-code lookup and before the sandbox-mode lookup (there is no `pms_tracker_status` row for a native system, so that path is also meaningless here).
3. Make `getPMSPropertyCode` / `getPMSCodeLabel` return `'internal'` / `'Internal Property'` for every alias, so any other consumer of those helpers stays consistent.
4. Redeploy the function and re-check readiness for Dassiesingel so the blocker clears and the score recalculates.

No database changes, no property-data edits, no UI changes needed — the indicator reads straight from this function.

## Technical notes

- Only `checkPMSConflicts` and the three `getPMS*` helpers change; all other checks (images, description, rates, contract, RU readiness) are untouched.
- Keeping `'rol'` in the alias set preserves behaviour for any legacy rows still using it.
