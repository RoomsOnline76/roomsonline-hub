/**
 * HOSTFULLY DATA TRANSFORMERS
 * Field-level transformation using the 68-field map
 * Converts Hostfully payloads into ROL schema
 */

import { HOSTFULLY_FIELD_MAP, FieldMapEntry, FieldAuthority } from "./field-map.ts";
import {
  IngestionContext,
  TransformedData,
  TransformedPropertyData,
  TransformedRoomData,
  TransformedRateTypeData,
  TransformedSeasonData,
  PropertyImage,
  HostfullyRulePayload,
  HostfullyFeePayload,
} from "./types.ts";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract value from object using dot-notation path
 * e.g., "address.city" from { address: { city: "Cape Town" } }
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Get fields by scope from the field map
 */
function getFieldsByScope(scope: "property" | "room" | "meta"): FieldMapEntry[] {
  return HOSTFULLY_FIELD_MAP.filter(f => f.scope === scope);
}

/**
 * Extract the DB column name from ROL path
 * e.g., "properties.name" -> "name"
 * e.g., "properties.amenities.pets_allowed" -> "pets_allowed" (for amenities)
 */
function getColumnName(rolPath: string): string {
  const parts = rolPath.split('.');
  return parts[parts.length - 1];
}

/**
 * Check if a field should write (based on authority and current value)
 */
function shouldWriteField(
  authority: FieldAuthority,
  currentValue: unknown
): boolean {
  if (authority === "HOSTFULLY_AT_INGEST") {
    // Always write authoritative fields
    return true;
  }
  
  if (authority === "SEED_ONLY") {
    // Only write if current value is empty/null
    return currentValue === null || currentValue === undefined || currentValue === '';
  }
  
  return false;
}

// ============================================================================
// TRANSFORM FUNCTIONS
// ============================================================================

/**
 * Transform property core fields
 */
function transformPropertyCore(ctx: IngestionContext): Partial<TransformedPropertyData> {
  const result: Partial<TransformedPropertyData> = {};
  const lockedFields: string[] = [];
  
  if (!ctx.property) return result;
  
  const prop = ctx.property;
  
  // Name
  if (prop.name) {
    result.name = prop.name;
    lockedFields.push('name');
  }
  
  // Address
  const address = prop.address1 || prop.streetAddress;
  if (address) {
    result.address = address;
    lockedFields.push('address');
  }
  
  // City
  if (prop.city) {
    result.city = prop.city;
    lockedFields.push('city');
  }
  
  // Country
  const country = prop.countryCode || prop.country;
  if (country) {
    result.country = country;
    lockedFields.push('country');
  }
  
  // Coordinates
  if (prop.latitude !== undefined) {
    result.latitude = prop.latitude;
    lockedFields.push('latitude');
  }
  if (prop.longitude !== undefined) {
    result.longitude = prop.longitude;
    lockedFields.push('longitude');
  }
  
  // Property type
  const propType = prop.propertyType || prop.type;
  if (propType) {
    result.property_type = propType;
    lockedFields.push('property_type');
  }
  
  // Hostfully UID
  result.hostfully_property_uid = prop.uid;
  lockedFields.push('hostfully_property_uid');
  
  result.lockedFieldNames = lockedFields;
  
  return result;
}

/**
 * Transform descriptions
 */
function transformDescriptions(ctx: IngestionContext): Partial<TransformedPropertyData> {
  const result: Partial<TransformedPropertyData> = {};
  
  if (!ctx.descriptions) return result;
  
  const desc = ctx.descriptions;
  
  // Main description (SEED_ONLY - only if empty)
  if (desc.description) {
    result.description = desc.description;
  }
  
  return result;
}

/**
 * Transform rules into amenities update
 */
function transformRules(ctx: IngestionContext): Record<string, unknown> {
  const amenitiesUpdate: Record<string, unknown> = {};
  
  if (!ctx.rules || !Array.isArray(ctx.rules)) return amenitiesUpdate;
  
  for (const rule of ctx.rules) {
    switch (rule.type) {
      case 'PET_POLICY':
        amenitiesUpdate.pets_allowed = rule.enabled ?? false;
        break;
      case 'SMOKING_POLICY':
        amenitiesUpdate.smoking_allowed = rule.enabled ?? false;
        break;
      case 'PARTY_POLICY':
        amenitiesUpdate.parties_allowed = rule.enabled ?? false;
        break;
      case 'CHILD_POLICY':
        amenitiesUpdate.children_allowed = rule.enabled ?? true;
        break;
      case 'CHECK_IN':
        if (rule.time) {
          amenitiesUpdate.check_in_from = rule.time;
        }
        break;
      case 'CHECK_OUT':
        if (rule.time) {
          amenitiesUpdate.check_out_to = rule.time;
        }
        break;
      case 'MINIMUM_AGE':
        if (rule.value !== undefined) {
          amenitiesUpdate.minimum_guest_age = rule.value;
        }
        break;
      case 'QUIET_HOURS':
        amenitiesUpdate.quiet_hours_enforced = rule.enabled ?? false;
        break;
    }
  }
  
  return amenitiesUpdate;
}

