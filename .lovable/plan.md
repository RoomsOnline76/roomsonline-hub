

## Fix Push_PutProperty_RQ: Two XML Structure Bugs

### Problem
Two XML formatting issues are causing all RU pushes to fail with Error 127:

**Bug 1 — IsActive/IsArchived placement**: Currently placed as children of `<Push_PutProperty_RQ>` (sibling of `<Property>`). RU expects them **inside** the `<Property>` element.

**Bug 2 — Location lookup XML**: Uses a `<Coordinates>` wrapper around `<Latitude>`/`<Longitude>`, but RU expects them as **direct children** of `<Pull_GetLocationByCoordinates_RQ>` (no wrapper).

### Changes

**File: `supabase/functions/rentalsunited-api/index.ts`**

1. Move `<IsActive>1</IsActive>` and `<IsArchived>0</IsArchived>` from lines 342-343 (outside `<Property>`) to inside `<Property>` (after `<ID>`), so the structure becomes:
```xml
<Push_PutProperty_RQ>
  <Authentication>...</Authentication>
  <Property>
    <ID>...</ID>
    <IsActive>1</IsActive>
    <IsArchived>0</IsArchived>
    <Name>...</Name>
    ...
  </Property>
</Push_PutProperty_RQ>
```

2. Fix the location lookup XML (line ~735) — remove the `<Coordinates>` wrapper:
```xml
<!-- Before -->
<Pull_GetLocationByCoordinates_RQ>...<Coordinates><Latitude>X</Latitude><Longitude>Y</Longitude></Coordinates></Pull_GetLocationByCoordinates_RQ>

<!-- After -->
<Pull_GetLocationByCoordinates_RQ>...<Latitude>X</Latitude><Longitude>Y</Longitude></Pull_GetLocationByCoordinates_RQ>
```

### Expected outcome
- Error 127 should be resolved, allowing property data to push successfully
- Location lookup should return a valid `DetailedLocationID` instead of falling back to `1`
