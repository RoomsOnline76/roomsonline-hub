import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// CLOUDBEDS API ADAPTER
// Follows the standardized adapter contract from adapter-contract.ts
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
// CAPABILITY DECLARATION
// ============================================================================

const CAPABILITIES = {
  supports_live_availability: true,
  supports_rate_fetch: true,
  supports_create_booking: true,
  supports_modify_booking: false,
  supports_webhooks: true,
};

// Standardized response wrapper
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
    source: "cloudbeds",
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
    source: "cloudbeds",
    fetched_at: new Date().toISOString(),
    action,
  };
}

// ============================================================================
// ENVIRONMENT HELPER - Reads from pms_tracker_status
// ============================================================================

async function getTrackerEnvironment(
  supabase: any,
  systemType: string = "cloudbeds"
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

// Input validation schemas
const baseRequestSchema = z.object({
  action: z.enum([
    "get_capabilities",
    "health_check",
    "fetch_availability",
    "create_reservation",
    "get_reservations",
    "get_room_types",
    "get_rate_plans",
    "fetch_property_data",
  ]),
  property_id: z.string().uuid({ message: "Invalid property ID format" }).optional(),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Start date must be YYYY-MM-DD format" }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be YYYY-MM-DD format" }),
  room_type_ids: z.array(z.string()).optional(),
});

const getReservationsSchema = baseRequestSchema.extend({
  action: z.literal("get_reservations"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Start date must be YYYY-MM-DD format" }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be YYYY-MM-DD format" }),
  status: z.string().optional(),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  reservation_data: z.object({
    startDate: z.string(),
    endDate: z.string(),
    roomTypeID: z.string(),
    ratePlanID: z.string().optional(),
    adults: z.number().min(1),
    children: z.number().min(0).optional(),
    guestFirstName: z.string().min(1),
    guestLastName: z.string().min(1),
    guestEmail: z.string().email(),
    guestPhone: z.string().optional(),
    estimatedArrivalTime: z.string().optional(),
    guestNotes: z.string().optional(),
    thirdPartyIdentifier: z.string().optional(),
    sendEmailConfirmation: z.boolean().optional(),
  }),
});

// Cloudbeds API Base URL
const CLOUDBEDS_API_URL = "https://hotels.cloudbeds.com/api/v1.2";

interface CloudbedsCredentials {
  api_key: string;
  property_id: string;
  environment: "sandbox" | "production";
}

// Get auth headers for Cloudbeds
const getAuthHeaders = (apiKey: string) => ({
  "Authorization": `Bearer ${apiKey}`,
  "Content-Type": "application/json",
});

