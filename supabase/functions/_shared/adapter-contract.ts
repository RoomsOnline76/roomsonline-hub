// ============================================================================
// ██████╗ ███╗   ███╗███████╗     █████╗ ██████╗  █████╗ ██████╗ ████████╗███████╗██████╗ 
// ██╔══██╗████╗ ████║██╔════╝    ██╔══██╗██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██╔══██╗
// ██████╔╝██╔████╔██║███████╗    ███████║██║  ██║███████║██████╔╝   ██║   █████╗  ██████╔╝
// ██╔═══╝ ██║╚██╔╝██║╚════██║    ██╔══██║██║  ██║██╔══██║██╔═══╝    ██║   ██╔══╝  ██╔══██╗
// ██║     ██║ ╚═╝ ██║███████║    ██║  ██║██████╔╝██║  ██║██║        ██║   ███████╗██║  ██║
// ╚═╝     ╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝        ╚═╝   ╚══════╝╚═╝  ╚═╝
// 
// STRICT ADAPTER RESPONSE CONTRACT
// ============================================================================
// 
// RULE: Every PMS adapter MUST return responses conforming to these interfaces.
// NO EXCEPTIONS. NO "almost the same" data.
// 
// BASE: Benson API is the reference implementation.
// NEW ADAPTERS: Must conform. May ADD fields but NEVER remove or rename base fields.
// 
// ============================================================================

/**
 * Base response wrapper - ALL adapter responses MUST use this shape
 */
export interface AdapterResponse<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The response data (null if error) */
  data: T | null;
  /** Error details (null if success) */
  error: AdapterError | null;
  /** PMS system identifier */
  source: PmsSource;
  /** When this response was generated (ISO8601) */
  fetched_at: string;
  /** Action that was performed */
  action: string;
}

/**
 * Supported PMS sources
 */
export type PmsSource = 
  | 'roomsonline'  // Native PMS - first-class internal adapter
  | 'benson' 
  | 'nightsbridge' 
  | 'checkfront' 
  | 'siteminder'
  | 'littlehotelier'
  | 'cloudbeds'
  | 'hostfully'
  | 'hotelbeds';

/**
 * Standardized error structure
 */
export interface AdapterError {
  /** Error code (HTTP status or custom) */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Original error details for debugging */
  details?: unknown;
}

// ============================================================================
// AVAILABILITY RESPONSE (fetch_availability action)
// ============================================================================

export interface AvailabilityResponse {
  room_types: RoomTypeAvailability[];
}

export interface RoomTypeAvailability {
  /** External PMS room type ID */
  room_type_id: string;
  /** Room type name */
  name: string;
  /** Daily availability data */
  availability_per_night: DailyAvailability[];
  /** Rate types available for this room */
  rate_types: RateTypeData[];
}

export interface DailyAvailability {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Number of rooms available */
  available_units: number;
  /** Restrictions for this date */
  restrictions: AvailabilityRestrictions;
}

export interface AvailabilityRestrictions {
  /** Stop sell flag - room cannot be booked */
  stop_sell: boolean;
  /** Minimum stay nights required */
  min_stay: number | null;
  /** Maximum stay nights allowed */
  max_stay: number | null;
  /** Minimum days in advance to book */
  lead_days_advance: number | null;
  /** Maximum days in advance to book */
  lead_days_post: number | null;
  /** Closed to arrival - cannot check in on this date */
  closed_to_arrival: boolean;
  /** Closed to departure - cannot check out on this date */
  closed_to_departure: boolean;
}

export interface RateTypeData {
  /** External PMS rate type ID */
  rate_type_id: string;
  /** Rate type name */
  name: string;
  /** Price type (per_room, per_person, etc.) */
  price_type: string | null;
  /** Daily rates */
  rates: DailyRate[];
}

