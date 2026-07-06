import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// HOSTFULLY API ADAPTER
// Conforms to: supabase/functions/_shared/adapter-contract.ts
// Reference: https://dev.hostfully.com/reference/getting-started
// 
// KEY CHANGE: Owner-level API keys
// - API key is tied to an Owner (Agency in Hostfully) who owns many properties
// - Each property has many rooms
// - API key passed per-request from owner_pms_credentials table
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE = "hostfully";

const HOSTFULLY_URLS: Record<string, string> = {
  sandbox: "https://sandbox.hostfully.com/api/v3",
  staging: "https://sandbox.hostfully.com/api/v3",
  production: "https://api.hostfully.com/api/v3",
};

// ============================================================================
// CAPABILITY DECLARATION
// ============================================================================

const CAPABILITIES = {
  supports_live_availability: true,
  supports_rate_fetch: true,
  supports_create_booking: true,
  supports_modify_booking: false,
  supports_webhooks: false,
  supports_owner_credentials: true, // NEW: Supports owner-level API keys
};

// ============================================================================
// STANDARDIZED ERROR CODES
// ============================================================================

const ERROR_CODES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  AUTH_FAILED: 'AUTH_FAILED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  AVAILABILITY_CHANGED: 'AVAILABILITY_CHANGED',
  BOOKING_REJECTED: 'BOOKING_REJECTED',
  MODIFICATION_NOT_SUPPORTED: 'MODIFICATION_NOT_SUPPORTED',
  CANCELLATION_NOT_SUPPORTED: 'CANCELLATION_NOT_SUPPORTED',
  INTERNAL_ADAPTER_ERROR: 'INTERNAL_ADAPTER_ERROR',
  PMS_UNAVAILABLE: 'PMS_UNAVAILABLE',
} as const;

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

interface AdapterResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  source: string;
  fetched_at: string;
  action: string;
}

function createSuccessResponse<T>(data: T, action: string): AdapterResponse<T> {
  return {
    success: true,
    data,
    error: null,
    source: SOURCE,
    fetched_at: new Date().toISOString(),
    action,
  };
}

function createErrorResponse(
  code: string,
  message: string,
  action: string,
  details?: unknown
): AdapterResponse<null> {
  return {
    success: false,
    data: null,
    error: { code, message, details },
    source: SOURCE,
    fetched_at: new Date().toISOString(),
    action,
  };
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

const baseRequestSchema = z.object({
  action: z.enum([
    "get_capabilities",
    "health_check",
    "validate_api_key",
    "sync_owner_listings",
    "list_properties",
    "list_all_properties",
    "get_listing_details",
    "get_property_rooms",
    "fetch_availability",
    "get_room_types",
    "get_rate_types",
    "get_reservations",
    "create_reservation",
    "modify_reservation",
    "cancel_reservation",
    "fetch_property_data",
    "full_ingest_property",    // One-time property data ingestion
    "ingest_building_units",   // Unit-level ingestion for building properties
    "repair_room_mapping",     // Backfill hostfully_room_types.hostfully_room_id by name
  ]),
  // Owner-level credentials (NEW)
  api_key: z.string().optional(),
  owner_credential_id: z.string().uuid().optional(),
  environment: z.enum(["sandbox", "staging", "production"]).optional(),
  // Property context
  property_id: z.string().uuid().optional(),
  propertyUid: z.string().optional(),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  // Accept either propertyUid (Hostfully) or property_id (ROL) - at least one required
  propertyUid: z.string().optional(),
  property_id: z.string().uuid().optional(),
  // Accept both camelCase and snake_case date formats
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be YYYY-MM-DD format" }).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "endDate must be YYYY-MM-DD format" }).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "start_date must be YYYY-MM-DD format" }).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "end_date must be YYYY-MM-DD format" }).optional(),
}).refine(
  data => data.propertyUid || data.property_id,
  { message: "Either propertyUid or property_id is required" }
).refine(
  data => (data.startDate || data.start_date) && (data.endDate || data.end_date),
  { message: "Start and end dates are required (startDate/endDate or start_date/end_date)" }
);

const getReservationsSchema = baseRequestSchema.extend({
  action: z.literal("get_reservations"),
  propertyUid: z.string({ required_error: "propertyUid is required" }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  propertyUid: z.string({ required_error: "propertyUid is required" }),
  reservation_data: z.object({
    checkInDate: z.string(),
    checkOutDate: z.string(),
    guestFirstName: z.string().min(1),
    guestLastName: z.string().min(1),
    guestEmail: z.string().email(),
    guestPhone: z.string().optional(),
    adults: z.number().min(1),
    children: z.number().default(0),
    notes: z.string().optional(),
  }),
});

// ============================================================================
// PROPERTY UID RESOLUTION HELPER
// ============================================================================

/**
 * Resolves the Hostfully propertyUid from either a direct UID or a ROL property_id.
 * Looks up the property in the database and extracts the Hostfully UID from:
 * 1. external_id (if set)
 * 2. amenities.room_types[0].hostfullyId or pmsRoomId (fallback)
 */
async function resolveHostfullyPropertyUid(
  supabase: any,
  propertyUid?: string,
  propertyId?: string
): Promise<string | null> {
  // If propertyUid already provided, use it directly
  if (propertyUid) return propertyUid;
  
  if (!propertyId) return null;
  
  // Look up from properties table
  const { data: propData, error } = await supabase
    .from("properties")
    .select("external_id, amenities")
    .eq("id", propertyId)
    .maybeSingle();
  
  if (error || !propData) {
    console.log("[Hostfully] Could not find property:", propertyId, error);
    return null;
  }
  
  // Option 1: Use external_id if set (must be a Hostfully building UID, not a ROL UUID)
  if (propData.external_id) {
    console.log("[Hostfully] Resolved propertyUid from external_id:", propData.external_id);
    return propData.external_id;
  }

  // Option 2: amenities.room_types[0].hostfullyId — ONLY if explicitly a Hostfully id.
  // We deliberately do NOT fall back to `pmsRoomId` because in many properties that field
  // holds a ROL UUID, not a Hostfully building UID, and using it produces wrong sync data.
  const roomTypes = propData.amenities?.room_types || [];
  if (roomTypes.length > 0 && roomTypes[0].hostfullyId) {
    console.log("[Hostfully] Resolved propertyUid from amenities.hostfullyId:", roomTypes[0].hostfullyId);
    return roomTypes[0].hostfullyId;
  }

  console.log("[Hostfully] Could not resolve propertyUid for property:", propertyId);
  return null;
}

// ============================================================================
// ENVIRONMENT HELPER - Reads from pms_tracker_status
// ============================================================================

async function getTrackerEnvironment(
  supabase: any,
  systemType: string = "hostfully"
): Promise<"sandbox" | "production"> {
  const { data, error } = await supabase
    .from("pms_tracker_status")
    .select("active_environment")
    .eq("system_type", systemType)
    .maybeSingle();
    
  if (error || !data) {
    console.log(`[${systemType}] No tracker environment found, defaulting to sandbox`);
    return "sandbox";
  }
  
  return data.active_environment === "production" ? "production" : "sandbox";
}

// ============================================================================
// CREDENTIAL INTERFACE & FETCH
// ============================================================================

interface HostfullyCredentials {
  api_key: string;
  environment: "sandbox" | "staging" | "production";
  owner_credential_id?: string;
}

// NEW: Get credentials from request body (owner-level) or fallback to system-level
async function getCredentials(
  supabase: any,
  body: z.infer<typeof baseRequestSchema>
): Promise<HostfullyCredentials | null> {
  // Get the tracker environment as the authoritative source
  const trackerEnv = await getTrackerEnvironment(supabase, "hostfully");
  
  // Option 1: API key provided directly in request
  if (body.api_key) {
    return {
      api_key: body.api_key,
      // Request body environment override OR tracker environment
      environment: body.environment || trackerEnv,
    };
  }

  // Option 2: Owner credential ID provided - fetch from owner_pms_credentials
  if (body.owner_credential_id) {
    const { data, error } = await supabase
      .from("owner_pms_credentials")
      .select("*")
      .eq("id", body.owner_credential_id)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data || !data.api_key) {
      console.error("Failed to fetch owner credentials:", error);
      return null;
    }

    return {
      api_key: data.api_key,
      // Use tracker environment as authoritative source
      environment: trackerEnv,
      owner_credential_id: data.id,
    };
  }

  // Option 2.5: property_id provided - try to find via property's owner_pms_credential_id
  if (body.property_id) {
    const { data: propData } = await supabase
      .from("properties")
      .select("owner_pms_credential_id")
      .eq("id", body.property_id)
      .maybeSingle();

    if (propData?.owner_pms_credential_id) {
      const { data: ownerCred } = await supabase
        .from("owner_pms_credentials")
        .select("*")
        .eq("id", propData.owner_pms_credential_id)
        .eq("is_active", true)
        .maybeSingle();

      if (ownerCred?.api_key) {
        return {
          api_key: ownerCred.api_key,
          // Use tracker environment as authoritative source
          environment: trackerEnv,
          owner_credential_id: ownerCred.id,
        };
      }
    }
  }

  // Option 3: Fallback to system-level pms_credentials (legacy/sandbox)
  const { data, error } = await supabase
    .from("pms_credentials")
    .select("*")
    .eq("system_type", "hostfully")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    console.error("Failed to fetch system credentials:", error);
    return null;
  }

  // Database takes precedence, ENV is fallback (user-editable source of truth)
  const apiKeyFromEnv = Deno.env.get("HOSTFULLY_API_KEY");
  const apiKey = data.api_key || apiKeyFromEnv;

  if (!apiKey) {
    return null;
  }

  return {
    api_key: apiKey,
    // Use tracker environment as authoritative source
    environment: trackerEnv,
  };
}

