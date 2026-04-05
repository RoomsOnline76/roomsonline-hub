import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// BENSON API - BASE REFERENCE IMPLEMENTATION
// All other PMS adapters MUST conform to Benson's response shapes.
// See: supabase/functions/_shared/adapter-contract.ts
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

// Standardized response wrapper - ALL adapters MUST use this shape
interface AdapterResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  source: string;
  fetched_at: string;
  action: string;
}

function createAdapterResponse<T>(
  success: boolean,
  data: T | null,
  error: { code: string; message: string; details?: unknown } | null,
  action: string
): AdapterResponse<T> {
  return {
    success,
    data,
    error,
    source: "benson",
    fetched_at: new Date().toISOString(),
    action,
  };
}

function createSuccessResponse<T>(data: T, action: string): AdapterResponse<T> {
  return createAdapterResponse(true, data, null, action);
}

function createErrorResponse(
  code: string,
  message: string,
  action: string,
  details?: unknown
): AdapterResponse<null> {
  return createAdapterResponse(false, null, { code, message, details }, action);
}

// Input validation schemas
const baseRequestSchema = z.object({
  action: z.enum([
    "get_capabilities",
    "health_check",
    "test_connection", // Legacy alias for health_check
    "fetch_availability",
    "create_reservation",
    "modify_reservation",
    "cancel_reservation",
    "get_reservations",
    "fetch_types",
    "fetch_property_data",
    "get_current_rooms",
    "get_client_invoices",
    "post_bill"
  ]),
  property_id: z.string().uuid({ message: "Invalid property ID format" }).optional(),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Start date must be YYYY-MM-DD format" }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be YYYY-MM-DD format" }),
  room_type_ids: z.array(z.number()).optional(),
  rate_type_ids: z.array(z.number()).optional(),
});

const getReservationsSchema = baseRequestSchema.extend({
  action: z.literal("get_reservations"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Start date must be YYYY-MM-DD format" }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be YYYY-MM-DD format" }),
  statuses: z.array(z.string()).optional(),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  reservation_data: z.object({
    arrivalDate: z.string(),
    departureDate: z.string(),
    rateTypeId: z.number(),
    contactName: z.string().min(1),
    contactNumber: z.string(),
    contactEmail: z.string().email(),
    voucher: z.string().optional(),
    note: z.string().optional(),
    rooms: z.array(z.object({
      roomTypeId: z.number(),
      numberOfAdults: z.number().min(0),
      numberOfTeens: z.number().min(0),
      numberOfChildren: z.number().min(0),
      numberOfInfants: z.number().min(0),
    })),
  }),
});

const modifyReservationSchema = baseRequestSchema.extend({
  action: z.literal("modify_reservation"),
  reservation_id: z.string(),
});

const cancelReservationSchema = baseRequestSchema.extend({
  action: z.literal("cancel_reservation"),
  reservation_id: z.string(),
});

const postBillSchema = baseRequestSchema.extend({
  action: z.literal("post_bill"),
  bill_data: z.object({
    roomId: z.number().optional(),
    reservationId: z.number().optional(),
    clientId: z.number().optional(),
    sourceReference: z.string(),
    charges: z.array(z.object({
      chargeTypeId: z.number(),
      amount: z.number(),
    })).optional(),
    payments: z.array(z.object({
      paymentTypeId: z.number(),
      amount: z.number(),
    })).optional(),
  }),
});

// Benson API Base URLs (defaults)
const BENSON_STAGING_URL = "https://staging-api.bensonsoftware.com/api/v3/integrations";
const BENSON_PRODUCTION_URL = "https://api.bensonsoftware.com/api/v3/integrations";

interface BensonCredentials {
  username: string;
  password: string;
  environment: "staging" | "production";
  baseUrl?: string; // Custom URL override
}

interface PropertyInfo {
  id: string;
  benson_property_code: string;
}

// Helper to get base64 encoded auth header (handles special characters)
const getAuthHeader = (username: string, password: string): string => {
  // Use TextEncoder to properly handle special characters
  const encoder = new TextEncoder();
  const data = encoder.encode(`${username}:${password}`);
  // Convert to base64 using Uint8Array
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const credentials = btoa(binary);
  return `Basic ${credentials}`;
};

// Helper to get the correct base URL
const getBaseUrl = (creds: BensonCredentials, propertyCode: string): string => {
  // Use custom URL if provided, otherwise use default based on environment
  const baseUrl = creds.baseUrl || (creds.environment === "production" ? BENSON_PRODUCTION_URL : BENSON_STAGING_URL);
  return `${baseUrl}/${propertyCode}`;
};