/**
 * Transform amenities list into facilities array
 */
function transformAmenities(ctx: IngestionContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  if (!ctx.amenities || !Array.isArray(ctx.amenities)) return result;
  
  // Extract facility names
  const facilities = ctx.amenities
    .filter(a => a.type)
    .map(a => a.type);
  
  if (facilities.length > 0) {
    result.facilities = facilities;
  }
  
  // Extract highlights
  const highlights = ctx.amenities
    .filter(a => a.highlight)
    .map(a => a.type || a.description)
    .filter(Boolean);
  
  if (highlights.length > 0) {
    result.highlights = highlights;
  }
  
  return result;
}

/**
 * Transform photos into images array
 * Falls back to pictureLink from property data if /photos endpoint is empty
 */
function transformMedia(ctx: IngestionContext): PropertyImage[] {
  // First, try the photos endpoint
  if (ctx.photos && Array.isArray(ctx.photos) && ctx.photos.length > 0) {
    return ctx.photos
      .filter(p => p.originalImageUrl || p.url)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .map((photo, index) => ({
        url: photo.originalImageUrl || photo.url || '',
        alt: photo.caption || '',
        order: photo.order ?? index,
        category: photo.category || 'property',
      }));
  }
  
  // Fallback: Use pictureLink from property data (common for sandbox/sample properties)
  if (ctx.property) {
    const pictureLink = ctx.property.pictureLink || ctx.property.picture;
    if (pictureLink) {
      return [{
        url: pictureLink,
        alt: ctx.property.name || 'Property image',
        order: 0,
        category: 'property',
      }];
    }
  }
  
  return [];
}

/**
 * Extract fee by type
 */
function getFeeByType(fees: HostfullyFeePayload[], type: string): number | undefined {
  const fee = fees.find(f => 
    f.type?.toUpperCase() === type.toUpperCase() ||
    f.name?.toUpperCase().includes(type.toUpperCase())
  );
  return fee?.amount;
}

/**
 * Transform bed configuration from Hostfully format to ROL format
 */
function transformBedConfiguration(
  beds: unknown
): Array<{ type: string; count: number }> {
  const BED_TYPE_MAP: Record<string, string> = {
    'KING': 'king',
    'KING_BED': 'king',
    'QUEEN': 'queen',
    'QUEEN_BED': 'queen',
    'DOUBLE': 'double',
    'DOUBLE_BED': 'double',
    'TWIN': 'twin',
    'TWIN_BED': 'twin',
    'SINGLE': 'single',
    'SINGLE_BED': 'single',
    'SOFA_BED': 'sofa-bed',
    'SOFABED': 'sofa-bed',
    'BUNK': 'bunk',
    'BUNK_BED': 'bunk',
  };
  
  // If it's already an array of bed objects
  if (Array.isArray(beds)) {
    return beds.map((b: unknown) => {
      if (typeof b === 'object' && b !== null) {
        const bed = b as Record<string, unknown>;
        const rawType = String(bed.type || bed.bedType || 'bed').toUpperCase();
        return {
          type: BED_TYPE_MAP[rawType] || rawType.toLowerCase() || 'bed',
          count: Number(bed.count || bed.quantity || 1),
        };
      }
      return { type: 'bed', count: 1 };
    });
  }
  
  // If it's just a number (total bed count)
  if (typeof beds === 'number' && beds > 0) {
    return [{ type: 'bed', count: beds }];
  }
  
  return [];
}

/**
 * Transform rooms with fee data, rate type linkage, and extended fields
 */
