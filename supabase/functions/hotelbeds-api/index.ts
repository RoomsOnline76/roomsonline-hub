import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// HOTELBEDS API ADAPTER
// Follows the standardized adapter contract from adapter-contract.ts
// 
// Authentication: Custom signature-based (Api-key + X-Signature)
// Signature = SHA256(apiKey + secret + timestamp)
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
  supports_webhooks: false,
};

// Base URLs for different environments
const BASE_URLS = {
  test: 'https://api.test.hotelbeds.com',
  production: 'https://api.hotelbeds.com',
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
    source: "hotelbeds",
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
    source: "hotelbeds",
    fetched_at: new Date().toISOString(),
    action,
  };
}

// Helper to ensure dates are in the future (HotelBeds requirement)
function ensureFutureDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inputDate = new Date(dateStr);
  
  if (inputDate < today) {
    return today.toISOString().split('T')[0];
  }
  return dateStr;
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
    "get_rate_types",
    "fetch_property_data",
  ]),
  property_id: z.string().uuid({ message: "Invalid property ID format" }).optional(),
});

// Schema for actions that require property_id
const propertyRequiredSchema = baseRequestSchema.extend({
  property_id: z.string().uuid({ message: "Invalid property ID format" }),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  // Accept both camelCase and snake_case, normalize internally
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  occupancy: z.object({
    rooms: z.number().min(1).default(1),
    adults: z.number().min(1).default(2),
    children: z.number().min(0).default(0),
  }).optional(),
}).refine(
  (d) => (d.startDate || d.start_date) && (d.endDate || d.end_date),
  { message: "start_date/startDate and end_date/endDate are required" },
);

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  reservation_data: z.object({
    rateKey: z.string().min(1, "Rate key is required from availability check"),
    holder: z.object({
      name: z.string().min(1),
      surname: z.string().min(1),
    }),
    rooms: z.array(z.object({
      rateKey: z.string(),
      paxes: z.array(z.object({
        roomId: z.number(),
        type: z.enum(["AD", "CH"]),
        name: z.string().optional(),
        surname: z.string().optional(),
        age: z.number().optional(),
      })),
    })),
    clientReference: z.string().optional(),
    remark: z.string().optional(),
  }),
});

// ============================================================================
// SIGNATURE GENERATION
// ============================================================================

