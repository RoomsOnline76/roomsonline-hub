

# Fix Hostfully Availability Fetch - Property ID Translation

## Problem Identified

When viewing a Hostfully property at `/property/:slug/room/:roomSlug`, rates and availability are not loading because:

1. **Frontend sends wrong parameter names**: The frontend sends `property_id`, `start_date`, `end_date` (snake_case)
2. **Edge Function expects different names**: The `fetchAvailabilitySchema` requires `propertyUid`, `startDate`, `endDate` (camelCase)
3. **No translation logic exists**: The Edge Function cannot convert ROL `property_id` to Hostfully `propertyUid`
4. **Property data issue**: The property's `external_id` is `null`, but the Hostfully UID is stored in `amenities.room_types[].hostfullyId`

### Current Request vs Expected

| Frontend Sends | Edge Function Expects |
|----------------|----------------------|
| `property_id` (ROL UUID) | `propertyUid` (Hostfully UID) |
| `start_date` (snake_case) | `startDate` (camelCase) |
| `end_date` (snake_case) | `endDate` (camelCase) |

## Solution

Update the Edge Function to accept the frontend's parameter format and auto-translate `property_id` to `propertyUid` by looking up the Hostfully UID from the database.

### Part 1: Update fetchAvailabilitySchema to Accept Both Formats

Modify the schema to accept either `propertyUid` OR `property_id`, and either camelCase OR snake_case date fields:

```typescript
const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  // Accept either propertyUid (Hostfully) or property_id (ROL)
  propertyUid: z.string().optional(),
  property_id: z.string().uuid().optional(),
  // Accept both camelCase and snake_case date formats
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  data => data.propertyUid || data.property_id,
  { message: "Either propertyUid or property_id is required" }
).refine(
  data => (data.startDate || data.start_date) && (data.endDate || data.end_date),
  { message: "Start and end dates are required" }
);
```

### Part 2: Add Property ID to Hostfully UID Translation

Add a helper function to translate ROL `property_id` to Hostfully `propertyUid`:

```typescript
async function resolveHostfullyPropertyUid(
  supabase: any,
  propertyUid?: string,
  propertyId?: string
): Promise<string | null> {
  // If propertyUid already provided, use it
  if (propertyUid) return propertyUid;
  
  if (!propertyId) return null;
  
  // Look up from properties table
  const { data: propData } = await supabase
    .from("properties")
    .select("external_id, amenities")
    .eq("id", propertyId)
    .maybeSingle();
  
  if (!propData) return null;
  
  // Option 1: Use external_id if set
  if (propData.external_id) return propData.external_id;
  
  // Option 2: Extract from amenities.room_types[0].hostfullyId or pmsRoomId
  const roomTypes = propData.amenities?.room_types || [];
  if (roomTypes.length > 0) {
    const firstRoom = roomTypes[0];
    return firstRoom.hostfullyId || firstRoom.pmsRoomId || null;
  }
  
  return null;
}
```

### Part 3: Update fetch_availability Case Handler

Modify the switch case to use the translation:

```typescript
case "fetch_availability": {
  const result = fetchAvailabilitySchema.safeParse(body);
  if (!result.success) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request", action, result.error.issues)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
  
  // Resolve the Hostfully propertyUid
  const hostfullyUid = await resolveHostfullyPropertyUid(
    supabase, 
    result.data.propertyUid, 
    result.data.property_id
  );
  
  if (!hostfullyUid) {
    return new Response(
      JSON.stringify(createErrorResponse(
        ERROR_CODES.NOT_FOUND, 
        "Could not resolve Hostfully property UID", 
        action
      )),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
    );
  }
  
  // Normalize date fields (accept both camelCase and snake_case)
  const startDate = result.data.startDate || result.data.start_date;
  const endDate = result.data.endDate || result.data.end_date;
  
  response = await handleFetchAvailability(creds, hostfullyUid, startDate!, endDate!);
  break;
}
```

## Technical Details

### Data Lookup Flow

```text
Frontend: POST { property_id: "1a4d...", start_date: "2026-01-26", end_date: "2026-02-09" }
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Edge Function: resolveHostfullyPropertyUid()                             │
│                                                                          │
│   1. SELECT external_id, amenities FROM properties WHERE id = ?          │
│                                                                          │
│   2. If external_id exists → use it                                      │
│      Else → use amenities.room_types[0].hostfullyId                      │
│                                                                          │
│   Result: "818e799c-df32-4d53-8765-dd8b7e2b0ff0"                          │
└──────────────────────────────────────────────────────────────────────────┘
              │
              ▼
handleFetchAvailability(creds, "818e799c-...", "2026-01-26", "2026-02-09")
              │
              ▼
Hostfully API: GET /property-calendar/818e799c-...?from=2026-01-26&to=2026-02-09
              │
              ▼
Response: { room_types: [{ rate_types: [{ rates: [{ room_amount: 450 }] }] }] }
```

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/hostfully-api/index.ts` | Update `fetchAvailabilitySchema` to accept both formats; add `resolveHostfullyPropertyUid()` helper; update switch case handler |

## Expected Result

After this fix:
1. PropertyShowcase and RoomShowcase can send `property_id` (ROL UUID) and the Edge Function will auto-resolve it
2. Both snake_case and camelCase date formats are accepted
3. Rates and availability will display correctly for Hostfully properties
4. Backward compatibility maintained for any code already sending `propertyUid` directly

