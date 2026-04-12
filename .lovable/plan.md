

## Fix Push_PutProperty_RQ — Three Bugs

### Bug 1: XML element ordering
RU error: `"The element 'Property' has invalid child element 'IsActive'. List of possible elements expected: 'Name'."`

The `<IsActive>` and `<IsArchived>` tags are placed **before** `<Name>` (line 344-345). RU's XSD requires `<Name>` first. Move these two tags to the **end** of the `<Property>` block, just before `</Property>`.

### Bug 2: Location ID not parsed from response
The RU response uses an **attribute**: `<Location LocationID="83272" ...>`, but the regex on line 742 looks for `<LocationID>(\d+)</LocationID>` (an element). Fix the regex to: `LocationID="(\d+)"`.

### Bug 3: SEESIG max_guests is 2
Room types sum to 24 (7+6+5+6). Update the property record to `max_guests = 24`.

### Changes

**File: `supabase/functions/rentalsunited-api/index.ts`**
- Move `<IsActive>1</IsActive>` and `<IsArchived>0</IsArchived>` from after `<ID>` to just before `</Property>` (after CheckOutUntil)
- Fix regex on line 742: `/<LocationID>(\d+)<\/LocationID>/` → `/LocationID="(\d+)"/`

**Database:**
- `UPDATE properties SET max_guests = 24 WHERE id = '76f524f3-8229-4097-b45d-18489f897195'`

