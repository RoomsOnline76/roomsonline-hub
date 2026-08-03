# Stop Rentals United building duplication

## What is actually happening (verified)

- Tidal Pools stores `rentalsunited_building_id = 48103` on the property record.
- Every inventory push for Tidal Pools runs the **building flow**: it calls `Push_PutBuilding_RQ` before pushing the units. No caller ever requests the alternative standalone-unit mode — the flag exists in `push-property-to-ru` but nothing in the app or crons sets it.
- Callers that trigger this on every run: the property push button, RU onboarding pipeline, currency panel, RU certification console (mandatory phase), `cron-refresh-ru-ari`, and `cron-push-all-properties-to-ru`. Between 21:56 and 22:55 today alone there were 10 pushes for this one property, each one issuing a building call.
- Our building mapping history shows a new RU BuildingID recorded per push cycle (46961, 46971, 46988, 47007, 48092, 48102, 48103, …) — i.e. RU created a fresh "Tidal Pools Self Cat" building each time rather than updating the existing one. The current code hides this by keeping the old ID locally when RU returns a different one, so the duplicates keep accumulating in the RU portal unnoticed.
- The building name is truncated to 20 chars, which is why every duplicate reads "Tidal Pools Self Cat".

Conclusion: buildings are not needed for this inventory model (each unit is pushed as its own RU property), and the building call is the sole source of the duplicates.

## The fix

1. **Make no-building the default.** Units are pushed as standalone RU properties with no `<BuildingID>`; `Push_PutBuilding_RQ` is not called at all during normal pushes, ARI refreshes, cron runs, or certification. The building flow becomes opt-in only (explicit request flag), so nothing can create a building implicitly.
2. **Guard the building call.** In the RU adapter, `push_building` only creates a *new* building when the caller explicitly asks for creation. Any call without an explicit create intent and without a stored BuildingID is refused instead of silently creating inventory. When RU returns a different BuildingID than the one we asked to update, treat it as an error (duplicate created) and surface it instead of quietly discarding it.
3. **Unlink units from stale buildings.** Existing unit pushes stop sending `BuildingID`/building-derived `ObjectTypeID`; ObjectTypeID falls back to the property type as the standalone path already does. Clear `rentalsunited_building_id` on the property once units are confirmed pushed standalone, so future runs cannot re-enter the building flow.
4. **Duplicate cleanup tool.** New "Buildings" panel in the RU white-label sync page: lists every building on the sub-user account (`Pull_ListBuildings_RQ`), flags duplicates by name, shows which of our records reference them, and lets us mark the stale ones as retired in our mapping table. RU's API has no building-delete method, so the panel will state plainly that the leftover 20+ empty buildings must be removed by RU support / in the RU portal, and will produce the exact ID list to hand over.
5. **Onboarding push gap.** The onboarding pipeline push will be exercised after the change to confirm it now creates/updates the four unit properties (ELF, GEELSTERT, LEERVIS, WILDEPERD) and creates no building.

## Technical notes

- `supabase/functions/push-property-to-ru/index.ts`: invert the multi-unit default to the standalone branch; remove the building/ObjectTypeID lookup from the default path; keep the building branch behind an explicit `use_building: true` request flag; stop writing `rentalsunited_building_id` unless that flag is used.
- `supabase/functions/rentalsunited-api/index.ts`: `push_building` requires either a `building_id > 0` (update) or `create: true`; mismatched returned BuildingID becomes `RU_BUILDING_DUPLICATE`.
- `pms_mappings` building rows gain a retired marker via metadata; no schema change needed.
- New component `src/components/integrations/RuBuildingsPanel.tsx`, mounted in `AdminRentalsUnited.tsx`.
- `PushToRentalsUnited.tsx`: building ID field becomes read-only/diagnostic with a "clear" action instead of driving the push mode.
