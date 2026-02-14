/**
 * HOSTFULLY UNIT-LEVEL INGESTION
 * 
 * Iterates over individual unit UIDs from the building import
 * and fetches per-unit details (property data, descriptions, photos)
 * to fully populate hostfully_room_types rows.
 * 
 * In Hostfully v3, each "unit" (e.g., "EIGHTY2onM 101 Studio") is
 * a separate property in the API. This module treats each unit UID
 * as its own property endpoint call.
 */

import {
  HostfullyCredentials,
  HostfullyRoomPayload,
  TransformedRoomData,
} from "./types.ts";
import {
  fetchProperty,
  fetchDescriptions,
  fetchPhotos,
  fetchFees,
} from "./fetchers.ts";

// ============================================================================
// TYPES
// ============================================================================

interface UnitIngestionResult {
  property_id: string;
  units_processed: number;
  units_succeeded: number;
  units_failed: number;
  errors: string[];
  warnings: string[];
}

interface AvailableListing {
  id: string;
  name: string;
  [key: string]: unknown;
}

// ============================================================================
// NAME PARSING (mirrors src/lib/hostfullyBuildingParser.ts for Deno)
// ============================================================================

function sanitizeName(name: string): string {
  return name
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\t\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUnitName(name: string): { building: string; room: string; type: string } | null {
  if (!name) return null;
  const sanitized = sanitizeName(name);
  const parts = sanitized.split(' ');
  if (parts.length < 2) return { building: name, room: '', type: '' };

  let roomIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d+[A-Za-z]?$|^[A-Za-z]?\d+$/.test(parts[i])) {
      roomIndex = i;
      break;
    }
  }

  if (roomIndex === -1) return { building: name, room: '', type: '' };

  return {
    building: parts.slice(0, roomIndex).join(' ') || 'Unknown Building',
    room: parts[roomIndex],
    type: parts.slice(roomIndex + 1).join(' ') || 'Standard',
  };
}

// ============================================================================
// UNIT DATA FETCHER
// ============================================================================

/**
 * Fetch full details for a single unit (which is a Hostfully "property")
 */
