/**
 * HOSTFULLY INGESTION TYPES
 * Type definitions for the one-time property data ingestion pipeline
 */

// ============================================================================
// RAW HOSTFULLY API PAYLOADS
// ============================================================================

export interface HostfullyPropertyPayload {
  uid: string;
  name: string;
  propertyType?: string;
  type?: string;
  address1?: string;
  address2?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  bedrooms?: number;
  bathrooms?: number;
  beds?: number;
  maxGuests?: number;
  minGuests?: number;
  baseDailyRate?: number;
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  pictureLink?: string;
  picture?: string;
}

export interface HostfullyDescriptionPayload {
  propertyUid: string;
  description?: string;
  summary?: string;
  houseManual?: string;
  space?: string;
  access?: string;
  neighborhood?: string;
  transit?: string;
  notes?: string;
  language?: string;
}

export interface HostfullyRulePayload {
  propertyUid: string;
  type: string;
  enabled?: boolean;
  value?: string | number;
  time?: string;
  description?: string;
}

export interface HostfullyAmenityPayload {
  type: string;
  description?: string;
  category?: string;
  icon?: string;
  highlight?: boolean;
  paid?: boolean;
  quantity?: number;
  notes?: string;
}

export interface HostfullyPhotoPayload {
  uid?: string;
  originalImageUrl?: string;
  url?: string;
  caption?: string;
  order?: number;
  category?: string;
  isPrimary?: boolean;
}

export interface HostfullyRoomPayload {
  uid: string;
  name: string;
  description?: string;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  beds?: number;
  size?: number;
  sizeUnit?: string;
  floor?: string;
  view?: string;
  amenities?: string[];
  notes?: string;
  checkInTime?: string;
  checkOutTime?: string;
  baseDailyRate?: number;
  currency?: string;
}

export interface HostfullyFeePayload {
  uid?: string;
  type: string;
  name?: string;
  amount?: number;
  currency?: string;
  isPercentage?: boolean;
  perStay?: boolean;
  perNight?: boolean;
  perGuest?: boolean;
  taxable?: boolean;
}

export interface HostfullyPricingPeriodPayload {
  uid?: string;
  name: string;
  startDate: string;
  endDate: string;
  minStay?: number;
  maxStay?: number;
  basePrice?: number;
  weekendPrice?: number;
  currency?: string;
  weekendOnly?: boolean;
  notes?: string;
  priority?: number;
  active?: boolean;
}

// ============================================================================
// INGESTION CONTEXT
// ============================================================================

export interface IngestionContext {
  propertyUid: string;
  rolPropertyId: string;        // Existing ROL property ID to update
  ownerCredentialId: string;
  
  // Raw API payloads
  property: HostfullyPropertyPayload | null;
  descriptions: HostfullyDescriptionPayload | null;
  rules: HostfullyRulePayload[] | null;
  amenities: HostfullyAmenityPayload[] | null;
  photos: HostfullyPhotoPayload[] | null;
  rooms: HostfullyRoomPayload[] | null;
  fees: HostfullyFeePayload[] | null;
  pricingPeriods: HostfullyPricingPeriodPayload[] | null;
  
  // Detection flags
  isMultiUnit: boolean;
  
  // Error tracking
  errors: string[];
  warnings: string[];
  
  // Phases completed
  phasesCompleted: string[];
}

// ============================================================================
// TRANSFORMED DATA (Ready for DB write)
// ============================================================================

export interface TransformedPropertyData {
  // Direct property columns
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  property_type?: string;
  description?: string;
  hostfully_property_uid?: string;
  
  // Will be merged into existing amenities JSONB
  amenitiesUpdate: Record<string, unknown>;
  
  // Property images array
  images: PropertyImage[];
  
  // Fields that were populated
  lockedFieldNames: string[];
}

export interface PropertyImage {
  url: string;
  alt?: string;
  order?: number;
  category?: string;
}

export interface TransformedRoomData {
  hostfully_room_id: string;
  name: string;
  description?: string;
  max_guests?: number;
  min_guests?: number;
  bedrooms?: number;
  bathrooms?: number;
  beds?: number;
  room_size?: number;
  room_size_unit?: string;
  check_in_time?: string;
  check_out_time?: string;
  cleaning_fee?: number;
  extra_guest_fee?: number;
  security_deposit?: number;
  amenities?: unknown;
  images?: unknown;
  
  // Metadata
  pms_synced_fields: string[];
  last_synced_at: string;
}

export interface TransformedSeasonData {
  name: string;
  startDate: string;
  endDate: string;
  minStay?: number;
  maxStay?: number;
  currency?: string;
  weekendOnly?: boolean;
  notes?: string;
  priority?: number;
  active?: boolean;
}

export interface TransformedData {
  property: TransformedPropertyData;
  rooms: TransformedRoomData[];
  seasons: TransformedSeasonData[];
  lockedFieldNames: string[];
  roomLockedFields: string[];
}

// ============================================================================
// INGESTION RESULT
// ============================================================================

export interface IngestionResult {
  property_id: string;
  fields_written: number;
  rooms_processed: number;
  locked_fields: boolean;
  phases_completed: string[];
  warnings?: string[];
}

// ============================================================================
// HOSTFULLY API CREDENTIALS
// ============================================================================

export interface HostfullyCredentials {
  api_key: string;
  environment: "sandbox" | "staging" | "production";
  owner_credential_id?: string;
}
