import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// HOSTFULLY API ADAPTER
// Conforms to: supabase/functions/_shared/adapter-contract.ts
// Reference: https://dev.hostfully.com/reference/getting-started
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE = "hostfully";

const HOSTFULLY_URLS = {
  sandbox: "https://sandbox.hostfully.com/api/v2",
  production: "https://api.hostfully.com/api/v2",
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
};

// ============================================================================
// STANDARDIZED ERROR CODES (from adapter-contract.ts)
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
    "fetch_availability",
    "get_room_types",
    "get_rate_types",
    "get_reservations",
    "create_reservation",
    "modify_reservation",
    "cancel_reservation",
    "fetch_property_data",  // Added per v1.1 spec
  ]),
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
  environment: "sandbox" | "production";
  is_active: boolean;
  refresh_interval_minutes: number;
}

async function getHostfullyCredentials(supabase: any): Promise<HostfullyCredentials | null> {
  const { data, error } = await supabase
    .from("pms_credentials")
    .select("*")
    .eq("system_type", "hostfully")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    console.error("Failed to fetch Hostfully credentials:", error);
    return null;
  }

  return {
    api_key: data.api_key,
    environment: data.environment as "sandbox" | "production",
    is_active: data.is_active,
    refresh_interval_minutes: data.refresh_interval_minutes || 60,
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
      return { code: ERROR_CODES.PMS_UNAVAILABLE, message: "Hostfully rate limit exceeded (10,000/hour)" };
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

interface HostfullyProperty {
  uid: string;
  name: string;
  description?: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  minGuests?: number;
}

interface HostfullyBooking {
  uid: string;
  propertyUid: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail?: string;
  adults?: number;
  children?: number;
  totalPrice?: number;
}

function mapHostfullyCalendarToAvailability(calendarData: HostfullyCalendarDay[], propertyUid: string) {
  const roomType = {
    room_type_id: propertyUid,
    name: "Property", // Hostfully treats whole property as unit
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

function mapHostfullyPropertyToRoomTypes(property: HostfullyProperty) {
  return {
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
  };
}

function mapHostfullyBookingToReservation(booking: HostfullyBooking) {
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

async function handleHealthCheck(creds: HostfullyCredentials) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];
  
  try {
    // Use agencies endpoint to verify API key works
    const response = await hostfullyRequest("/agencies", creds.api_key, baseUrl);
    
    if (!response.ok) {
      const error = mapHostfullyHttpError(response.status, await response.text());
      return createErrorResponse(error.code, error.message, "health_check");
    }
    
    return createSuccessResponse({ healthy: true, environment: creds.environment }, "health_check");
  } catch (err) {
    console.error("[Hostfully] Health check failed:", err);
    return createErrorResponse(
      ERROR_CODES.PMS_UNAVAILABLE,
      "Failed to connect to Hostfully API",
      "health_check",
      err
    );
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
    return createErrorResponse(
      ERROR_CODES.INTERNAL_ADAPTER_ERROR,
      "Failed to fetch availability from Hostfully",
      "fetch_availability",
      err
    );
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
    const roomTypes = mapHostfullyPropertyToRoomTypes(property);
    
    return createSuccessResponse(roomTypes, "get_room_types");
  } catch (err) {
    console.error("[Hostfully] Get room types failed:", err);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_ADAPTER_ERROR,
      "Failed to fetch room types from Hostfully",
      "get_room_types",
      err
    );
  }
}

async function handleGetRateTypes(creds: HostfullyCredentials, propertyUid: string) {
  // Hostfully doesn't have separate rate types - properties have single pricing
  // Return a standard rate type for consistency with adapter contract
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
    return createErrorResponse(
      ERROR_CODES.INTERNAL_ADAPTER_ERROR,
      "Failed to fetch reservations from Hostfully",
      "get_reservations",
      err
    );
  }
}

async function handleCreateReservation(
  creds: HostfullyCredentials,
  propertyUid: string,
  reservationData: z.infer<typeof createReservationSchema>["reservation_data"]
) {
  const baseUrl = HOSTFULLY_URLS[creds.environment];
  
  // ============================================================================
  // DATA AUTHORITY RULE: CACHE IS NEVER AUTHORITATIVE. PMS ALWAYS IS.
  // Verify live availability before creating reservation
  // ============================================================================
  
  console.log("[Hostfully] Verifying live availability before booking...");
  
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
    
    // Create the booking
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
    return createErrorResponse(
      ERROR_CODES.INTERNAL_ADAPTER_ERROR,
      "Failed to create reservation in Hostfully",
      "create_reservation",
      err
    );
  }
}

async function handleModifyReservation() {
  return createErrorResponse(
    ERROR_CODES.MODIFICATION_NOT_SUPPORTED,
    "Hostfully reservation modification is not yet supported",
    "modify_reservation"
  );
}

