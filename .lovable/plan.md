

## Fix: Building Created Without Unit Types

### Problem
The `Push_PutBuilding_RQ` XML only sends `<BuildingName>` but omits the `<Composition>` block that defines unit types and their quantities. RU requires this block for units to appear inside the building. That's why the dashboard shows "0 Unit types".

### Required XML Structure
```xml
<Push_PutBuilding_RQ>
  <Authentication>...</Authentication>
  <BuildingID>46840</BuildingID>          <!-- for updates -->
  <BuildingName>Fonteinhutte Self-Ca</BuildingName>
  <Composition>
    <UnitsComposition>
      <UnitType>
        <UnitTypeName>ALBATROS</UnitTypeName>
        <Quantity>1</Quantity>
      </UnitType>
      <UnitType>
        <UnitTypeName>ANEMOON</UnitTypeName>
        <Quantity>1</Quantity>
      </UnitType>
      <!-- ... one per distinct room type name -->
    </UnitsComposition>
  </Composition>
</Push_PutBuilding_RQ>
```

### Changes

**1. `supabase/functions/rentalsunited-api/index.ts`**
- Update `buildPushBuildingXml` to accept a `unitTypes` parameter: `Array<{ name: string; quantity: number }>`.
- When provided, append a `<Composition><UnitsComposition>` block with one `<UnitType>` per entry.
- Update the `push_building` action handler to pass `body.unit_types` through.

**2. `supabase/functions/push-property-to-ru/index.ts`**
- Before calling `push_building`, aggregate `activeRoomTypes` by name to build the unit types array (each distinct room type name with a count).
- Pass this array in the `push_building` request body as `unit_types`.

### Expected Outcome
- Building is created/updated with unit type definitions matching the active room types.
- Units pushed with `<BuildingID>` are properly linked to their unit types within the building.
- RU dashboard shows the correct unit type count and unit assignments.

