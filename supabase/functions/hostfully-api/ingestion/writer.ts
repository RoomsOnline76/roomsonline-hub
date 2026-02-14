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
  supabase: any
): Promise<WriteResult> {
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
    
    // 5. Upsert rooms (if any)
    if (data.rooms.length > 0) {
      console.log(`[Writer] Upserting ${data.rooms.length} rooms...`);
      
      const successfulRooms: TransformedRoomData[] = [];
      
      for (const room of data.rooms) {
        const roomData = {
          property_id: rolPropertyId,
          hostfully_room_id: room.hostfully_room_id,
          name: room.name,
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
          // Room category
          property_type: room.property_type,
          // Extended room fields
          extra_person_policy: room.extra_person_policy,
          bed_configuration: room.bed_configuration || [],
          facilities_raw: room.facilities_raw || [],
          rate_type: room.rate_type || 'per-unit',
          linked_rate_type_ids: room.linked_rate_type_ids || [],
          pms_synced_fields: room.pms_synced_fields,
          last_synced_at: room.last_synced_at,
          is_active: true,
          updated_at: new Date().toISOString(),
        };
        
        // Use upsert with conflict on property_id + hostfully_room_id
        const { error: roomError } = await supabase
          .from("hostfully_room_types")
          .upsert(roomData, {
            onConflict: 'property_id,hostfully_room_id',
            ignoreDuplicates: false,
          });
        
        if (roomError) {
          console.error(`[Writer] Room upsert error for ${room.hostfully_room_id}:`, roomError);
          // Continue with other rooms
        } else {
          result.roomsUpserted++;
          successfulRooms.push(room);
        }
      }
      
      // 5b. Sync rooms to properties.amenities.room_types for calendar/form visibility
      if (successfulRooms.length > 0) {
        console.log(`[Writer] Syncing ${successfulRooms.length} rooms to amenities.room_types...`);
        
        const roomTypesForAmenities = successfulRooms.map(room => ({
          id: room.hostfully_room_id,
          pmsRoomId: room.hostfully_room_id,
          pmsRoomType: room.property_type || room.name,
          name: room.name,
          description: room.description || '',
          maxPeople: room.max_guests || 2,
          maxAdults: room.max_guests || 2,
          minGuests: room.min_guests || 1,
          numRooms: 1,
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
        }));
        
        // Update amenities with room_types
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
          console.log(`[Writer] Successfully synced ${roomTypesForAmenities.length} room types to amenities`);
        }
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