// ============================================================================
// API REQUEST HELPER
// ============================================================================

async function hostfullyRequest(
  endpoint: string,
  apiKey: string,
  baseUrl: string,
  method: string = "GET",
  body?: unknown
): Promise<Response> {
  const url = `${baseUrl}${endpoint}`;
  console.log(`[Hostfully] ${method} ${url}`);

  const headers: Record<string, string> = {
    "X-HOSTFULLY-APIKEY": apiKey,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }

  return fetch(url, options);
}

// ============================================================================
// ERROR MAPPING
// ============================================================================

function mapHostfullyHttpError(status: number, body: unknown): { code: string; message: string } {
  switch (status) {
    case 400:
      return { code: ERROR_CODES.INVALID_REQUEST, message: "Invalid request to Hostfully API" };
    case 401:
      return { code: ERROR_CODES.AUTH_FAILED, message: "Hostfully API key is invalid or expired" };
    case 403:
      return { code: ERROR_CODES.ACCESS_DENIED, message: "Access denied to Hostfully resource" };
    case 404:
      return { code: ERROR_CODES.NOT_FOUND, message: "Hostfully resource not found" };
    case 409:
      return { code: ERROR_CODES.BOOKING_REJECTED, message: "Booking conflict or already exists" };
    case 429:
      return { code: ERROR_CODES.PMS_UNAVAILABLE, message: "Hostfully rate limit exceeded" };
    default:
      return { code: ERROR_CODES.INTERNAL_ADAPTER_ERROR, message: `Hostfully API error: ${status}` };
  }
}

// ============================================================================
// DATA TRANSFORMERS
// ============================================================================

// Hostfully API v3 calendar response format
interface HostfullyCalendarDay {
  date: string;
  note?: string | null;
  // v3 nested format
  pricing?: {
    currency: string;
    value: number;
  };
  availability?: {
    unavailable: boolean;
    unavailabilityReason?: string | null;
    availableForCheckIn: boolean;
    availableForCheckOut: boolean;
    minimumStayLength: number;
    maximumStayLength: number;
  };
  // Legacy flat format support
  available?: boolean;
  price?: number;
  minimumStay?: number;
  checkInAllowed?: boolean;
  checkOutAllowed?: boolean;
}

function mapHostfullyCalendarToAvailability(calendarData: HostfullyCalendarDay[], propertyUid: string, roomName: string = "Property") {
  const roomType = {
    room_type_id: propertyUid,
    name: roomName,
    availability_per_night: calendarData.map(day => {
      // Handle both v3 nested format and legacy flat format
      const isAvailable = day.availability 
        ? !day.availability.unavailable 
        : day.available ?? true;
      const minStay = day.availability?.minimumStayLength || day.minimumStay || 1;
      const maxStay = day.availability?.maximumStayLength || null;
      const checkInAllowed = day.availability?.availableForCheckIn ?? day.checkInAllowed ?? true;
      const checkOutAllowed = day.availability?.availableForCheckOut ?? day.checkOutAllowed ?? true;
      
      return {
        date: day.date,
        available_units: isAvailable ? 1 : 0,
        restrictions: {
          stop_sell: !isAvailable,
          min_stay: minStay,
          max_stay: maxStay,
          closed_to_arrival: !checkInAllowed,
          closed_to_departure: !checkOutAllowed,
        },
      };
    }),
    rate_types: [{
      rate_type_id: "per-unit",
      name: "Per Unit Rate",
      price_type: "per_night",
      currency: calendarData[0]?.pricing?.currency || "ZAR",
      rates: calendarData
        .filter(d => d.pricing?.value || d.price)
        .map(day => ({
          date: day.date,
          room_amount: day.pricing?.value || day.price || 0,
          adult_amounts: [],
        })),
    }],
  };

  return { room_types: [roomType] };
}

function mapHostfullyBookingToReservation(booking: any) {
  return {
    external_reservation_id: booking.uid,
    property_uid: booking.propertyUid,
    arrival_date: booking.checkInDate,
    departure_date: booking.checkOutDate,
    status: booking.status?.toLowerCase() || "confirmed",
    contact: {
      name: `${booking.guestFirstName || ""} ${booking.guestLastName || ""}`.trim(),
      email: booking.guestEmail,
    },
    guests: {
      adults: booking.adults || 1,
      children: booking.children || 0,
    },
    total_amount: booking.totalPrice,
  };
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleGetCapabilities() {
  return createSuccessResponse(CAPABILITIES, "get_capabilities");
}

// NEW: Validate an API key and return agency info
async function handleValidateApiKey(apiKey: string, environment: string) {
  const baseUrl = HOSTFULLY_URLS[environment] || HOSTFULLY_URLS.production;

  try {
    const response = await hostfullyRequest("/agencies", apiKey, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "validate_api_key");
    }

    const agenciesData = await response.json();
    const agency = agenciesData?.agencies?.[0] || agenciesData?.[0];

    if (!agency) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "No agency found for this API key", "validate_api_key");
    }

    // Get property count
    const propertiesResponse = await hostfullyRequest(`/properties?agencyUid=${agency.uid}`, apiKey, baseUrl);
    let propertyCount = 0;

    if (propertiesResponse.ok) {
      const propData = await propertiesResponse.json();
      const props = propData?.properties || propData || [];
      propertyCount = Array.isArray(props) ? props.length : 0;
    }

    return createSuccessResponse({
      valid: true,
      agency_uid: agency.uid,
      agency_name: agency.name || agency.companyName || null,
      property_count: propertyCount,
      environment,
    }, "validate_api_key");
  } catch (err) {
    console.error("[Hostfully] Validate API key failed:", err);
    return createErrorResponse(ERROR_CODES.PMS_UNAVAILABLE, "Failed to validate API key", "validate_api_key", err);
  }
}

