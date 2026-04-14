

## Fix Push Building to Rentals United

### Root Cause (two issues)

1. **Wrong XML structure**: Our `buildPushBuildingXml` wraps the building data in a `<Building>` element with `<BuildingID>`. The RU API docs show `<BuildingName>` should be a **direct child** of `<Push_PutBuilding_RQ>` — no `<Building>` wrapper, no `<BuildingID>` in the request.

2. **BuildingName too long**: RU limits `BuildingName` to **20 characters**. "SEESIG Self Catering CHALETS" is 29 characters, causing the "Unexpected error" (error 17).

### RU API Expected XML
```text
<Push_PutBuilding_RQ>
  <Authentication>
    <AccessKey>...</AccessKey>
    <SecretKey>...</SecretKey>
  </Authentication>
  <BuildingName>SEESIG CHALETS</BuildingName>
</Push_PutBuilding_RQ>
```

Response returns `<BuildingID>` which we save.

### Changes

**File: `supabase/functions/rentalsunited-api/index.ts`**

1. Fix `buildPushBuildingXml` to remove the `<Building>` wrapper and `<BuildingID>` element. Place `<BuildingName>` directly under root.
2. Truncate `buildingName` to 20 characters max.

**File: `supabase/functions/push-property-to-ru/index.ts`**

3. When constructing the building name, use a shorter version (e.g. truncate or abbreviate) to fit the 20-char limit.

