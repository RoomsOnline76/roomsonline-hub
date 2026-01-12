/**
 * AUTHORITATIVE FIELD MAP
 * Hostfully → ROL one-time ingestion
 * Total mapped fields: 68
 *
 * HARD RULES:
 * - Read-only from Hostfully
 * - One-time population
 * - All written fields are LOCKED in ROL
 * - No pricing authority
 */

export type FieldAuthority =
  | "HOSTFULLY_AT_INGEST"
  | "SEED_ONLY";

export interface FieldMapEntry {
  hf: string;                 // Hostfully JSON path
  rol: string;                // ROL DB path
  authority: FieldAuthority;
  scope: "property" | "room" | "meta";
}

/**
 * =========================
 * PROPERTY CORE (12)
 * =========================
 */
const PROPERTY_CORE: FieldMapEntry[] = [
  { hf: "name", rol: "properties.name", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "address.street", rol: "properties.address", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "address.city", rol: "properties.city", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "address.state", rol: "properties.state", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "address.postalCode", rol: "properties.postcode", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "address.country", rol: "properties.country", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "latitude", rol: "properties.latitude", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "longitude", rol: "properties.longitude", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "timezone", rol: "properties.timezone", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "propertyType", rol: "properties.property_type", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "createdAt", rol: "properties.pms_created_at", authority: "SEED_ONLY", scope: "meta" },
  { hf: "hostfullyPropertyUid", rol: "properties.hostfully_property_uid", authority: "HOSTFULLY_AT_INGEST", scope: "meta" }
];

/**
 * =========================
 * PROPERTY DESCRIPTIONS (6)
 * =========================
 */
const PROPERTY_DESCRIPTIONS: FieldMapEntry[] = [
  { hf: "description", rol: "properties.description", authority: "SEED_ONLY", scope: "property" },
  { hf: "summary", rol: "properties.short_description", authority: "SEED_ONLY", scope: "property" },
  { hf: "houseManual", rol: "properties.house_manual", authority: "SEED_ONLY", scope: "property" },
  { hf: "language", rol: "properties.primary_language", authority: "SEED_ONLY", scope: "meta" },
  { hf: "checkInInstructions", rol: "properties.check_in_instructions", authority: "SEED_ONLY", scope: "property" },
  { hf: "checkOutInstructions", rol: "properties.check_out_instructions", authority: "SEED_ONLY", scope: "property" }
];

/**
 * =========================
 * PROPERTY RULES (8)
 * =========================
 */
const PROPERTY_RULES: FieldMapEntry[] = [
  { hf: "rules.PET_POLICY.enabled", rol: "properties.amenities.pets_allowed", authority: "SEED_ONLY", scope: "property" },
  { hf: "rules.SMOKING_POLICY.enabled", rol: "properties.amenities.smoking_allowed", authority: "SEED_ONLY", scope: "property" },
  { hf: "rules.PARTY_POLICY.enabled", rol: "properties.amenities.parties_allowed", authority: "SEED_ONLY", scope: "property" },
  { hf: "rules.CHILD_POLICY.enabled", rol: "properties.amenities.children_allowed", authority: "SEED_ONLY", scope: "property" },
  { hf: "rules.CHECK_IN.time", rol: "properties.amenities.check_in_from", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "rules.CHECK_OUT.time", rol: "properties.amenities.check_out_to", authority: "HOSTFULLY_AT_INGEST", scope: "property" },
  { hf: "rules.MINIMUM_AGE.value", rol: "properties.amenities.minimum_guest_age", authority: "SEED_ONLY", scope: "property" },
  { hf: "rules.QUIET_HOURS.enabled", rol: "properties.amenities.quiet_hours_enforced", authority: "SEED_ONLY", scope: "property" }
];

/**
 * =========================
 * PROPERTY AMENITIES (8)
 * =========================
 */
const PROPERTY_AMENITIES: FieldMapEntry[] = [
  { hf: "amenities[].type", rol: "properties.amenities.facilities", authority: "SEED_ONLY", scope: "property" },
  { hf: "amenities[].description", rol: "properties.amenities.amenities", authority: "SEED_ONLY", scope: "property" },
  { hf: "amenities[].category", rol: "properties.amenities.categories", authority: "SEED_ONLY", scope: "property" },
  { hf: "amenities[].icon", rol: "properties.amenities.icons", authority: "SEED_ONLY", scope: "meta" },
  { hf: "amenities[].highlight", rol: "properties.amenities.highlights", authority: "SEED_ONLY", scope: "property" },
  { hf: "amenities[].paid", rol: "properties.amenities.paid_features", authority: "SEED_ONLY", scope: "property" },
  { hf: "amenities[].quantity", rol: "properties.amenities.quantities", authority: "SEED_ONLY", scope: "property" },
  { hf: "amenities[].notes", rol: "properties.amenities.notes", authority: "SEED_ONLY", scope: "property" }
];

/**
 * =========================
 * PHOTOS / MEDIA (4)
 * =========================
 */
const PROPERTY_MEDIA: FieldMapEntry[] = [
  { hf: "photos[].originalImageUrl", rol: "properties.images.url", authority: "SEED_ONLY", scope: "property" },
  { hf: "photos[].caption", rol: "properties.images.alt", authority: "SEED_ONLY", scope: "property" },
  { hf: "photos[].order", rol: "properties.images.order", authority: "SEED_ONLY", scope: "property" },
  { hf: "photos[].category", rol: "properties.images.category", authority: "SEED_ONLY", scope: "meta" }
];

/**
 * =========================
 * ROOM CORE (14)
 * =========================
 */