// NEW: Sync listings for an owner and store in owner_pms_credentials
async function handleSyncOwnerListings(
  creds: HostfullyCredentials,
  supabase: any
) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    // Get agency UID
    const agenciesResponse = await hostfullyRequest("/agencies", creds.api_key, baseUrl);
    if (!agenciesResponse.ok) {
      const error = mapHostfullyHttpError(agenciesResponse.status, await agenciesResponse.text());
      return createErrorResponse(error.code, error.message, "sync_owner_listings");
    }

    const agenciesData = await agenciesResponse.json();
    const agency = agenciesData?.agencies?.[0] || agenciesData?.[0];

    if (!agency) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "No agency found", "sync_owner_listings");
    }

    // Get all properties
    const propertiesResponse = await hostfullyRequest(`/properties?agencyUid=${agency.uid}`, creds.api_key, baseUrl);
    if (!propertiesResponse.ok) {
      const error = mapHostfullyHttpError(propertiesResponse.status, await propertiesResponse.text());
      return createErrorResponse(error.code, error.message, "sync_owner_listings");
    }

    const propertiesData = await propertiesResponse.json();
    const propertiesArray = propertiesData?.properties || propertiesData || [];

    // Map to standardized format
    const listings = (Array.isArray(propertiesArray) ? propertiesArray : []).map((p: any) => ({
      id: p.uid,
      name: p.name,
      status: p.status || 'active',
      property_type: p.type || p.propertyType || 'property',
      bedrooms: p.bedrooms || null,
      bathrooms: p.bathrooms || null,
      max_guests: p.maxGuests || null,
      address: p.address1 || p.streetAddress || null,
      city: p.city || null,
      country: p.countryCode || p.country || null,
      currency: p.currency || null,
      base_price: p.baseDailyRate || null,
      thumbnail: p.pictureLink || p.picture || null,
    }));

    // Update owner_pms_credentials if we have credential ID
    if (creds.owner_credential_id) {
      const { error: updateError } = await supabase
        .from("owner_pms_credentials")
        .update({
          available_listings: listings,
          last_sync_at: new Date().toISOString(),
          sync_status: 'connected',
          sync_error: null,
          external_account_id: agency.uid,
          external_account_name: agency.name || agency.companyName || null,
        })
        .eq("id", creds.owner_credential_id);

      if (updateError) {
        console.error("[Hostfully] Failed to update owner_pms_credentials:", updateError);
      }
    }

    return createSuccessResponse({
      listings,
      count: listings.length,
      agency_uid: agency.uid,
      agency_name: agency.name || agency.companyName || null,
      synced_at: new Date().toISOString(),
    }, "sync_owner_listings");
  } catch (err) {
    console.error("[Hostfully] Sync owner listings failed:", err);

    // Update error status if we have credential ID
    if (creds.owner_credential_id) {
      await supabase
        .from("owner_pms_credentials")
        .update({
          sync_status: 'error',
          sync_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", creds.owner_credential_id);
    }

    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to sync listings", "sync_owner_listings", err);
  }
}

// NEW: Get rooms for a specific property
async function handleGetPropertyRooms(creds: HostfullyCredentials, propertyUid: string) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    // Hostfully properties are typically single units, but may have bedroom info
    const response = await hostfullyRequest(`/properties/${propertyUid}`, creds.api_key, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "get_property_rooms");
    }

    const property = await response.json();

    // For Hostfully, the property itself is the "room"
    // But we can create room entries based on bedroom configuration
    const rooms = [{
      id: propertyUid,
      hostfully_room_id: propertyUid,
      name: property.name || "Property",
      description: property.description || property.summary || null,
      max_guests: property.maxGuests || 2,
      bedrooms: property.bedrooms || 1,
      bathrooms: property.bathrooms || 1,
      beds: property.beds || property.bedrooms || 1,
      daily_rate: property.baseDailyRate || null,
      currency: property.currency || 'USD',
      images: property.photos || property.images || [],
      amenities: property.amenities || property.features || [],
    }];

    return createSuccessResponse({ rooms, property_uid: propertyUid }, "get_property_rooms");
  } catch (err) {
    console.error("[Hostfully] Get property rooms failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch rooms", "get_property_rooms", err);
  }
}

async function handleHealthCheck(creds: HostfullyCredentials) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    const response = await hostfullyRequest("/agencies", creds.api_key, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "health_check");
    }

    return createSuccessResponse({
      status: "ok",
      healthy: true,
      environment: creds.environment
    }, "health_check");
  } catch (err) {
    console.error("[Hostfully] Health check failed:", err);
    return createErrorResponse(ERROR_CODES.PMS_UNAVAILABLE, "Failed to connect to Hostfully API", "health_check", err);
  }
}

async function handleListProperties(creds: HostfullyCredentials) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    // First get the agency UID
    const agenciesResponse = await hostfullyRequest("/agencies", creds.api_key, baseUrl);
    if (!agenciesResponse.ok) {
      const error = mapHostfullyHttpError(agenciesResponse.status, await agenciesResponse.text());
      return createErrorResponse(error.code, error.message, "list_properties");
    }

    const agenciesData = await agenciesResponse.json();
    const agency = agenciesData?.agencies?.[0] || agenciesData?.[0];
    const agencyUid = agency?.uid;

    if (!agencyUid) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "No agency found for this API key", "list_properties");
    }

    // Use /multi-units/multi-unit-properties endpoint to get multi-unit properties
    const multiUnitResponse = await hostfullyRequest(`/multi-units/multi-unit-properties?agencyUid=${agencyUid}`, creds.api_key, baseUrl);

    if (!multiUnitResponse.ok) {
      // If multi-unit endpoint fails, fall back to regular properties endpoint
      console.log("[Hostfully] Multi-unit endpoint failed, falling back to /properties");
      const propertiesResponse = await hostfullyRequest(`/properties?agencyUid=${agencyUid}`, creds.api_key, baseUrl);

      if (!propertiesResponse.ok) {
        const error = mapHostfullyHttpError(propertiesResponse.status, await propertiesResponse.text());
        return createErrorResponse(error.code, error.message, "list_properties");
      }

      const propertiesData = await propertiesResponse.json();
      const propertiesArray = propertiesData?.properties || propertiesData || [];

      const propertyList = (Array.isArray(propertiesArray) ? propertiesArray : []).map((p: any) => ({
        id: p.uid,
        name: p.name,
        status: p.status,
        bedrooms: p.bedrooms || null,
        bathrooms: p.bathrooms || null,
        max_guests: p.maxGuests || null,
        address: p.address1 || null,
        city: p.city || null,
        country: p.countryCode || null,
        currency: p.currency || null,
        base_price: p.baseDailyRate || null,
        source_endpoint: 'properties',
        _raw: p,
      }));

      return createSuccessResponse({
        properties: propertyList,
        agency_uid: agencyUid,
        agency_name: agency?.name || agency?.companyName || null,
        count: propertyList.length,
        endpoint_used: 'properties',
      }, "list_properties");
    }

    // Parse multi-unit properties response
    const multiUnitData = await multiUnitResponse.json();
    console.log("[Hostfully] Multi-unit response:", JSON.stringify(multiUnitData).substring(0, 500));
    
    // Multi-unit properties are the parent properties that contain child units
    const multiUnitArray = multiUnitData?.multiUnitProperties || multiUnitData?.properties || multiUnitData || [];

    const propertyList = (Array.isArray(multiUnitArray) ? multiUnitArray : []).map((p: any) => ({
      id: p.uid,
      name: p.name,
      status: p.status,
      property_type: 'multi_unit',
      bedrooms: p.bedrooms || null,
      bathrooms: p.bathrooms || null,
      max_guests: p.maxGuests || null,
      address: p.address1 || p.streetAddress || null,
      city: p.city || null,
      country: p.countryCode || p.country || null,
      currency: p.currency || null,
      base_price: p.baseDailyRate || null,
      child_properties: p.childProperties || p.units || [],
      child_count: (p.childProperties || p.units || []).length,
      source_endpoint: 'multi-units',
      _raw: p,
    }));

    return createSuccessResponse({
      properties: propertyList,
      agency_uid: agencyUid,
      agency_name: agency?.name || agency?.companyName || null,
      count: propertyList.length,
      endpoint_used: 'multi-units/multi-unit-properties',
      raw_response: multiUnitData,
    }, "list_properties");
  } catch (err) {
    console.error("[Hostfully] List properties failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to list properties", "list_properties", err);
  }
}

