
# Fix Hostfully Room Types Not Imported on Sync

## Problem

When syncing a Hostfully property, no room types are imported into `hostfully_room_types`. This affects both:
1. Standalone properties (like "Victorian House Sample")  
2. Multi-unit building imports (via HostfullyBuildingImportDialog)

## Root Causes

| Issue | Location | Impact |
|-------|----------|--------|
| **Import flows bypass full ingestion** | `AdminKeys.tsx`, `HostfullyBuildingImportDialog.tsx` | Properties created without room details |
| **Standalone properties have no rooms** | Hostfully API returns empty `[]` for `/rooms` endpoint | No room types created |
| **Synthetic room not created** | `orchestrator.ts` only fetches external rooms | Standalone properties get 0 rooms |

## Solution

### 1. Create Synthetic Room Type for Standalone Properties

In `supabase/functions/hostfully-api/ingestion/orchestrator.ts`, after Phase 3 (room fetch), add logic to create a synthetic room type if:
- `ctx.isMultiUnit === false`
- `ctx.rooms` is empty or null

The synthetic room should be derived from the property data itself:
- `hostfully_room_id` = property UID
- `name` = property name (or "Full Property")
- `max_guests` = property.maxGuests
- `bedrooms` = property.bedrooms
- `bathrooms` = property.bathrooms
- `beds` = property.beds

This mirrors what `handleGetPropertyRooms` already does for the `get_property_rooms` action.

### 2. Call Full Ingestion After Property Import (HostfullyBuildingImportDialog)

After creating the property in `HostfullyBuildingImportDialog.tsx`, invoke `full_ingest_property` to populate all 68 fields including detailed room data:

```typescript
// After property insert, call full ingestion
await supabase.functions.invoke("hostfully-api", {
  body: {
    action: "full_ingest_property",
    propertyUid: building.sample_hostfully_uid,
    rol_property_id: newProperty.id,
    owner_credential_id: ownerCredentialId,
  }
});
```

### 3. Call Full Ingestion in AdminKeys Import Flow

Similarly update `handleHostfullyImportListings` in `AdminKeys.tsx` to invoke full ingestion after property creation.

---

## Technical Changes

### File 1: `supabase/functions/hostfully-api/ingestion/orchestrator.ts`

**Add synthetic room creation** after Phase 3 (~line 235):

```typescript
// Phase 3.5: Create synthetic room for standalone properties
if (!ctx.isMultiUnit && (!ctx.rooms || ctx.rooms.length === 0)) {
  console.log("[Orchestrator] Standalone property - creating synthetic room from property data");
  
  if (ctx.property) {
    ctx.rooms = [{
      uid: ctx.propertyUid,
      name: ctx.property.name || "Full Property",
      description: ctx.descriptions?.description || ctx.property.description || undefined,
      maxGuests: ctx.property.maxGuests,
      bedrooms: ctx.property.bedrooms,
      bathrooms: ctx.property.bathrooms,
      beds: ctx.property.beds,
    }];
    ctx.phasesCompleted.push("synthetic-room");
  }
}
```

### File 2: `src/components/pms/HostfullyBuildingImportDialog.tsx`

**After property insert** (~line 153), invoke full ingestion:

```typescript
if (propError) throw propError;

// Invoke full ingestion to populate all fields
try {
  const { data: ingestResult, error: ingestError } = await supabase.functions.invoke(
    "hostfully-api",
    {
      body: {
        action: "full_ingest_property",
        propertyUid: building.sample_hostfully_uid,
        rol_property_id: newProperty.id,
        owner_credential_id: ownerCredentialId,
      },
    }
  );
  
  if (ingestError) {
    console.warn("Full ingestion failed, rooms may be incomplete:", ingestError);
  } else {
    console.log("Full ingestion completed:", ingestResult);
  }
} catch (ingestErr) {
  console.warn("Ingestion error (property still created):", ingestErr);
}

// Remove the manual room inserts since full_ingest handles this
```

### File 3: `src/pages/AdminKeys.tsx`

**After property insert** in `handleHostfullyImportListings` (~line 726), invoke full ingestion:

```typescript
const { data: newProperty, error } = await supabase.from("properties")
  .insert(propertyData)
  .select("id")
  .single();

if (error) {
  throw new Error(`Failed to create property: ${error.message}`);
}

// Invoke full ingestion to populate room types and all PMS fields
try {
  await supabase.functions.invoke("hostfully-api", {
    body: {
      action: "full_ingest_property",
      propertyUid: listing.id,
      rol_property_id: newProperty.id,
      owner_credential_id: hostfullyCredential?.id,
    },
  });
} catch (ingestErr) {
  console.warn("Ingestion warning:", ingestErr);
}
```

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/ingestion/orchestrator.ts` | Add synthetic room creation for standalone properties |
| `src/components/pms/HostfullyBuildingImportDialog.tsx` | Invoke `full_ingest_property` after property creation |
| `src/pages/AdminKeys.tsx` | Invoke `full_ingest_property` after property creation |

---

## Expected Outcome

After implementation:

1. **Standalone properties** (like Victorian House Sample) will have a synthetic room type entry in `hostfully_room_types` with:
   - `hostfully_room_id` = property UID
   - `name` = property name
   - `max_guests`, `bedrooms`, `bathrooms`, `beds` populated from property

2. **Multi-unit buildings** will have full ingestion run, populating:
   - All 68 mapped fields
   - Detailed room types with amenities, fees, bed configs
   - Rate type linkages

3. **Edge function logs** will show the ingestion phases completing:
   - `[Orchestrator] Phase 3.5: Standalone property - creating synthetic room`
   - `[Writer] Upserting 1 rooms...`