async function generateSignature(apiKey: string, secret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureData = apiKey + secret + timestamp;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getAuthHeaders(apiKey: string, signature: string): Record<string, string> {
  return {
    'Api-key': apiKey,
    'X-Signature': signature,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
  };
}

// ============================================================================
// ENVIRONMENT HELPER - Reads from pms_tracker_status
// ============================================================================

async function getTrackerEnvironment(
  supabase: any,
  systemType: string = "hotelbeds"
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
// API CALL HELPER
// ============================================================================

async function hotelbedsApiCall(
  endpoint: string,
  apiKey: string,
  secret: string,
  environment: string,
  method: string = "GET",
  body?: unknown
): Promise<any> {
  const baseUrl = environment === 'production' ? BASE_URLS.production : BASE_URLS.test;
  const url = `${baseUrl}${endpoint}`;
  
  console.log(`[HotelBeds] ${method} ${url}`);
  
  const signature = await generateSignature(apiKey, secret);
  const headers = getAuthHeaders(apiKey, signature);

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
    console.log(`[HotelBeds] Request body:`, JSON.stringify(body, null, 2));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();

  console.log(`[HotelBeds] Response status: ${response.status}`);
  console.log(`[HotelBeds] Response (first 500 chars): ${responseText.substring(0, 500)}`);

  if (!response.ok) {
    // Handle specific HotelBeds errors
    if (response.status === 401) {
      throw { code: ERROR_CODES.AUTH_FAILED, message: "Authentication failed - check API key and secret" };
    }
    if (response.status === 403) {
      throw { code: ERROR_CODES.PMS_UNAVAILABLE, message: "API quota exceeded or access denied" };
    }
    console.error(`[HotelBeds] API error: ${response.status} - ${responseText}`);
    throw { code: ERROR_CODES.INTERNAL_ADAPTER_ERROR, message: `HotelBeds API error: ${response.status}` };
  }

  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error(`[HotelBeds] Failed to parse JSON:`, e);
    throw { code: ERROR_CODES.INTERNAL_ADAPTER_ERROR, message: "Invalid JSON response from HotelBeds API" };
  }
}

// ============================================================================
// API OPERATIONS
// ============================================================================

// Get availability and rates
async function getAvailability(
  apiKey: string,
  secret: string,
  environment: string,
  hotelCode: string,
  startDate: string,
  endDate: string,
  occupancy: { rooms: number; adults: number; children: number }
): Promise<any> {
  const requestBody = {
    stay: {
      checkIn: startDate,
      checkOut: endDate,
    },
    occupancies: [{
      rooms: occupancy.rooms,
      adults: occupancy.adults,
      children: occupancy.children,
    }],
    hotels: {
      hotel: [parseInt(hotelCode) || hotelCode],
    },
    // Request rates in South African Rand
    currency: "ZAR",
  };

  return hotelbedsApiCall(
    '/hotel-api/1.0/hotels',
    apiKey,
    secret,
    environment,
    'POST',
    requestBody
  );
}

// Check API status (health check)
async function checkStatus(
  apiKey: string,
  secret: string,
  environment: string
): Promise<any> {
  return hotelbedsApiCall(
    '/hotel-api/1.0/status',
    apiKey,
    secret,
    environment,
    'GET'
  );
}

// ============================================================================
// CONTENT API FUNCTIONS (for Editorial Sync)
// ============================================================================

// Get hotel content data (name, description, address, coordinates, etc.)
async function getHotelContent(
  apiKey: string,
  secret: string,
  environment: string,
  hotelCode: string
): Promise<any> {
  return hotelbedsApiCall(
    `/hotel-content-api/1.0/hotels?codes=${hotelCode}&language=ENG&from=1&to=1`,
    apiKey,
    secret,
    environment,
    'GET'
  );
}

// Get hotel images
async function getHotelImages(
  apiKey: string,
  secret: string,
  environment: string,
  hotelCode: string
): Promise<any> {
  return hotelbedsApiCall(
    `/hotel-content-api/1.0/hotels/${hotelCode}/details`,
    apiKey,
    secret,
    environment,
    'GET'
  );
}

// Get hotel facilities/amenities
async function getHotelFacilities(
  apiKey: string,
  secret: string,
  environment: string,
  hotelCode: string
): Promise<any> {
  return hotelbedsApiCall(
    `/hotel-content-api/1.0/hotels/${hotelCode}/details`,
    apiKey,
    secret,
    environment,
    'GET'
  );
}

// Create booking
async function createBooking(
  apiKey: string,
  secret: string,
  environment: string,
  bookingData: {
    holder: { name: string; surname: string };
    rooms: Array<{
      rateKey: string;
      paxes: Array<{
        roomId: number;
        type: string;
        name?: string;
        surname?: string;
        age?: number;
      }>;
    }>;
    clientReference?: string;
    remark?: string;
  }
): Promise<any> {
  const requestBody = {
    holder: bookingData.holder,
    rooms: bookingData.rooms,
    clientReference: bookingData.clientReference || "",
    remark: bookingData.remark || "",
  };

  return hotelbedsApiCall(
    '/hotel-api/1.0/bookings',
    apiKey,
    secret,
    environment,
    'POST',
    requestBody
  );
}

// Get booking details
async function getBooking(
  apiKey: string,
  secret: string,
  environment: string,
  bookingReference: string
): Promise<any> {
  return hotelbedsApiCall(
    `/hotel-api/1.0/bookings/${bookingReference}`,
    apiKey,
    secret,
    environment,
    'GET'
  );
}

// ============================================================================
// TRANSFORM FUNCTIONS
// ============================================================================

function transformAvailability(hotelbedsData: any, startDate: string, endDate: string): any {
  const roomTypes: any[] = [];
  
  const hotels = hotelbedsData?.hotels?.hotels || [];
  
  for (const hotel of hotels) {
    const rooms = hotel.rooms || [];
    
    for (const room of rooms) {
      // Use rooms_available_per_night format expected by CalendarAccommodation
      const roomsAvailablePerNight: any[] = [];
      const rateTypes: any[] = [];
      
      // Generate daily entries for the date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        roomsAvailablePerNight.push({
          date: dateStr,
          available_units: room.rates?.length > 0 ? 1 : 0,
          stop_sell: false,
          closed_to_arrival: false,
          closed_to_departure: false,
          min_stay: null,
          max_stay: null,
          lead_days_advance: null,
          lead_days_post: null,
        });
      }
      
      // Group rates by boardCode to deduplicate and aggregate
      const ratesByBoardCode = new Map<string, {
        boardCode: string;
        boardName: string;
        rateClass: string;
        rateKey: string;
        cancellationPolicies: any[];
        netTotal: number;
        count: number;
      }>();
      
      for (const rate of (room.rates || [])) {
        const boardCode = rate.boardCode || rate.rateClass || 'standard';
        if (!ratesByBoardCode.has(boardCode)) {
          ratesByBoardCode.set(boardCode, {
            boardCode,
            boardName: rate.boardName || rate.rateClass || "Standard",
            rateClass: rate.rateClass,
            rateKey: rate.rateKey, // Store one rateKey for booking
            cancellationPolicies: rate.cancellationPolicies || [],
            netTotal: parseFloat(rate.net) || 0,
            count: 1,
          });
        } else {
          // Use lowest rate for this board type
          const existing = ratesByBoardCode.get(boardCode)!;
          const newNet = parseFloat(rate.net) || 0;
          if (newNet < existing.netTotal) {
            existing.netTotal = newNet;
            existing.rateKey = rate.rateKey;
            existing.cancellationPolicies = rate.cancellationPolicies || [];
          }
          existing.count++;
        }
      }
      
      // Build rate types from grouped data
      for (const [boardCode, rateData] of ratesByBoardCode) {
        const rates: any[] = [];
        const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const perNightRate = nights > 0 ? rateData.netTotal / nights : rateData.netTotal;
        
        // Create daily rate entries
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          rates.push({
            date: dateStr,
            room_amount: perNightRate,
            adult_amounts: {
              adult_amount_1: perNightRate,
              adult_amount_2: perNightRate,
            },
            teen_amount: 0,
            child_amount: 0,
            infant_amount: 0,
            currency: hotelbedsData?.hotels?.currency || "EUR",
          });
        }
        
        rateTypes.push({
          rate_type_id: boardCode, // Use boardCode for consistency with transformRateTypes
          rate_type_name: rateData.boardName,
          name: rateData.boardName,
          rate_key: rateData.rateKey, // Store full rateKey for booking
          board_code: boardCode,
          board_name: rateData.boardName,
          price_type: "UnitRate",
          cancellation_policies: rateData.cancellationPolicies,
          rates: rates,
          net_total: rateData.netTotal,
        });
      }
      
      roomTypes.push({
        room_type_id: room.code?.toString() || `room_${roomTypes.length}`,
        room_type_name: room.name || "Room",
        name: room.name || "Room",
        description: room.description || "",
        rooms_available_per_night: roomsAvailablePerNight,
        rate_types: rateTypes,
      });
    }
  }
  
  // Debug logging
  console.log(`[HotelBeds] transformAvailability result:`, {
    room_count: roomTypes.length,
    first_room: roomTypes[0] ? {
      id: roomTypes[0].room_type_id,
      name: roomTypes[0].room_type_name,
      rate_types_count: roomTypes[0].rate_types?.length || 0,
      first_rate_type: roomTypes[0].rate_types?.[0] ? {
        id: roomTypes[0].rate_types[0].rate_type_id,
        name: roomTypes[0].rate_types[0].rate_type_name,
        rates_count: roomTypes[0].rate_types[0].rates?.length || 0,
        sample_rate: roomTypes[0].rate_types[0].rates?.[0],
      } : null,
    } : null,
  });
  
  return {
    room_types: roomTypes,
    currency: hotelbedsData?.hotels?.currency || "EUR",
    fetched_at: new Date().toISOString(),
  };
}

