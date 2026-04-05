import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// LITTLE HOTELIER API ADAPTER
// Follows the standardized adapter contract from adapter-contract.ts
// Read-only Rates API - no reservation creation capability
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
  supports_create_booking: false, // Read-only API - no reservation creation
  supports_modify_booking: false,
  supports_webhooks: false,
};

// Region-specific API base URLs
const REGIONS: Record<string, string> = {
  apac: "https://apac.littlehotelier.com",
  emea: "https://emea.littlehotelier.com",
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
    source: "littlehotelier",
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
    source: "littlehotelier",
    fetched_at: new Date().toISOString(),
    action,
  };
}

// Input validation schemas
const baseRequestSchema = z.object({
  action: z.enum([
    "get_capabilities",
    "health_check",
    "fetch_availability",
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
});

// Little Hotelier API call helper
async function littleHotelierApiCall(
  channelCode: string,
  region: string,
  startDate: string,
  endDate: string
): Promise<any> {
  const baseUrl = REGIONS[region.toLowerCase()] || REGIONS.emea;
  const url = `${baseUrl}/api/v1/properties/${channelCode}/rates.json?start_date=${startDate}&end_date=${endDate}`;
  
  console.log(`[LittleHotelier] GET ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
  });

  const responseText = await response.text();
  console.log(`[LittleHotelier] Response status: ${response.status}`);
  console.log(`[LittleHotelier] Response (first 500 chars): ${responseText.substring(0, 500)}`);

  if (!response.ok) {
    console.error(`[LittleHotelier] API error: ${response.status} - ${responseText}`);
    throw new Error(`Little Hotelier API error: ${response.status} - ${responseText}`);
  }

  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error(`[LittleHotelier] Failed to parse JSON:`, e);
    throw new Error(`Invalid JSON response from Little Hotelier API`);
  }
}

// Transform Little Hotelier rate-plans to room types
function transformToRoomTypes(ratePlans: any[]): any[] {
  // Group by room - Little Hotelier uses rate-plans which contain room info
  const roomsMap = new Map<string, any>();
  
  for (const rp of ratePlans) {
    const roomId = rp["room-id"]?.toString() || rp.id?.toString();
    const roomName = rp["room-name"] || rp.name || `Room ${roomId}`;
    
    if (!roomsMap.has(roomId)) {
      roomsMap.set(roomId, {
        room_type_id: roomId,
        name: roomName,
        description: "",
        max_guests: rp["max-occupancy"] || 2,
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
        linked_rate_type_ids: [],
        raw_data: {},
      });
    }
    
    // Add rate plan ID to linked rate types
    const room = roomsMap.get(roomId);
    if (rp.id) {
      room.linked_rate_type_ids.push(rp.id.toString());
    }
  }
  
  return Array.from(roomsMap.values());
}

// Transform Little Hotelier rate-plans to rate types
function transformToRateTypes(ratePlans: any[]): any[] {
  return ratePlans.map(rp => ({
    rate_type_id: rp.id?.toString() || rp["rate-plan-id"]?.toString(),
    name: rp.name || rp["rate-plan-name"] || "Standard Rate",
    description: rp.description || "",
    price_type: "per_room",
    min_stay_days: rp["min-stay"] || null,
    max_stay_days: rp["max-stay"] || null,
    min_advance_days: null,
    max_advance_days: null,
    raw_data: rp,
  }));
}

// Transform Little Hotelier rates response to availability format
function transformToAvailability(apiResponse: any, startDate: string, endDate: string): any {
  const roomTypes: any[] = [];
  
  // Little Hotelier returns properties[0].rate-plans[]
  const properties = apiResponse.properties || apiResponse;
  const property = Array.isArray(properties) ? properties[0] : properties;
  const ratePlans = property?.["rate-plans"] || property?.ratePlans || [];
  
  console.log(`[LittleHotelier] Processing ${ratePlans.length} rate plans`);
  
  // Group rate plans by room
  const roomsMap = new Map<string, any>();
  
  for (const rp of ratePlans) {
    const roomId = rp["room-id"]?.toString() || rp.id?.toString();
    const roomName = rp["room-name"] || rp.name || `Room ${roomId}`;
    const ratePlanId = rp.id?.toString() || rp["rate-plan-id"]?.toString();
    const ratePlanName = rp.name || rp["rate-plan-name"] || "Standard";
    
    if (!roomsMap.has(roomId)) {
      roomsMap.set(roomId, {
        room_type_id: roomId,
        name: roomName,
        daily_availability: new Map<string, any>(),
        rate_types: [],
      });
    }
    
    const room = roomsMap.get(roomId);
    const ratePlanDates = rp["rate-plan-dates"] || rp.dates || [];
    
    // Process daily rates for this rate plan
    const dailyRates: any[] = [];
    
    for (const dateEntry of ratePlanDates) {
      const date = dateEntry.date;
      const rate = parseFloat(dateEntry.rate) || parseFloat(dateEntry["rate-amount"]) || 0;
      const available = dateEntry.available ?? dateEntry["rooms-available"] ?? 0;
      const minStay = dateEntry["min-stay"] || null;
      const stopSell = dateEntry["stop-online-sell"] || dateEntry["close-to-arrival"] || false;
      
      // Update availability for this date
      if (!room.daily_availability.has(date)) {
        room.daily_availability.set(date, {
          date,
          available_units: available,
          restrictions: {
            stop_sell: stopSell,
            closed_to_arrival: dateEntry["close-to-arrival"] || false,
            closed_to_departure: dateEntry["close-to-departure"] || false,
            min_stay: minStay,
            max_stay: dateEntry["max-stay"] || null,
            min_advance: null,
            max_advance: null,
          },
        });
      }
      
      dailyRates.push({
        date,
        room_amount: rate,
        adult_amount_1: rate,
        adult_amount_2: rate,
        teen_amount: 0,
        child_amount: 0,
        infant_amount: 0,
        currency: property?.currency || "USD",
      });
    }
    
    // Add rate type with its daily rates
    room.rate_types.push({
      rate_type_id: ratePlanId,
      name: ratePlanName,
      daily_rates: dailyRates,
    });
  }
  
  // Convert maps to arrays
  for (const [roomId, room] of roomsMap) {
    roomTypes.push({
      room_type_id: room.room_type_id,
      name: room.name,
      daily_availability: Array.from(room.daily_availability.values()),
      rate_types: room.rate_types,
    });
  }
  
  return {
    room_types: roomTypes,
    currency: property?.currency || "USD",
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
    console.log(`[LittleHotelier] Request:`, JSON.stringify(body, null, 2));

    // Validate base request
    const baseValidation = baseRequestSchema.safeParse(body);
    if (!baseValidation.success) {
      console.error(`[LittleHotelier] Validation error:`, baseValidation.error);
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

    // Handle health_check - doesn't need property_id, just any connected property
    if (action === "health_check" && !propertyId) {
      console.log(`[LittleHotelier] Standalone health check - no property_id provided`);
      
      // Get any Little Hotelier-connected property
      const { data: testProperty } = await supabaseClient
        .from("properties")
        .select("littlehotelier_channel_code, littlehotelier_region")
        .not("littlehotelier_channel_code", "is", null)
        .limit(1)
        .maybeSingle();

      if (!testProperty?.littlehotelier_channel_code) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.NOT_FOUND,
            "No Little Hotelier-connected properties found for health check",
            action
          )),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const checkDate = new Date().toISOString().split('T')[0];
        await littleHotelierApiCall(
          testProperty.littlehotelier_channel_code, 
          testProperty.littlehotelier_region || "emea", 
          checkDate, 
          checkDate
        );
        
        return new Response(
          JSON.stringify(createSuccessResponse({
            status: "ok",
            healthy: true,
            region: testProperty.littlehotelier_region || "emea",
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

    // Get property details to find Little Hotelier config
    const { data: property, error: propError } = await supabaseClient
      .from("properties")
      .select("littlehotelier_channel_code, littlehotelier_region, external_system")
      .eq("id", propertyId)
      .single();

    if (propError || !property) {
      console.error(`[LittleHotelier] Property lookup failed:`, propError);
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.NOT_FOUND,
          "Property not found",
          action
        )),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const channelCode = property.littlehotelier_channel_code;
    const region = property.littlehotelier_region || "emea";

    if (!channelCode) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          "Little Hotelier channel code not configured for this property",
          action
        )),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get credentials from pms_credentials (optional - for future authenticated endpoints)
    const { data: credentials } = await supabaseClient
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "littlehotelier")
      .eq("is_active", true)
      .maybeSingle();

    console.log(`[LittleHotelier] Using channel code: ${channelCode}, region: ${region}`);

    // Default date range for fetching data
    const today = new Date();
    const startDate = body.start_date || today.toISOString().split('T')[0];
    const endDateObj = new Date(today);
    endDateObj.setDate(endDateObj.getDate() + 365); // 1 year forward
    const endDate = body.end_date || endDateObj.toISOString().split('T')[0];

    // Handle different actions
    switch (action) {
      case "health_check": {
        try {
          // Fetch single day to verify connection
          const checkDate = today.toISOString().split('T')[0];
          const response = await littleHotelierApiCall(channelCode, region, checkDate, checkDate);
          
          return new Response(
            JSON.stringify(createSuccessResponse({
              status: "healthy",
              channel_code: channelCode,
              region: region,
              message: "Connection verified successfully",
            }, action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[LittleHotelier] Health check failed:`, error);
          return new Response(
            JSON.stringify(createErrorResponse(
              ERROR_CODES.PMS_UNAVAILABLE,
              `Health check failed: ${errorMessage}`,
              action
            )),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      case "fetch_availability": {
        const validatedData = fetchAvailabilitySchema.parse(body);
        const response = await littleHotelierApiCall(
          channelCode,
          region,
          validatedData.start_date,
          validatedData.end_date
        );
        
        const rawAvailability = transformToAvailability(response, validatedData.start_date, validatedData.end_date);
        
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
        
        return new Response(
          JSON.stringify(createSuccessResponse(availability, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_room_types": {
        const response = await littleHotelierApiCall(channelCode, region, startDate, endDate);
        
        const properties = response.properties || response;
        const property = Array.isArray(properties) ? properties[0] : properties;
        const ratePlans = property?.["rate-plans"] || property?.ratePlans || [];
        
        const roomTypes = transformToRoomTypes(ratePlans);
        
        return new Response(
          JSON.stringify(createSuccessResponse({ room_types: roomTypes }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_rate_plans": {
        const response = await littleHotelierApiCall(channelCode, region, startDate, endDate);
        
        const properties = response.properties || response;
        const property = Array.isArray(properties) ? properties[0] : properties;
        const ratePlans = property?.["rate-plans"] || property?.ratePlans || [];
        
        const rateTypes = transformToRateTypes(ratePlans);
        
        return new Response(
          JSON.stringify(createSuccessResponse({ rate_types: rateTypes }, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_property_data": {
        // ============================================================================
        // LITTLE HOTELIER fetch_property_data - per v1.1 pms-implementation-master.json:
        // - name: authoritative
        // - description: authoritative
        // - location: authoritative
        // - images: partial
        // - star_rating: authoritative (per-PMS override)
        // ============================================================================
        console.log(`[LittleHotelier] Fetching property data for ${propertyId}`);
        
        // Fetch all property data in one call
        const response = await littleHotelierApiCall(channelCode, region, startDate, endDate);
        
        const properties = response.properties || response;
        const prop = Array.isArray(properties) ? properties[0] : properties;
        const ratePlans = prop?.["rate-plans"] || prop?.ratePlans || [];
        
        const roomTypes = transformToRoomTypes(ratePlans);
        const rateTypes = transformToRateTypes(ratePlans);
        
        // Extract editorial data from property response
        const propertyName = prop?.name || prop?.propertyName || null;
        const description = prop?.description || prop?.propertyDescription || null;
        
        // Location data
        const location = {
          address: prop?.address || prop?.streetAddress || null,
          city: prop?.city || prop?.locality || null,
          country: prop?.country || prop?.countryCode || null,
          postal_code: prop?.postalCode || prop?.postcode || null,
        };
        const hasLocation = location.address || location.city || location.country;
        
        // Images - partial per spec (unreliable)
        const images = prop?.images || prop?.photos || null;
        const imageUrls = Array.isArray(images)
          ? images.map((img: any) => typeof img === 'string' ? img : (img.url || img.imageUrl))
          : null;
        
        // Star rating - authoritative for Little Hotelier per override
        const starRating = prop?.starRating || prop?.stars || prop?.rating || null;
        
        // Check-in/out times if available
        const checkInTime = prop?.checkInTime || prop?.checkinTime || null;
        const checkOutTime = prop?.checkOutTime || prop?.checkoutTime || null;
        
        // Return PropertyDataResponse per adapter-contract.ts
        return new Response(
          JSON.stringify(createSuccessResponse({
            // Editorial fields per v1.1 spec
            property_name: propertyName,
            description: description,
            location: hasLocation ? location : null,
            geo: null,                    // not_available for Little Hotelier
            images: imageUrls,            // partial
            amenities: null,              // not_available
            
            // Operational reference data
            room_types: roomTypes,
            rate_types: rateTypes,
            
            // Global fields
            charge_types: [],
            payment_types: [],
            check_in_time: checkInTime,
            check_out_time: checkOutTime,
            star_rating: starRating ? parseFloat(starRating) : null,
            max_guests: null,
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[LittleHotelier] Error:`, error);
    return new Response(
      JSON.stringify(createErrorResponse(
        ERROR_CODES.INTERNAL_ADAPTER_ERROR,
        errorMessage || "Internal adapter error",
        action,
        errorStack
      )),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
