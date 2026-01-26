
# Fix HotelBeds Calendar Sync Validation Error

## Problem

The HotelBeds calendar sync is failing with a non-2xx (400) edge function error because of a parameter naming mismatch between the frontend and the edge function schema.

**Frontend sends (CalendarAccommodation.tsx):**
```javascript
{
  action: "fetch_availability",
  property_id: "...",
  propertyUid: "99994",
  startDate: "2026-01-01",   // camelCase
  endDate: "2026-01-31"      // camelCase
}
```

**HotelBeds schema expects (hotelbeds-api/index.ts):**
```javascript
{
  start_date: "2026-01-01",  // snake_case
  end_date: "2026-01-31"     // snake_case
}
```

Other PMS adapters (hostfully-api, benson-api) use **camelCase** (`startDate`, `endDate`), so the frontend uses camelCase. HotelBeds is the outlier using snake_case, causing schema validation to fail.

---

## Solution

Update the `hotelbeds-api` edge function to accept camelCase parameter names to match the convention used by other PMS adapters and the frontend.

---

## Changes Required

### File: `supabase/functions/hotelbeds-api/index.ts`

#### 1. Update `fetchAvailabilitySchema` (lines 122-131)

Change from:
```typescript
const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Start date must be YYYY-MM-DD format" }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be YYYY-MM-DD format" }),
  occupancy: z.object({
    rooms: z.number().min(1).default(1),
    adults: z.number().min(1).default(2),
    children: z.number().min(0).default(0),
  }).optional(),
});
```

To:
```typescript
const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be YYYY-MM-DD format" }),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "endDate must be YYYY-MM-DD format" }),
  occupancy: z.object({
    rooms: z.number().min(1).default(1),
    adults: z.number().min(1).default(2),
    children: z.number().min(0).default(0),
  }).optional(),
});
```

#### 2. Update extraction in fetch_availability handler (line 872)

Change from:
```typescript
const { start_date, end_date, occupancy } = validation.data;
```

To:
```typescript
const { startDate: start_date, endDate: end_date, occupancy } = validation.data;
```

This keeps the internal variable names unchanged so the rest of the code (date adjustment logic, API calls, caching) continues to work without modification.

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hotelbeds-api/index.ts` | Update schema and variable extraction to use camelCase |

---

## Why This Approach

1. **Consistency with other adapters**: hostfully-api, benson-api, and others use camelCase
2. **Minimal code changes**: Only 2 lines need updating
3. **No frontend changes needed**: CalendarAccommodation.tsx already sends the correct format
4. **Backward compatible**: Destructuring renames keep internal logic unchanged

---

## Testing

After deployment:
1. Navigate to Calendar page
2. Select "HOTELBEDS SPAIN - PRUEBAS" property (the one with `external_system: hotelbeds`)
3. Click "Sync" to fetch availability
4. Verify rates and availability display correctly

---

## Technical Notes

- The property `cd424b0b-a039-4d14-8f3b-3787f59aaf2d` already has cached data in `pms_availability_cache` from previous successful syncs
- The error only occurs when forcing a refresh sync (bypassing cache)
- There's also a duplicate property `93f79b31-8e65-4718-b3d8-179436ba0dd1` with invalid hotel code format (`99994|H|1`) - this property has `external_system: hostfully` so won't trigger HotelBeds flow, but should be cleaned up
