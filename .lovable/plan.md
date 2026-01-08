# Fix: Hostfully Sync All Data - Debug Why 68 Fields Not Written

## Problem
During "Sync All Hostfully Data" operation, the `get_listing_details` API call returns 68+ fields of data, but none are being written to the database.

## Root Cause Analysis

After investigation, the issue appears to be in the data flow of `handleFullHostfullySync`:

1. **Building Name Mismatch**: The function fetches all properties from Hostfully via `list_all_properties`, then tries to find a building matching `formData.name` (e.g., "SixOnN")
2. If no matching building is found, it silently returns early with a "No Matching Building" toast - without calling `get_listing_details`
3. Even if building is found, the rooms may have been imported with DIFFERENT Hostfully UIDs than what's currently available in the owner's Hostfully account

## Immediate Debug Plan

Add comprehensive logging/toasts to understand exactly what's happening at each step:

### Step 1: Add Debug Output to `handleFullHostfullySync`

In `src/pages/PropertyForm.tsx`, add temporary debug toasts/logs at key points:

1. **After parsing buildings** (line ~774): Log which buildings were parsed from Hostfully
2. **After building match check** (line ~778): Log which building was matched (or not matched)
3. **After room upsert loop** (line ~811): Log how many rooms were imported with their IDs
4. **After `get_listing_details` call** (line ~833): Log the FULL response (success or failure)
5. **Before database update** (line ~888): Log the `dbUpdate` object being written
6. **After database update** (line ~888): Log whether the update succeeded or failed

### Step 2: Add Response Inspection

Modify the sync flow to show a detailed alert/toast with:
- Number of buildings found
- Matched building name (if any)
- Number of rooms to sync
- Full API response from `get_listing_details`
- Database update result

## Code Changes

### File: `src/pages/PropertyForm.tsx`

**Location: Lines 749-917 (`handleFullHostfullySync` function)**

Replace the function with enhanced debugging version:

