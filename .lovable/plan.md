

## Fix: Duplicate Building + Units Not in Building + ARI Ownership Errors

### Root Causes

**1. Duplicate building created every push**
`buildPushBuildingXml` accepts `_buildingId` but never uses it. The XML always sends only `<BuildingName>` without `<BuildingID>`, so RU creates a brand new building every time. The existing building 46833 (and now 46838) is never updated.

**Fix**: Include `<BuildingID>` in the XML when an existing building ID > 0 is provided. This tells RU to update the existing building instead of creating a new one.

**2. `Push_PutBuildingProperties_RQ` doesn't exist**
The RU API returned "not implemented method" — this API call doesn't exist. However, the property push XML already includes `<BuildingID>` (line 393), which should assign units to the building at creation time. The real problem is that these units were originally created without a valid building ID, and now re-pushing them with `<BuildingID>` may not reassign them.

**Fix**: Since the property XML already includes `<BuildingID>`, the assignment should work if the building ID is correct and consistent. Remove the `assign_building_properties` action (it's not a valid RU method). Instead, rely on the `<BuildingID>` in each unit's property push XML. For the already-orphaned units, the re-push with the correct building ID should reassign them.

**3. ARI "not the owner" errors**
The units (4692138–4692146) were created under building 46838 with OwnerID 738925. The "not the owner" error on pricing suggests the units may need to be fully validated/activated in RU before ARI can be pushed, or the building assignment needs to complete first.

### Changes

**File: `supabase/functions/rentalsunited-api/index.ts`**

1. Fix `buildPushBuildingXml` to include `<BuildingID>` when updating an existing building:
```xml
<!-- Create new -->
<Push_PutBuilding_RQ><Auth/><BuildingName>SEESIG</BuildingName></Push_PutBuilding_RQ>

<!-- Update existing -->
<Push_PutBuilding_RQ><Auth/><BuildingID>46833</BuildingID><BuildingName>SEESIG</BuildingName></Push_PutBuilding_RQ>
```

2. Remove the `assign_building_properties` action — it's not a valid RU API method.

**File: `supabase/functions/push-property-to-ru/index.ts`**

3. Remove the Step 5 `assign_building_properties` call entirely. The building assignment is already handled by `<BuildingID>` in each unit's property XML (line 393 of rentalsunited-api).

4. Before the push, verify that `buildingId` from Step 1 is correctly passed to `buildUnitPayload` so each unit's XML includes the right `<BuildingID>`.

### Expected Outcome After Fix
- Push uses existing building ID (46833) — no duplicate created
- Each unit's property XML includes `<BuildingID>46833</BuildingID>`
- Units appear inside the building folder in RU
- ARI pushes succeed once units are properly owned/assigned

### Data Cleanup Note
Buildings 46838 (and any other duplicates) will need to be cleaned up in RU. After the fix deploys, you should re-push Seesig to update all units with the correct building ID 46833.