export interface DailyRate {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Base room amount */
  room_amount: number;
  /** Per-adult amounts (adult_amount_1, adult_amount_2, etc.) */
  adult_amounts: Record<string, number>;
  /** Teen amount */
  teen_amount: number | null;
  /** Child amount */
  child_amount: number | null;
  /** Infant amount */
  infant_amount: number | null;
  /** Currency code */
  currency: string;
}

// ============================================================================
// ROOM TYPES RESPONSE (get_room_types action)
// ============================================================================

export interface RoomTypesResponse {
  room_types: RoomTypeDefinition[];
}

export interface RoomTypeDefinition {
  /** External PMS room type ID */
  room_type_id: string;
  /** Room type name */
  name: string;
  /** Description */
  description: string | null;
  /** Minimum guests */
  min_guests: number;
  /** Maximum guests */
  max_guests: number;
  /** Guest type rules */
  guest_rules: GuestRules;
  /** Linked rate type IDs */
  linked_rate_type_ids: string[];
}

export interface GuestRules {
  allow_teens: boolean;
  teen_min_age: number | null;
  teen_max_age: number | null;
  allow_children: boolean;
  child_min_age: number | null;
  child_max_age: number | null;
  allow_infants: boolean;
  infant_min_age: number | null;
  infant_max_age: number | null;
}

// ============================================================================
// RATE TYPES RESPONSE (get_rate_types action)
// ============================================================================

export interface RateTypesResponse {
  rate_types: RateTypeDefinition[];
}

export interface RateTypeDefinition {
  /** External PMS rate type ID */
  rate_type_id: string;
  /** Rate type name */
  name: string;
  /** Description */
  description: string | null;
  /** Price type (per_room, per_person, etc.) */
  price_type: string | null;
  /** Stay restrictions */
  min_stay_days: number | null;
  max_stay_days: number | null;
  min_advance_days: number | null;
  max_advance_days: number | null;
}

// ============================================================================
// RESERVATIONS RESPONSE (get_reservations action)
// ============================================================================

export interface ReservationsResponse {
  reservations: ReservationData[];
}

export interface ReservationData {
  /** External PMS reservation ID */
  reservation_id: string;
  /** Reservation status */
  status: string;
  /** Arrival date (YYYY-MM-DD) */
  arrival_date: string;
  /** Departure date (YYYY-MM-DD) */
  departure_date: string;
  /** Contact details */
  contact: ContactInfo;
  /** Rooms in this reservation */
  rooms: ReservationRoom[];
  /** Total amount */
  total_amount: number;
  /** Currency code */
  currency: string;
  /** Rate type name */
  rate_type_name: string | null;
  /** Reservation reference/voucher */
  voucher: string | null;
  /** Special requests/notes */
  notes: string | null;
  /** Creation timestamp */
  created_at: string | null;
}