// Paginated list of ALL properties (ID + Name only) for large accounts
async function handleListAllProperties(creds: HostfullyCredentials, supabase: any) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];
  const PAGE_SIZE = 100;
  let allProperties: { id: string; name: string }[] = [];
  let offset = 0;
  let hasMore = true;

  try {
    // Get agency UID first
    const agenciesResponse = await hostfullyRequest("/agencies", creds.api_key, baseUrl);
    if (!agenciesResponse.ok) {
      const error = mapHostfullyHttpError(agenciesResponse.status, await agenciesResponse.text());
      return createErrorResponse(error.code, error.message, "list_all_properties");
    }

    const agenciesData = await agenciesResponse.json();
    const agency = agenciesData?.agencies?.[0] || agenciesData?.[0];
    const agencyUid = agency?.uid;

    if (!agencyUid) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "No agency found for this API key", "list_all_properties");
    }

    console.log(`[Hostfully] Starting paginated fetch for agency ${agencyUid}...`);

    // Paginate through all properties
    while (hasMore) {
      const response = await hostfullyRequest(
        `/properties?agencyUid=${agencyUid}&_limit=${PAGE_SIZE}&_offset=${offset}`,
        creds.api_key,
        baseUrl
      );

      if (!response.ok) {
        const error = mapHostfullyHttpError(response.status, await response.text());
        return createErrorResponse(error.code, error.message, "list_all_properties");
      }

      const data = await response.json();
      const properties = data?.properties || data || [];
      const batch = (Array.isArray(properties) ? properties : []).map((p: any) => ({
        id: p.uid,
        name: p.name,
      }));

      allProperties = [...allProperties, ...batch];

      console.log(`[Hostfully] Fetched ${allProperties.length} properties (offset: ${offset}, batch: ${batch.length})`);

      // Check if there are more pages
      if (batch.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    // Persist listings to available_listings if owner_credential_id provided
    if (creds.owner_credential_id && allProperties.length > 0) {
      const { error: updateError } = await supabase
        .from("owner_pms_credentials")
        .update({
          available_listings: allProperties,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", creds.owner_credential_id);

      if (updateError) {
        console.error("[Hostfully] Failed to update available_listings:", updateError);
      } else {
        console.log(`[Hostfully] Saved ${allProperties.length} listings to available_listings`);
      }
    }

    return createSuccessResponse({
      properties: allProperties,
      agency_uid: agencyUid,
      agency_name: agency?.name || agency?.companyName || null,
      total_count: allProperties.length,
    }, "list_all_properties");

  } catch (err) {
    console.error("[Hostfully] List all properties failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to list all properties", "list_all_properties", err);
  }
}

/**
 * Normalise a room name so "Two-Bedroom Apartment" ↔ "2 Bedroom" can be matched.
 * Lowercases, strips punctuation, drops descriptor words, and collapses spelled-out
 * numbers (one→1, two→2, etc.) so we can align ROL names with Hostfully unit names.
 */
function normaliseRoomName(name: string): string {
  if (!name) return "";
  let s = name.toLowerCase();
  const words: Record<string, string> = {
    one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  };
  s = s.replace(/[-_/,]+/g, " ");
  s = s.replace(/\b(apartment|apt|suite|unit|room|the|a|an)\b/g, " ");
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (m) => words[m] || m);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Backfill hostfully_room_types.hostfully_room_id (and properties.external_id when
 * possible) by matching ROL room type names against Hostfully child unit names for
 * the given property. Used to recover from mis-mapped multi-unit buildings such as
 * ONE46 ON M where all hostfully_room_id values were NULL and calendar sync produced
 * ghost "Property" rows.
 */
async function handleRepairRoomMapping(
  creds: HostfullyCredentials,
  supabase: any,
  propertyId: string,
) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    const { data: prop } = await supabase
      .from("properties")
      .select("id, name, external_id, hostfully_property_uid")
      .eq("id", propertyId)
      .maybeSingle();
    if (!prop) return createErrorResponse(ERROR_CODES.NOT_FOUND, "Property not found", "repair_room_mapping");

    const { data: rolRooms } = await supabase
      .from("hostfully_room_types")
      .select("id, name, hostfully_room_id")
      .eq("property_id", propertyId)
      .eq("is_active", true);
    if (!rolRooms || rolRooms.length === 0) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "No active room types on this property", "repair_room_mapping");
    }

    // 1. Locate the agency
    const agenciesRes = await hostfullyRequest("/agencies", creds.api_key, baseUrl);
    if (!agenciesRes.ok) {
      const err = mapHostfullyHttpError(agenciesRes.status, await agenciesRes.text());
      return createErrorResponse(err.code, err.message, "repair_room_mapping");
    }
    const agenciesData = await agenciesRes.json();
    const agencyUid = (agenciesData?.agencies?.[0] || agenciesData?.[0])?.uid;
    if (!agencyUid) return createErrorResponse(ERROR_CODES.NOT_FOUND, "No agency", "repair_room_mapping");

    // 2. List multi-unit buildings. Prefer matching by the property's known
    // hostfully_property_uid / external_id; fall back to a normalised name match.
    const muRes = await hostfullyRequest(`/multi-units/multi-unit-properties?agencyUid=${agencyUid}`, creds.api_key, baseUrl);
    let buildingUid: string | null = prop.external_id || prop.hostfully_property_uid || null;
    let childUnits: any[] = [];
    const knownUids = new Set(
      [prop.external_id, prop.hostfully_property_uid].filter(Boolean) as string[]
    );

    if (muRes.ok) {
      const muData = await muRes.json();
      const buildings = muData?.multiUnitProperties || muData?.properties || muData || [];
      const list = Array.isArray(buildings) ? buildings : [];
      const targetKey = normaliseRoomName(prop.name);

      // Try by known UID (building itself or any child)
      let building = list.find((b: any) => {
        if (b?.uid && knownUids.has(b.uid)) return true;
        const children = b?.childProperties || b?.units || [];
        return children.some((c: any) => c?.uid && knownUids.has(c.uid));
      });
      // Then by normalised building name
      if (!building) {
        building = list.find((b: any) => normaliseRoomName(b.name || "") === targetKey);
      }
      if (building) {
        buildingUid = building.uid || buildingUid;
        childUnits = building.childProperties || building.units || [];
      }
    }

    // 3. Fallback: list all single-unit properties for this agency and match by known UID / name
    if (childUnits.length === 0) {
      const propsRes = await hostfullyRequest(`/properties?agencyUid=${agencyUid}`, creds.api_key, baseUrl);
      if (propsRes.ok) {
        const propsData = await propsRes.json();
        const allProps = propsData?.properties || propsData || [];
        const list = Array.isArray(allProps) ? allProps : [];
        const targetKey = normaliseRoomName(prop.name);
        childUnits = list.filter((p: any) => {
          if (p?.uid && knownUids.has(p.uid)) return true;
          const n = normaliseRoomName(p.name || "");
          return n && (n.includes(targetKey) || targetKey.includes(n));
        });
      }
    }

    if (childUnits.length === 0) {
      return createErrorResponse(
        ERROR_CODES.NOT_FOUND,
        `Could not locate any Hostfully units for "${prop.name}". Check the property name matches your Hostfully building name.`,
        "repair_room_mapping"
      );
    }

    // 4. Match child units to ROL room types by normalised name
    const results: Array<{ room_type_id: string; room_name: string; hostfully_uid: string | null; hostfully_name: string | null; matched: boolean }> = [];
    for (const rolRoom of rolRooms) {
      const key = normaliseRoomName(rolRoom.name);
      let match = childUnits.find((u: any) => normaliseRoomName(u.name || "") === key);
      if (!match) {
        // Loose contains match as a fallback
        match = childUnits.find((u: any) => {
          const n = normaliseRoomName(u.name || "");
          return n && (n.includes(key) || key.includes(n));
        });
      }
      if (match?.uid) {
        await supabase
          .from("hostfully_room_types")
          .update({ hostfully_room_id: match.uid })
          .eq("id", rolRoom.id);
      }
      results.push({
        room_type_id: rolRoom.id,
        room_name: rolRoom.name,
        hostfully_uid: match?.uid || null,
        hostfully_name: match?.name || null,
        matched: !!match?.uid,
      });
    }

    // 5. Save building UID on the property if we have one and it isn't set
    if (buildingUid && !prop.external_id) {
      await supabase.from("properties").update({ external_id: buildingUid }).eq("id", propertyId);
    }

    // 6. Purge cache rows that no longer match any active room type so the next
    // sync starts clean.
    await supabase
      .from("pms_availability_cache")
      .delete()
      .eq("property_id", propertyId)
      .eq("system_type", "hostfully");

    return createSuccessResponse({
      property_id: propertyId,
      building_uid: buildingUid,
      matched: results.filter(r => r.matched).length,
      total: results.length,
      results,
    }, "repair_room_mapping");
  } catch (err) {
    console.error("[Hostfully] repair_room_mapping failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to repair room mapping", "repair_room_mapping", err);
  }
}


