---
name: RU Distances XML shape
description: Verified Push_PutProperty Distances block shape — DestinationID/DistanceUnitID/DistanceValue child elements, in that order
type: feature
---

Rentals United ignores attributes on `<Distance>`. Verified working shape (Status 0 on all units of
property 700a9471-6c1d-4ad5-b889-1f3c71a0e9fc, 2026-08-20):

```xml
<Distances>
  <Distance>
    <DestinationID>491</DestinationID>
    <DistanceUnitID>1</DistanceUnitID>
    <DistanceValue>0.1</DistanceValue>
  </Distance>
</Distances>
```

Element order matters (RU deserialises a sequence). Diagnostic history:
- `<Distance DestinationID=".." DistanceUnit="1">0.1</Distance>` → `Wrong destination id:0`, and with
  several entries `Duplicate value in distances` (every id parsed as 0).
- `<DistanceUnit>` child → `Wrong distance unit id:0`; the correct name is `DistanceUnitID` (1 = km).

Block sits after `<Coordinates>`, omitted entirely when nothing maps. `push-property-to-ru` accepts a
`distance_limit` body param for probing.