export interface ContactInfo {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface ReservationRoom {
  /** Room type ID */
  room_type_id: string;
  /** Room type name */
  room_type_name: string | null;
  /** Number of adults */
  adults: number;
  /** Number of teens */
  teens: number;
  /** Number of children */
  children: number;
  /** Number of infants */
  infants: number;
}

// ============================================================================
// CREATE RESERVATION RESPONSE (create_reservation action)
// ============================================================================

export interface CreateReservationResponse {
  /** External PMS reservation ID */
  reservation_id: string;
  /** Confirmation/voucher number */
  confirmation_number: string | null;
  /** Reservation status */
  status: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a successful adapter response
 */
export function createSuccessResponse<T>(
  data: T,
  source: PmsSource,
  action: string
): AdapterResponse<T> {
  return {
    success: true,
    data,
    error: null,
    source,
    fetched_at: new Date().toISOString(),
    action,
  };
}

/**
 * Create an error adapter response
 */
export function createErrorResponse(
  code: string,
  message: string,
  source: PmsSource,
  action: string,
  details?: unknown
): AdapterResponse<null> {
  return {
    success: false,
    data: null,
    error: { code, message, details },
    source,
    fetched_at: new Date().toISOString(),
    action,
  };
}

/**
 * Default restrictions when not provided by PMS
 */
export const DEFAULT_RESTRICTIONS: AvailabilityRestrictions = {
  stop_sell: false,
  min_stay: null,
  max_stay: null,
  lead_days_advance: null,
  lead_days_post: null,
  closed_to_arrival: false,
  closed_to_departure: false,
};

// ============================================================================
// STANDARDIZED ERROR CODES
// ============================================================================

/**
 * All adapters MUST use these error codes for consistency.
 * Do NOT create custom error codes - use these or request additions.
 */
export const ERROR_CODES = {
  /** Invalid request parameters or format */
  INVALID_REQUEST: 'INVALID_REQUEST',
  /** Authentication/credential failure */
  AUTH_FAILED: 'AUTH_FAILED',
  /** User lacks permission for this operation */
  ACCESS_DENIED: 'ACCESS_DENIED',
  /** Requested resource not found */
  NOT_FOUND: 'NOT_FOUND',
  /** Availability changed since last check (booking conflict) */
  AVAILABILITY_CHANGED: 'AVAILABILITY_CHANGED',
  /** PMS rejected the booking (stop sell, restrictions, etc.) */
  BOOKING_REJECTED: 'BOOKING_REJECTED',
  /** PMS does not support modification */
  MODIFICATION_NOT_SUPPORTED: 'MODIFICATION_NOT_SUPPORTED',
  /** PMS does not support cancellation */
  CANCELLATION_NOT_SUPPORTED: 'CANCELLATION_NOT_SUPPORTED',
  /** Internal adapter error (catch-all for unexpected failures) */
  INTERNAL_ADAPTER_ERROR: 'INTERNAL_ADAPTER_ERROR',
  /** PMS system is unavailable/unreachable */
  PMS_UNAVAILABLE: 'PMS_UNAVAILABLE',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ============================================================================
// STANDARDIZED ACTION NAMES
// ============================================================================

/**
 * All adapters MUST use these action names for consistency.
 * Each PMS may support a subset of these actions based on capabilities.
 */
export const ACTIONS = {
  /** Returns adapter capability flags */
  GET_CAPABILITIES: 'get_capabilities',
  /** Tests PMS connection and credentials */
  HEALTH_CHECK: 'health_check',
  /** Fetches availability and rates for date range */
  FETCH_AVAILABILITY: 'fetch_availability',
  /** Gets room type definitions */
  GET_ROOM_TYPES: 'get_room_types',
  /** Gets rate type definitions */
  GET_RATE_TYPES: 'get_rate_types',
  /** Gets reservations for date range */
  GET_RESERVATIONS: 'get_reservations',
  /** Creates a new reservation */
  CREATE_RESERVATION: 'create_reservation',
  /** Modifies an existing reservation */
  MODIFY_RESERVATION: 'modify_reservation',
  /** Cancels an existing reservation */
  CANCEL_RESERVATION: 'cancel_reservation',
  /** (Native only) Sets availability directly */
  SET_AVAILABILITY: 'set_availability',
  /** (Native only) Sets rates directly */
  SET_RATES: 'set_rates',
  /** Fetches property editorial data for sync - follows pms-implementation-master.json rules */
  FETCH_PROPERTY_DATA: 'fetch_property_data',
} as const;

export type ActionName = typeof ACTIONS[keyof typeof ACTIONS];

// ============================================================================
// EDITORIAL DATA RESPONSE (fetch_property_data action)
// ============================================================================
//
// IMPORTANT: All adapters implementing fetch_property_data MUST:
// 1. Follow rules defined in src/config/pms-implementation-master.json
// 2. Only return fields their PMS is configured to provide
// 3. Use these standardized interfaces for consistency
//
// FIELD AUTHORITY LEVELS (from master JSON):
// ┌─────────────────┬────────────────────────────────────────────────────────┐
// │ authoritative   │ Always overwrite local data with PMS data              │
// │ seed_only       │ Only populate if local field is empty/null             │
// │ partial         │ Merge with existing (arrays concat, objects shallow)   │
// │ not_available   │ PMS doesn't provide this data - adapter returns null   │
// └─────────────────┴────────────────────────────────────────────────────────┘
//
// PMS CAPABILITY MATRIX (see master JSON for authoritative source):
// ┌────────────┬────────┬────────────┬──────────┬───────────┬─────────────────┐
// │ Field      │ Benson │ Checkfront │ Hostfully│ Cloudbeds │ Little Hotelier │
// ├────────────┼────────┼────────────┼──────────┼───────────┼─────────────────┤
// │ name       │ ✅ auth │ ✅ auth     │ ✅ auth   │ ✅ auth    │ ✅ auth          │
// │ description│ ❌ n/a  │ 🌱 seed    │ ✅ auth   │ ✅ auth    │ ✅ auth          │
// │ location   │ ❌ n/a  │ ❌ n/a      │ ✅ auth   │ ✅ auth    │ ✅ auth          │
// │ geo        │ ❌ n/a  │ ❌ n/a      │ ❌ n/a    │ ✅ auth    │ ❌ n/a           │
// │ images     │ ❌ n/a  │ ❌ n/a      │ ✅ auth   │ ✅ auth    │ 🔄 partial       │
// │ amenities  │ ❌ n/a  │ ❌ n/a      │ 🔄 partial│ 🔄 partial │ ❌ n/a           │
// └────────────┴────────┴────────────┴──────────┴───────────┴─────────────────┘
//
// ============================================================================

/**
 * Field authority levels - determines how PMS data is applied to local fields
 */
export type FieldAuthority = 'authoritative' | 'seed_only' | 'partial' | 'not_available';

/**
 * Editorial fields that can be synced from PMS
 */
export type PropertyEditorialField = 
  | 'name'
  | 'description' 
  | 'location'
  | 'geo'
  | 'images'
  | 'amenities';

/**
 * Property location data structure
 */
export interface PropertyLocation {
  address?: string;
  city?: string;
  country?: string;
  postal_code?: string;
}

/**
 * Geographic coordinates
 */
export interface PropertyGeo {
  latitude: number;
  longitude: number;
}

/**
 * Charge type from PMS (operational data - always authoritative)
 */
export interface ChargeType {
  id: string;
  name: string;
  amount?: number;
  currency?: string;
  is_percentage?: boolean;
}

/**
 * Payment type from PMS (operational data - always authoritative)
 */
export interface PaymentType {
  id: string;
  name: string;
  is_active?: boolean;
}

/**
 * Property data response - returned by fetch_property_data action
 * 
 * ADAPTER IMPLEMENTATION NOTES:
 * - Return null for fields your PMS doesn't provide (authority = 'not_available')
 * - The sync-editorial function will apply authority rules from master JSON
 * - Operational data (room_types, rate_types, charge_types, payment_types) is always authoritative
 * - Editorial data follows PMS-specific rules from pms-implementation-master.json
 */
export interface PropertyDataResponse {
  // === EDITORIAL FIELDS (authority varies by PMS - see master JSON) ===
  
  /** Property name - authoritative for most PMS */
  property_name: string | null;
  
  /** Property description - varies by PMS (authoritative/seed_only/not_available) */
  description: string | null;
  
  /** Location details - varies by PMS */
  location: PropertyLocation | null;
  
  /** Geographic coordinates - only cloudbeds provides this authoritatively */
  geo: PropertyGeo | null;
  
  /** Property images - varies by PMS (authoritative/partial/not_available) */
  images: string[] | null;
  
  /** Amenities list - typically partial merge when available */
  amenities: string[] | null;

  // === OPERATIONAL REFERENCE DATA (always authoritative from PMS) ===
  
  /** Room type definitions - always sync from PMS */
  room_types: RoomTypeDefinition[];
  
  /** Rate type definitions - always sync from PMS */
  rate_types: RateTypeDefinition[];
  
  /** Charge types - operational, always authoritative, UI locked */
  charge_types?: ChargeType[];
  
  /** Payment types - operational, always authoritative, UI locked */
  payment_types?: PaymentType[];
  
  /** Check-in time (HH:MM format) - authoritative when PMS provides */
  check_in_time?: string | null;
  
  /** Check-out time (HH:MM format) - authoritative when PMS provides */
  check_out_time?: string | null;
  
  /** Star rating - seed_only for most PMS, authoritative for Cloudbeds/Little Hotelier */
  star_rating?: number | null;
  
  /** Property capacity - seed only, never auto-derived */
  max_guests?: number | null;
}

// ============================================================================
// PMS IMPLEMENTATION RULES (embedded from master JSON for adapter reference)
// ============================================================================

/**
 * Global field rules that apply across all PMS systems
 * Some PMS may override these via per-PMS overrides
 */
export interface GlobalFieldRule {
  source: 'PMS' | 'admin_only' | 'PMS_if_available_else_admin' | 'PMS_seed_or_admin' | 'seed_only';
  authoritative: boolean;
  authoritative_when_present?: boolean;
  ui_locked?: boolean;
  ui_locked_when_pms?: boolean;
  notes: string;
}

export type GlobalFieldName = 
  | 'charge_types'
  | 'payment_types'
  | 'check_in_out_times'
  | 'star_rating'
  | 'property_capacity'
  | 'house_rules'
  | 'offerings';

/**
 * Global field rules - applies to all PMS unless overridden
 */
export const GLOBAL_FIELD_RULES: Record<GlobalFieldName, GlobalFieldRule> = {
  charge_types: {
    source: 'PMS',
    authoritative: true,
    ui_locked: true,
    notes: 'Operational reference data. Never editable.',
  },
  payment_types: {
    source: 'PMS',
    authoritative: true,
    ui_locked: true,
    notes: 'Operational reference data. Never editable.',
  },
  check_in_out_times: {
    source: 'PMS_if_available_else_admin',
    authoritative: false,
    authoritative_when_present: true,
    ui_locked_when_pms: true,
    notes: 'Never overwritten without explicit refresh.',
  },
  star_rating: {
    source: 'seed_only',
    authoritative: false,
    ui_locked: false,
    notes: 'Only authoritative for selected PMS (Cloudbeds, Little Hotelier).',
  },
  property_capacity: {
    source: 'PMS_seed_or_admin',
    authoritative: false,
    notes: 'Never auto-derived from room data.',
  },
  house_rules: {
    source: 'admin_only',
    authoritative: false,
    notes: 'PMS data ignored due to inconsistency.',
  },
  offerings: {
    source: 'admin_only',
    authoritative: false,
    notes: 'Marketing/editorial only.',
  },
};

/**
 * Per-PMS overrides for global field rules
 */
export const PMS_GLOBAL_FIELD_OVERRIDES: Partial<Record<PmsSource, Partial<Record<GlobalFieldName, Partial<GlobalFieldRule>>>>> = {
  cloudbeds: {
    star_rating: {
      authoritative: true,
      ui_locked: true,
    },
  },
  littlehotelier: {
    star_rating: {
      authoritative: true,
      ui_locked: true,
    },
  },
};

/**
 * PMS-specific field rules - adapters should reference this
 */
export const PMS_EDITORIAL_RULES: Record<PmsSource, {
  property_fields: Partial<Record<PropertyEditorialField, FieldAuthority>>;
  notes: string;
}> = {
  roomsonline: {
    property_fields: {
      name: 'authoritative',
      description: 'authoritative',
      location: 'authoritative',
      geo: 'authoritative',
      images: 'authoritative',
      amenities: 'authoritative',
    },
    notes: 'Native PMS - full editorial control.',
  },
  benson: {
    property_fields: {
      name: 'authoritative',
      description: 'not_available',
      location: 'not_available',
      images: 'not_available',
    },
    notes: 'Operational PMS only. Do not seed editorial content.',
  },
  checkfront: {
    property_fields: {
      name: 'authoritative',
      description: 'seed_only',
      location: 'not_available',
      images: 'not_available',
    },
    notes: 'Descriptions inconsistent. Never overwrite admin content.',
  },
  hostfully: {
    property_fields: {
      name: 'authoritative',
      description: 'authoritative',
      location: 'authoritative',
      images: 'authoritative',
      amenities: 'partial',
    },
    notes: 'Best hybrid PMS. Guard amenities mapping.',
  },
  cloudbeds: {
    property_fields: {
      name: 'authoritative',
      description: 'authoritative',
      location: 'authoritative',
      geo: 'authoritative',
      images: 'authoritative',
      amenities: 'partial',
    },
    notes: 'Gold standard PMS. Requires disciplined facilities mapping.',
  },
  littlehotelier: {
    property_fields: {
      name: 'authoritative',
      description: 'authoritative',
      location: 'authoritative',
      images: 'partial',
    },
    notes: 'Room images unreliable. Seed text only.',
  },
  nightsbridge: {
    property_fields: {
      name: 'authoritative',
    },
    notes: 'Limited editorial support.',
  },
  siteminder: {
    property_fields: {
      name: 'authoritative',
    },
    notes: 'Channel manager - minimal editorial data.',
  },
  hotelbeds: {
    property_fields: {
      name: 'authoritative',
      description: 'authoritative',
      images: 'authoritative',
    },
    notes: 'B2B supplier - rich content available.',
  },
};

/**
 * Get field authority for a specific PMS and field
 * Utility function for adapters and sync logic
 */
export function getEditorialFieldAuthority(
  pms: PmsSource,
  field: PropertyEditorialField
): FieldAuthority {
  const rules = PMS_EDITORIAL_RULES[pms];
  if (!rules) return 'not_available';
  return rules.property_fields[field] || 'not_available';
}

/**
 * Get all syncable editorial fields for a PMS
 */
export function getSyncableEditorialFields(pms: PmsSource): PropertyEditorialField[] {
  const rules = PMS_EDITORIAL_RULES[pms];
  if (!rules) return [];
  
  return Object.entries(rules.property_fields)
    .filter(([_, authority]) => authority !== 'not_available')
    .map(([field]) => field as PropertyEditorialField);
}

/**
 * Get PMS notes/warnings
 */
export function getPmsEditorialNotes(pms: PmsSource): string {
  return PMS_EDITORIAL_RULES[pms]?.notes || 'No configuration notes available.';
}

/**
 * Get global field rule with PMS-specific overrides applied
 */
export function getGlobalFieldRule(pms: PmsSource, field: GlobalFieldName): GlobalFieldRule {
  const baseRule = GLOBAL_FIELD_RULES[field];
  const pmsOverride = PMS_GLOBAL_FIELD_OVERRIDES[pms]?.[field];
  
  if (!pmsOverride) return baseRule;
  
  return { ...baseRule, ...pmsOverride };
}

/**
 * Check if a global field is authoritative for a given PMS
 */
export function isGlobalFieldAuthoritative(pms: PmsSource, field: GlobalFieldName): boolean {
  const rule = getGlobalFieldRule(pms, field);
  return rule.authoritative || rule.authoritative_when_present === true;
}

/**
 * Check if a global field should be UI locked for a given PMS
 */
export function isGlobalFieldUILocked(pms: PmsSource, field: GlobalFieldName): boolean {
  const rule = getGlobalFieldRule(pms, field);
  return rule.ui_locked === true || rule.ui_locked_when_pms === true;
}