const ROOM_CORE: FieldMapEntry[] = [
  { hf: "rooms[].uid", rol: "hostfully_room_types.external_room_uid", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].name", rol: "hostfully_room_types.name", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].description", rol: "hostfully_room_types.description", authority: "SEED_ONLY", scope: "room" },
  { hf: "rooms[].maxGuests", rol: "hostfully_room_types.max_guests", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].bedrooms", rol: "hostfully_room_types.bedrooms", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].bathrooms", rol: "hostfully_room_types.bathrooms", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].beds", rol: "hostfully_room_types.beds", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].size", rol: "hostfully_room_types.room_size", authority: "SEED_ONLY", scope: "room" },
  { hf: "rooms[].floor", rol: "hostfully_room_types.floor", authority: "SEED_ONLY", scope: "room" },
  { hf: "rooms[].view", rol: "hostfully_room_types.view_type", authority: "SEED_ONLY", scope: "room" },
  { hf: "rooms[].amenities", rol: "hostfully_room_types.amenities", authority: "SEED_ONLY", scope: "room" },
  { hf: "rooms[].notes", rol: "hostfully_room_types.notes", authority: "SEED_ONLY", scope: "room" },
  { hf: "rooms[].checkInTime", rol: "hostfully_room_types.check_in_time", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].checkOutTime", rol: "hostfully_room_types.check_out_time", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  // Extended room fields
  { hf: "rooms[].extraPersonPolicy", rol: "hostfully_room_types.extra_person_policy", authority: "SEED_ONLY", scope: "room" },
  { hf: "rooms[].bedTypes", rol: "hostfully_room_types.bed_configuration", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].rateType", rol: "hostfully_room_types.rate_type", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "rooms[].photos", rol: "hostfully_room_types.images", authority: "SEED_ONLY", scope: "room" },
  { hf: "rooms[].amenities", rol: "hostfully_room_types.facilities_raw", authority: "SEED_ONLY", scope: "room" },
];

/**
 * =========================
 * FEES & SEASONS (16)
 * =========================
 */
const FEES_AND_SEASONS: FieldMapEntry[] = [
  { hf: "fees[CLEANING].amount", rol: "hostfully_room_types.cleaning_fee", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "fees[EXTRA_GUEST].amount", rol: "hostfully_room_types.extra_guest_fee", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "fees[SECURITY_DEPOSIT].amount", rol: "hostfully_room_types.security_deposit", authority: "HOSTFULLY_AT_INGEST", scope: "room" },
  { hf: "fees[].type", rol: "hostfully_room_types.fee_types", authority: "SEED_ONLY", scope: "room" },
  { hf: "fees[].perStay", rol: "hostfully_room_types.fee_per_stay", authority: "SEED_ONLY", scope: "room" },
  { hf: "fees[].perNight", rol: "hostfully_room_types.fee_per_night", authority: "SEED_ONLY", scope: "room" },

  { hf: "pricingPeriods[].name", rol: "properties.amenities.seasons", authority: "SEED_ONLY", scope: "property" },
  { hf: "pricingPeriods[].startDate", rol: "properties.amenities.season_start", authority: "SEED_ONLY", scope: "property" },
  { hf: "pricingPeriods[].endDate", rol: "properties.amenities.season_end", authority: "SEED_ONLY", scope: "property" },
  { hf: "pricingPeriods[].minStay", rol: "properties.amenities.season_min_stay", authority: "SEED_ONLY", scope: "property" },
  { hf: "pricingPeriods[].maxStay", rol: "properties.amenities.season_max_stay", authority: "SEED_ONLY", scope: "property" },
  { hf: "pricingPeriods[].currency", rol: "properties.currency", authority: "SEED_ONLY", scope: "meta" },
  { hf: "pricingPeriods[].weekendOnly", rol: "properties.amenities.weekend_only", authority: "SEED_ONLY", scope: "property" },
  { hf: "pricingPeriods[].notes", rol: "properties.amenities.season_notes", authority: "SEED_ONLY", scope: "property" },
  { hf: "pricingPeriods[].priority", rol: "properties.amenities.season_priority", authority: "SEED_ONLY", scope: "property" },
  { hf: "pricingPeriods[].active", rol: "properties.amenities.season_active", authority: "SEED_ONLY", scope: "property" }
];

/**
 * =========================
 * EXPORT – TOTAL: 73 FIELDS
 * =========================
 */
export const HOSTFULLY_FIELD_MAP: FieldMapEntry[] = [
  ...PROPERTY_CORE,
  ...PROPERTY_DESCRIPTIONS,
  ...PROPERTY_RULES,
  ...PROPERTY_AMENITIES,
  ...PROPERTY_MEDIA,
  ...ROOM_CORE,
  ...FEES_AND_SEASONS
];

// Field counts for validation
export const FIELD_COUNTS = {
  PROPERTY_CORE: PROPERTY_CORE.length,
  PROPERTY_DESCRIPTIONS: PROPERTY_DESCRIPTIONS.length,
  PROPERTY_RULES: PROPERTY_RULES.length,
  PROPERTY_AMENITIES: PROPERTY_AMENITIES.length,
  PROPERTY_MEDIA: PROPERTY_MEDIA.length,
  ROOM_CORE: ROOM_CORE.length,
  FEES_AND_SEASONS: FEES_AND_SEASONS.length,
  TOTAL: HOSTFULLY_FIELD_MAP.length,
};

// Exported groups for selective access
export {
  PROPERTY_CORE,
  PROPERTY_DESCRIPTIONS,
  PROPERTY_RULES,
  PROPERTY_AMENITIES,
  PROPERTY_MEDIA,
  ROOM_CORE,
  FEES_AND_SEASONS,
};