```typescript
const handleFullHostfullySync = async () => {
  if (!propertyId || !ownerPmsCredentialId) {
    toast({
      title: "Cannot Sync",
      description: "Property must be linked to owner's Hostfully account",
      variant: "destructive",
    });
    return;
  }

  setFullSyncingHostfully(true);
  setSyncProgress({ phase: "Importing rooms...", current: 0, total: 0 });

  try {
    // PHASE 1: Import rooms (reuse existing logic)
    const { data, error } = await supabase.functions.invoke("hostfully-api", {
      body: {
        action: "list_all_properties",
        owner_credential_id: ownerPmsCredentialId,
      },
    });

    if (error) throw error;
    if (!data?.data?.properties) throw new Error("No properties returned from Hostfully");

    // DEBUG: Log raw property count
    console.log("[DEBUG] Raw properties from Hostfully:", data.data.properties.length);

    const buildings = parseHostfullyProperties(data.data.properties);
    
    // DEBUG: Show parsed buildings
    const buildingNames = buildings.map(b => b.building_name).join(", ");
    console.log("[DEBUG] Parsed buildings:", buildingNames);
    toast({
      title: "DEBUG: Buildings Parsed",
      description: `Found ${buildings.length} buildings: ${buildingNames.substring(0, 100)}...`,
    });

    const matchingBuilding = buildings.find(
      (b) => b.building_name.toUpperCase() === formData.name.toUpperCase()
    );

    // DEBUG: Show matching result
    console.log("[DEBUG] Looking for:", formData.name.toUpperCase());
    console.log("[DEBUG] Matching building:", matchingBuilding?.building_name || "NOT FOUND");

    if (!matchingBuilding) {
      toast({
        title: "No Matching Building",
        description: `Could not find "${formData.name}" in Hostfully. Available: ${buildingNames}`,
        variant: "destructive",
      });
      setFullSyncingHostfully(false);
      setSyncProgress(null);
      return;
    }

    // Upsert all rooms and collect their DB IDs
    const importedRoomIds: { dbId: string; hostfullyId: string }[] = [];
    for (const unit of matchingBuilding.units) {
      const roomName = `${unit.room_number} ${unit.room_type}`.trim() || unit.name;
      const { data: upsertedRoom, error: upsertError } = await supabase
        .from("hostfully_room_types")
        .upsert(
          {
            property_id: propertyId,
            hostfully_room_id: unit.id,
            name: roomName,
            is_active: true,
          },
          { onConflict: "property_id,hostfully_room_id" }
        )
        .select("id")
        .single();

      if (!upsertError && upsertedRoom) {
        importedRoomIds.push({ dbId: upsertedRoom.id, hostfullyId: unit.id });
      }
    }

    // DEBUG: Show imported rooms
    console.log("[DEBUG] Imported room IDs:", importedRoomIds);
    toast({
      title: "DEBUG: Rooms Imported",
      description: `${importedRoomIds.length} rooms. First: ${importedRoomIds[0]?.hostfullyId || 'none'}`,
    });

    // TESTING LIMIT: Only sync first 1 room
    const roomsToSync = importedRoomIds.slice(0, 1);
    setSyncProgress({ phase: "Rooms imported. Populating data...", current: 0, total: roomsToSync.length });

    // PHASE 2: Populate each room's data sequentially
    let syncedCount = 0;
    for (const room of roomsToSync) {
      setSyncProgress({
        phase: `Syncing room ${syncedCount + 1}/${roomsToSync.length}...`,
        current: syncedCount + 1,
        total: roomsToSync.length,
      });

      // DEBUG: Show which room we're fetching
      console.log("[DEBUG] Fetching get_listing_details for:", room.hostfullyId);
      toast({
        title: "DEBUG: Fetching Room",
        description: `Calling get_listing_details for: ${room.hostfullyId}`,
      });

      // Call Hostfully API with get_listing_details
      const { data: roomData, error: roomError } = await supabase.functions.invoke("hostfully-api", {
        body: {
          action: "get_listing_details",
          owner_credential_id: ownerPmsCredentialId,
          propertyUid: room.hostfullyId,
        },
      });

      // DEBUG: Show full response
      console.log("[DEBUG] get_listing_details response:", JSON.stringify(roomData, null, 2));
      console.log("[DEBUG] get_listing_details error:", roomError);
      
      toast({
        title: roomError ? "DEBUG: API Error" : "DEBUG: API Response",
        description: roomError 
          ? `Error: ${roomError.message}` 
          : `Success: ${roomData?.success}, Has data: ${!!roomData?.data}, Name: ${roomData?.data?.name || 'N/A'}`,
        variant: roomError ? "destructive" : "default",
      });

      if (!roomError && roomData?.success) {
        const hf = roomData.data;
        
        // DEBUG: Show key fields
        console.log("[DEBUG] Hostfully data keys:", Object.keys(hf || {}));
        console.log("[DEBUG] max_guests:", hf?.max_guests);
        console.log("[DEBUG] cleaning_fee:", hf?.cleaning_fee);
        console.log("[DEBUG] images count:", hf?.images?.length);
        
        const syncedFields = [
          "name", "description", "maxPeople", "maxAdults", "minGuests", "bathrooms",
          "roomSize", "beds", "images", "amenities", "minStay", "maxStay",
          "checkInTime", "checkOutTime", "dailyRate", "currency", "cleaningFee",
          "securityDeposit", "extraGuestFee", "taxRate", "propertyType",
          "wifiNetwork", "wifiPassword", "houseRules", "checkInInstructions", "cancellationPolicy",
          "addressStreet", "addressCity", "addressState", "addressPostalCode", "addressCountry",
          "latitude", "longitude", "thumbnailUrl",
        ];

        const dbUpdate = {
          name: hf.name,
          description: hf.description,
          max_guests: hf.max_guests,
          min_guests: hf.min_guests,
          bedrooms: hf.bedrooms,
          bathrooms: hf.bathrooms,
          beds: hf.beds,
          room_size: hf.room_size,
          room_size_unit: hf.room_size_unit || "SQUARE_METERS",
          daily_rate: hf.daily_rate,
          currency: hf.currency || "ZAR",
          cleaning_fee: hf.cleaning_fee,
          security_deposit: hf.security_deposit,
          extra_guest_fee: hf.extra_guest_fee,
          tax_rate: hf.tax_rate,
          min_stay: hf.min_stay,
          max_stay: hf.max_stay,
          check_in_time: hf.check_in_time,
          check_out_time: hf.check_out_time,
          property_type: hf.property_type,
          images: hf.images || [],
          amenities: hf.amenities || [],
          thumbnail_url: hf.thumbnail,
          wifi_network: hf.wifi_network,
          wifi_password: hf.wifi_password,
          check_in_instructions: hf.check_in_instructions,
          house_rules: hf.house_rules,
          cancellation_policy: hf.cancellation_policy,
          address_street: hf.address?.street,
          address_city: hf.address?.city,
          address_state: hf.address?.state,
          address_postal_code: hf.address?.postal_code,
          address_country: hf.address?.country,
          latitude: hf.location?.latitude,
          longitude: hf.location?.longitude,
          pms_synced_fields: syncedFields,
          last_synced_at: new Date().toISOString(),
          raw_data: hf._raw || hf,
        };

        // DEBUG: Show what we're writing
        console.log("[DEBUG] DB Update object:", dbUpdate);
        toast({
          title: "DEBUG: Writing to DB",
          description: `Updating room ${room.dbId} with name: ${dbUpdate.name}, max_guests: ${dbUpdate.max_guests}`,
        });

        const { error: updateError } = await supabase.from("hostfully_room_types").update(dbUpdate).eq("id", room.dbId);
        
        // DEBUG: Show update result
        if (updateError) {
          console.error("[DEBUG] DB Update error:", updateError);
          toast({
            title: "DEBUG: DB Update FAILED",
            description: updateError.message,
            variant: "destructive",
          });
        } else {
          console.log("[DEBUG] DB Update SUCCESS for room:", room.dbId);
          toast({
            title: "Room Synced Successfully",
            description: `Updated: ${hf.name || 'Unknown'} (ID: ${room.hostfullyId})`,
          });
        }
      } else {
        // DEBUG: Log why we're skipping
        console.log("[DEBUG] Skipping DB update - roomError:", !!roomError, "success:", roomData?.success);
      }
      syncedCount++;
    }

    // Refresh room count
    const { count } = await supabase
      .from("hostfully_room_types")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId);
    setHostfullyRoomCount(count || 0);

    toast({
      title: "Full Sync Complete",
      description: `Imported ${importedRoomIds.length} rooms, synced data for ${syncedCount} (limit: 1 for testing)`,
    });
  } catch (err: any) {
    console.error("Full Hostfully sync error:", err);
    toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
  } finally {
    setFullSyncingHostfully(false);
    setSyncProgress(null);
  }
};
```

## Expected Debug Output

When running "Sync All Hostfully Data", you should see a sequence of toasts:

1. "DEBUG: Buildings Parsed" - Shows how many buildings were found
2. "No Matching Building" (if building name doesn't match) - OR continues...
3. "DEBUG: Rooms Imported" - Shows room count and first ID
4. "DEBUG: Fetching Room" - Shows which Hostfully UID is being fetched
5. "DEBUG: API Response" - Shows whether API call succeeded and key data
6. "DEBUG: Writing to DB" - Shows what data is being written
7. "Room Synced Successfully" or "DEBUG: DB Update FAILED"

## Likely Root Cause

Based on the data analysis, the most likely issue is:
- The property "SixOnN" has room types with Hostfully UIDs (`f3162d57-e133-4b96-85fb-e32efd1723af`)
- But the owner's API key only has access to "EIGHTY2onM" properties
- The building name match fails, so `get_listing_details` is never called

## Critical Files for Implementation

- `src/pages/PropertyForm.tsx` - Contains `handleFullHostfullySync` function (lines 749-917)
- `supabase/functions/hostfully-api/index.ts` - Edge function handling `get_listing_details` action
- `src/lib/hostfullyBuildingParser.ts` - Building name parser
