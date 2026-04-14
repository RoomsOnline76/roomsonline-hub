

## Fix Push_PutProperty_RQ — Name Tag and Coordinate Order

### Root Cause
Two issues found by comparing our XML against the official RU example (visible on developer.rentalsunited.com):

**Bug 1: `<Name>` wraps text in `<Text>` — RU expects plain text**
- Our code (line 362): `<Name><Text>Seesig</Text></Name>`
- RU expects: `<Name>Seesig</Name>`
- The `<Text>` wrapper is only valid inside `<Description>`, not `<Name>`. This causes RU to reject the XML as malformed.

**Bug 2: Coordinate element order is reversed**
- Our code: `<Latitude>` then `<Longitude>`
- RU example: `<Longitude>` first, then `<Latitude>`
- XSD strict ordering means wrong order = validation failure.

### Changes

**File: `supabase/functions/rentalsunited-api/index.ts`**

1. Line 362: Change `<Name><Text>${escapeXml(prop.name)}</Text></Name>` to `<Name>${escapeXml(prop.name)}</Name>`

2. Lines 376-377: Swap coordinate order from:
```xml
<Latitude>${prop.latitude}</Latitude>
<Longitude>${prop.longitude}</Longitude>
```
to:
```xml
<Longitude>${prop.longitude}</Longitude>
<Latitude>${prop.latitude}</Latitude>
```

Then redeploy `rentalsunited-api`.

