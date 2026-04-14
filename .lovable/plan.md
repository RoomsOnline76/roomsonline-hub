

## Fix: Building Created Without Unit Types — Root Cause Analysis

### What I Found

1. **The `<Composition>` block IS being sent** in the building XML and RU accepts it (Status 0), but it appears to be **silently ignored**. RU docs confirm unit types are created by pushing properties with `<BuildingID>` and `<NoOfUnits>`, not via a Composition block on the building.

2. **The real issue: `<BuildingID>` position in property XML violates XSD order.** Currently the XML outputs:
   ```
   <NoOfUnits>1</NoOfUnits>
   <BuildingID>46843</BuildingID>   ← wrong position
   <Floor>0</Floor>
   ```
   RU's XSD has a strict element order. `<BuildingID>` likely needs to be placed elsewhere (probably after `<Floor>` or in a different position), and when it's in the wrong spot, RU silently ignores it — the property is created but NOT linked to the building.

3. **Logs confirm** properties were pushed with building ID 46843, but they show "0 Unit types" in RU dashboard, meaning the `<BuildingID>` tag is being ignored due to incorrect positioning.

### Changes

**1. `supabase/functions/rentalsunited-api/index.ts`**
- Move `<BuildingID>` to the correct XSD position in `buildPushPropertyXml`. Based on the RU XSD, `<BuildingID>` should come right after `<Floor>` (before `<Street>`).
- Add a debug log that prints the full XML (first 1000 chars) for building pushes to confirm the Composition block content.
- Keep the `<Composition>` block in `buildPushBuildingXml` as a fallback (it doesn't hurt).

**2. `supabase/functions/push-property-to-ru/index.ts`**  
- No changes needed — it already passes `building_id` correctly.

**3. Verification step**
- After deploying, I'll use the edge function curl tool to push a test property with the corrected `<BuildingID>` position and verify it appears under the building in the list_buildings response.

### Expected Outcome
- Properties pushed with `<BuildingID>` in the correct XSD position will be linked to the building.
- RU dashboard will show the correct unit type count.

