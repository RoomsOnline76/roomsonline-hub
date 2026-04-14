

## Fix: Units Not in Building Folder + Missing Seasons/Rates

### Root Causes

**1. Units not assigned to building**
The `BuildingID` element IS included in the property XML (line 392 of `rentalsunited-api/index.ts`), but the issue is likely that these 9 units were created in RU during an earlier push attempt BEFORE the building was created (or before the building fix was applied). RU created them as standalone properties. Now, even though subsequent pushes include `<BuildingID>46833</BuildingID>`, the RU API may not reassign existing standalone properties to a building via `Push_PutProperty_RQ` — it may require calling `Push_PutBuildingProperties_RQ` to explicitly assign properties to a building.

**2. No seasons/rates on units**
The `pushARI` function reads `property.amenities.seasons` and `property.amenities.season_rates`. The data EXISTS (3 seasons, rates defined), and the code path looks correct. However, ARI errors are silently absorbed — the unit result shows `success: true` even if availability/pricing pushes fail. The likely cause: the availability/pricing push returned an error that was captured in `ariResult` but not surfaced to the user or logged clearly.

### Plan

**File: `supabase/functions/rentalsunited-api/index.ts`**

1. Add a new action `assign_building_properties` that sends `Push_PutBuildingProperties_RQ` XML to explicitly assign a list of RU property IDs to a building:
   ```xml
   <Push_PutBuildingProperties_RQ>
     <Authentication>...</Authentication>
     <BuildingID>46833</BuildingID>
     <PropertyIDs>
       <PropertyID>4692142</PropertyID>
       <PropertyID>4692143</PropertyID>
       ...
     </PropertyIDs>
   </Push_PutBuildingProperties_RQ>
   ```
2. Add a helper `buildAssignBuildingPropertiesXml` function.

**File: `supabase/functions/push-property-to-ru/index.ts`**

3. After pushing all units in the multi-unit flow (after the unit loop, around line 600), add a final step that calls `assign_building_properties` with the building ID and all successfully-pushed unit RU IDs. This explicitly groups them into the building folder.

4. Add better error surfacing for ARI pushes — include `availability_error` and `prices_error` in the unit results so they are visible in the UI response, and log them clearly.

5. Re-push ARI: After assigning units to the building, ensure the availability and pricing push runs for each unit. Add logging before the `pushARI` call to confirm it's being reached with valid season data.

**Testing**: After deployment, re-push Seesig. Verify:
- All 9 units appear under building 46833 in RU
- Each unit has availability periods and pricing pushed

### Technical Details

- The `Push_PutBuildingProperties_RQ` is the correct RU API method for assigning existing properties into a building folder
- No schema or migration changes needed
- The `pushARI` function itself is correct — the issue is likely silent error handling or the push simply not being invoked for units with `unitRuId = '0'`