function transformRoomTypes(hotelbedsData: any, contentImages?: any[]): any[] {
  const roomTypes: any[] = [];
  const hotels = hotelbedsData?.hotels?.hotels || [];
  
  for (const hotel of hotels) {
    for (const room of (hotel.rooms || [])) {
      const roomCode = room.code?.toString();
      
      // Filter images that match this room's code exactly (strict matching)
      // HotelBeds room codes: DBT.DX-1, DBT.DX-2, DBT.ST, etc.
      // Only exact matches to prevent cross-pollution of images between room types
      const roomImages = contentImages
        ?.filter((img: any) => {
          const imgRoomCode = img.roomCode || img.room_code;
          if (!imgRoomCode || !roomCode) return false;
          // Strict exact match only
          return imgRoomCode === roomCode;
        })
        ?.map((img: any) => {
          if (img.path) return `https://photos.hotelbeds.com/giata/${img.path}`;
          return img.url;
        })
        ?.filter((url: string) => !!url) || [];
      
      roomTypes.push({
        room_type_id: roomCode || `room_${roomTypes.length}`,
        name: room.name || "Room",
        description: room.description || "",
        images: roomImages, // Room-specific images from Content API
        max_guests: 4, // HotelBeds doesn't always provide this
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
        // Use boardCode for consistency with transformRateTypes
        linked_rate_type_ids: [...new Set(room.rates?.map((r: any) => r.boardCode || r.rateClass) || [])],
      });
    }
  }
  
  return roomTypes;
}

