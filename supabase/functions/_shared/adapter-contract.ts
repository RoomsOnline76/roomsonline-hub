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
  | 'smoobu'
  | 'hostfully';

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