async function handleFetchAvailability(
  creds: HostfullyCredentials,
  propertyUid: string,
  startDate: string,
  endDate: string,
  propertyId?: string // Optional ROL property ID for caching
) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Check if this property has room types with unit maps
    let roomTypeRows: { id: string; name: string; total_units: number; hostfully_room_id: string }[] = [];
    let allRoomTypeCount = 0;
    let unitMapByRoomType = new Map<string, { hostfully_uid: string; unit_name: string }[]>();
    
    if (propertyId) {
      // First try the new unit_map approach
      const { data: roomTypes } = await supabase
        .from('hostfully_room_types')
        .select('id, hostfully_room_id, name, total_units')
        .eq('property_id', propertyId)
        .eq('is_active', true);
      
      if (roomTypes && roomTypes.length > 0) {
        allRoomTypeCount = roomTypes.length;
        roomTypeRows = roomTypes.filter(r => !!r.hostfully_room_id);
        
        // Check for unit map entries
        const { data: unitMaps } = await supabase
          .from('hostfully_unit_map')
          .select('room_type_id, hostfully_uid, unit_name')
          .eq('property_id', propertyId)
          .eq('is_active', true);
        
        if (unitMaps && unitMaps.length > 0) {
          for (const um of unitMaps) {
            if (!unitMapByRoomType.has(um.room_type_id)) {
              unitMapByRoomType.set(um.room_type_id, []);
            }
            unitMapByRoomType.get(um.room_type_id)!.push({
              hostfully_uid: um.hostfully_uid,
              unit_name: um.unit_name || '',
            });
          }
        }

        // Guardrail: if the property has room types but NONE of them carry a Hostfully
        // room id, we cannot safely fetch availability — silently falling back to the
        // single-unit path would poison the cache with placeholder "Property" rows and
        // wrong ARI (see ONE46 ON M incident, 2026-07). Surface a real error instead.
        if (allRoomTypeCount > 0 && roomTypeRows.length === 0 && unitMapByRoomType.size === 0) {
          console.warn(
            `[Hostfully] Property ${propertyId} has ${allRoomTypeCount} room types but none have hostfully_room_id set — refusing to sync.`
          );
          return createErrorResponse(
            ERROR_CODES.INVALID_REQUEST,
            `Hostfully room mapping is missing for this property. Run "Repair Hostfully mapping" so each room type is linked to its Hostfully unit UID before syncing availability.`,
            "fetch_availability"
          );
        }
      }
    }


    // If we have room types, fetch availability per unit and aggregate by type
    if (roomTypeRows.length > 0) {
      const hasUnitMap = unitMapByRoomType.size > 0;
      console.log(`[Hostfully] Multi-unit property: ${roomTypeRows.length} room types, unit_map=${hasUnitMap}`);
      
      const BATCH_SIZE = 10;
      const allRoomTypes: any[] = [];

      for (const roomType of roomTypeRows) {
        // Get individual unit UIDs: prefer unit_map, fallback to single hostfully_room_id
        const unitEntries = unitMapByRoomType.get(roomType.id) || 
          [{ hostfully_uid: roomType.hostfully_room_id, unit_name: roomType.name }];
        
        // Fetch availability for all units of this type
        const unitAvailabilities: any[] = [];
        
        for (let i = 0; i < unitEntries.length; i += BATCH_SIZE) {
          const batch = unitEntries.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (unit) => {
              try {
                const endpoint = `/property-calendar/${unit.hostfully_uid}?from=${startDate}&to=${endDate}`;
                const response = await hostfullyRequest(endpoint, creds.api_key, baseUrl);
                
                if (!response.ok) {
                  console.warn(`[Hostfully] Calendar fetch failed for unit ${unit.unit_name} (${unit.hostfully_uid}): ${response.status}`);
                  return null;
                }
                
                const responseData = await response.json();
                const calendarArray = responseData?.calendar?.entries || 
                                      responseData?.calendar || 
                                      responseData?.days || 
                                      responseData;
                
                if (!Array.isArray(calendarArray)) {
                  console.warn(`[Hostfully] Invalid calendar data for unit ${unit.unit_name}`);
                  return null;
                }
                
                const mapped = mapHostfullyCalendarToAvailability(calendarArray, unit.hostfully_uid, unit.unit_name);
                return mapped.room_types[0] || null;
              } catch (err) {
                console.warn(`[Hostfully] Error fetching calendar for unit ${unit.unit_name}:`, err);
                return null;
              }
            })
          );
          
          for (const rt of batchResults) {
            if (rt) unitAvailabilities.push(rt);
          }
        }

        // Aggregate: sum available units per date across all units of this type
        if (unitAvailabilities.length > 0) {
          const dateAvailMap = new Map<string, { available: number; restrictions: any; rates: any[] }>();
          
          for (const unitAvail of unitAvailabilities) {
            const perNight = unitAvail.availability_per_night || [];
            for (const day of perNight) {
              const existing = dateAvailMap.get(day.date);
              if (existing) {
                existing.available += (day.available_units || 0);
              } else {
                dateAvailMap.set(day.date, {
                  available: day.available_units || 0,
                  restrictions: day.restrictions || {},
                  rates: [],
                });
              }
            }
          }

          // Use rate data from first unit (rates are same across units of same type)
          const firstUnit = unitAvailabilities[0];
          
          const aggregatedPerNight = Array.from(dateAvailMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, data]) => ({
              date,
              available_units: data.available,
              restrictions: data.restrictions,
            }));

          allRoomTypes.push({
            room_type_id: roomType.id,
            external_room_type_id: roomType.hostfully_room_id || roomType.id,
            room_type_aliases: [roomType.hostfully_room_id, roomType.id].filter(Boolean),
            name: roomType.name,
            total_units: roomType.total_units || unitEntries.length,
            availability_per_night: aggregatedPerNight,
            rate_types: firstUnit.rate_types || [],
          });
        }
      }
      
      console.log(`[Hostfully] Successfully aggregated availability for ${allRoomTypes.length}/${roomTypeRows.length} room types`);
      
      const availability = { room_types: allRoomTypes };
      
      // Cache all unit availability
      if (propertyId && allRoomTypes.length > 0) {
        (async () => {
          try {
            for (const roomType of allRoomTypes) {
              const availPerNight = roomType.availability_per_night || [];
              const rateTypes = roomType.rate_types || [];
              
              for (const availDay of availPerNight) {
                const ratesForDate = rateTypes.flatMap((rt: any) => 
                  (rt.rates || []).filter((r: any) => r.date === availDay.date)
                );
                
                await supabase.from("pms_availability_cache").upsert({
                  property_id: propertyId,
                  system_type: "hostfully",
                  external_room_type_id: roomType.room_type_id,
                  date: availDay.date,
                  available_units: availDay.available_units,
                  restrictions: availDay.restrictions,
                  rates: ratesForDate.length > 0 ? ratesForDate : null,
                  raw_data: { roomTypeName: roomType.name },
                  fetched_at: new Date().toISOString(),
                }, {
                  onConflict: 'property_id,external_room_type_id,date,system_type',
                });
              }
            }
            console.log(`[Hostfully] Cached availability for ${allRoomTypes.length} units`);
          } catch (cacheErr) {
            console.warn("[Hostfully] Failed to cache multi-unit availability:", cacheErr);
          }
        })();
      }
      
      return createSuccessResponse(availability, "fetch_availability");
    }

    // Single-unit fallback: fetch calendar for the building/property UID directly
    const endpoint = `/property-calendar/${propertyUid}?from=${startDate}&to=${endDate}`;
    const response = await hostfullyRequest(endpoint, creds.api_key, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "fetch_availability");
    }

    const responseData = await response.json();
    
    console.log("[Hostfully] Calendar response structure:", JSON.stringify(responseData).substring(0, 200));
    
    const calendarArray = responseData?.calendar?.entries || 
                          responseData?.calendar || 
                          responseData?.days || 
                          responseData;
    
    if (!Array.isArray(calendarArray)) {
      console.error("[Hostfully] Calendar data is not an array:", typeof calendarArray, JSON.stringify(responseData).substring(0, 300));
      return createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        "Invalid calendar data format from Hostfully API",
        "fetch_availability"
      );
    }
    
    // Look up the matching ROL room type by Hostfully unit UID. If we can't identify
    // it, we refuse to cache — writing a placeholder "Property" row would poison the
    // calendar (see ONE46 ON M incident, 2026-07).
    let roomTypeRow: { id: string; name: string } | null = null;
    try {
      const { data: roomData } = await supabase
        .from('hostfully_room_types')
        .select('id, name')
        .eq('hostfully_room_id', propertyUid)
        .maybeSingle();
      if (roomData?.id) roomTypeRow = roomData;
    } catch (dbErr) {
      console.warn("[Hostfully] Could not look up room type by hostfully_room_id:", dbErr);
    }

    if (!roomTypeRow) {
      console.warn(
        `[Hostfully] No hostfully_room_types row matches Hostfully UID ${propertyUid} for property ${propertyId ?? 'n/a'} — refusing to cache to avoid ghost rows.`
      );
      return createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        `Cannot identify which room type this Hostfully unit (${propertyUid}) belongs to. Run "Repair Hostfully mapping" to link it before syncing availability.`,
        "fetch_availability"
      );
    }

    const availability = mapHostfullyCalendarToAvailability(calendarArray, propertyUid, roomTypeRow.name);

    // Cache availability under the ROL room type id so orchestrator lookups line up
    // with hostfully_room_types.id (never the raw Hostfully UID).
    if (propertyId && availability.room_types?.length > 0) {
      (async () => {
        try {
          for (const roomType of availability.room_types) {
            const availPerNight = roomType.availability_per_night || [];
            const rateTypes = roomType.rate_types || [];

            for (const availDay of availPerNight) {
              const ratesForDate = rateTypes.flatMap((rt: any) =>
                (rt.rates || []).filter((r: any) => r.date === availDay.date)
              );

              await supabase.from("pms_availability_cache").upsert({
                property_id: propertyId,
                system_type: "hostfully",
                external_room_type_id: roomTypeRow!.id,
                date: availDay.date,
                available_units: availDay.available_units,
                restrictions: availDay.restrictions,
                rates: ratesForDate.length > 0 ? ratesForDate : null,
                raw_data: { roomTypeName: roomTypeRow!.name, hostfully_uid: propertyUid },
                fetched_at: new Date().toISOString(),
              }, {
                onConflict: 'property_id,external_room_type_id,date,system_type',
              });
            }
          }
          console.log(`[Hostfully] Cached ${availability.room_types[0]?.availability_per_night?.length || 0} days for ${roomTypeRow!.name}`);
        } catch (cacheErr) {
          console.warn("[Hostfully] Failed to cache availability:", cacheErr);
        }
      })();
    }


    return createSuccessResponse(availability, "fetch_availability");
  } catch (err) {
    console.error("[Hostfully] Fetch availability failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch availability", "fetch_availability", err);
  }
}