async function fetchUnitDetails(
  unitUid: string,
  unitName: string,
  creds: HostfullyCredentials
): Promise<{ room: TransformedRoomData | null; error: string | null }> {
  try {
    // Parallel fetch: property core, descriptions, photos
    const [propResult, descResult, photosResult, feesResult] = await Promise.all([
      fetchProperty(unitUid, creds),
      fetchDescriptions(unitUid, creds),
      fetchPhotos(unitUid, creds),
      fetchFees(unitUid, creds),
    ]);

    if (!propResult.success || !propResult.data) {
      return { room: null, error: `Property fetch failed for ${unitUid}: ${propResult.error}` };
    }

    const prop = propResult.data;
    const desc = descResult.success ? descResult.data : null;
    const photos = photosResult.success ? photosResult.data : null;
    const fees = feesResult.success ? feesResult.data : null;

    // Parse unit name to extract category
    const parsed = parseUnitName(unitName);
    const roomCategory = parsed?.type || unitName.replace(/^\d+\s*/, '').trim() || 'Standard';
    const roomNumber = parsed?.room || '';

    // Build images array
    const images = (photos || [])
      .filter((p: any) => p.originalImageUrl || p.url)
      .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999))
      .map((p: any, i: number) => ({
        url: p.originalImageUrl || p.url || '',
        alt: p.caption || unitName,
        order: p.order ?? i,
        category: p.category || 'room',
      }));

    // Fallback to property pictureLink
    if (images.length === 0 && (prop.pictureLink || prop.picture)) {
      images.push({
        url: prop.pictureLink || prop.picture || '',
        alt: unitName,
        order: 0,
        category: 'room',
      });
    }

    // Extract fees
    const cleaningFee = fees?.find((f: any) =>
      f.type?.toUpperCase() === 'CLEANING' || f.name?.toUpperCase()?.includes('CLEANING')
    )?.amount;
    const extraGuestFee = fees?.find((f: any) =>
      f.type?.toUpperCase() === 'EXTRA_GUEST' || f.name?.toUpperCase()?.includes('EXTRA')
    )?.amount;
    const securityDeposit = fees?.find((f: any) =>
      f.type?.toUpperCase() === 'SECURITY_DEPOSIT' || f.name?.toUpperCase()?.includes('SECURITY')
    )?.amount;

    const syncedAt = new Date().toISOString();
    const lockedFields = [
      'hostfully_room_id', 'name', 'description', 'max_guests',
      'bedrooms', 'bathrooms', 'beds', 'images',
    ];
    if (cleaningFee !== undefined) lockedFields.push('cleaning_fee');
    if (extraGuestFee !== undefined) lockedFields.push('extra_guest_fee');
    if (securityDeposit !== undefined) lockedFields.push('security_deposit');
    if (prop.baseDailyRate) lockedFields.push('daily_rate');

    const room: TransformedRoomData = {
      hostfully_room_id: unitUid,
      name: unitName,
      description: desc?.description || desc?.summary || (prop as any).description || undefined,
      max_guests: (prop as any).maxGuests || prop.maxGuests,
      min_guests: (prop as any).minGuests || 1,
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      beds: prop.beds,
      room_size: undefined,
      room_size_unit: 'sqm',
      check_in_time: undefined,
      check_out_time: undefined,
      cleaning_fee: cleaningFee,
      extra_guest_fee: extraGuestFee,
      security_deposit: securityDeposit,
      amenities: undefined,
      images: images.length > 0 ? images : undefined,
      property_type: roomCategory,
      extra_person_policy: undefined,
      bed_configuration: [],
      facilities_raw: [],
      rate_type: 'per-unit',
      linked_rate_type_ids: ['per-unit'],
      pms_synced_fields: lockedFields,
      last_synced_at: syncedAt,
    };

    return { room, error: null };
  } catch (err) {
    return {
      room: null,
      error: `Exception for unit ${unitUid}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================================
// MAIN BUILDING UNIT INGESTION
// ============================================================================

/**
 * Ingest all units belonging to a building.
 * 
 * 1. Reads available_listings from owner_pms_credentials
 * 2. Filters to units matching this building name
 * 3. For each unit, fetches property/description/photos from Hostfully
 * 4. Writes to hostfully_room_types + syncs to amenities.room_types
 */
export async function ingestBuildingUnits(
  rolPropertyId: string,
  ownerCredentialId: string,
  supabase: any
): Promise<UnitIngestionResult> {
  const result: UnitIngestionResult = {
    property_id: rolPropertyId,
    units_processed: 0,
    units_succeeded: 0,
    units_failed: 0,
    errors: [],
    warnings: [],
  };

  console.log(`[UnitIngestion] Starting for property ${rolPropertyId}`);

  // 1. Get credentials
  const { data: credData, error: credError } = await supabase
    .from("owner_pms_credentials")
    .select("api_key, environment, available_listings")
    .eq("id", ownerCredentialId)
    .eq("is_active", true)
    .maybeSingle();

  if (credError || !credData?.api_key) {
    result.errors.push("Failed to fetch owner credentials");
    return result;
  }

  const creds: HostfullyCredentials = {
    api_key: credData.api_key,
    environment: (credData.environment as "production" | "sandbox") || "production",
    owner_credential_id: ownerCredentialId,
  };

  const availableListings: AvailableListing[] = credData.available_listings || [];
  if (availableListings.length === 0) {
    result.errors.push("No available_listings found on credential. Run sync_owner_listings first.");
    return result;
  }

  // 2. Get the property to find its building name
  const { data: propData, error: propError } = await supabase
    .from("properties")
    .select("name, hostfully_property_uid")
    .eq("id", rolPropertyId)
    .single();

  if (propError || !propData) {
    result.errors.push(`Property ${rolPropertyId} not found`);
    return result;
  }

  const buildingName = propData.name;
  console.log(`[UnitIngestion] Building: "${buildingName}", available listings: ${availableListings.length}`);

  // 3. Filter listings that belong to this building
  // Match by checking if the listing name starts with the building name (case-insensitive)
  const buildingNameUpper = buildingName.toUpperCase().trim();
  const matchingUnits = availableListings.filter(listing => {
    const listingNameUpper = sanitizeName(listing.name).toUpperCase();
    return listingNameUpper.startsWith(buildingNameUpper);
  });

  if (matchingUnits.length === 0) {
    result.warnings.push(`No units found matching building "${buildingName}" in ${availableListings.length} listings`);
    // Try exact property UID match as fallback (standalone property)
    if (propData.hostfully_property_uid) {
      const exactMatch = availableListings.find(l => l.id === propData.hostfully_property_uid);
      if (exactMatch) {
        matchingUnits.push(exactMatch);
        console.log(`[UnitIngestion] Fallback: found exact UID match`);
      }
    }
    if (matchingUnits.length === 0) return result;
  }

  console.log(`[UnitIngestion] Found ${matchingUnits.length} units for building "${buildingName}"`);

  // 4. Process units in batches of 5 to avoid overwhelming the API
  const BATCH_SIZE = 5;
  const allRooms: TransformedRoomData[] = [];

  for (let i = 0; i < matchingUnits.length; i += BATCH_SIZE) {
    const batch = matchingUnits.slice(i, i + BATCH_SIZE);
    console.log(`[UnitIngestion] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(matchingUnits.length / BATCH_SIZE)} (${batch.length} units)`);

    const batchResults = await Promise.all(
      batch.map(unit => fetchUnitDetails(unit.id, sanitizeName(unit.name), creds))
    );

    for (const res of batchResults) {
      result.units_processed++;
      if (res.room) {
        allRooms.push(res.room);
        result.units_succeeded++;
      } else {
        result.units_failed++;
        if (res.error) result.errors.push(res.error);
      }
    }
  }

  // 5. Write rooms to hostfully_room_types
  console.log(`[UnitIngestion] Writing ${allRooms.length} rooms to database...`);

  for (const room of allRooms) {
    const roomData: Record<string, unknown> = {
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
      images: room.images || [],
      property_type: room.property_type,
      extra_person_policy: room.extra_person_policy,
      bed_configuration: room.bed_configuration || [],
      facilities_raw: room.facilities_raw || [],
      rate_type: room.rate_type || 'per-unit',
      linked_rate_type_ids: room.linked_rate_type_ids || ['per-unit'],
      pms_synced_fields: room.pms_synced_fields,
      last_synced_at: room.last_synced_at,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Also store daily_rate if available from property data
    // (TransformedRoomData doesn't have it but we can check)

    const { error: upsertError } = await supabase
      .from("hostfully_room_types")
      .upsert(roomData, {
        onConflict: 'property_id,hostfully_room_id',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error(`[UnitIngestion] Failed to upsert room ${room.hostfully_room_id}:`, upsertError);
      result.errors.push(`DB upsert failed for ${room.name}: ${upsertError.message}`);
    }
  }

  // 6. Sync rooms to properties.amenities.room_types
  if (allRooms.length > 0) {
    console.log(`[UnitIngestion] Syncing ${allRooms.length} rooms to amenities.room_types...`);

    // Fetch the freshly written room records to get IDs and daily_rate
    const { data: dbRooms } = await supabase
      .from("hostfully_room_types")
      .select("id, hostfully_room_id, name, description, max_guests, min_guests, bedrooms, bathrooms, beds, room_size, check_in_time, check_out_time, cleaning_fee, security_deposit, extra_guest_fee, property_type, rate_type, linked_rate_type_ids, facilities_raw, pms_synced_fields, last_synced_at, daily_rate, images, thumbnail_url")
      .eq("property_id", rolPropertyId)
      .eq("is_active", true);

    const roomTypesForAmenities = (dbRooms || allRooms).map((room: any) => ({
      id: room.hostfully_room_id || room.hostfully_room_id,
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
      dailyRate: room.daily_rate || 0,
      currency: 'ZAR',
      cleaningFee: room.cleaning_fee || 0,
      securityDeposit: room.security_deposit || 0,
      extraGuestFee: room.extra_guest_fee || 0,
      rateType: room.rate_type || 'per-unit',
      linkedRateTypeIds: room.linked_rate_type_ids || ['per-unit'],
      propertyType: room.property_type || '',
      images: room.images || [],
      thumbnailUrl: room.thumbnail_url || (Array.isArray(room.images) && room.images[0]?.url) || '',
      amenities: [],
      facilities: [],
      facilitiesRaw: room.facilities_raw || [],
      selected: false,
      splitPercent: 0,
      pms_synced_fields: room.pms_synced_fields || [],
      lastSyncedAt: room.last_synced_at,
    }));

    // Merge into existing amenities
    const { data: currentProp } = await supabase
      .from("properties")
      .select("amenities")
      .eq("id", rolPropertyId)
      .single();

    const updatedAmenities = {
      ...((currentProp?.amenities as Record<string, unknown>) || {}),
      room_types: roomTypesForAmenities,
    };

    const { error: amenityError } = await supabase
      .from("properties")
      .update({
        amenities: updatedAmenities,
        last_pms_sync_at: new Date().toISOString(),
        pms_sync_status: 'ingested',
      })
      .eq("id", rolPropertyId);

    if (amenityError) {
      result.errors.push(`Failed to sync amenities: ${amenityError.message}`);
    } else {
      console.log(`[UnitIngestion] Synced ${roomTypesForAmenities.length} room types to amenities`);
    }
  }

  // 7. Upsert synthetic rate type
  await supabase
    .from("pms_rate_types_cache")
    .upsert({
      property_id: rolPropertyId,
      system_type: 'hostfully',
      external_rate_type_id: 'per-unit',
      name: 'Per Unit Rate',
      description: 'Standard nightly rate per unit',
      price_type: 'per-unit',
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'property_id,system_type,external_rate_type_id' });

  console.log(`[UnitIngestion] Complete:`, result);
  return result;
}