// Helper to make Cloudbeds API calls
async function cloudbedsApiCall(
  endpoint: string,
  apiKey: string,
  propertyId: string,
  method: string = "GET",
  body?: unknown
): Promise<any> {
  const url = `${CLOUDBEDS_API_URL}${endpoint}`;
  console.log(`[Cloudbeds] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: getAuthHeaders(apiKey),
  };

  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseText = await response.text();

  console.log(`[Cloudbeds] Response status: ${response.status}`);
  console.log(`[Cloudbeds] Response (first 500 chars): ${responseText.substring(0, 500)}`);

  if (!response.ok) {
    console.error(`[Cloudbeds] API error: ${response.status} - ${responseText}`);
    throw new Error(`Cloudbeds API error: ${response.status} - ${responseText}`);
  }

  try {
    const data = JSON.parse(responseText);
    // Cloudbeds wraps responses in a success/data structure
    if (data.success === false) {
      throw new Error(data.message || "Cloudbeds API returned error");
    }
    return data.data || data;
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error(`[Cloudbeds] Failed to parse JSON:`, e);
      throw new Error(`Invalid JSON response from Cloudbeds API`);
    }
    throw e;
  }
}

// Get hotel details (health check)
async function getHotelDetails(apiKey: string, propertyId: string): Promise<any> {
  return cloudbedsApiCall(`/getHotelDetails?propertyID=${propertyId}`, apiKey, propertyId);
}

// Get room types
async function getRoomTypes(apiKey: string, propertyId: string): Promise<any> {
  return cloudbedsApiCall(`/getRoomTypes?propertyID=${propertyId}`, apiKey, propertyId);
}

// Get rate plans
async function getRatePlans(
  apiKey: string,
  propertyId: string,
  startDate?: string,
  endDate?: string,
  detailedRates: boolean = true
): Promise<any> {
  let url = `/getRatePlans?propertyID=${propertyId}&detailedRates=${detailedRates}`;
  if (startDate) url += `&startDate=${startDate}`;
  if (endDate) url += `&endDate=${endDate}`;
  return cloudbedsApiCall(url, apiKey, propertyId);
}

// Get availability
async function getAvailability(
  apiKey: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  roomTypeIds?: string[]
): Promise<any> {
  let url = `/getAvailableRoomTypes?propertyID=${propertyId}&startDate=${startDate}&endDate=${endDate}`;
  if (roomTypeIds?.length) {
    roomTypeIds.forEach(id => url += `&roomTypeID=${id}`);
  }
  return cloudbedsApiCall(url, apiKey, propertyId);
}

// Get reservations
async function getReservations(
  apiKey: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  status?: string
): Promise<any> {
  let url = `/getReservations?propertyID=${propertyId}&checkInFrom=${startDate}&checkInTo=${endDate}`;
  if (status) url += `&status=${status}`;
  return cloudbedsApiCall(url, apiKey, propertyId);
}

// Create reservation
async function createReservation(
  apiKey: string,
  propertyId: string,
  reservationData: {
    startDate: string;
    endDate: string;
    roomTypeID: string;
    ratePlanID?: string;
    adults: number;
    children?: number;
    guestFirstName: string;
    guestLastName: string;
    guestEmail: string;
    guestPhone?: string;
    estimatedArrivalTime?: string;
    guestNotes?: string;
    thirdPartyIdentifier?: string;
    sendEmailConfirmation?: boolean;
  }
): Promise<any> {
  const payload = {
    propertyID: propertyId,
    startDate: reservationData.startDate,
    endDate: reservationData.endDate,
    rooms: [{
      roomTypeID: reservationData.roomTypeID,
      ratePlanID: reservationData.ratePlanID,
      adults: reservationData.adults,
      children: reservationData.children || 0,
    }],
    guestFirstName: reservationData.guestFirstName,
    guestLastName: reservationData.guestLastName,
    guestEmail: reservationData.guestEmail,
    guestPhone: reservationData.guestPhone || "",
    estimatedArrivalTime: reservationData.estimatedArrivalTime,
    guestNotes: reservationData.guestNotes || "",
    thirdPartyIdentifier: reservationData.thirdPartyIdentifier || "",
    sendEmailConfirmation: reservationData.sendEmailConfirmation ?? false,
  };

  console.log(`[Cloudbeds] Creating reservation:`, JSON.stringify(payload, null, 2));
  return cloudbedsApiCall(`/postReservation`, apiKey, propertyId, "POST", payload);
}

// Transform Cloudbeds room types to adapter contract format
function transformRoomTypes(cloudbedsRoomTypes: any[]): any[] {
  return cloudbedsRoomTypes.map(rt => ({
    room_type_id: rt.roomTypeID?.toString() || rt.roomTypeId?.toString(),
    name: rt.roomTypeName || rt.name,
    description: rt.roomTypeDescription || rt.description || "",
    max_guests: rt.maxGuests || rt.roomTypeMaxGuests || 2,
    min_guests: 1,
    guest_rules: {
      allow_teens: true,
      teen_min_age: 13,
      teen_max_age: 17,
      allow_children: true,
      child_min_age: 2,
      child_max_age: 12,
      allow_infants: true,
      infant_min_age: 0,
      infant_max_age: 1,
    },
    linked_rate_type_ids: rt.roomTypeRates?.map((r: any) => r.rateID?.toString()) || [],
    raw_data: rt,
  }));
}

// Transform Cloudbeds rate plans to adapter contract format
function transformRatePlans(cloudbedsRatePlans: any[]): any[] {
  return cloudbedsRatePlans.map(rp => ({
    rate_type_id: rp.ratePlanID?.toString() || rp.rateID?.toString(),
    name: rp.ratePlanName || rp.rateName || rp.name,
    description: rp.ratePlanDescription || rp.description || "",
    price_type: "per_room",
    min_stay_days: rp.minLOS || rp.minimumStay || null,
    max_stay_days: rp.maxLOS || rp.maximumStay || null,
    min_advance_days: null,
    max_advance_days: null,
    raw_data: rp,
  }));
}

// Transform Cloudbeds availability to adapter contract format
function transformAvailability(cloudbedsAvailability: any[], startDate: string, endDate: string): any {
  const roomTypes: any[] = [];

  for (const rt of cloudbedsAvailability) {
    const dailyAvailability: any[] = [];
    
    // Cloudbeds returns roomsAvailable as a number or per-day breakdown
    const roomsAvailable = rt.roomsAvailable || rt.roomsToSell || 0;
    
    // If we have daily data
    if (rt.availability && Array.isArray(rt.availability)) {
      for (const day of rt.availability) {
        dailyAvailability.push({
          date: day.date,
          available_units: day.roomsAvailable ?? roomsAvailable,
          restrictions: {
            stop_sell: day.isClosed || false,
            closed_to_arrival: day.closedToArrival || false,
            closed_to_departure: day.closedToDeparture || false,
            min_stay: day.minLOS || null,
            max_stay: day.maxLOS || null,
            min_advance: null,
            max_advance: null,
          },
        });
      }
    } else {
      // Generate daily entries for the date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dailyAvailability.push({
          date: dateStr,
          available_units: roomsAvailable,
          restrictions: {
            stop_sell: false,
            closed_to_arrival: false,
            closed_to_departure: false,
            min_stay: null,
            max_stay: null,
            min_advance: null,
            max_advance: null,
          },
        });
      }
    }

    // Rate types for this room
    const rateTypes: any[] = [];
    if (rt.roomTypeRates && Array.isArray(rt.roomTypeRates)) {
      for (const rate of rt.roomTypeRates) {
        const dailyRates: any[] = [];
        
        if (rate.rates && Array.isArray(rate.rates)) {
          for (const r of rate.rates) {
            dailyRates.push({
              date: r.date,
              room_amount: parseFloat(r.rate) || parseFloat(r.baseRate) || 0,
              adult_amount_1: parseFloat(r.rate) || parseFloat(r.baseRate) || 0,
              adult_amount_2: parseFloat(r.rate) || parseFloat(r.baseRate) || 0,
              teen_amount: 0,
              child_amount: 0,
              infant_amount: 0,
              currency: rate.currency || "USD",
            });
          }
        }

        rateTypes.push({
          rate_type_id: rate.rateID?.toString() || rate.ratePlanID?.toString(),
          name: rate.rateName || rate.ratePlanName || "Standard",
          daily_rates: dailyRates,
        });
      }
    }

    roomTypes.push({
      room_type_id: rt.roomTypeID?.toString() || rt.roomTypeId?.toString(),
      name: rt.roomTypeName || rt.name,
      daily_availability: dailyAvailability,
      rate_types: rateTypes,
    });
  }

  return {
    room_types: roomTypes,
    currency: cloudbedsAvailability[0]?.currency || "USD",
    fetched_at: new Date().toISOString(),
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let action = "unknown";

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    console.log(`[Cloudbeds] Request:`, JSON.stringify(body, null, 2));

    // Validate base request
    const baseValidation = baseRequestSchema.safeParse(body);
    if (!baseValidation.success) {
      console.error(`[Cloudbeds] Validation error:`, baseValidation.error);
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          "Invalid request parameters",
          action,
          baseValidation.error.issues
        )),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    action = body.action;
    const propertyId = body.property_id;

    // Handle get_capabilities without needing credentials
    if (action === "get_capabilities") {
      return new Response(
        JSON.stringify(createSuccessResponse(CAPABILITIES, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle health_check - doesn't need property, just credentials
    if (action === "health_check" && !propertyId) {
      console.log(`[Cloudbeds] Standalone health check - no property_id provided`);
      
      // Get Cloudbeds credentials
      const { data: credentials } = await supabaseClient
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "cloudbeds")
        .eq("is_active", true)
        .maybeSingle();

      if (!credentials?.api_key) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.AUTH_FAILED,
            "Cloudbeds credentials not configured",
            action
          )),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get any Cloudbeds-connected property for testing
      const { data: testProperty } = await supabaseClient
        .from("properties")
        .select("cloudbeds_property_id")
        .not("cloudbeds_property_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (!testProperty?.cloudbeds_property_id) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.NOT_FOUND,
            "No Cloudbeds-connected properties found for health check",
            action
          )),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const result = await getHotelDetails(credentials.api_key, testProperty.cloudbeds_property_id);
        
        return new Response(
          JSON.stringify(createSuccessResponse({
            status: "ok",
            healthy: true,
            environment: credentials.environment || "production",
            message: "Connection successful",
          }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.PMS_UNAVAILABLE,
            error.message || "Health check failed",
            action
          )),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // For remaining actions, property_id is required
    if (!propertyId) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          "property_id is required for this action",
          action
        )),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get property details to find Cloudbeds property ID
    const { data: property, error: propError } = await supabaseClient
      .from("properties")
      .select("cloudbeds_property_id, external_system")
      .eq("id", propertyId)
      .single();

    if (propError || !property) {
      console.error(`[Cloudbeds] Property lookup failed:`, propError);
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.NOT_FOUND,
          "Property not found",
          action
        )),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cloudbedsPropertyId = property.cloudbeds_property_id;
    if (!cloudbedsPropertyId) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          "Cloudbeds property ID not configured for this property",
          action
        )),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Cloudbeds credentials from pms_credentials
    const { data: credentials, error: credError } = await supabaseClient
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "cloudbeds")
      .eq("is_active", true)
      .single();

    if (credError || !credentials?.api_key) {
      console.error(`[Cloudbeds] Credentials lookup failed:`, credError);
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.AUTH_FAILED,
          "Cloudbeds credentials not configured",
          action
        )),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = credentials.api_key;

    // Route to appropriate handler
    switch (action) {
      case "health_check": {
        const hotelDetails = await getHotelDetails(apiKey, cloudbedsPropertyId);
        return new Response(
          JSON.stringify(createSuccessResponse({
            status: "connected",
            property_name: hotelDetails.propertyName || hotelDetails.name,
            property_id: cloudbedsPropertyId,
          }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_room_types": {
        const roomTypesRaw = await getRoomTypes(apiKey, cloudbedsPropertyId);
        const roomTypes = transformRoomTypes(Array.isArray(roomTypesRaw) ? roomTypesRaw : [roomTypesRaw]);

        // Cache room types
        for (const rt of roomTypes) {
          await supabaseClient
            .from("pms_room_types_cache")
            .upsert({
              property_id: propertyId,
              system_type: "cloudbeds",
              external_room_type_id: rt.room_type_id,
              name: rt.name,
              description: rt.description,
              max_guests: rt.max_guests,
              min_guests: rt.min_guests,
              allow_teens: rt.guest_rules?.allow_teens ?? true,
              teen_min_age: rt.guest_rules?.teen_min_age,
              teen_max_age: rt.guest_rules?.teen_max_age,
              allow_children: rt.guest_rules?.allow_children ?? true,
              child_min_age: rt.guest_rules?.child_min_age,
              child_max_age: rt.guest_rules?.child_max_age,
              allow_infants: rt.guest_rules?.allow_infants ?? true,
              infant_min_age: rt.guest_rules?.infant_min_age,
              infant_max_age: rt.guest_rules?.infant_max_age,
              linked_rate_type_ids: rt.linked_rate_type_ids,
              raw_data: rt.raw_data,
              fetched_at: new Date().toISOString(),
            }, {
              onConflict: "property_id,system_type,external_room_type_id",
            });
        }

        return new Response(
          JSON.stringify(createSuccessResponse({ room_types: roomTypes }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_property_data": {
        // ============================================================================
        // CLOUDBEDS fetch_property_data - per v1.1 pms-implementation-master.json:
        // - name: authoritative
        // - description: authoritative
        // - location: authoritative
        // - geo: authoritative (unique to Cloudbeds)
        // - images: authoritative
        // - amenities: partial
        // - star_rating: authoritative (per-PMS override)
        // ============================================================================
        console.log(`[Cloudbeds] Fetching full property data for ${propertyId}`);
        
        // Fetch hotel details for editorial content
        const hotelDetails = await getHotelDetails(apiKey, cloudbedsPropertyId);
        console.log(`[Cloudbeds] Hotel details:`, JSON.stringify(hotelDetails).substring(0, 500));
        
        // Fetch room types and rate plans
        const roomTypesRaw = await getRoomTypes(apiKey, cloudbedsPropertyId);
        const ratePlansRaw = await getRatePlans(apiKey, cloudbedsPropertyId);
        
        const roomTypes = transformRoomTypes(Array.isArray(roomTypesRaw) ? roomTypesRaw : [roomTypesRaw]);
        const rateTypes = transformRatePlans(Array.isArray(ratePlansRaw) ? ratePlansRaw : [ratePlansRaw]);

        // Cache room types
        for (const rt of roomTypes) {
          await supabaseClient
            .from("pms_room_types_cache")
            .upsert({
              property_id: propertyId,
              system_type: "cloudbeds",
              external_room_type_id: rt.room_type_id,
              name: rt.name,
              description: rt.description,
              max_guests: rt.max_guests,
              min_guests: rt.min_guests,
              allow_teens: rt.guest_rules?.allow_teens ?? true,
              teen_min_age: rt.guest_rules?.teen_min_age,
              teen_max_age: rt.guest_rules?.teen_max_age,
              allow_children: rt.guest_rules?.allow_children ?? true,
              child_min_age: rt.guest_rules?.child_min_age,
              child_max_age: rt.guest_rules?.child_max_age,
              allow_infants: rt.guest_rules?.allow_infants ?? true,
              infant_min_age: rt.guest_rules?.infant_min_age,
              infant_max_age: rt.guest_rules?.infant_max_age,
              linked_rate_type_ids: rt.linked_rate_type_ids,
              raw_data: rt.raw_data,
              fetched_at: new Date().toISOString(),
            }, {
              onConflict: "property_id,system_type,external_room_type_id",
            });
        }

        // Cache rate types
        for (const rateType of rateTypes) {
          await supabaseClient
            .from("pms_rate_types_cache")
            .upsert({
              property_id: propertyId,
              system_type: "cloudbeds",
              external_rate_type_id: rateType.rate_type_id,
              name: rateType.name,
              description: rateType.description,
              price_type: rateType.price_type,
              min_stay_days: rateType.min_stay_days,
              max_stay_days: rateType.max_stay_days,
              min_advance_days: rateType.min_advance_days,
              max_advance_days: rateType.max_advance_days,
              raw_data: rateType.raw_data,
              fetched_at: new Date().toISOString(),
            }, {
              onConflict: "property_id,system_type,external_rate_type_id",
            });
        }

        // Extract editorial data from hotel details
        // Cloudbeds API fields vary - handle both camelCase and snake_case
        const propertyName = hotelDetails.propertyName || hotelDetails.property_name || hotelDetails.name || null;
        const description = hotelDetails.propertyDescription || hotelDetails.property_description || hotelDetails.description || null;
        
        // Location data
        const location = {
          address: hotelDetails.propertyAddress || hotelDetails.address1 || hotelDetails.address || null,
          city: hotelDetails.propertyCity || hotelDetails.city || null,
          country: hotelDetails.propertyCountry || hotelDetails.country || null,
          postal_code: hotelDetails.propertyZip || hotelDetails.postalCode || hotelDetails.zip || null,
        };
        const hasLocation = location.address || location.city || location.country;
        
        // Geo data - Cloudbeds is the only PMS with authoritative geo
        const latitude = hotelDetails.propertyLatitude || hotelDetails.latitude || hotelDetails.lat;
        const longitude = hotelDetails.propertyLongitude || hotelDetails.longitude || hotelDetails.lng;
        const geo = (latitude && longitude) ? {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        } : null;
        
        // Images from Cloudbeds
        const images = hotelDetails.propertyImages || hotelDetails.images || hotelDetails.photos || null;
        const imageUrls = Array.isArray(images) 
          ? images.map((img: any) => typeof img === 'string' ? img : (img.url || img.image || img.imageUrl))
          : null;
        
        // Amenities - partial merge per spec
        const amenities = hotelDetails.propertyAmenities || hotelDetails.amenities || hotelDetails.facilities || null;
        const amenityList = Array.isArray(amenities)
          ? amenities.map((a: any) => typeof a === 'string' ? a : (a.name || a.amenityName))
          : null;
        
        // Star rating - authoritative for Cloudbeds per override
        const starRating = hotelDetails.propertyStars || hotelDetails.starRating || hotelDetails.stars || null;
        
        // Check-in/out times
        const checkInTime = hotelDetails.checkInTime || hotelDetails.checkinTime || null;
        const checkOutTime = hotelDetails.checkOutTime || hotelDetails.checkoutTime || null;
        
        // Max guests from hotel details if available
        const maxGuests = hotelDetails.maxGuests || hotelDetails.propertyMaxGuests || null;

        // Return PropertyDataResponse per adapter-contract.ts
        return new Response(
          JSON.stringify(createSuccessResponse({
            // Editorial fields - authoritative for Cloudbeds
            property_name: propertyName,
            description: description,
            location: hasLocation ? location : null,
            geo: geo,
            images: imageUrls,
            amenities: amenityList,
            
            // Operational reference data - always authoritative
            room_types: roomTypes,
            rate_types: rateTypes,
            
            // Global fields - Cloudbeds provides these
            charge_types: [],      // Would need separate API call
            payment_types: [],     // Would need separate API call
            check_in_time: checkInTime,
            check_out_time: checkOutTime,
            star_rating: starRating ? parseFloat(starRating) : null,
            max_guests: maxGuests ? parseInt(maxGuests) : null,
          }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_rate_plans": {
        const ratePlansRaw = await getRatePlans(
          apiKey,
          cloudbedsPropertyId,
          body.start_date,
          body.end_date,
          true
        );
        const rateTypes = transformRatePlans(Array.isArray(ratePlansRaw) ? ratePlansRaw : [ratePlansRaw]);
        
        return new Response(
          JSON.stringify(createSuccessResponse({ rate_types: rateTypes }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_availability": {
        const validation = fetchAvailabilitySchema.safeParse(body);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.INVALID_REQUEST,
              "Invalid availability request",
              action,
              validation.error.issues
            )),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { start_date, end_date, room_type_ids } = validation.data;
        const availabilityRaw = await getAvailability(
          apiKey,
          cloudbedsPropertyId,
          start_date,
          end_date,
          room_type_ids
        );

        const rawAvailability = transformAvailability(
          Array.isArray(availabilityRaw) ? availabilityRaw : [availabilityRaw],
          start_date,
          end_date
        );

        // Map PMS-native room IDs to DB UUIDs (adapter contract enforcement)
        const { data: dbRooms } = await supabaseClient
          .from("hostfully_room_types")
          .select("id, hostfully_room_id")
          .eq("property_id", propertyId)
          .eq("is_active", true);
        
        const pmsCodeToDbUuid: Record<string, string> = {};
        if (dbRooms) {
          for (const r of dbRooms) {
            if (r.hostfully_room_id) {
              const rawCode = r.hostfully_room_id.includes(':') 
                ? r.hostfully_room_id.split(':').slice(1).join(':') 
                : r.hostfully_room_id;
              pmsCodeToDbUuid[rawCode] = r.id;
            }
          }
        }

        const availability = {
          ...rawAvailability,
          room_types: (rawAvailability.room_types || []).map((rt: any) => ({
            ...rt,
            external_room_type_id: rt.room_type_id,
            room_type_id: pmsCodeToDbUuid[rt.room_type_id] || rt.room_type_id,
          })),
        };

        // Cache availability
        for (const rt of availability.room_types) {
          for (const day of rt.daily_availability) {
            await supabaseClient
              .from("pms_availability_cache")
              .upsert({
                property_id: propertyId,
                system_type: "cloudbeds",
                external_room_type_id: rt.external_room_type_id || rt.room_type_id,
                date: day.date,
                available_units: day.available_units,
                restrictions: day.restrictions,
                rates: rt.rate_types,
                fetched_at: new Date().toISOString(),
              }, {
                onConflict: "property_id,system_type,external_room_type_id,date",
              });
          }
        }

        return new Response(
          JSON.stringify(createSuccessResponse(availability, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_reservations": {
        const validation = getReservationsSchema.safeParse(body);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.INVALID_REQUEST,
              "Invalid reservations request",
              action,
              validation.error.issues
            )),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { start_date, end_date, status } = validation.data;
        const reservationsRaw = await getReservations(
          apiKey,
          cloudbedsPropertyId,
          start_date,
          end_date,
          status
        );

        const reservations = (Array.isArray(reservationsRaw) ? reservationsRaw : [reservationsRaw]).map((res: any) => ({
          reservation_id: res.reservationID?.toString(),
          external_id: res.reservationID?.toString(),
          arrival_date: res.startDate,
          departure_date: res.endDate,
          status: res.status,
          contact_name: `${res.guestFirstName || ''} ${res.guestLastName || ''}`.trim(),
          contact_email: res.guestEmail,
          contact_phone: res.guestPhone,
          total_amount: parseFloat(res.grandTotal) || 0,
          currency: res.currency || "USD",
          rooms: res.rooms?.map((r: any) => ({
            room_type_id: r.roomTypeID?.toString(),
            room_type_name: r.roomTypeName,
            adults: r.adults,
            children: r.children,
          })) || [],
          raw_data: res,
        }));

        return new Response(
          JSON.stringify(createSuccessResponse({ reservations }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_reservation": {
        const validation = createReservationSchema.safeParse(body);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.INVALID_REQUEST,
              "Invalid reservation data",
              action,
              validation.error.issues
            )),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const reservationData = validation.data.reservation_data;
        const result = await createReservation(apiKey, cloudbedsPropertyId, reservationData);

        const reservationId = result.reservationID || result.reservationId || result.id;

        // Store in pms_reservations
        await supabaseClient
          .from("pms_reservations")
          .insert({
            property_id: propertyId,
            system_type: "cloudbeds",
            external_reservation_id: reservationId?.toString(),
            arrival_date: reservationData.startDate,
            departure_date: reservationData.endDate,
            contact_name: `${reservationData.guestFirstName} ${reservationData.guestLastName}`,
            contact_email: reservationData.guestEmail,
            contact_phone: reservationData.guestPhone,
            status: "confirmed",
            raw_data: result,
          });

        return new Response(
          JSON.stringify(createSuccessResponse({
            reservation_id: reservationId?.toString(),
            confirmation_number: result.confirmationCode || result.thirdPartyIdentifier,
            status: "confirmed",
          }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.INVALID_REQUEST,
            `Unknown action: ${action}`,
            action
          )),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error(`[Cloudbeds] Error in ${action}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Check for auth errors
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.AUTH_FAILED,
          "Authentication failed - check API key",
          action,
          errorMessage
        )),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(createErrorResponse(
        ERROR_CODES.INTERNAL_ADAPTER_ERROR,
        errorMessage,
        action
      )),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
