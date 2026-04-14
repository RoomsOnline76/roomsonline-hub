
Goal: finish the RU unit-type fix properly. The previous work is not complete because the current code already sends both pieces we thought were missing, yet RU buildings still show 0 unit types.

What I verified
- `push-property-to-ru` already aggregates active room types and sends `unit_types` in the building push.
- `rentalsunited-api` already sends:
  - building XML with `<Composition><UnitsComposition>...`
  - property XML with `<BuildingID>`
- So the unresolved issue is no longer “missing logic”; it is most likely one of:
  1. the building XML shape/order is still wrong for RU’s schema,
  2. the property XML placement of `<BuildingID>` is still wrong,
  3. RU accepts the request but ignores the fields silently.

Implementation plan
1. Add proper request typing and diagnostics
- Extend the `RequestBody` type in `supabase/functions/rentalsunited-api/index.ts` to explicitly include `unit_types`.
- Return/log the exact compact XML used for `push_building` and `push_property` so we can confirm the live payload, not just assume it.

2. Rework RU building XML to match schema more defensively
- Update `buildPushBuildingXml` to support the exact field ordering/shape RU expects.
- Make the composition block builder isolated so we can adjust tag names/order without touching the rest of the adapter.
- Keep name truncation, but preserve original room-type naming logic from the property data.

3. Re-audit property XML ordering around building assignment
- Revisit `buildPushPropertyXml` and place `<BuildingID>` in the safest schema position relative to neighboring fields.
- Ensure no unintended ordering regressions exist around `PropertyTypeID`, `NoOfUnits`, `Floor`, `BuildingID`, `Street`, and coordinates.

4. Improve multi-unit push verification flow
- In `push-property-to-ru`, include richer per-step results:
  - building XML preview
  - unit XML preview
  - returned RU IDs
- This makes failures visible in the UI instead of looking “successful” while RU ignores the linkage.

5. End-to-end validation against live RU
- Redeploy the RU functions.
- Re-push one affected building (SEESIG) and one test building.
- Verify whether unit types appear after the new payload shape.
- If still not visible, inspect RU responses/logs and do one more schema correction pass before closing the task.

Files to update
- `supabase/functions/rentalsunited-api/index.ts`
- `supabase/functions/push-property-to-ru/index.ts`
- optionally `src/components/property/PushToRentalsUnited.tsx` if we surface the new diagnostics in the panel

Expected outcome
- RU building pushes use a schema-accurate composition payload.
- Unit property pushes attach to the building with the correct XML ordering.
- SEESIG and the test buildings show actual unit types in RU, not just a successful push response.

Technical note
Right now the code proves the earlier hypothesis was incomplete: the Composition block and BuildingID assignment are already present. The next fix must focus on exact RU XML compatibility plus live verification, not just adding more fields.
