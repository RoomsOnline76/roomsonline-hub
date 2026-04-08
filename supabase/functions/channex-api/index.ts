import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// CHANNEX.IO API ADAPTER
// Channel manager and PMS connectivity platform
// Docs: https://docs.channex.io/
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

// ============================================================================
// CAPABILITY DECLARATION
// ============================================================================

const CAPABILITIES = {
  supports_live_availability: true,
  supports_rate_fetch: true,
  supports_create_booking: true,
  supports_modify_booking: true,
  supports_cancel_booking: true,
  supports_webhooks: true,
  supports_owner_credentials: false,
};

// ============================================================================
// ADAPTER RESPONSE
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
  return { success: true, data, error: null, source: "channex", fetched_at: new Date().toISOString(), action };
}

function createErrorResponse(code: string, message: string, action: string, details?: unknown): AdapterResponse<null> {
  return { success: false, data: null, error: { code, message, details }, source: "channex", fetched_at: new Date().toISOString(), action };
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const baseRequestSchema = z.object({
  action: z.enum([
    "get_capabilities",
    "health_check",
    "test_connection",
    "fetch_availability",
    "fetch_restrictions",
    "fetch_types",
    "create_reservation",
    "modify_reservation",
    "cancel_reservation",
    "get_reservations",
  ]),
  property_id: z.string().uuid().optional(),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const fetchRestrictionsSchema = baseRequestSchema.extend({
  action: z.literal("fetch_restrictions"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  reservation_data: z.object({
    property_id: z.string(),
    room_type_id: z.string(),
    rate_plan_id: z.string(),
    arrival_date: z.string(),
    departure_date: z.string(),
    guest: z.object({
      name: z.string().min(1),
      surname: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }),
    occupancy: z.object({
      adults: z.number().min(1),
      children: z.number().min(0).optional(),
      infants: z.number().min(0).optional(),
    }),
    guarantee: z.object({
      card_number: z.string().optional(),
      card_type: z.string().optional(),
      cardholder_name: z.string().optional(),
      expiration_date: z.string().optional(),
      cvv: z.string().optional(),
    }).optional(),
    notes: z.string().optional(),
  }),
});

const modifyReservationSchema = baseRequestSchema.extend({
  action: z.literal("modify_reservation"),
  reservation_id: z.string(),
  reservation_data: z.record(z.unknown()).optional(),
});

const cancelReservationSchema = baseRequestSchema.extend({
  action: z.literal("cancel_reservation"),
  reservation_id: z.string(),
});

const getReservationsSchema = baseRequestSchema.extend({
  action: z.literal("get_reservations"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ============================================================================
// CHANNEX API CONFIG
// ============================================================================

const CHANNEX_STAGING_URL = "https://staging.channex.io/api/v1";
const CHANNEX_PRODUCTION_URL = "https://app.channex.io/api/v1";

interface ChannexCredentials {
  api_key: string;
  environment: "staging" | "production";
  channex_property_id?: string;
}

function getBaseUrl(environment: string): string {
  return environment === "production" ? CHANNEX_PRODUCTION_URL : CHANNEX_STAGING_URL;
}

function getHeaders(apiKey: string): Record<string, string> {
  return {
    "user-api-key": apiKey,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

// ============================================================================
// CHANNEX API FUNCTIONS
// ============================================================================

async function channexFetch(baseUrl: string, path: string, apiKey: string, options: RequestInit = {}): Promise<Response> {
  const url = `${baseUrl}${path}`;
  console.log(`[Channex] ${options.method || 'GET'} ${url}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(apiKey),
      ...(options.headers || {}),
    },
  });
  
  console.log(`[Channex] Response: ${response.status}`);
  return response;
}

async function healthCheck(creds: ChannexCredentials): Promise<any> {
  const baseUrl = getBaseUrl(creds.environment);
  const response = await channexFetch(baseUrl, "/properties", creds.api_key);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channex health check failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return {
    status: "ok",
    healthy: true,
    environment: creds.environment,
    properties_count: Array.isArray(data?.data) ? data.data.length : 0,
    message: "Connection successful",
  };
}

async function fetchAvailability(creds: ChannexCredentials, propertyId: string, startDate: string, endDate: string): Promise<any> {
  const baseUrl = getBaseUrl(creds.environment);
  const params = new URLSearchParams({
    "filter[property_id]": propertyId,
    "filter[date][gte]": startDate,
    "filter[date][lte]": endDate,
  });
  
  const response = await channexFetch(baseUrl, `/availability?${params}`, creds.api_key);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channex availability error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

async function fetchRestrictions(creds: ChannexCredentials, propertyId: string, startDate: string, endDate: string): Promise<any> {
  const baseUrl = getBaseUrl(creds.environment);
  const params = new URLSearchParams({
    "filter[property_id]": propertyId,
    "filter[date][gte]": startDate,
    "filter[date][lte]": endDate,
  });
  
  const response = await channexFetch(baseUrl, `/restrictions?${params}`, creds.api_key);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channex restrictions error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

async function fetchRoomTypes(creds: ChannexCredentials, propertyId: string): Promise<any> {
  const baseUrl = getBaseUrl(creds.environment);
  const params = new URLSearchParams({
    "filter[property_id]": propertyId,
  });
  
  const response = await channexFetch(baseUrl, `/room_types?${params}`, creds.api_key);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channex room types error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

async function createReservation(creds: ChannexCredentials, reservationData: any): Promise<any> {
  const baseUrl = getBaseUrl(creds.environment);
  
  // Map to Channex booking format
  const channexPayload = {
    booking: {
      property_id: reservationData.property_id,
      room_type_id: reservationData.room_type_id,
      rate_plan_id: reservationData.rate_plan_id,
      arrival_date: reservationData.arrival_date,
      departure_date: reservationData.departure_date,
      status: "new",
      guest: {
        name: reservationData.guest.name,
        surname: reservationData.guest.surname,
        email: reservationData.guest.email,
        phone: reservationData.guest.phone,
      },
      occupancy: reservationData.occupancy,
      guarantee: reservationData.guarantee,
      notes: reservationData.notes,
    },
  };
  
  const response = await channexFetch(baseUrl, "/bookings", creds.api_key, {
    method: "POST",
    body: JSON.stringify(channexPayload),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channex create booking error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

async function modifyReservation(creds: ChannexCredentials, reservationId: string, updateData: any): Promise<any> {
  const baseUrl = getBaseUrl(creds.environment);
  
  const response = await channexFetch(baseUrl, `/bookings/${reservationId}`, creds.api_key, {
    method: "PUT",
    body: JSON.stringify({ booking: updateData }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channex modify booking error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

async function cancelReservation(creds: ChannexCredentials, reservationId: string): Promise<any> {
  const baseUrl = getBaseUrl(creds.environment);
  
  const response = await channexFetch(baseUrl, `/bookings/${reservationId}/cancel`, creds.api_key, {
    method: "DELETE",
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channex cancel booking error: ${response.status} - ${errorText}`);
  }
  
  // Some DELETE endpoints return 204 No Content
  if (response.status === 204) {
    return { status: "cancelled", reservation_id: reservationId };
  }
  
  return response.json();
}

async function getReservationsFeed(creds: ChannexCredentials): Promise<any> {
  const baseUrl = getBaseUrl(creds.environment);
  
  const response = await channexFetch(baseUrl, "/booking_revisions/feed", creds.api_key);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channex reservations feed error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();

    // Validate base request
    const baseValidation = baseRequestSchema.safeParse(body);
    if (!baseValidation.success) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request parameters", "unknown", baseValidation.error.issues)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedBody = {
      ...body,
      start_date: body.start_date || body.startDate,
      end_date: body.end_date || body.endDate,
      property_id: body.property_id || body.propertyId,
    };
    const { property_id } = normalizedBody;
    action = normalizedBody.action;

    // get_capabilities — no credentials needed
    if (action === "get_capabilities") {
      return new Response(
        JSON.stringify(createSuccessResponse(CAPABILITIES, "get_capabilities")),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // RESOLVE CREDENTIALS
    // ========================================================================

    // For health_check without property_id — use any active channex credentials
    if ((action === "health_check" || action === "test_connection") && !property_id) {
      let { data: credentials } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "channex")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!credentials?.api_key) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.AUTH_FAILED, "Channex credentials not configured", action)),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const result = await healthCheck({
          api_key: credentials.api_key,
          environment: credentials.environment || "staging",
        });
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        return new Response(
          JSON.stringify(createErrorResponse(
            error.message?.includes("401") ? ERROR_CODES.AUTH_FAILED : ERROR_CODES.PMS_UNAVAILABLE,
            error.message || "Health check failed",
            action
          )),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // All other actions require property_id
    if (!property_id) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "property_id is required for this action", action)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get credentials for this property
    const { data: credentials, error: credError } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "channex")
      .eq("property_id", property_id)
      .eq("is_active", true)
      .maybeSingle();

    // Fall back to global channex credentials if no property-specific ones
    let creds: ChannexCredentials;
    if (credentials?.api_key) {
      creds = {
        api_key: credentials.api_key,
        environment: credentials.environment || "staging",
        channex_property_id: credentials.external_property_id || undefined,
      };
    } else {
      const { data: globalCreds } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "channex")
        .eq("is_active", true)
        .is("property_id", null)
        .limit(1)
        .maybeSingle();

      if (!globalCreds?.api_key) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.AUTH_FAILED, "Channex credentials not found for this property", action)),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      creds = {
        api_key: globalCreds.api_key,
        environment: globalCreds.environment || "staging",
        channex_property_id: globalCreds.external_property_id || undefined,
      };
    }

    // Resolve the Channex property ID
    const channexPropertyId = creds.channex_property_id || property_id;
    console.log(`[Channex] Action: ${action}, Property: ${property_id}, Channex Property: ${channexPropertyId}, Env: ${creds.environment}`);

    // ========================================================================
    // ACTION DISPATCH
    // ========================================================================

    switch (action) {
      case "health_check":
      case "test_connection": {
        const result = await healthCheck(creds);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_availability": {
        const validation = fetchAvailabilitySchema.safeParse(normalizedBody);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid availability request", action, validation.error.issues)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const rawData = await fetchAvailability(creds, channexPropertyId, normalizedBody.start_date, normalizedBody.end_date);
        return new Response(
          JSON.stringify(createSuccessResponse(rawData, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_restrictions": {
        const validation = fetchRestrictionsSchema.safeParse(normalizedBody);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid restrictions request", action, validation.error.issues)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const rawData = await fetchRestrictions(creds, channexPropertyId, normalizedBody.start_date, normalizedBody.end_date);
        return new Response(
          JSON.stringify(createSuccessResponse(rawData, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_types": {
        const rawData = await fetchRoomTypes(creds, channexPropertyId);
        return new Response(
          JSON.stringify(createSuccessResponse(rawData, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_reservation": {
        const validation = createReservationSchema.safeParse(normalizedBody);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid reservation data", action, validation.error.issues)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const result = await createReservation(creds, normalizedBody.reservation_data);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "modify_reservation": {
        const validation = modifyReservationSchema.safeParse(normalizedBody);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid modify request", action, validation.error.issues)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const result = await modifyReservation(creds, normalizedBody.reservation_id, normalizedBody.reservation_data || {});
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cancel_reservation": {
        const validation = cancelReservationSchema.safeParse(normalizedBody);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid cancel request", action, validation.error.issues)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const result = await cancelReservation(creds, normalizedBody.reservation_id);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_reservations": {
        const result = await getReservationsFeed(creds);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, `Unknown action: ${action}`, action)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error(`[Channex] Error in ${action}:`, error);
    
    const isAuthError = error.message?.includes("401") || error.message?.includes("403");
    return new Response(
      JSON.stringify(createErrorResponse(
        isAuthError ? ERROR_CODES.AUTH_FAILED : ERROR_CODES.INTERNAL_ADAPTER_ERROR,
        error.message || "Internal adapter error",
        action
      )),
      { 
        status: isAuthError ? 401 : 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