async function handleGetRoomTypes(creds: HostfullyCredentials, propertyUid: string) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    const response = await hostfullyRequest(`/properties/${propertyUid}`, creds.api_key, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "get_room_types");
    }

    const property = await response.json();

    return createSuccessResponse({
      room_types: [{
        room_type_id: property.uid,
        name: property.name,
        description: property.description,
        max_guests: property.maxGuests || 2,
        min_guests: property.minGuests || 1,
        guest_rules: {
          allow_teens: true,
          allow_children: true,
          allow_infants: true,
        },
      }],
    }, "get_room_types");
  } catch (err) {
    console.error("[Hostfully] Get room types failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch room types", "get_room_types", err);
  }
}

async function handleGetRateTypes() {
  return createSuccessResponse({
    rate_types: [{
      rate_type_id: "standard",
      name: "Standard Rate",
      description: "Default property rate",
      price_type: "per_night",
    }],
  }, "get_rate_types");
}

async function handleGetReservations(
  creds: HostfullyCredentials,
  propertyUid: string,
  startDate?: string,
  endDate?: string
) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    let endpoint = `/leads?propertyUid=${propertyUid}`;
    if (startDate) endpoint += `&checkInDate=${startDate}`;
    if (endDate) endpoint += `&checkOutDate=${endDate}`;

    const response = await hostfullyRequest(endpoint, creds.api_key, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "get_reservations");
    }

    const bookings = await response.json();
    const reservations = (bookings || []).map(mapHostfullyBookingToReservation);

    return createSuccessResponse({ reservations }, "get_reservations");
  } catch (err) {
    console.error("[Hostfully] Get reservations failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch reservations", "get_reservations", err);
  }
}