// Fetch availability from Benson
async function fetchAvailability(
  creds: BensonCredentials,
  propertyCode: string,
  startDate: string,
  endDate: string,
  roomTypeIds?: number[],
  rateTypeIds?: number[]
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  let url = `${baseUrl}/availability?startdate=${startDate}&enddate=${endDate}`;
  
  if (roomTypeIds?.length) {
    roomTypeIds.forEach(id => url += `&roomtypeid=${id}`);
  }
  if (rateTypeIds?.length) {
    rateTypeIds.forEach(id => url += `&ratetypeid=${id}`);
  }

  console.log(`Fetching availability from: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  console.log(`Availability response status: ${response.status}`);
  
  const responseText = await response.text();
  console.log(`Availability raw response (first 1000 chars): ${responseText.substring(0, 1000)}`);

  if (!response.ok) {
    console.error(`Benson API error: ${response.status} - ${responseText}`);
    throw new Error(`Benson API error: ${response.status} - ${responseText}`);
  }

  try {
    const data = JSON.parse(responseText);
    console.log(`Parsed availability data keys: ${Object.keys(data).join(', ')}`);
    return data;
  } catch (e) {
    console.error(`Failed to parse availability response as JSON:`, e);
    throw new Error(`Invalid JSON response from Benson API`);
  }
}

// Create reservation in Benson
async function createReservation(
  creds: BensonCredentials,
  propertyCode: string,
  reservationData: {
    arrivalDate: string;
    departureDate: string;
    rateTypeId: number;
    contactName: string;
    contactNumber: string;
    contactEmail: string;
    voucher?: string;
    note?: string;
    rooms: Array<{
      roomTypeId: number;
      numberOfAdults: number;
      numberOfTeens: number;
      numberOfChildren: number;
      numberOfInfants: number;
    }>;
  }
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/reservations`;

  console.log(`Creating reservation at: ${url}`);
  console.log(`Reservation data:`, JSON.stringify(reservationData, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reservationData),
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error(`Benson API error: ${response.status}`, data);
    throw new Error(`Benson API error: ${response.status} - ${JSON.stringify(data)}`);
  }

  return data;
}

// Get reservations from Benson
async function getReservations(
  creds: BensonCredentials,
  propertyCode: string,
  startDate: string,
  endDate: string,
  statuses: string[]
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  // Use lowercase query params as per Benson API docs
  let url = `${baseUrl}/reservations?startdate=${startDate}&enddate=${endDate}`;
  
  // Add status filters - use lowercase 'status' param
  statuses.forEach(status => url += `&status=${status}`);

  console.log(`Fetching reservations from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get room types from Benson (Room Information)
async function getRoomTypes(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/roomtypes`;

  console.log(`Fetching room types from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get rate types from Benson (Rate Info dropdown)
async function getRateTypes(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/ratetypes`;

  console.log(`Fetching rate types from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get rates from Benson (Rate Breakdown)
async function getRates(
  creds: BensonCredentials, 
  propertyCode: string,
  startDate: string,
  endDate: string
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/rates?startdate=${startDate}&enddate=${endDate}`;

  console.log(`Fetching rates from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get current rooms from Benson
async function getCurrentRooms(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/currentrooms`;

  console.log(`Fetching current rooms from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get client default invoices from Benson
async function getClientDefaultInvoices(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/clientdefaultinvoices`;

  console.log(`Fetching client default invoices from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Post bill to Benson
async function postBill(
  creds: BensonCredentials,
  propertyCode: string,
  billData: {
    roomId?: number;
    reservationId?: number;
    clientId?: number;
    sourceReference: string;
    charges?: Array<{ chargeTypeId: number; amount: number }>;
    payments?: Array<{ paymentTypeId: number; amount: number }>;
  }
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/bill`;

  console.log(`Posting bill to: ${url}`);
  console.log(`Bill data:`, JSON.stringify(billData, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(billData),
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error(`Benson API error: ${response.status}`, data);
    throw new Error(`Benson API error: ${response.status} - ${JSON.stringify(data)}`);
  }

  return data;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let action = "unknown";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    
    // Validate base request structure
    const baseValidation = baseRequestSchema.safeParse(body);
    if (!baseValidation.success) {
      console.error("Validation failed:", baseValidation.error);
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request parameters", "unknown", baseValidation.error.issues)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Normalize camelCase to snake_case for interoperability
    const normalizedBody = {
      ...body,
      start_date: body.start_date || body.startDate,
      end_date: body.end_date || body.endDate,
      room_type_ids: body.room_type_ids || body.roomTypeIds,
      rate_type_ids: body.rate_type_ids || body.rateTypeIds,
      reservation_data: body.reservation_data || body.reservationData,
      property_id: body.property_id || body.propertyId,
    };
    const { property_id, ...params } = normalizedBody;
    action = normalizedBody.action;

    // Handle get_capabilities early (no credentials needed)
    if (action === "get_capabilities") {
      return new Response(
        JSON.stringify(createSuccessResponse(CAPABILITIES, "get_capabilities")),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle health_check/test_connection - doesn't need property, just credentials
    if ((action === "health_check" || action === "test_connection") && !property_id) {
      console.log(`[Benson] Standalone health check - no property_id provided`);
      
      // PRIORITY 1: Get production Benson credentials
      let { data: credentials } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "benson")
        .eq("is_active", true)
        .eq("environment", "production")
        .maybeSingle();

      // PRIORITY 2: Fall back to any active Benson credentials
      if (!credentials) {
        const { data: fallbackCreds } = await supabase
          .from("pms_credentials")
          .select("*")
          .eq("system_type", "benson")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        credentials = fallbackCreds;
      }

      if (!credentials || !credentials.username || !credentials.password) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.AUTH_FAILED,
            "Benson credentials not configured",
            action
          )),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get a production Benson property to test against (prefer active production properties)
      let { data: testProperty } = await supabase
        .from("properties")
        .select("benson_property_code, benson_environment")
        .not("benson_property_code", "is", null)
        .eq("benson_environment", "production")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fall back to any active Benson property if no production ones
      if (!testProperty) {
        const { data: fallbackProperty } = await supabase
          .from("properties")
          .select("benson_property_code, benson_environment")
          .not("benson_property_code", "is", null)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        testProperty = fallbackProperty;
      }

      if (!testProperty?.benson_property_code) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.NOT_FOUND,
            "No Benson-connected properties found for health check",
            action
          )),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use the property's environment for the API call
      const testEnvironment = testProperty.benson_environment || credentials.environment || "production";
      const baseUrl = testEnvironment === "production" ? BENSON_PRODUCTION_URL : BENSON_STAGING_URL;
      
      // Use /availability endpoint with 1-day range (roomtypes returns 404 for some properties)
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const testUrl = `${baseUrl}/${testProperty.benson_property_code}/availability?startdate=${today}&enddate=${tomorrow}`;
      
      console.log(`[Benson] Testing connection to: ${testUrl} (env: ${testEnvironment})`);

      try {
        const testResponse = await fetch(testUrl, {
          headers: {
            "Authorization": getAuthHeader(credentials.username, credentials.password),
            "Content-Type": "application/json",
          },
        });
        
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          return new Response(
            JSON.stringify(createErrorResponse(
              testResponse.status === 401 ? ERROR_CODES.AUTH_FAILED : ERROR_CODES.PMS_UNAVAILABLE,
              `Health check failed: ${errorText || testResponse.status}`,
              action
            )),
            { status: testResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify(createSuccessResponse({
            status: "ok",
            healthy: true,
            environment: testEnvironment,
            test_property_code: testProperty.benson_property_code,
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
    if (!property_id) {
      return new Response(
        JSON.stringify(createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          "property_id is required for this action",
          action
        )),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Benson API action: ${action}, property_id: ${property_id}`);

    // Get property info first to determine which environment to use
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("id, benson_property_code, benson_environment")
      .eq("id", property_id)
      .single();

    if (propError || !property) {
      console.error("Property not found:", propError);
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.NOT_FOUND, "Property not found", action)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!property.benson_property_code) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Benson property code not configured for this property", action)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use property's environment setting (per-property, not global)
    const propertyEnvironment = property.benson_environment || "staging";
    console.log(`Using Benson ${propertyEnvironment} environment for property ${property_id}`);

    // Get Benson credentials for the property's environment
    const { data: credentials, error: credError } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "benson")
      .eq("environment", propertyEnvironment)
      .maybeSingle();

    if (credError || !credentials) {
      console.error("Benson credentials not found:", credError);
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.AUTH_FAILED, `Benson ${propertyEnvironment} credentials not configured`, action)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!credentials.username || !credentials.password) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.AUTH_FAILED, `Benson ${propertyEnvironment} username/password not configured`, action)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const creds: BensonCredentials = {
      username: credentials.username,
      password: credentials.password,
      environment: credentials.environment as "staging" | "production",
      baseUrl: credentials.base_url || undefined,
    };

    const propertyCode = property.benson_property_code;
    let result: any;

    switch (action) {
      case "health_check":
      case "test_connection": {
        // Simple test to verify credentials work - use /availability endpoint (roomtypes returns 404 for some properties)
        const baseUrl = creds.baseUrl || (creds.environment === "production" ? BENSON_PRODUCTION_URL : BENSON_STAGING_URL);
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const testUrl = `${baseUrl}/${propertyCode}/availability?startdate=${today}&enddate=${tomorrow}`;
        
        console.log(`Testing connection to: ${testUrl}`);
        console.log(`Username: ${creds.username}`);
        console.log(`Password length: ${creds.password.length}`);
        console.log(`Environment: ${creds.environment}`);
        
        // Log the auth header (masked)
        const authHeader = getAuthHeader(creds.username, creds.password);
        console.log(`Auth header prefix: ${authHeader.substring(0, 15)}...`);
        
        const testResponse = await fetch(testUrl, {
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
        });
        
        console.log(`Test response status: ${testResponse.status}`);
        
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error(`Test failed: ${testResponse.status} - ${errorText}`);
          return new Response(
            JSON.stringify(createErrorResponse(
              testResponse.status === 401 ? ERROR_CODES.AUTH_FAILED : ERROR_CODES.PMS_UNAVAILABLE,
              errorText || "Connection test failed",
              "health_check",
              { status: testResponse.status, url: testUrl }
            )),
            { status: testResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const testData = await testResponse.json();
        result = { 
          healthy: true, 
          message: "Connection successful",
          room_types_count: Array.isArray(testData) ? testData.length : 0,
        };
        break;
      }

      case "fetch_availability":
        const rawAvailability = await fetchAvailability(
          creds,
          propertyCode,
          params.start_date,
          params.end_date,
          params.room_type_ids,
          params.rate_type_ids
        );
        
        // Benson returns an array of room types directly
        const availabilityRoomTypes = Array.isArray(rawAvailability) ? rawAvailability : (rawAvailability?.roomTypes || []);
        
        // Transform to snake_case contract format
        const transformedRoomTypes = availabilityRoomTypes.map((roomType: any) => ({
          room_type_id: roomType.roomTypeId?.toString() || "",
          room_type_name: roomType.name || `Room ${roomType.roomTypeId}`,
          max_guests: roomType.maxGuests || roomType.maxPeople,
          min_guests: roomType.minGuests,
          allow_teens: roomType.allowTeens,
          teen_min_age: roomType.teenMinAge,
          teen_max_age: roomType.teenMaxAge,
          allow_children: roomType.allowChildren,
          child_min_age: roomType.childMinAge,
          child_max_age: roomType.childMaxAge,
          allow_infants: roomType.allowInfants,
          infant_min_age: roomType.infantMinAge,
          infant_max_age: roomType.infantMaxAge,
          rooms_available_per_night: (roomType.roomsAvailablePerNight || []).map((avail: any) => ({
            date: avail.date,
            available_units: avail.numberOfRoomsAvailable ?? 0,
            stop_sell: avail.stopSell ?? avail.isClosed ?? false,
            min_stay: avail.minimumStay ?? avail.minStay,
            max_stay: avail.maximumStay ?? avail.maxStay,
            lead_days_advance: avail.leadDaysAdvance,
            lead_days_post: avail.leadDaysPost,
            closed_to_arrival: avail.closedToArrival ?? false,
            closed_to_departure: avail.closedToDeparture ?? false,
          })),
          rate_types: (roomType.rateTypes || []).map((rateType: any) => ({
            rate_type_id: rateType.rateTypeId?.toString() || "",
            rate_type_name: rateType.name || `Rate ${rateType.rateTypeId}`,
            price_type: rateType.priceType || "UnitRate",
            min_stay_days: rateType.minStayDays,
            max_stay_days: rateType.maxStayDays,
            rates: (rateType.rates || []).map((rate: any) => ({
              date: rate.date,
              room_amount: rate.roomAmount || 0,
              adult_amounts: {
                adult_amount_1: rate.adultAmount1,
                adult_amount_2: rate.adultAmount2,
                adult_amount_3: rate.adultAmount3,
                adult_amount_4: rate.adultAmount4,
                adult_amount_5: rate.adultAmount5,
                adult_amount_6: rate.adultAmount6,
                adult_amount_7: rate.adultAmount7,
                adult_amount_8: rate.adultAmount8,
                adult_amount_9: rate.adultAmount9,
                adult_amount_10: rate.adultAmount10,
              },
              teen_amount: rate.teenAmount,
              child_amount: rate.childAmount,
              infant_amount: rate.infantAmount,
            })),
          })),
        }));
        
        // Map PMS-native room IDs to DB UUIDs (adapter contract enforcement)
        const { data: dbRooms } = await supabase
          .from("hostfully_room_types")
          .select("id, hostfully_room_id")
          .eq("property_id", property_id)
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
        
        // Replace PMS codes with DB UUIDs
        const mappedRoomTypes = transformedRoomTypes.map((rt: any) => ({
          ...rt,
          external_room_type_id: rt.room_type_id,
          room_type_id: pmsCodeToDbUuid[rt.room_type_id] || rt.room_type_id,
        }));
        
        result = { room_types: mappedRoomTypes };
        
        console.log(`Benson availability response structure:`, JSON.stringify({
          hasRoomTypes: !!result.room_types,
          roomTypesCount: result.room_types?.length || 0,
          sampleRoomType: result.room_types?.[0] ? {
            room_type_id: result.room_types[0].room_type_id,
            room_type_name: result.room_types[0].room_type_name,
            hasRateTypes: !!result.room_types[0].rate_types,
            rateTypesCount: result.room_types[0].rate_types?.length || 0,
          } : null,
        }));
        
        // Cache the availability data (still using raw Benson data for caching)
        if (availabilityRoomTypes && availabilityRoomTypes.length > 0) {
          console.log(`Processing ${availabilityRoomTypes.length} room types for caching`);
          for (const roomType of availabilityRoomTypes) {
            console.log(`Room type: ${roomType.roomTypeId} - ${roomType.name}, availPerNight: ${roomType.roomsAvailablePerNight?.length || 0}`);
            if (roomType.roomsAvailablePerNight) {
              for (const availability of roomType.roomsAvailablePerNight) {
                // Build restrictions object from availability data
                const restrictions = {
                  stop_sell: availability.stopSell ?? availability.isClosed ?? availability.closed ?? false,
                  min_stay: availability.minStay ?? availability.minimumStay ?? availability.minStayNights ?? null,
                  max_stay: availability.maxStay ?? availability.maximumStay ?? availability.maxStayNights ?? null,
                  lead_days_advance: availability.leadDaysAdvance ?? availability.minAdvanceDays ?? null,
                  lead_days_post: availability.leadDaysPost ?? availability.maxAdvanceDays ?? null,
                  closed_to_arrival: availability.closedToArrival ?? availability.cta ?? false,
                  closed_to_departure: availability.closedToDeparture ?? availability.ctd ?? false,
                  blocked_rooms: availability.blockedRooms || [],
                };
                
                // source_timestamp: use the date from PMS as source authority marker
                // fetched_at: when we pulled this data (last_synced_at)
                const { error: availError } = await supabase.from("pms_availability_cache").upsert({
                  property_id: property_id,
                  system_type: "benson",
                  external_room_type_id: roomType.roomTypeId.toString(),
                  date: availability.date,
                  available_units: availability.numberOfRoomsAvailable,
                  restrictions: restrictions,
                  raw_data: {
                    ...availability,
                    roomTypeName: roomType.name,
                    roomTypeId: roomType.roomTypeId,
                  },
                  source_timestamp: availability.lastModified || availability.updatedAt || new Date().toISOString(),
                  fetched_at: new Date().toISOString(),
                }, {
                  onConflict: "property_id,system_type,external_room_type_id,date"
                });
                if (availError) {
                  console.error(`Error caching availability for ${roomType.roomTypeId} on ${availability.date}:`, availError);
                }
              }
            }
            
            // Cache rate data - aggregate all rate types per date into an array
            if (roomType.rateTypes) {
              // Group rates by date first
              const ratesByDate = new Map<string, any[]>();
              
              for (const rateType of roomType.rateTypes) {
                if (rateType.rates) {
                  for (const rate of rateType.rates) {
                    const dateStr = rate.date;
                    if (!ratesByDate.has(dateStr)) {
                      ratesByDate.set(dateStr, []);
                    }
                    ratesByDate.get(dateStr)!.push({
                      rate_type_id: rateType.rateTypeId,
                      rate_type_name: rateType.name,
                      price_type: rateType.priceType,
                      room_amount: rate.roomAmount,
                      adult_amounts: Object.entries(rate)
                        .filter(([k]) => k.startsWith("adultAmount"))
                        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
                      teen_amount: rate.teenAmount,
                      child_amount: rate.childAmount,
                      infant_amount: rate.infantAmount,
                    });
                  }
                }
              }
              
              // Now upsert with all rate types per date as an array
              for (const [dateStr, ratesArray] of ratesByDate.entries()) {
                const { error: rateError } = await supabase.from("pms_availability_cache").upsert({
                  property_id: property_id,
                  system_type: "benson",
                  external_room_type_id: roomType.roomTypeId.toString(),
                  date: dateStr,
                  rates: ratesArray, // Store as array instead of single object
                  raw_data: {
                    roomTypeName: roomType.name,
                    roomTypeId: roomType.roomTypeId,
                  },
                  source_timestamp: new Date().toISOString(), // PMS timestamp when data was valid
                  fetched_at: new Date().toISOString(),
                }, {
                  onConflict: "property_id,system_type,external_room_type_id,date"
                });
                if (rateError) {
                  console.error(`Error caching rate for ${roomType.roomTypeId} on ${dateStr}:`, rateError);
                }
              }
            }
          }

          // ── Hydrate cache → ROL'OS pipeline ──
          try {
            const hydrateUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hydrate-pms-cache-to-rolos`;
            await fetch(hydrateUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ property_id, system_type: "benson" }),
            });
            console.log(`[Benson] Hydration triggered for property ${property_id}`);
          } catch (hydrateErr) {
            console.error("[Benson] Hydration call failed (non-blocking):", hydrateErr);
          }
        } else {
          console.warn(`No room types found in Benson response. Full response:`, JSON.stringify(result).substring(0, 500));
        }
        break;

      case "create_reservation":
        result = await createReservation(creds, propertyCode, params.reservation_data);
        
        // Store the reservation in our database with full fields
        if (result.id) {
          const totalAmount = result.charges?.reduce((sum: number, charge: any) => {
            return sum + (parseFloat(charge.amount) || 0);
          }, 0) || 0;

          await supabase.from("pms_reservations").upsert({
            property_id: property_id,
            system_type: "benson",
            external_reservation_id: result.id.toString(),
            status: result.status,
            arrival_date: result.arrivalDate,
            departure_date: result.departureDate,
            contact_name: result.contactName,
            contact_email: result.contactEmail,
            contact_phone: result.contactNumber,
            rate_type_name: result.rateTypeName,
            total_amount: totalAmount,
            currency: "ZAR",
            rooms: result.reservationRooms || [],
            guests: result.guests || [],
            charges: result.charges || [],
            payments: result.payments || [],
            reservation_name: result.reservationName || null,
            reservation_voucher: result.reservationVoucher || null,
            consultant_name: result.consultantName || null,
            consultant_email: result.consultantEmail || null,
            consultant_contact_number: result.consultantContactNumber || null,
            originating_agent: result.originatingAgent || {},
            responsible_client: result.responsibleClient || {},
            guarantee: result.guarantee || {},
            cancellation: result.cancellation || {},
            number_of_rooms: result.numberOfRooms || null,
            number_of_guests: result.numberOfGuests || null,
            guest_nationality: result.guestNationality || null,
            create_date: result.createDate || null,
            create_user_name: result.createUserName || null,
            is_property_tax_inclusive: result.isPropertyTaxInclusive ?? true,
            raw_data: result,
            synced_at: new Date().toISOString(),
          }, {
            onConflict: "property_id,system_type,external_reservation_id"
          });
        }
        
        // Transform to contract shape
        result = {
          reservation_id: result.id?.toString(),
          confirmation_number: result.reservationVoucher || result.id?.toString(),
          status: result.status,
        };
        break;

      case "modify_reservation":
        // Benson does not support modification via API
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.MODIFICATION_NOT_SUPPORTED,
            "Benson API does not support reservation modification. Please modify directly in Benson.",
            "modify_reservation"
          )),
          { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "cancel_reservation":
        // Benson does not support cancellation via API
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.CANCELLATION_NOT_SUPPORTED,
            "Benson API does not support reservation cancellation. Please cancel directly in Benson.",
            "cancel_reservation"
          )),
          { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "get_reservations":
        result = await getReservations(
          creds,
          propertyCode,
          params.start_date,
          params.end_date,
          params.statuses || ["PROVISIONAL", "CONFIRMED", "GUARANTEED", "CHECKED-IN", "CANCELLED"]
        );
        
        // Sync reservations to our database with full Benson API fields
        if (Array.isArray(result)) {
          console.log(`Syncing ${result.length} reservations from Benson`);
          for (const res of result) {
            // Calculate total amount from charges
            const totalAmount = res.charges?.reduce((sum: number, charge: any) => {
              return sum + (parseFloat(charge.amount) || 0);
            }, 0) || 0;

            const { error: upsertError } = await supabase.from("pms_reservations").upsert({
              property_id: property_id,
              system_type: "benson",
              external_reservation_id: res.id.toString(),
              status: res.status,
              arrival_date: res.arrivalDate,
              departure_date: res.departureDate,
              contact_name: res.contactName,
              contact_email: res.contactEmail,
              contact_phone: res.contactNumber,
              rate_type_name: res.rateTypeName,
              total_amount: totalAmount,
              currency: "ZAR",
              rooms: res.reservationRooms || [],
              guests: res.guests || [],
              charges: res.charges || [],
              payments: res.payments || [],
              // New fields from Benson API docs
              reservation_name: res.reservationName || null,
              reservation_voucher: res.reservationVoucher || null,
              consultant_name: res.consultantName || null,
              consultant_email: res.consultantEmail || null,
              consultant_contact_number: res.consultantContactNumber || null,
              originating_agent: res.originatingAgent || {},
              responsible_client: res.responsibleClient || {},
              guarantee: res.guarantee || {},
              cancellation: res.cancellation || {},
              number_of_rooms: res.numberOfRooms || null,
              number_of_guests: res.numberOfGuests || null,
              guest_nationality: res.guestNationality || null,
              link_id: res.linkId || null,
              create_date: res.createDate || null,
              create_user_name: res.createUserName || null,
              cancellation_date: res.cancellationDate || null,
              cancellation_user_name: res.cancellationUserName || null,
              cancellation_reason: res.cancellationReason || null,
              status_at_time_of_cancellation: res.statusAtTimeOfCancellation || null,
              is_property_tax_inclusive: res.isPropertyTaxInclusive ?? true,
              raw_data: res,
              synced_at: new Date().toISOString(),
            }, {
              onConflict: "property_id,system_type,external_reservation_id"
            });
            
            if (upsertError) {
              console.error(`Error upserting reservation ${res.id}:`, upsertError);
            }
          }
          console.log(`Successfully synced ${result.length} reservations`);
        }
        
        // Transform to contract shape
        result = {
          reservations: (Array.isArray(result) ? result : []).map((res: any) => ({
            reservation_id: res.id?.toString(),
            status: res.status,
            arrival_date: res.arrivalDate,
            departure_date: res.departureDate,
            contact: {
              name: res.contactName || res.reservationName || "",
              email: res.contactEmail,
              phone: res.contactNumber,
            },
            rooms: (res.reservationRooms || []).map((room: any) => ({
              room_type_id: room.roomTypeId?.toString(),
              room_type_name: room.roomTypeName,
              adults: room.numberOfAdults || 0,
              teens: room.numberOfTeens || 0,
              children: room.numberOfChildren || 0,
              infants: room.numberOfInfants || 0,
            })),
            total_amount: res.charges?.reduce((sum: number, charge: any) => sum + (parseFloat(charge.amount) || 0), 0) || 0,
            currency: "ZAR",
            rate_type_name: res.rateTypeName,
            voucher: res.reservationVoucher,
            notes: res.note,
            created_at: res.createDate,
          })),
        };
        break;

      case "fetch_types":
        // Fetch room types and rate types from availability endpoint
        console.log(`Fetching types via availability endpoint`);
        
        const typesStartDate = new Date();
        const typesEndDate = new Date();
        typesEndDate.setDate(typesEndDate.getDate() + 7); // Only need a few days to get types
        
        let typesAvailData: any = [];
        try {
          typesAvailData = await fetchAvailability(
            creds, 
            propertyCode, 
            typesStartDate.toISOString().split("T")[0],
            typesEndDate.toISOString().split("T")[0]
          );
        } catch (availError: any) {
          console.warn(`Could not fetch availability for types: ${availError.message}`);
        }
        
        // Extract room types and rate types from availability response
        // CONTRACT: Return snake_case IDs per adapter-contract.ts
        const fetchedRoomTypes: any[] = [];
        const fetchedRateTypes: Map<number, any> = new Map();
        
        if (Array.isArray(typesAvailData)) {
          typesAvailData.forEach((roomType: any) => {
            fetchedRoomTypes.push({
              room_type_id: roomType.roomTypeId,
              name: roomType.name,
            });
            
            // Extract rate types from this room type
            if (roomType.rateTypes && Array.isArray(roomType.rateTypes)) {
              roomType.rateTypes.forEach((rateType: any) => {
                if (!fetchedRateTypes.has(rateType.rateTypeId)) {
                  fetchedRateTypes.set(rateType.rateTypeId, {
                    rate_type_id: rateType.rateTypeId,
                    name: rateType.name,
                  });
                }
              });
            }
          });
        }
        
        console.log(`Fetched ${fetchedRoomTypes.length} room types, ${fetchedRateTypes.size} rate types from availability`);
        
        result = {
          room_types: fetchedRoomTypes,
          rate_types: Array.from(fetchedRateTypes.values()),
          charge_types: [], // Not available from availability endpoint
          payment_types: [], // Not available from availability endpoint
        };
        break;

      case "fetch_property_data":
        // ============================================================================
        // BENSON fetch_property_data - per v1.1 pms-implementation-master.json:
        // - name: authoritative (but not exposed via availability API)
        // - description: not_available
        // - location: not_available
        // - images: not_available
        // - charge_types/payment_types: authoritative (PMS operational data)
        // ============================================================================
        console.log(`[Benson] Fetching property data for ${property_id}`);
        
        // Get availability for 30 days - this returns room types with embedded rate types
        const propStartDate = new Date();
        const propEndDate = new Date();
        propEndDate.setDate(propEndDate.getDate() + 30);
        
        let availabilityData: any = [];
        try {
          availabilityData = await fetchAvailability(
            creds, 
            propertyCode, 
            propStartDate.toISOString().split("T")[0],
            propEndDate.toISOString().split("T")[0]
          );
        } catch (availError: any) {
          console.warn(`[Benson] Could not fetch availability: ${availError.message}`);
        }
        
        // Extract room types from availability response
        const extractedRoomTypes: any[] = [];
        const extractedRateTypes: Map<number, any> = new Map();
        
        if (Array.isArray(availabilityData)) {
          availabilityData.forEach((roomType: any) => {
            extractedRoomTypes.push({
              room_type_id: roomType.roomTypeId?.toString() || "",
              name: roomType.name || `Room ${roomType.roomTypeId}`,
              description: null, // Benson doesn't provide room descriptions
              min_guests: roomType.minPeople || roomType.minGuests || 1,
              max_guests: roomType.maxPeople || roomType.maxGuests || 2,
              guest_rules: {
                allow_teens: roomType.allowTeens ?? true,
                teen_min_age: roomType.teenMinAge ?? null,
                teen_max_age: roomType.teenMaxAge ?? null,
                allow_children: roomType.allowChildren ?? true,
                child_min_age: roomType.childMinAge ?? null,
                child_max_age: roomType.childMaxAge ?? null,
                allow_infants: roomType.allowInfants ?? true,
                infant_min_age: roomType.infantMinAge ?? null,
                infant_max_age: roomType.infantMaxAge ?? null,
              },
              linked_rate_type_ids: roomType.rateTypes?.map((rt: any) => rt.rateTypeId?.toString()) || [],
            });
            
            // Extract rate types for mapping
            if (roomType.rateTypes && Array.isArray(roomType.rateTypes)) {
              roomType.rateTypes.forEach((rateType: any) => {
                if (!extractedRateTypes.has(rateType.rateTypeId)) {
                  extractedRateTypes.set(rateType.rateTypeId, {
                    rate_type_id: rateType.rateTypeId?.toString() || "",
                    name: rateType.name || `Rate ${rateType.rateTypeId}`,
                    description: null,
                    price_type: rateType.priceType || null,
                    min_stay_days: rateType.minStayDays ?? null,
                    max_stay_days: rateType.maxStayDays ?? null,
                    min_advance_days: rateType.minAdvanceDays ?? null,
                    max_advance_days: rateType.maxAdvanceDays ?? null,
                  });
                }
              });
            }
          });
        }
        
        console.log(`[Benson] Extracted ${extractedRoomTypes.length} room types, ${extractedRateTypes.size} rate types`);
        
        // Return PropertyDataResponse per adapter-contract.ts
        // Benson is operational-only PMS - no editorial content available
        result = {
          // Editorial fields - all not_available per v1.1 spec (except name which requires dedicated endpoint)
          property_name: null,       // authoritative but not exposed via availability API
          description: null,         // not_available
          location: null,            // not_available
          geo: null,                 // not_available
          images: null,              // not_available
          amenities: null,           // not_available
          
          // Operational reference data - always authoritative from PMS
          room_types: extractedRoomTypes,
          rate_types: Array.from(extractedRateTypes.values()),
          
          // Charge types and payment types - TODO: implement when Benson provides endpoint
          // For now returning empty arrays as endpoint not available
          charge_types: [],
          payment_types: [],
          
          // Check-in/out times - not available from Benson availability API
          check_in_time: null,
          check_out_time: null,
          
          // Star rating - not available from Benson
          star_rating: null,
          
          // Property capacity - not available (never auto-derived from room data per spec)
          max_guests: null,
        };
        break;

      case "get_current_rooms":
        result = await getCurrentRooms(creds, propertyCode);
        break;

      case "get_client_invoices":
        result = await getClientDefaultInvoices(creds, propertyCode);
        break;

      case "post_bill":
        result = await postBill(creds, propertyCode, params.bill);
        break;

      default:
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, `Unknown action: ${action}`, action)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Log the sync operation
    await supabase.from("sync_logs").insert({
      property_id: property_id,
      external_system: "benson",
      sync_type: action,
      status: "success",
      message: `Successfully executed ${action}`,
      request_data: body,
      response_data: typeof result === "object" ? result : { result },
    });

    // Return standardized adapter response
    return new Response(
      JSON.stringify(createSuccessResponse(result, action)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Benson API error:", error);
    
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase.from("sync_logs").insert({
        external_system: "benson",
        sync_type: "error",
        status: "error",
        message: error.message,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    // Parse error message for standardized error code
    const errorMsg = error.message || "";
    let errorCode: string = ERROR_CODES.INTERNAL_ADAPTER_ERROR;
    let userMessage = "An error occurred processing your request";
    let statusCode = 500;

    if (errorMsg.includes("401")) {
      errorCode = ERROR_CODES.AUTH_FAILED;
      userMessage = "Authentication failed. Please verify your Benson username and password in API Keys settings.";
      statusCode = 401;
    } else if (errorMsg.includes("404")) {
      errorCode = ERROR_CODES.NOT_FOUND;
      userMessage = "Benson API endpoint not found. Please verify the property code and API URL are correct.";
      statusCode = 404;
    } else if (errorMsg.includes("403")) {
      errorCode = ERROR_CODES.ACCESS_DENIED;
      userMessage = "Access denied. Your Benson account may not have API access enabled.";
      statusCode = 403;
    }

    return new Response(
      JSON.stringify(createErrorResponse(errorCode, userMessage, action, errorMsg)),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