function transformRateTypes(hotelbedsData: any): any[] {
  const rateTypes: any[] = [];
  const seenRates = new Set<string>();
  const hotels = hotelbedsData?.hotels?.hotels || [];
  
  for (const hotel of hotels) {
    for (const room of (hotel.rooms || [])) {
      for (const rate of (room.rates || [])) {
        const rateId = rate.boardCode || rate.rateClass || `rate_${rateTypes.length}`;
        if (!seenRates.has(rateId)) {
          seenRates.add(rateId);
          rateTypes.push({
            rate_type_id: rateId,
            name: rate.boardName || rate.rateClass || "Standard",
            description: `${rate.boardName || ""} - ${rate.rateClass || ""}`.trim(),
            price_type: "per_room",
            min_stay_days: null,
            max_stay_days: null,
            min_advance_days: null,
            max_advance_days: null,
          });
        }
      }
    }
  }
  
  return rateTypes;
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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    console.log(`[HotelBeds] Request:`, JSON.stringify(body, null, 2));

    // Validate base request
    const baseValidation = baseRequestSchema.safeParse(body);
    if (!baseValidation.success) {
      console.error(`[HotelBeds] Validation error:`, baseValidation.error);
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

    // Handle get_capabilities without needing credentials
    if (action === "get_capabilities") {
      return new Response(
        JSON.stringify(createSuccessResponse(CAPABILITIES, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle health_check - doesn't need property, just credentials
    if (action === "health_check") {
      let apiKey = Deno.env.get("HOTELBEDS_API_KEY");
      let apiSecret = Deno.env.get("HOTELBEDS_API_SECRET");
      
      // Get environment from tracker (authoritative source)
      const environment = await getTrackerEnvironment(supabaseClient, "hotelbeds");

      if (!apiKey || !apiSecret) {
        console.log(`[HotelBeds] Cloud secrets not found for health_check, checking pms_credentials...`);
        const { data: credentials } = await supabaseClient
          .from("pms_credentials")
          .select("*")
          .eq("system_type", "hotelbeds")
          .eq("is_active", true)
          .maybeSingle();

        if (credentials) {
          apiKey = credentials.api_key;
          apiSecret = credentials.password;
        }
      } else {
        console.log(`[HotelBeds] Using Cloud secrets for health_check`);
      }

      if (!apiKey || !apiSecret) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.AUTH_FAILED,
            "HotelBeds credentials not configured",
            action
          )),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const status = await checkStatus(apiKey, apiSecret, environment);
        return new Response(
          JSON.stringify(createSuccessResponse({
            status: "ok",
            api_status: status,
            environment,
            using_cloud_secrets: !!Deno.env.get("HOTELBEDS_API_KEY")
          }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            error.code || ERROR_CODES.PMS_UNAVAILABLE,
            error.message || "Health check failed",
            action
          )),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // For remaining actions, property_id is required
    const propertyId = body.property_id;
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

    // Get property details to find HotelBeds hotel code
    const { data: property, error: propError } = await supabaseClient
      .from("properties")
      .select("hotelbeds_hotel_code, external_system")
      .eq("id", propertyId)
      .single();

    if (propError || !property) {
      console.error(`[HotelBeds] Property lookup failed:`, propError);
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.NOT_FOUND,
          "Property not found",
          action
        )),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hotelCode = (property as any).hotelbeds_hotel_code;
    if (!hotelCode) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          "HotelBeds hotel code not configured for this property",
          action
        )),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate hotel code format (must be numeric)
    const hotelCodeStr = hotelCode.toString().trim();
    if (!/^\d+$/.test(hotelCodeStr)) {
      console.error(`[HotelBeds] Invalid hotel code format: ${hotelCode}`);
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          `Invalid HotelBeds hotel code format. Expected numeric value, got: "${hotelCode}". Please update the property's HotelBeds hotel code.`,
          action
        )),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get HotelBeds credentials - prioritize Cloud secrets, fallback to pms_credentials
    let apiKey = Deno.env.get("HOTELBEDS_API_KEY");
    let apiSecret = Deno.env.get("HOTELBEDS_API_SECRET");
    // Get environment from tracker (authoritative source)
    const environment = await getTrackerEnvironment(supabaseClient, "hotelbeds");

    // If Cloud secrets not set, fallback to database credentials
    if (!apiKey || !apiSecret) {
      console.log(`[HotelBeds] Cloud secrets not found, checking pms_credentials...`);
      const { data: credentials, error: credError } = await supabaseClient
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "hotelbeds")
        .eq("is_active", true)
        .single();

      if (credError || !credentials) {
        console.error(`[HotelBeds] Credentials lookup failed:`, credError);
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.AUTH_FAILED,
            "HotelBeds credentials not configured or inactive",
            action
          )),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      apiKey = credentials.api_key;
      apiSecret = credentials.password;
      // Environment comes from tracker, not credentials
    } else {
      console.log(`[HotelBeds] Using Cloud secrets for authentication`);
    }

    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.AUTH_FAILED,
          "HotelBeds API key or secret not configured",
          action
        )),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // HANDLE ACTIONS
    // ========================================================================

    // Health check
    if (action === "health_check") {
      try {
        const status = await checkStatus(apiKey, apiSecret, environment || "test");
        return new Response(
          JSON.stringify(createSuccessResponse({ 
            status: "ok", 
            api_status: status,
            environment: environment || "test",
          }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            error.code || ERROR_CODES.PMS_UNAVAILABLE,
            error.message || "Health check failed",
            action
          )),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch availability
    if (action === "fetch_availability") {
      const validation = fetchAvailabilitySchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.INVALID_REQUEST,
            "Invalid fetch_availability parameters",
            action,
            validation.error.issues
          )),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Normalize: accept both camelCase and snake_case
      const start_date = validation.data.startDate || validation.data.start_date!;
      const end_date = validation.data.endDate || validation.data.end_date!;
      const occupancy = validation.data.occupancy;
      const occ = occupancy || { rooms: 1, adults: 2, children: 0 };

      // Ensure dates are in the future (HotelBeds requirement)
      const validStartDate = ensureFutureDate(start_date);
      let validEndDate = end_date;

      // If start date was adjusted, ensure end date is still after start
      if (validStartDate !== start_date) {
        const startD = new Date(validStartDate);
        const endD = new Date(end_date);
        if (endD <= startD) {
          // Extend end date to at least 7 days after start
          const newEnd = new Date(startD);
          newEnd.setDate(newEnd.getDate() + 7);
          validEndDate = newEnd.toISOString().split('T')[0];
        }
        console.log(`[HotelBeds] Adjusted dates: ${start_date} -> ${validStartDate}, ${end_date} -> ${validEndDate}`);
      }

      try {
        const availabilityData = await getAvailability(
          apiKey,
          apiSecret,
          environment || "test",
          hotelCode,
          validStartDate,
          validEndDate,
          occ
        );

        const rawTransformed = transformAvailability(availabilityData, validStartDate, validEndDate);
        
        // Map PMS-native room codes to DB UUIDs (adapter contract enforcement)
        const { data: dbRooms } = await supabaseClient
          .from("hostfully_room_types")
          .select("id, hostfully_room_id")
          .eq("property_id", propertyId)
          .eq("is_active", true);
        
        const pmsCodeToDbUuid: Record<string, string> = {};
        if (dbRooms) {
          for (const r of dbRooms) {
            if (r.hostfully_room_id) {
              // Strip adapter prefix: "hotelbeds:DBT.DX-4" → "DBT.DX-4"
              const rawCode = r.hostfully_room_id.includes(':') 
                ? r.hostfully_room_id.split(':').slice(1).join(':') 
                : r.hostfully_room_id;
              pmsCodeToDbUuid[rawCode] = r.id;
            }
          }
        }
        
        // Replace PMS codes with DB UUIDs in response
        const transformed = {
          ...rawTransformed,
          room_types: (rawTransformed.room_types || []).map((rt: any) => ({
            ...rt,
            external_room_type_id: rt.room_type_id, // Preserve PMS code for caching
            room_type_id: pmsCodeToDbUuid[rt.room_type_id] || rt.room_type_id, // Map to DB UUID
          })),
        };
        
        // Cache availability data to pms_availability_cache (like other PMS adapters)
        const roomTypes = transformed.room_types || [];
        for (const roomType of roomTypes) {
          const cacheRoomTypeId = (roomType.external_room_type_id || roomType.room_type_id)?.toString();
          const roomTypeName = roomType.room_type_name || roomType.name;
          
          // Cache availability per night
          for (const availability of (roomType.rooms_available_per_night || [])) {
            const dateStr = availability.date;
            
            // Build restrictions object
            const restrictions = {
              stop_sell: availability.stop_sell ?? false,
              min_stay: availability.min_stay ?? null,
              max_stay: availability.max_stay ?? null,
              closed_to_arrival: availability.closed_to_arrival ?? false,
              closed_to_departure: availability.closed_to_departure ?? false,
              lead_days_advance: availability.lead_days_advance ?? null,
              lead_days_post: availability.lead_days_post ?? null,
            };
            
            // Build rates array for this date from rate_types
            const ratesForDate: any[] = [];
            for (const rateType of (roomType.rate_types || [])) {
              const rateForDate = rateType.rates?.find((r: any) => r.date === dateStr);
              if (rateForDate) {
                ratesForDate.push({
                  rate_type_id: rateType.rate_type_id,
                  rate_type_name: rateType.rate_type_name || rateType.name,
                  price_type: rateType.price_type || "UnitRate",
                  room_amount: rateForDate.room_amount || 0,
                  adult_amounts: rateForDate.adult_amounts,
                  teen_amount: rateForDate.teen_amount,
                  child_amount: rateForDate.child_amount,
                  infant_amount: rateForDate.infant_amount,
                  currency: rateForDate.currency,
                  rate_key: rateType.rate_key,
                });
              }
            }
            
            // Upsert to cache
            const { error: cacheError } = await supabaseClient.from("pms_availability_cache").upsert({
              property_id: propertyId,
              system_type: "hotelbeds",
              external_room_type_id: cacheRoomTypeId,
              date: dateStr,
              available_units: availability.available_units ?? 0,
              restrictions: restrictions,
              rates: ratesForDate.length > 0 ? ratesForDate : null,
              raw_data: {
                roomTypeName: roomTypeName,
                roomTypeId: cacheRoomTypeId,
              },
              source_timestamp: new Date().toISOString(),
              fetched_at: new Date().toISOString(),
            }, {
              onConflict: "property_id,system_type,external_room_type_id,date"
            });
            
            if (cacheError) {
              console.error(`[HotelBeds] Cache upsert error for ${dateStr}:`, cacheError);
            }
          }
        }

        console.log(`[HotelBeds] Cached availability for ${roomTypes.length} room types`);

        // ── Hydrate cache → ROL'OS pipeline ──
        try {
          const hydrateUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hydrate-pms-cache-to-rolos`;
          await fetch(hydrateUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ property_id: propertyId, system_type: "hotelbeds" }),
          });
          console.log(`[HotelBeds] Hydration triggered for property ${propertyId}`);
        } catch (hydrateErr) {
          console.error("[HotelBeds] Hydration call failed (non-blocking):", hydrateErr);
        }

        return new Response(
          JSON.stringify(createSuccessResponse(transformed, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            error.code || ERROR_CODES.INTERNAL_ADAPTER_ERROR,
            error.message || "Failed to fetch availability",
            action
          )),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get room types
    if (action === "get_room_types") {
      try {
        // Use availability endpoint to get room data
        const today = new Date();
        const startDate = today.toISOString().split('T')[0];
        const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const availabilityData = await getAvailability(
          apiKey,
          apiSecret,
          environment || "test",
          hotelCode,
          startDate,
          endDate,
          { rooms: 1, adults: 2, children: 0 }
        );

        const roomTypes = transformRoomTypes(availabilityData, []);
        
        return new Response(
          JSON.stringify(createSuccessResponse({ room_types: roomTypes }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            error.code || ERROR_CODES.INTERNAL_ADAPTER_ERROR,
            error.message || "Failed to fetch room types",
            action
          )),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get rate types
    if (action === "get_rate_types") {
      try {
        // Use availability endpoint to get rate data
        const today = new Date();
        const startDate = today.toISOString().split('T')[0];
        const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const availabilityData = await getAvailability(
          apiKey,
          apiSecret,
          environment || "test",
          hotelCode,
          startDate,
          endDate,
          { rooms: 1, adults: 2, children: 0 }
        );

        const rateTypes = transformRateTypes(availabilityData);
        
        return new Response(
          JSON.stringify(createSuccessResponse({ rate_types: rateTypes }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            error.code || ERROR_CODES.INTERNAL_ADAPTER_ERROR,
            error.message || "Failed to fetch rate types",
            action
          )),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create reservation
    if (action === "create_reservation") {
      const validation = createReservationSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.INVALID_REQUEST,
            "Invalid create_reservation parameters",
            action,
            validation.error.issues
          )),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { reservation_data } = validation.data;

      try {
        const bookingResult = await createBooking(
          apiKey,
          apiSecret,
          environment || "test",
          reservation_data
        );

        const booking = bookingResult?.booking;
        
        return new Response(
          JSON.stringify(createSuccessResponse({
            reservation_id: booking?.reference || booking?.bookingReference,
            confirmation_number: booking?.reference,
            status: booking?.status || "confirmed",
            raw_response: bookingResult,
          }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            error.code || ERROR_CODES.BOOKING_REJECTED,
            error.message || "Failed to create reservation",
            action
          )),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get reservations
    if (action === "get_reservations") {
      try {
        // HotelBeds doesn't have a list endpoint, need booking reference
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.INVALID_REQUEST,
            "get_reservations requires a booking reference - use booking lookup instead",
            action
          )),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            error.code || ERROR_CODES.INTERNAL_ADAPTER_ERROR,
            error.message || "Failed to fetch reservations",
            action
          )),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch property data for editorial sync (per adapter-contract.ts)
    if (action === "fetch_property_data") {
      try {
        // Fetch from Content API endpoints + availability in parallel
        const today = new Date();
        const startDate = today.toISOString().split('T')[0];
        const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        console.log(`[HotelBeds] Fetching property data from Content API for hotel ${hotelCode}`);
        
        // Call all endpoints in parallel for better performance
        const [hotelContentResult, availabilityData] = await Promise.allSettled([
          getHotelContent(apiKey, apiSecret, environment || "test", hotelCode),
          getAvailability(apiKey, apiSecret, environment || "test", hotelCode, startDate, endDate, { rooms: 1, adults: 2, children: 0 }),
        ]);

        // Extract Content API data (may fail if Content API not available)
        let hotel: any = null;
        let contentImages: any[] = [];
        let contentFacilities: any[] = [];
        
        if (hotelContentResult.status === 'fulfilled') {
          const contentData = hotelContentResult.value;
          hotel = contentData?.hotels?.[0] || contentData?.hotel || null;
          contentImages = hotel?.images || [];
          contentFacilities = hotel?.facilities || [];
          console.log(`[HotelBeds] Content API returned hotel: ${hotel?.name?.content || hotel?.name || 'N/A'}`);
        } else {
          console.log(`[HotelBeds] Content API failed, using availability data only:`, hotelContentResult.reason);
        }

        // Fallback to availability data if Content API fails
        let availHotel: any = null;
        if (availabilityData.status === 'fulfilled') {
          const hotels = availabilityData.value?.hotels?.hotels || [];
          availHotel = hotels[0];
        }

        // Use Content API data first, fallback to availability data
        const finalHotel = hotel || availHotel;

        // Extract room types and rate types from availability data
        let roomTypes: any[] = [];
        let rateTypes: any[] = [];
        if (availabilityData.status === 'fulfilled') {
          // Pass Content API images for room-specific matching
          roomTypes = transformRoomTypes(availabilityData.value, contentImages);
          rateTypes = transformRateTypes(availabilityData.value);
        }

        // Transform Content API images (full URLs)
        const images = contentImages.length > 0 
          ? contentImages.map((img: any) => ({
              url: img.path ? `https://photos.hotelbeds.com/giata/${img.path}` : img.url,
              type: img.imageTypeCode || img.type || 'general',
              description: img.description?.content || img.description || null,
              room_code: img.roomCode || null,
              order: img.order || 0,
            }))
          : (finalHotel?.images?.map((img: any) => ({
              url: img.path ? `https://photos.hotelbeds.com/giata/${img.path}` : img.url,
              type: img.imageTypeCode || 'general',
              description: null,
              room_code: null,
              order: 0,
            })) || null);

        // Transform facilities to amenities
        const amenities = contentFacilities.length > 0
          ? contentFacilities.map((f: any) => ({
              code: f.facilityCode?.toString() || f.code?.toString(),
              group_code: f.facilityGroupCode?.toString() || f.groupCode?.toString(),
              name: f.description?.content || f.description || f.facilityName || null,
              is_included: f.indYesOrNo !== false,
              number: f.number || null,
            }))
          : null;

        // Build property data with Content API fields
        const propertyData = {
          // Basic info
          property_name: hotel?.name?.content || hotel?.name || finalHotel?.name || null,
          description: hotel?.description?.content || hotel?.description || finalHotel?.description || null,
          
          // Location fields (from Content API)
          address: hotel?.address?.content || hotel?.address || null,
          city: hotel?.city?.content || hotel?.city || null,
          country: hotel?.country?.description?.content || hotel?.country?.content || hotel?.country || null,
          country_code: hotel?.countryCode || null,
          postal_code: hotel?.postalCode || null,
          
          // Geo coordinates
          latitude: hotel?.coordinates?.latitude || null,
          longitude: hotel?.coordinates?.longitude || null,
          
          // Contact info
          email: hotel?.email || null,
          phone: hotel?.phones?.[0]?.phoneNumber || hotel?.phones?.[0]?.phone || null,
          web: hotel?.web || null,
          
          // Editorial content
          images: images,
          amenities: amenities,
          
          // Operational data
          room_types: roomTypes,
          rate_types: rateTypes,
          charge_types: [],
          payment_types: [],
          check_in_time: null,
          check_out_time: null,
          star_rating: hotel?.categoryCode ? parseInt(hotel.categoryCode) : (hotel?.category?.code ? parseInt(hotel.category.code) : null),
          max_guests: null,
          
          // Location structure for backward compatibility
          location: hotel?.address?.content || hotel?.address ? {
            address: hotel?.address?.content || hotel?.address || null,
            city: hotel?.city?.content || hotel?.city || null,
            country: hotel?.country?.description?.content || hotel?.country || null,
            postal_code: hotel?.postalCode || null,
          } : null,
          geo: hotel?.coordinates?.latitude ? {
            latitude: hotel.coordinates.latitude,
            longitude: hotel.coordinates.longitude,
          } : null,
        };

        console.log(`[HotelBeds] fetch_property_data result:`, {
          has_name: !!propertyData.property_name,
          has_description: !!propertyData.description,
          has_address: !!propertyData.address,
          image_count: images?.length || 0,
          amenity_count: amenities?.length || 0,
          room_type_count: roomTypes.length,
          rate_type_count: rateTypes.length,
        });

        return new Response(
          JSON.stringify(createSuccessResponse(propertyData, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        console.error("[HotelBeds] fetch_property_data failed:", error);
        return new Response(
          JSON.stringify(createErrorResponse(
            error.code || ERROR_CODES.INTERNAL_ADAPTER_ERROR,
            error.message || "Failed to fetch property data",
            action
          )),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Unknown action
    return new Response(
      JSON.stringify(createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        `Unknown action: ${action}`,
        action
      )),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[HotelBeds] Unhandled error:`, error);
    return new Response(
      JSON.stringify(createErrorResponse(
        ERROR_CODES.INTERNAL_ADAPTER_ERROR,
        error instanceof Error ? error.message : "An unexpected error occurred",
        action
      )),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
