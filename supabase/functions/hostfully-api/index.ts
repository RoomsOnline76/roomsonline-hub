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
    "validate_api_key",        // NEW: Validates owner API key
    "sync_owner_listings",     // NEW: Syncs listings for owner
    "list_properties",
    "get_listing_details",
    "get_property_rooms",      // NEW: Get rooms for a property
    "fetch_availability",
    "get_room_types",
    "get_rate_types",
    "get_reservations",
    "create_reservation",
    "modify_reservation",
    "cancel_reservation",
    "fetch_property_data",
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
  propertyUid: z.string({ required_error: "propertyUid is required" }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be YYYY-MM-DD format" }),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "endDate must be YYYY-MM-DD format" }),
});

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
  // Option 1: API key provided directly in request
  if (body.api_key) {
    return {
      api_key: body.api_key,
      environment: body.environment || "production",
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
      environment: data.environment as "sandbox" | "production" || "production",
      owner_credential_id: data.id,
    };
  }

  // Option 3: Fallback to system-level pms_credentials (legacy)
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

  const apiKeyFromEnv = Deno.env.get("HOSTFULLY_API_KEY");
  const apiKey = apiKeyFromEnv || data.api_key;

  if (!apiKey) {
    return null;
  }

  return {
    api_key: apiKey,
    environment: data.environment as "sandbox" | "production" || "production",
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

interface HostfullyCalendarDay {
  date: string;
  available: boolean;
  price?: number;
  minimumStay?: number;
  checkInAllowed?: boolean;
  checkOutAllowed?: boolean;
}

function mapHostfullyCalendarToAvailability(calendarData: HostfullyCalendarDay[], propertyUid: string) {
  const roomType = {
    room_type_id: propertyUid,
    name: "Property",
    availability_per_night: calendarData.map(day => ({
      date: day.date,
      available_units: day.available ? 1 : 0,
      restrictions: {
        stop_sell: !day.available,
        min_stay: day.minimumStay || 1,
        max_stay: null,
        closed_to_arrival: !day.checkInAllowed,
        closed_to_departure: !day.checkOutAllowed,
      },
    })),
    rate_types: [{
      rate_type_id: "standard",
      name: "Standard Rate",
      price_type: "per_night",
      rates: calendarData.filter(d => d.price).map(day => ({
        date: day.date,
        room_amount: day.price || 0,
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
async function handleListAllProperties(creds: HostfullyCredentials) {
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

async function handleFetchAvailability(
  creds: HostfullyCredentials,
  propertyUid: string,
  startDate: string,
  endDate: string
) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];

  try {
    const endpoint = `/properties/${propertyUid}/calendar?startDate=${startDate}&endDate=${endDate}`;
    const response = await hostfullyRequest(endpoint, creds.api_key, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "fetch_availability");
    }

    const calendarData = await response.json();
    const availability = mapHostfullyCalendarToAvailability(calendarData, propertyUid);

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
    const calendarEndpoint = `/properties/${propertyUid}/calendar?startDate=${reservationData.checkInDate}&endDate=${reservationData.checkOutDate}`;
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
    const response = await hostfullyRequest(`/properties/${propertyUid}`, creds.api_key, baseUrl);

    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "get_listing_details");
    }

    const property = await response.json();

    return createSuccessResponse({
      id: property.uid,
      name: property.name,
      description: property.description || property.summary || null,
      property_type: property.type || property.propertyType || 'property',
      status: property.status || 'active',
      bedrooms: property.bedrooms || null,
      bathrooms: property.bathrooms || null,
      max_guests: property.maxGuests || null,
      min_guests: property.minGuests || 1,
      address: {
        street: property.address1 || property.streetAddress || null,
        city: property.city || null,
        state: property.state || property.province || null,
        postal_code: property.postalCode || property.zipCode || null,
        country: property.countryCode || property.country || null,
      },
      location: {
        latitude: property.latitude || null,
        longitude: property.longitude || null,
      },
      pricing: {
        base_daily_rate: property.baseDailyRate || null,
        currency: property.currency || 'USD',
        cleaning_fee: property.cleaningFee || null,
      },
      check_in_time: property.checkInTime || property.checkInTimeStart || null,
      check_out_time: property.checkOutTime || null,
      images: property.photos || property.images || [],
      amenities: property.amenities || property.features || [],
      thumbnail: property.pictureLink || property.picture || null,
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
      const response = await handleValidateApiKey(body.api_key, body.environment || "production");
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
        response = await handleListAllProperties(creds);
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
        response = await handleFetchAvailability(creds, result.data.propertyUid, result.data.startDate, result.data.endDate);
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