async function handleCancelReservation() {
  return createErrorResponse(
    ERROR_CODES.CANCELLATION_NOT_SUPPORTED,
    "Hostfully reservation cancellation is not yet supported",
    "cancel_reservation"
  );
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let action = "unknown";

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const body = await req.json();
    console.log("[Hostfully] Request:", JSON.stringify(body, null, 2));

    // Validate base request
    const baseResult = baseRequestSchema.safeParse(body);
    if (!baseResult.success) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          "Invalid request format",
          "unknown",
          baseResult.error.issues
        )),
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

    // Get credentials for all other actions
    const creds = await getHostfullyCredentials(supabase);
    if (!creds) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.AUTH_FAILED,
          "Hostfully credentials not configured or inactive",
          action
        )),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Route to appropriate handler
    let response: AdapterResponse<unknown>;

    switch (action) {
      case "health_check":
        response = await handleHealthCheck(creds);
        break;

      case "fetch_availability": {
        const result = fetchAvailabilitySchema.safeParse(body);
        if (!result.success) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.INVALID_REQUEST,
              "Invalid fetch_availability request",
              action,
              result.error.issues
            )),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleFetchAvailability(
          creds,
          result.data.propertyUid,
          result.data.startDate,
          result.data.endDate
        );
        break;
      }

      case "get_room_types": {
        if (!body.propertyUid) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.INVALID_REQUEST,
              "propertyUid is required",
              action
            )),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleGetRoomTypes(creds, body.propertyUid);
        break;
      }

      case "get_rate_types": {
        if (!body.propertyUid) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.INVALID_REQUEST,
              "propertyUid is required",
              action
            )),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleGetRateTypes(creds, body.propertyUid);
        break;
      }

      case "get_reservations": {
        const result = getReservationsSchema.safeParse(body);
        if (!result.success) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.INVALID_REQUEST,
              "Invalid get_reservations request",
              action,
              result.error.issues
            )),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleGetReservations(
          creds,
          result.data.propertyUid,
          result.data.startDate,
          result.data.endDate
        );
        break;
      }

      case "create_reservation": {
        const result = createReservationSchema.safeParse(body);
        if (!result.success) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.INVALID_REQUEST,
              "Invalid create_reservation request",
              action,
              result.error.issues
            )),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        response = await handleCreateReservation(
          creds,
          result.data.propertyUid,
          result.data.reservation_data
        );
        break;
      }

      case "modify_reservation":
        response = await handleModifyReservation();
        break;

      case "cancel_reservation":
        response = await handleCancelReservation();
        break;

      case "fetch_property_data": {
        // ============================================================================
        // HOSTFULLY fetch_property_data - per v1.1 pms-implementation-master.json:
        // - name: authoritative
        // - description: authoritative
        // - location: authoritative
        // - images: authoritative
        // - amenities: partial
        // ============================================================================
        if (!body.propertyUid) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyUid is required", action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        
        const baseUrl = HOSTFULLY_URLS[creds.environment];
        const propResponse = await hostfullyRequest(`/properties/${body.propertyUid}`, creds.api_key, baseUrl);
        
        if (!propResponse.ok) {
          const error = mapHostfullyHttpError(propResponse.status, await propResponse.text());
          response = createErrorResponse(error.code, error.message, action);
          break;
        }
        
        const prop = await propResponse.json();
        
        // Extract editorial data
        const location = {
          address: prop.address || prop.streetAddress || null,
          city: prop.city || null,
          country: prop.country || prop.countryCode || null,
          postal_code: prop.postalCode || prop.zipCode || null,
        };
        
        // Get images if available
        let imageUrls: string[] | null = null;
        if (prop.photos || prop.images) {
          const images = prop.photos || prop.images;
          imageUrls = Array.isArray(images) 
            ? images.map((img: any) => typeof img === 'string' ? img : (img.url || img.original))
            : null;
        }
        
        // Amenities - partial per spec
        const amenities = prop.amenities || prop.features || null;
        const amenityList = Array.isArray(amenities)
          ? amenities.map((a: any) => typeof a === 'string' ? a : a.name)
          : null;
        
        response = createSuccessResponse({
          property_name: prop.name || null,
          description: prop.description || prop.summary || null,
          location: (location.address || location.city) ? location : null,
          geo: null,
          images: imageUrls,
          amenities: amenityList,
          room_types: [{
            room_type_id: body.propertyUid,
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
        }, action);
        break;
      }

      default:
        response = createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          `Unknown action: ${action}`,
          action
        );
    }

    console.log("[Hostfully] Response:", JSON.stringify(response, null, 2));

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Hostfully] Unhandled error:", err);
    return new Response(
      JSON.stringify(createErrorResponse(
        ERROR_CODES.INTERNAL_ADAPTER_ERROR,
        "Internal adapter error",
        action,
        err instanceof Error ? err.message : String(err)
      )),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
