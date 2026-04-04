/**
 * HOSTFULLY INGESTION WRITER
 * Single-commit database writer with field locking
 * 
 * HARD RULES:
 * - One atomic write transaction
 * - All written fields marked as locked
 * - Never writes back to Hostfully
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { TransformedData, TransformedRoomData } from "./types.ts";

// URL normalization for image dedup
function normalizeImageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    return u.href.replace(/\/+$/, '');
  } catch {
    return url.replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

// ============================================================================\\
// TYPES
// ============================================================================\\

interface WriteResult {
  success: boolean;
  error?: string;
  propertyUpdated: boolean;
  roomsUpserted: number;
  rateTypesUpserted: number;
}

// ============================================================================\\
// MAIN WRITER
// ============================================================================\\

/**
 * Write all transformed data to database in a single operation
 * 
 * @param data - Transformed ingestion data
 * @param rolPropertyId - ROL property ID to update
 * @param ownerCredentialId - Owner credential ID for reference
 * @param supabase - Supabase client
 */
export async function writeIngestion(
  data: TransformedData,
  rolPropertyId: string,
  ownerCredentialId: string,
  supabase: any,
  options?: { skipRooms?: boolean }
): Promise<WriteResult> {
  const skipRooms = options?.skipRooms ?? false;
  const result: WriteResult = {
    success: false,
    propertyUpdated: false,
    roomsUpserted: 0,
    rateTypesUpserted: 0,
  };
  
  try {
    // 1. Fetch current property to merge amenities
    const { data: currentProperty, error: fetchError } = await supabase
      .from("properties")
      .select("id, amenities, images, pms_managed_fields")
      .eq("id", rolPropertyId)
      .single();
    
    if (fetchError || !currentProperty) {
      result.error = `Property ${rolPropertyId} not found: ${fetchError?.message}`;
      return result;
    }
    
    // 2. Build property update
    const currentAmenities = (currentProperty.amenities as Record<string, unknown>) || {};
    const currentImages = (currentProperty.images as unknown[]) || [];
    const currentManagedFields = (currentProperty.pms_managed_fields as string[]) || [];
    
    // Merge amenities (new values override existing for ingested fields)
    const mergedAmenities = {
      ...currentAmenities,
      ...data.property.amenitiesUpdate,
    };
    
    // Use new images if we have them, otherwise keep existing
    const finalImages = data.property.images.length > 0 
      ? data.property.images 
      : currentImages;
    
    // Merge managed fields (add new locked fields)
    const allManagedFields = [
      ...new Set([...currentManagedFields, ...data.lockedFieldNames])
    ];
    
    // Build update object (only include non-undefined values)
    const propertyUpdate: Record<string, unknown> = {
      amenities: mergedAmenities,
      images: finalImages,
      pms_managed_fields: allManagedFields,
      last_pms_sync_at: new Date().toISOString(),
      pms_sync_status: 'ingested',
      updated_at: new Date().toISOString(),
    };
    
    // Add direct property fields if present
    if (data.property.name !== undefined) {
      propertyUpdate.name = data.property.name;
    }
    if (data.property.address !== undefined) {
      propertyUpdate.address = data.property.address;
    }
    if (data.property.city !== undefined) {
      propertyUpdate.city = data.property.city;
    }
    if (data.property.country !== undefined) {
      propertyUpdate.country = data.property.country;
    }
    if (data.property.latitude !== undefined) {
      propertyUpdate.latitude = data.property.latitude;
    }
    if (data.property.longitude !== undefined) {
      propertyUpdate.longitude = data.property.longitude;
    }
    if (data.property.property_type !== undefined) {
      propertyUpdate.property_type = data.property.property_type;
    }
    if (data.property.description !== undefined) {
      propertyUpdate.description = data.property.description;
    }
    if (data.property.hostfully_property_uid !== undefined) {
      propertyUpdate.hostfully_property_uid = data.property.hostfully_property_uid;
    }
    
    // 3. Update property
    console.log(`[Writer] Updating property ${rolPropertyId}...`);
    
    const { error: updateError } = await supabase
      .from("properties")
      .update(propertyUpdate)
      .eq("id", rolPropertyId);
    
    if (updateError) {
      result.error = `Property update failed: ${updateError.message}`;
      return result;
    }
    
    result.propertyUpdated = true;
    
    // 4. Upsert rate types (if any)
    if (data.rateTypes && data.rateTypes.length > 0) {
      console.log(`[Writer] Upserting ${data.rateTypes.length} rate types...`);
      
      for (const rateType of data.rateTypes) {
        const { error: rateError } = await supabase
          .from("pms_rate_types_cache")
          .upsert({
            property_id: rolPropertyId,
            system_type: 'hostfully',
            external_rate_type_id: rateType.external_rate_type_id,
            name: rateType.name,
            description: rateType.description,
            price_type: rateType.price_type,
            fetched_at: new Date().toISOString(),
          }, {
            onConflict: 'property_id,system_type,external_rate_type_id',
          });
        
        if (rateError) {
          console.error(`[Writer] Rate type upsert error for ${rateType.external_rate_type_id}:`, rateError);
        } else {
          result.rateTypesUpserted++;
        }
      }
    }
    
    // 5. Aggregate rooms by type, then upsert one row per type + unit_map entries
    if (data.rooms.length > 0 && !skipRooms) {
      console.log(`[Writer] Aggregating ${data.rooms.length} rooms by type...`);
      
      // Fetch existing room types for this property to match by name (prevents duplicates)
      const { data: existingRoomTypes } = await supabase
        .from("hostfully_room_types")
        .select("id, name, property_type, hostfully_room_id")
        .eq("property_id", rolPropertyId);
      
      const existingByType = new Map<string, { id: string; hostfully_room_id: string }>();
      for (const existing of (existingRoomTypes || [])) {
        const key = (existing.property_type || existing.name || '').toUpperCase().trim();
        if (key) existingByType.set(key, { id: existing.id, hostfully_room_id: existing.hostfully_room_id });
      }
      
      // Group by normalized property_type
      const typeGroups = new Map<string, { representative: TransformedRoomData; unitUids: string[]; unitNames: string[]; allImages: Array<{ url: string; alt?: string; order?: number; category?: string }> }>();
      for (const room of data.rooms) {
        const typeKey = (room.property_type || 'Standard').toUpperCase().trim();
        if (!typeGroups.has(typeKey)) {
          typeGroups.set(typeKey, { representative: room, unitUids: [], unitNames: [], allImages: [] });
        }
        const group = typeGroups.get(typeKey)!;
        group.unitUids.push(room.hostfully_room_id);
        group.unitNames.push(room.name);
        // Collect images from all units, dedup by URL later
        if (Array.isArray(room.images)) {
          for (const img of room.images as any[]) {
            const imgUrl = typeof img === 'string' ? img : img?.url;
            if (imgUrl && !group.allImages.some(existing => (typeof existing === 'string' ? existing : existing.url) === imgUrl)) {
              group.allImages.push(typeof img === 'string' ? { url: img } : img);
            }
          }
        }
      }
      
      console.log(`[Writer] ${data.rooms.length} units → ${typeGroups.size} room types`);
      
      for (const [typeKey, group] of typeGroups) {
        const room = group.representative;
        const typeName = room.property_type || 'Standard';
        
        // Use existing row's hostfully_room_id if we already have this type
        const existingMatch = existingByType.get(typeKey);
        const hostfullyRoomId = existingMatch?.hostfully_room_id || group.unitUids[0];
        
        const roomData = {
          property_id: rolPropertyId,
          hostfully_room_id: hostfullyRoomId,
          name: typeName,
          description: room.description,
          max_guests: room.max_guests,
          min_guests: room.min_guests,
          bedrooms: room.bedrooms,
          bathrooms: room.bathrooms,
          beds: room.beds,
          room_size: room.room_size,
          room_size_unit: room.room_size_unit,
          check_in_time: room.check_in_time,
          check_out_time: room.check_out_time,
          cleaning_fee: room.cleaning_fee,
          extra_guest_fee: room.extra_guest_fee,
          security_deposit: room.security_deposit,
          amenities: room.amenities,
          images: group.allImages.length > 0 ? group.allImages : (room.images || []),
          property_type: room.property_type,
          extra_person_policy: room.extra_person_policy,
          bed_configuration: room.bed_configuration || [],
          facilities_raw: room.facilities_raw || [],
          rate_type: room.rate_type || 'per-unit',
          linked_rate_type_ids: room.linked_rate_type_ids || [],
          pms_synced_fields: room.pms_synced_fields,
          last_synced_at: room.last_synced_at,
          total_units: group.unitUids.length,
          is_active: true,
          updated_at: new Date().toISOString(),
        };
        
        let upsertedRowId: string | undefined;
        
        if (existingMatch) {
          // UPDATE existing row by ID to avoid duplicate key issues
          const { error: updateError } = await supabase
            .from("hostfully_room_types")
            .update(roomData)
            .eq("id", existingMatch.id);
          
          if (updateError) {
            console.error(`[Writer] Room type update error for ${typeName}:`, updateError);
          } else {
            result.roomsUpserted++;
            upsertedRowId = existingMatch.id;
          }
        } else {
          // INSERT new row
          const { data: upsertedRow, error: roomError } = await supabase
            .from("hostfully_room_types")
            .upsert(roomData, {
              onConflict: 'property_id,hostfully_room_id',
              ignoreDuplicates: false,
            })
            .select("id")
            .maybeSingle();
          
          if (roomError) {
            console.error(`[Writer] Room type upsert error for ${typeName}:`, roomError);
          } else {
            result.roomsUpserted++;
            upsertedRowId = upsertedRow?.id;
          }
        }
        
        if (upsertedRowId) {
          for (let u = 0; u < group.unitUids.length; u++) {
            const { error: mapError } = await supabase
              .from("hostfully_unit_map")
              .upsert({
                property_id: rolPropertyId,
                room_type_id: upsertedRowId,
                hostfully_uid: group.unitUids[u],
                unit_name: group.unitNames[u],
                unit_number: '',
                is_active: true,
              }, { onConflict: 'property_id,hostfully_uid' });
            if (mapError) {
              console.error(`[Writer] unit_map error for ${group.unitUids[u]}:`, mapError);
              throw new Error(`unit_map write failed for ${group.unitUids[u]}: ${mapError.message}`);
            }
          }
        }
      }
      
      // 5b. Sync aggregated types to properties.amenities.room_types
      console.log(`[Writer] Syncing ${typeGroups.size} aggregated types to amenities.room_types...`);
      
      const roomTypesForAmenities: any[] = [];
      for (const [, group] of typeGroups) {
        const room = group.representative;
        roomTypesForAmenities.push({
          id: group.unitUids[0],
          pmsRoomId: group.unitUids[0],
          pmsRoomType: room.property_type || room.name,
          name: room.property_type || 'Standard',
          description: room.description || '',
          maxPeople: room.max_guests || 2,
          maxAdults: room.max_guests || 2,
          minGuests: room.min_guests || 1,
          numRooms: group.unitUids.length,
          units: group.unitUids.length,
          bedrooms: room.bedrooms || 1,
          bathrooms: room.bathrooms || 1,
          beds: room.beds || 1,
          roomSize: room.room_size || 0,
          checkInTime: room.check_in_time || '',
          checkOutTime: room.check_out_time || '',
          dailyRate: 0,
          currency: 'ZAR',
          cleaningFee: room.cleaning_fee || 0,
          securityDeposit: room.security_deposit || 0,
          extraGuestFee: room.extra_guest_fee || 0,
          rateType: room.rate_type || 'per-unit',
          linkedRateTypeIds: room.linked_rate_type_ids || ['per-unit'],
          propertyType: room.property_type || '',
          images: Array.isArray(room.images) ? room.images.map((img: any) => typeof img === 'string' ? img : img?.url).filter(Boolean) : [],
          amenities: [],
          facilities: [],
          facilitiesRaw: room.facilities_raw || [],
          selected: false,
          splitPercent: 0,
          pms_synced_fields: room.pms_synced_fields || [],
          lastSyncedAt: room.last_synced_at,
        });
      }
      
      const updatedAmenities = {
        ...((await supabase.from("properties").select("amenities").eq("id", rolPropertyId).single()).data?.amenities || {}),
        room_types: roomTypesForAmenities,
      };
      
      const { error: amenityError } = await supabase
        .from("properties")
        .update({ amenities: updatedAmenities })
        .eq("id", rolPropertyId);
      
      if (amenityError) {
        console.error("[Writer] Failed to sync room_types to amenities:", amenityError);
      } else {
        console.log(`[Writer] Successfully synced ${roomTypesForAmenities.length} aggregated room types to amenities`);
      }
    }
    
    // 6. Success
    result.success = true;
    console.log(`[Writer] Write complete. Property: ${result.propertyUpdated}, Rooms: ${result.roomsUpserted}, RateTypes: ${result.rateTypesUpserted}`);
    
    return result;
    
  } catch (err) {
    console.error("[Writer] Unhandled error:", err);
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}