async function handleCreateReservation(
  creds: HostfullyCredentials,
  propertyUid: string,
  reservationData: z.infer<typeof createReservationSchema>["reservation_data"]
) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    // Check live availability first
    const calendarEndpoint = `/property-calendar/${propertyUid}?from=${reservationData.checkInDate}&to=${reservationData.checkOutDate}`;
    const calendarResponse = await hostfullyRequest(calendarEndpoint, creds.api_key, baseUrl);

    if (!calendarResponse.ok) {
      const error = mapHostfullyHttpError(calendarResponse.status, await calendarResponse.text());
      return createErrorResponse(error.code, error.message, "create_reservation");
    }

    const calendarData: HostfullyCalendarDay[] = await calendarResponse.json();
    const unavailableDates = calendarData.filter(d => !d.available);

    if (unavailableDates.length > 0) {
      return createErrorResponse(
        ERROR_CODES.AVAILABILITY_CHANGED,
        `Property not available for dates: ${unavailableDates.map(d => d.date).join(", ")}`,
        "create_reservation",
        { unavailable_dates: unavailableDates.map(d => d.date) }
      );
    }

    const bookingPayload = {
      propertyUid,
      checkInDate: reservationData.checkInDate,
      checkOutDate: reservationData.checkOutDate,
      firstName: reservationData.guestFirstName,
      lastName: reservationData.guestLastName,
      email: reservationData.guestEmail,
      phoneNumber: reservationData.guestPhone,
      adults: reservationData.adults,
      children: reservationData.children,
      notes: reservationData.notes,
      source: "RoomsOnline",
    };

    const response = await hostfullyRequest("/leads", creds.api_key, baseUrl, "POST", bookingPayload);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[Hostfully] Create reservation failed:", response.status, errorBody);
      const error = mapHostfullyHttpError(response.status, errorBody);
      return createErrorResponse(error.code, error.message, "create_reservation", errorBody);
    }

    const booking = await response.json();

    return createSuccessResponse({
      external_reservation_id: booking.uid,
      confirmation_number: booking.uid,
      status: "confirmed",
    }, "create_reservation");
  } catch (err) {
    console.error("[Hostfully] Create reservation error:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to create reservation", "create_reservation", err);
  }
}

async function handleGetListingDetails(creds: HostfullyCredentials, propertyUid: string) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    // Fetch main property data
    const response = await hostfullyRequest(`/properties/${propertyUid}`, creds.api_key, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "get_listing_details");
    }

    const rawResponse = await response.json();
    // Handle potential property wrapper in response
    const property = rawResponse.property || rawResponse;
    
    console.log("[Hostfully] Raw property keys:", Object.keys(property));

    // Fetch photos from dedicated endpoint for complete image list
    let photos: any[] = property.photos || property.images || [];
    try {
      const photosResponse = await hostfullyRequest(`/photos?propertyUid=${propertyUid}`, creds.api_key, baseUrl);
      if (photosResponse.ok) {
        const photosData = await photosResponse.json();
        const fetchedPhotos = photosData?.photos || photosData || [];
        if (Array.isArray(fetchedPhotos) && fetchedPhotos.length > 0) {
          photos = fetchedPhotos;
        }
      }
    } catch (e) {
      console.log("[Hostfully] Photos endpoint failed, using main property photos");
    }

    // Fetch amenities from dedicated endpoint for complete list
    let amenities: any[] = property.amenities || property.features || [];
    try {
      const amenitiesResponse = await hostfullyRequest(`/properties/${propertyUid}/amenities`, creds.api_key, baseUrl);
      if (amenitiesResponse.ok) {
        const amenitiesData = await amenitiesResponse.json();
        const fetchedAmenities = amenitiesData?.amenities || amenitiesData || [];
        if (Array.isArray(fetchedAmenities) && fetchedAmenities.length > 0) {
          amenities = fetchedAmenities;
        }
      }
    } catch (e) {
      console.log("[Hostfully] Amenities endpoint failed, using main property amenities");
    }

    // Fetch descriptions from dedicated endpoint
    let description = property.description || property.summary || null;
    try {
      const descriptionsResponse = await hostfullyRequest(`/property-descriptions/${propertyUid}`, creds.api_key, baseUrl);
      if (descriptionsResponse.ok) {
        const descriptionsData = await descriptionsResponse.json();
        console.log("[Hostfully] Descriptions endpoint response:", Object.keys(descriptionsData));
        if (descriptionsData?.summary) {
          description = descriptionsData.summary;
        } else if (descriptionsData?.description) {
          description = descriptionsData.description;
        }
      }
    } catch (e) {
      console.log("[Hostfully] Descriptions endpoint failed, using main property description");
    }

    // Extract nested availability object
    const availability = property.availability || {};
    // Extract nested pricing object
    const pricing = property.pricing || {};
    // Extract nested area object
    const area = property.area || {};
    // Extract nested address object (could also be flat on property)
    const addressObj = property.address || {};

    // Process images to extract URLs
    const imageUrls = photos.map((img: any) => {
      if (typeof img === 'string') return img;
      return img.originalImageUrl || img.url || img.original || img.pictureLink || img.uri || null;
    }).filter(Boolean);

    // Process amenities to extract names
    const amenityNames = amenities.map((a: any) => {
      if (typeof a === 'string') return a;
      return a.name || a.label || a.amenityName || null;
    }).filter(Boolean);

    return createSuccessResponse({
      // Identifiers
      id: property.uid,
      name: property.name,
      
      // Descriptions
      description: description,
      house_rules: property.houseRules || property.rules || null,
      check_in_instructions: property.checkInInstructions || property.instructions || null,
      
      // Property type
      property_type: property.type || property.propertyType || property.listingType || 'property',
      status: property.status || (property.isActive === false ? 'inactive' : 'active'),
      
      // Physical specs
      bedrooms: property.bedrooms ?? null,
      bathrooms: property.bathrooms ? parseFloat(property.bathrooms) : null,
      beds: property.beds ?? null,
      room_size: area.size || property.areaSize || property.squareFeet || null,
      room_size_unit: area.unitType || property.areaSizeUnit || 'SQUARE_METERS',
      
      // Occupancy
      max_guests: availability.maxGuests || property.maxGuests || null,
      min_guests: availability.minGuests || property.minGuests || availability.baseGuests || 1,
      
      // Stay rules
      min_stay: availability.minimumStay || property.minimumStay || 1,
      max_stay: availability.maximumStay || property.maximumStay || null,
      check_in_time: availability.checkInTimeStart || property.checkInTime || property.checkInTimeStart || null,
      check_out_time: availability.checkOutTime || property.checkOutTime || null,
      
      // Pricing
      daily_rate: pricing.dailyRate || property.baseDailyRate || property.basePrice || null,
      currency: pricing.currency || property.currency || 'USD',
      cleaning_fee: pricing.cleaningFee || property.cleaningFee || null,
      security_deposit: pricing.securityDeposit || property.securityDeposit || null,
      extra_guest_fee: pricing.extraGuestFee || property.extraGuestFee || null,
      tax_rate: pricing.taxRate || property.taxRate || null,
      
      // Address - try both nested and flat
      address: {
        street: addressObj.address || addressObj.address1 || property.address1 || property.streetAddress || null,
        street2: addressObj.address2 || property.address2 || null,
        city: addressObj.city || property.city || null,
        state: addressObj.state || property.state || property.province || null,
        postal_code: addressObj.zipCode || addressObj.postalCode || property.postalCode || property.zipCode || null,
        country: addressObj.countryCode || property.countryCode || property.country || null,
      },
      
      // Location
      latitude: addressObj.latitude || property.latitude || null,
      longitude: addressObj.longitude || property.longitude || null,
      
      // Media - fallback to pictureLink if photos endpoint returns empty
      images: imageUrls.length > 0 ? imageUrls : (property.pictureLink ? [property.pictureLink] : []),
      thumbnail: property.pictureLink || property.picture || property.thumbnailUrl || (imageUrls.length > 0 ? imageUrls[0] : null),
      
      // Amenities
      amenities: amenityNames,
      
      // Wifi/Access
      wifi_network: property.wifiNetwork || property.wifiName || null,
      wifi_password: property.wifiPassword || null,
      
      // Policies
      cancellation_policy: property.cancellationPolicy || null,
      
      // Raw data for debugging
      _raw: property,
    }, "get_listing_details");
  } catch (err) {
    console.error("[Hostfully] Get listing details failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch listing details", "get_listing_details", err);
  }
}