function transformRooms(ctx: IngestionContext): TransformedRoomData[] {
  if (!ctx.rooms || !Array.isArray(ctx.rooms)) return [];
  
  const fees = ctx.fees || [];
  const syncedAt = new Date().toISOString();
  
  return ctx.rooms.map(room => {
    const lockedFields: string[] = [];
    
    // Core fields (HOSTFULLY_AT_INGEST)
    lockedFields.push('hostfully_room_id', 'name', 'max_guests', 'bedrooms', 'bathrooms', 'beds');
    
    // Extract room category from unit name (e.g., "101 Studio" -> "Studio")
    const roomCategory = room.name ? room.name.replace(/^\d+\s*/, '').trim() || room.name : undefined;
    
    // Determine rate type from room data
    const rateType = room.rateType || 'per-unit';
    
    // Transform bed configuration
    const bedConfig = transformBedConfiguration(room.bedTypes || room.beds);
    
    // Extract raw amenities for correlation
    const facilitiesRaw = room.amenities || [];
    
    const transformed: TransformedRoomData = {
      hostfully_room_id: room.uid,
      name: room.name,
      description: room.description,
      max_guests: room.maxGuests,
      min_guests: 1,
      bedrooms: room.bedrooms,
      bathrooms: room.bathrooms,
      beds: room.beds,
      room_size: room.size,
      room_size_unit: room.sizeUnit || 'sqm',
      check_in_time: room.checkInTime,
      check_out_time: room.checkOutTime,
      cleaning_fee: getFeeByType(fees, 'CLEANING'),
      extra_guest_fee: getFeeByType(fees, 'EXTRA_GUEST'),
      security_deposit: getFeeByType(fees, 'SECURITY_DEPOSIT'),
      amenities: room.amenities ? { items: room.amenities } : undefined,
      // Room category
      property_type: roomCategory,
      // Extended fields
      extra_person_policy: room.extraPersonPolicy,
      bed_configuration: bedConfig,
      facilities_raw: facilitiesRaw,
      rate_type: rateType,
      // Link rooms to their rate type
      linked_rate_type_ids: [rateType],
      pms_synced_fields: lockedFields,
      last_synced_at: syncedAt,
    };
    
    // Add fee fields to locked list if present
    if (transformed.cleaning_fee !== undefined) lockedFields.push('cleaning_fee');
    if (transformed.extra_guest_fee !== undefined) lockedFields.push('extra_guest_fee');
    if (transformed.security_deposit !== undefined) lockedFields.push('security_deposit');
    if (room.checkInTime) lockedFields.push('check_in_time');
    if (room.checkOutTime) lockedFields.push('check_out_time');
    if (room.extraPersonPolicy) lockedFields.push('extra_person_policy');
    if (bedConfig.length > 0) lockedFields.push('bed_configuration');
    if (facilitiesRaw.length > 0) lockedFields.push('facilities_raw');
    lockedFields.push('rate_type', 'linked_rate_type_ids');
    
    transformed.pms_synced_fields = lockedFields;
    
    return transformed;
  });
}

/**
 * Transform rate types (synthetic for Hostfully since it doesn't have discrete rate entities)
 */
function transformRateTypes(_ctx: IngestionContext): TransformedRateTypeData[] {
  // Hostfully uses "per-unit" as the standard rate type
  // This is a synthetic rate type since Hostfully doesn't have discrete rate entities
  return [
    {
      external_rate_type_id: 'per-unit',
      name: 'Per Unit Rate',
      description: 'Standard nightly rate per unit',
      price_type: 'per-unit',
    },
  ];
}

/**
 * Transform pricing periods into seasons
 */
function transformSeasons(ctx: IngestionContext): TransformedSeasonData[] {
  if (!ctx.pricingPeriods || !Array.isArray(ctx.pricingPeriods)) return [];
  
  return ctx.pricingPeriods.map(period => ({
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    minStay: period.minStay,
    maxStay: period.maxStay,
    currency: period.currency,
    weekendOnly: period.weekendOnly,
    notes: period.notes,
    priority: period.priority,
    active: period.active ?? true,
  }));
}

// ============================================================================
// MAIN TRANSFORM FUNCTION
// ============================================================================

/**
 * Apply all 68 field transformations
 * Returns a consolidated TransformedData object ready for DB write
 */
export function transformFullIngestion(ctx: IngestionContext): TransformedData {
  const allLockedFields: string[] = [];
  
  // 1. Transform property core
  const propertyCore = transformPropertyCore(ctx);
  if (propertyCore.lockedFieldNames) {
    allLockedFields.push(...propertyCore.lockedFieldNames);
    delete propertyCore.lockedFieldNames;
  }
  
  // 2. Transform descriptions
  const descriptions = transformDescriptions(ctx);
  
  // 3. Transform rules -> amenities
  const rulesAmenities = transformRules(ctx);
  
  // 4. Transform amenities -> facilities
  const facilitiesAmenities = transformAmenities(ctx);
  
  // 5. Transform media -> images
  const images = transformMedia(ctx);
  
  // 6. Transform rooms
  const rooms = transformRooms(ctx);
  
  // 7. Transform rate types
  const rateTypes = transformRateTypes(ctx);
  
  // 8. Transform seasons
  const seasons = transformSeasons(ctx);
  
  // Merge all amenities updates
  const amenitiesUpdate = {
    ...rulesAmenities,
    ...facilitiesAmenities,
  };
  
  // Add seasons to amenities if present
  if (seasons.length > 0) {
    amenitiesUpdate.seasons = seasons;
  }
  
  // Collect room locked fields
  const roomLockedFields = rooms.length > 0 
    ? rooms[0].pms_synced_fields 
    : [];
  
  return {
    property: {
      ...propertyCore,
      ...descriptions,
      amenitiesUpdate,
      images,
      lockedFieldNames: allLockedFields,
    } as TransformedPropertyData,
    rooms,
    rateTypes,
    seasons,
    lockedFieldNames: allLockedFields,
    roomLockedFields,
  };
}