async function handleFetchPropertyData(creds: HostfullyCredentials, propertyUid: string) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    const propResponse = await hostfullyRequest(`/properties/${propertyUid}`, creds.api_key, baseUrl);

    if (!propResponse.ok) {
      const error = mapHostfullyHttpError(propResponse.status, await propResponse.text());
      return createErrorResponse(error.code, error.message, "fetch_property_data");
    }

    const prop = await propResponse.json();

    const location = {
      address: prop.address || prop.streetAddress || null,
      city: prop.city || null,
      country: prop.country || prop.countryCode || null,
      postal_code: prop.postalCode || prop.zipCode || null,
    };

    let imageUrls: string[] | null = null;
    if (prop.photos || prop.images) {
      const images = prop.photos || prop.images;
      imageUrls = Array.isArray(images)
        ? images.map((img: any) => typeof img === 'string' ? img : (img.url || img.original))
        : null;
    }

    const amenities = prop.amenities || prop.features || null;
    const amenityList = Array.isArray(amenities)
      ? amenities.map((a: any) => typeof a === 'string' ? a : a.name)
      : null;

    return createSuccessResponse({
      property_name: prop.name || null,
      description: prop.description || prop.summary || null,
      location: (location.address || location.city) ? location : null,
      geo: null,
      images: imageUrls,
      amenities: amenityList,
      room_types: [{
        room_type_id: propertyUid,
        name: prop.name || "Property",
        description: prop.description || null,
        min_guests: prop.minGuests || 1,
        max_guests: prop.maxGuests || 2,
        guest_rules: { allow_teens: true, allow_children: true, allow_infants: true },
        linked_rate_type_ids: [],
      }],
      rate_types: [{ rate_type_id: "standard", name: "Standard Rate", description: null, price_type: "per_night" }],
      charge_types: [],
      payment_types: [],
      check_in_time: prop.checkInTime || null,
      check_out_time: prop.checkOutTime || null,
      star_rating: null,
      max_guests: prop.maxGuests || null,
    }, "fetch_property_data");
  } catch (err) {
    console.error("[Hostfully] Fetch property data failed:", err);
    return createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch property data", "fetch_property_data", err);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let action = "unknown";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log("[Hostfully] Request:", JSON.stringify(body, null, 2));

    const baseResult = baseRequestSchema.safeParse(body);
    if (!baseResult.success) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request format", "unknown", baseResult.error.issues)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    action = baseResult.data.action;

    // Handle get_capabilities without credentials
    if (action === "get_capabilities") {
      const response = await handleGetCapabilities();
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle validate_api_key with provided key
    if (action === "validate_api_key") {
      if (!body.api_key) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "api_key is required", action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
      
      // Use provided environment OR read from tracker (same as other actions)
      let environment = body.environment;
      if (!environment) {
        environment = await getTrackerEnvironment(supabase, "hostfully");
      }
      
      const response = await handleValidateApiKey(body.api_key, environment);
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get credentials for all other actions
    const creds = await getCredentials(supabase, baseResult.data);
    if (!creds) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.AUTH_FAILED, "No valid credentials found", action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    let response: AdapterResponse<unknown>;

    switch (action) {
      case "health_check":
        response = await handleHealthCheck(creds);
        break;

      case "sync_owner_listings":
        response = await handleSyncOwnerListings(creds, supabase);
        break;

      case "list_properties":
        response = await handleListProperties(creds);
        break;

      case "list_all_properties":
        response = await handleListAllProperties(creds, supabase);
        break;

      case "get_listing_details":
        if (!body.propertyUid) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyUid is required", action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleGetListingDetails(creds, body.propertyUid);
        break;

      case "get_property_rooms":
        if (!body.propertyUid) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyUid is required", action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleGetPropertyRooms(creds, body.propertyUid);
        break;

      case "fetch_availability": {
        const result = fetchAvailabilitySchema.safeParse(body);
        if (!result.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request", action, result.error.issues)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        
        // Resolve the Hostfully propertyUid from either direct UID or ROL property_id
        const hostfullyUid = await resolveHostfullyPropertyUid(
          supabase, 
          result.data.propertyUid, 
          result.data.property_id
        );
        
        if (!hostfullyUid) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.NOT_FOUND, 
              "Could not resolve Hostfully property UID. Ensure property has external_id or room_types with hostfullyId.", 
              action
            )),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
          );
        }
        
        // Normalize date fields (accept both camelCase and snake_case)
        const startDate = result.data.startDate || result.data.start_date;
        const endDate = result.data.endDate || result.data.end_date;
        
        // Pass property_id for caching availability data
        response = await handleFetchAvailability(creds, hostfullyUid, startDate!, endDate!, result.data.property_id);
        break;
      }

      case "get_room_types":
        if (!body.propertyUid) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyUid is required", action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleGetRoomTypes(creds, body.propertyUid);
        break;

      case "get_rate_types":
        response = await handleGetRateTypes();
        break;

      case "get_reservations": {
        const result = getReservationsSchema.safeParse(body);
        if (!result.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request", action, result.error.issues)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleGetReservations(creds, result.data.propertyUid, result.data.startDate, result.data.endDate);
        break;
      }

      case "create_reservation": {
        const result = createReservationSchema.safeParse(body);
        if (!result.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request", action, result.error.issues)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleCreateReservation(creds, result.data.propertyUid, result.data.reservation_data);
        break;
      }

      case "modify_reservation":
        response = createErrorResponse(ERROR_CODES.MODIFICATION_NOT_SUPPORTED, "Not supported", action);
        break;

      case "cancel_reservation":
        response = createErrorResponse(ERROR_CODES.CANCELLATION_NOT_SUPPORTED, "Not supported", action);
        break;

      case "fetch_property_data":
        if (!body.propertyUid) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyUid is required", action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleFetchPropertyData(creds, body.propertyUid);
        break;

      case "full_ingest_property": {
        // One-time property data ingestion (68 fields)
        const { executeFullIngestion } = await import("./ingestion/orchestrator.ts");
        if (!body.propertyUid || !body.rol_property_id) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyUid and rol_property_id required", action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await executeFullIngestion(body.propertyUid, body.rol_property_id, creds.owner_credential_id || '', supabase, { skipRooms: body.skipRooms === true });
        break;
      }

      case "ingest_building_units": {
        // Unit-level ingestion: iterates over child unit UIDs and fetches full details
        const { ingestBuildingUnits } = await import("./ingestion/unit-ingestion.ts");
        if (!body.rol_property_id) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "rol_property_id is required", action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        const ingestionResult = await ingestBuildingUnits(
          body.rol_property_id,
          creds.owner_credential_id || '',
          supabase
        );
        response = ingestionResult.errors.length > 0 && ingestionResult.units_succeeded === 0
          ? createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, ingestionResult.errors.join('; '), action, ingestionResult)
          : createSuccessResponse(ingestionResult, action);
        break;
      }

      case "repair_room_mapping": {
        if (!body.property_id) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "property_id is required", action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleRepairRoomMapping(creds, supabase, body.property_id);
        break;
      }

      default:
        response = createErrorResponse(ERROR_CODES.INVALID_REQUEST, `Unknown action: ${action}`, action);
    }

    console.log("[Hostfully] Response:", JSON.stringify(response, null, 2));

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Hostfully] Unhandled error:", err);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Internal error", action, err instanceof Error ? err.message : String(err))),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
