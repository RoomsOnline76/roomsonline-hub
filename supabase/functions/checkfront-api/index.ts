import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

// Input validation schemas
const baseRequestSchema = z.object({
  action: z.enum([
    'get_items',
    'get_item_details',
    'get_item_availability',
    'create_booking',
    'get_bookings',
    'get_booking_details',
    'update_booking',
    'cancel_booking',
    'test_connection',
    'health_check',  // Added for system health monitoring
    'fetch_property_data'  // Added per v1.1 spec
  ]),
  property_id: z.string().uuid().optional(),
  item_id: z.string().optional(),
  category_id: z.string().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  booking_id: z.string().optional(),
  booking_data: z.record(z.unknown()).optional(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CHECKFRONT API CLIENT - Supports both Token Pair and OAuth2 authentication
// Docs: https://api.checkfront.com/
// ============================================================================

interface CheckfrontCredentials {
  host: string;
  authMode: "token_pair" | "oauth2";
  // Token pair auth
  apiKey?: string;
  apiSecret?: string;
  // OAuth2 auth
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  connectionId?: string;
}

interface CheckfrontResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

// Build the base URL for Checkfront API calls
const getBaseUrl = (host: string): string => {
  // Ensure host doesn't have protocol and add it
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${cleanHost}/api/3.0`;
};

// Build Authorization header for Token Pair auth (Basic Auth with base64)
const getTokenPairAuthHeader = (apiKey: string, apiSecret: string): string => {
  const credentials = btoa(`${apiKey}:${apiSecret}`);
  return `Basic ${credentials}`;
};

// Build Authorization header for OAuth2
const getOAuth2AuthHeader = (accessToken: string): string => {
  return `Bearer ${accessToken}`;
};

// Check if OAuth2 token needs refresh (within 5 minutes of expiry)
const needsTokenRefresh = (expiresAt: Date | undefined): boolean => {
  if (!expiresAt) return true;
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  return expiresAt <= fiveMinutesFromNow;
};

// Refresh OAuth2 access token
async function refreshOAuth2Token(
  supabase: any,
  connectionId: string,
  refreshToken: string,
  host: string
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  console.log(`Refreshing OAuth2 token for connection ${connectionId}`);
  
  // Get OAuth2 credentials from pms_credentials
  const { data: creds } = await supabase
    .from("pms_credentials")
    .select("*")
    .eq("system_type", "checkfront")
    .eq("is_active", true)
    .single();

  if (!creds?.api_key || !creds?.agent_code) {
    console.error("Checkfront OAuth2 client credentials not configured");
    return null;
  }

  const clientId = creds.api_key; // Repurposed as OAuth client ID
  const clientSecret = creds.agent_code; // Repurposed as OAuth client secret

  try {
    const tokenUrl = `https://${host}/oauth/token`;
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      console.error(`OAuth2 token refresh failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    // Update the connection with new tokens
    await supabase
      .from("checkfront_connections")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_at: expiresAt.toISOString(),
      })
      .eq("id", connectionId);

    console.log(`OAuth2 token refreshed successfully`);
    return { accessToken: data.access_token, expiresAt };
  } catch (error) {
    console.error("OAuth2 token refresh error:", error);
    return null;
  }
}

// Make authenticated API call to Checkfront
async function checkfrontFetch<T>(
  supabase: any,
  creds: CheckfrontCredentials,
  endpoint: string,
  options: RequestInit = {}
): Promise<CheckfrontResponse<T>> {
  const baseUrl = getBaseUrl(creds.host);
  const url = `${baseUrl}${endpoint}`;

  let authHeader: string;

  if (creds.authMode === "token_pair") {
    if (!creds.apiKey || !creds.apiSecret) {
      return { success: false, error: "Token pair credentials not configured" };
    }
    authHeader = getTokenPairAuthHeader(creds.apiKey, creds.apiSecret);
  } else {
    // OAuth2 - check if token needs refresh
    if (needsTokenRefresh(creds.expiresAt) && creds.refreshToken && creds.connectionId) {
      const refreshed = await refreshOAuth2Token(
        supabase,
        creds.connectionId,
        creds.refreshToken,
        creds.host
      );
      if (refreshed) {
        creds.accessToken = refreshed.accessToken;
        creds.expiresAt = refreshed.expiresAt;
      } else {
        return { success: false, error: "Failed to refresh OAuth2 token" };
      }
    }
    if (!creds.accessToken) {
      return { success: false, error: "OAuth2 access token not available" };
    }
    authHeader = getOAuth2AuthHeader(creds.accessToken);
  }

  console.log(`Checkfront API call: ${options.method || "GET"} ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(options.headers || {}),
      },
    });

    const responseText = await response.text();
    let data: any;
    
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    if (!response.ok) {
      console.error(`Checkfront API error: ${response.status} - ${responseText}`);
      return { 
        success: false, 
        error: data?.error?.message || `API error: ${response.status}`,
        status: response.status 
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Checkfront fetch error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

// ============================================================================
// CHECKFRONT API METHODS
// ============================================================================

// Get items (room types/inventory items)
async function getItems(
  supabase: any,
  creds: CheckfrontCredentials,
  params: { category_id?: string; limit?: number; page?: number } = {}
): Promise<CheckfrontResponse<any>> {
  const searchParams = new URLSearchParams();
  if (params.category_id) searchParams.set("category_id", params.category_id);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.page) searchParams.set("page", params.page.toString());
  
  const query = searchParams.toString();
  return checkfrontFetch(supabase, creds, `/item${query ? `?${query}` : ""}`);
}

// Get item details
async function getItemDetails(
  supabase: any,
  creds: CheckfrontCredentials,
  itemId: string
): Promise<CheckfrontResponse<any>> {
  return checkfrontFetch(supabase, creds, `/item/${itemId}`);
}

// Get item availability/calendar
async function getItemAvailability(
  supabase: any,
  creds: CheckfrontCredentials,
  params: {
    item_id?: string;
    start_date: string;
    end_date: string;
    category_id?: string;
  }
): Promise<CheckfrontResponse<any>> {
  const searchParams = new URLSearchParams({
    start_date: params.start_date,
    end_date: params.end_date,
  });
  if (params.category_id) searchParams.set("category_id", params.category_id);
  
  const endpoint = params.item_id 
    ? `/item/${params.item_id}/cal?${searchParams}` 
    : `/item/cal?${searchParams}`;
  
  return checkfrontFetch(supabase, creds, endpoint);
}

// Get rated item (with pricing for specific dates/guests)
async function getRatedItem(
  supabase: any,
  creds: CheckfrontCredentials,
  itemId: string,
  params: {
    start_date: string;
    end_date: string;
    param?: Record<string, number>; // e.g. { adults: 2, children: 1 }
  }
): Promise<CheckfrontResponse<any>> {
  const searchParams = new URLSearchParams({
    start_date: params.start_date,
    end_date: params.end_date,
  });
  
  // Add guest params
  if (params.param) {
    Object.entries(params.param).forEach(([key, value]) => {
      searchParams.set(`param[${key}]`, value.toString());
    });
  }
  
  return checkfrontFetch(supabase, creds, `/item/${itemId}?${searchParams}`);
}

// Start/update booking session with SLIPs
async function startBookingSession(
  supabase: any,
  creds: CheckfrontCredentials,
  slips: string[],
  sessionId?: string
): Promise<CheckfrontResponse<any>> {
  const body: any = {};
  slips.forEach((slip, index) => {
    body[`slip[${index}]`] = slip;
  });
  if (sessionId) {
    body.session_id = sessionId;
  }

  return checkfrontFetch(supabase, creds, "/booking/session", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Get booking form fields
async function getBookingForm(
  supabase: any,
  creds: CheckfrontCredentials,
  sessionId: string
): Promise<CheckfrontResponse<any>> {
  return checkfrontFetch(supabase, creds, `/booking/form?session_id=${sessionId}`);
}

// Create booking from session
async function createBooking(
  supabase: any,
  creds: CheckfrontCredentials,
  sessionId: string,
  formData: Record<string, any>
): Promise<CheckfrontResponse<any>> {
  const body = {
    session_id: sessionId,
    ...formData,
  };

  return checkfrontFetch(supabase, creds, "/booking/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Get bookings list
async function getBookings(
  supabase: any,
  creds: CheckfrontCredentials,
  params: {
    start_date?: string;
    end_date?: string;
    status?: string;
    customer_id?: string;
    limit?: number;
    page?: number;
  } = {}
): Promise<CheckfrontResponse<any>> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, value.toString());
  });
  
  const query = searchParams.toString();
  return checkfrontFetch(supabase, creds, `/booking${query ? `?${query}` : ""}`);
}

// Get booking details
async function getBookingDetails(
  supabase: any,
  creds: CheckfrontCredentials,
  bookingId: string
): Promise<CheckfrontResponse<any>> {
  return checkfrontFetch(supabase, creds, `/booking/${bookingId}`);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    
    // Validate request body
    const validationResult = baseRequestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid request parameters", 
          details: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { action, property_id, ...params } = body;

    console.log(`Checkfront API action: ${action}, property_id: ${property_id}`);

    // Handle health_check/test_connection without property - just validate credentials
    if ((action === "health_check" || action === "test_connection") && !property_id) {
      console.log(`[Checkfront] Standalone health check - no property_id provided`);
      
      // Get Checkfront credentials from pms_credentials
      const { data: pmsCredentials } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "checkfront")
        .eq("is_active", true)
        .maybeSingle();

      if (!pmsCredentials || !pmsCredentials.api_key) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Checkfront credentials not configured",
            source: "checkfront",
            action 
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use demo host or first connected property's host
      const { data: connection } = await supabase
        .from("checkfront_connections")
        .select("host")
        .limit(1)
        .maybeSingle();

      const host = connection?.host || pmsCredentials.base_url || "demo.checkfront.com";
      
      const creds: CheckfrontCredentials = {
        host,
        authMode: "token_pair",
        apiKey: pmsCredentials.api_key,
        apiSecret: pmsCredentials.agent_code,
      };

      try {
        const result = await getItems(supabase, creds, { limit: 1 });
        
        if (result.success) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              data: { 
                status: "ok", 
                healthy: true, 
                host,
                message: "Connection successful" 
              },
              source: "checkfront",
              action 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: result.error || "Connection test failed",
              source: "checkfront",
              action 
            }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (error: any) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: error.message || "Health check failed",
            source: "checkfront",
            action 
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Checkfront credentials - first check for OAuth2 connection
    let creds: CheckfrontCredentials | null = null;

    if (property_id) {
      // Check for OAuth2 connection first
      const { data: connection } = await supabase
        .from("checkfront_connections")
        .select("*")
        .eq("property_id", property_id)
        .single();

      if (connection) {
        creds = {
          host: connection.host,
          authMode: connection.auth_mode as "token_pair" | "oauth2",
          accessToken: connection.access_token,
          refreshToken: connection.refresh_token,
          expiresAt: connection.expires_at ? new Date(connection.expires_at) : undefined,
          connectionId: connection.id,
        };
      }
    }

    // Fallback to token pair from pms_credentials
    if (!creds) {
      const { data: pmsCredentials } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "checkfront")
        .eq("is_active", true)
        .single();

      if (!pmsCredentials) {
        return new Response(
          JSON.stringify({ error: "Checkfront credentials not configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get property host from properties table
      let host = "demo.checkfront.com"; // Default fallback
      if (property_id) {
        const { data: property } = await supabase
          .from("properties")
          .select("checkfront_property_code, amenities")
          .eq("id", property_id)
          .single();
        
        if (property?.amenities?.checkfront_host) {
          host = property.amenities.checkfront_host;
        }
      }

      creds = {
        host,
        authMode: "token_pair",
        apiKey: pmsCredentials.api_key,
        apiSecret: pmsCredentials.agent_code, // Secret stored in agent_code field
      };
    }

    let result: CheckfrontResponse<any>;

    switch (action) {
      case "get_items":
        result = await getItems(supabase, creds, params);
        break;

      case "get_item_details":
        if (!params.item_id) {
          return new Response(
            JSON.stringify({ error: "item_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await getItemDetails(supabase, creds, params.item_id);
        break;

      case "get_availability":
        if (!params.start_date || !params.end_date) {
          return new Response(
            JSON.stringify({ error: "start_date and end_date are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await getItemAvailability(supabase, creds, {
          item_id: params.item_id,
          start_date: params.start_date,
          end_date: params.end_date,
          category_id: params.category_id,
        });
        
        // Cache availability data if successful
        if (result.success && result.data && property_id) {
          await cacheAvailabilityData(supabase, property_id, result.data, params.start_date, params.end_date);
        }
        break;

      case "get_rated_item":
        if (!params.item_id || !params.start_date || !params.end_date) {
          return new Response(
            JSON.stringify({ error: "item_id, start_date, and end_date are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await getRatedItem(supabase, creds, params.item_id, {
          start_date: params.start_date,
          end_date: params.end_date,
          param: params.guests,
        });
        break;

      case "start_session":
        if (!params.slips || !Array.isArray(params.slips)) {
          return new Response(
            JSON.stringify({ error: "slips array is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await startBookingSession(supabase, creds, params.slips, params.session_id);
        break;

      case "get_booking_form":
        if (!params.session_id) {
          return new Response(
            JSON.stringify({ error: "session_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await getBookingForm(supabase, creds, params.session_id);
        break;

      case "create_booking":
        if (!params.session_id || !params.form_data) {
          return new Response(
            JSON.stringify({ error: "session_id and form_data are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await createBooking(supabase, creds, params.session_id, params.form_data);
        
        // Store booking in local database if successful
        if (result.success && result.data && property_id) {
          await storeBookingLocally(supabase, property_id, result.data, params.form_data);
        }
        break;

      case "get_bookings":
        result = await getBookings(supabase, creds, params);
        
        // Sync bookings to local database if successful
        if (result.success && result.data && property_id) {
          await syncBookingsToLocal(supabase, property_id, result.data);
        }
        break;

      case "get_booking_details":
        if (!params.booking_id) {
          return new Response(
            JSON.stringify({ error: "booking_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await getBookingDetails(supabase, creds, params.booking_id);
        break;

      case "health_check":
        // Simple health check - try to get items
        result = await getItems(supabase, creds, { limit: 1 });
        break;

      case "fetch_property_data": {
        // ============================================================================
        // CHECKFRONT fetch_property_data - per v1.1 pms-implementation-master.json:
        // - name: authoritative
        // - description: seed_only
        // - location: not_available
        // - images: not_available
        // ============================================================================
        console.log(`[Checkfront] Fetching property data for ${property_id}`);
        
        // Get items (room types) from Checkfront
        const itemsResult = await getItems(supabase, creds, {});
        const items = itemsResult.success ? (itemsResult.data?.items || []) : [];
        
        // Transform items to room types
        const roomTypes = Object.values(items as Record<string, any>).map((item: any) => ({
          room_type_id: item.item_id?.toString() || "",
          name: item.name || `Item ${item.item_id}`,
          description: item.summary || item.description || null,
          min_guests: item.param?.min || 1,
          max_guests: item.param?.max || item.stock || 2,
          guest_rules: {
            allow_teens: true,
            teen_min_age: null,
            teen_max_age: null,
            allow_children: true,
            child_min_age: null,
            child_max_age: null,
            allow_infants: true,
            infant_min_age: null,
            infant_max_age: null,
          },
          linked_rate_type_ids: [],
        }));
        
        // Extract property-level data from account info if available
        // Checkfront doesn't expose property name via items API
        // Description is seed_only per spec
        const firstItem = Object.values(items as Record<string, any>)[0];
        const propertyDescription = firstItem?.category?.summary || null;
        
        // Return PropertyDataResponse per adapter-contract.ts
        result = {
          success: true,
          data: {
            // Editorial fields per v1.1 spec
            property_name: null,           // would need separate API call
            description: propertyDescription, // seed_only
            location: null,                // not_available
            geo: null,                     // not_available
            images: null,                  // not_available
            amenities: null,               // not_available
            
            // Operational reference data
            room_types: roomTypes,
            rate_types: [],                // Checkfront uses per-item pricing
            
            // Global fields
            charge_types: [],
            payment_types: [],
            check_in_time: null,
            check_out_time: null,
            star_rating: null,
            max_guests: null,
          }
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Log the sync operation
    await supabase.from("sync_logs").insert({
      property_id: property_id || null,
      external_system: "checkfront",
      sync_type: action,
      status: result.success ? "success" : "error",
      message: result.error || `${action} completed successfully`,
      request_data: { action, ...params },
      response_data: result.success ? { data_keys: Object.keys(result.data || {}) } : { error: result.error },
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: result.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(result.data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Checkfront API error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS FOR DATA SYNC
// ============================================================================

async function cacheAvailabilityData(
  supabase: any,
  propertyId: string,
  data: any,
  startDate: string,
  endDate: string
) {
  try {
    const items = data.items || data.item || {};
    
    for (const [itemId, itemData] of Object.entries(items as Record<string, any>)) {
      const calendar = itemData.calendar || {};
      
      for (const [date, dayData] of Object.entries(calendar as Record<string, any>)) {
        await supabase.from("pms_availability_cache").upsert({
          property_id: propertyId,
          system_type: "checkfront",
          external_room_type_id: itemId,
          date: date,
          available_units: dayData.available || 0,
          restrictions: {
            min_stay: dayData.min_stay,
            max_stay: dayData.max_stay,
            closed: dayData.closed,
          },
          rates: dayData.rate ? { base_rate: dayData.rate } : null,
          raw_data: dayData,
          fetched_at: new Date().toISOString(),
        }, {
          onConflict: "property_id,system_type,external_room_type_id,date"
        });
      }
    }
    
    console.log(`Cached availability data for property ${propertyId}`);
  } catch (error) {
    console.error("Error caching availability:", error);
  }
}

async function storeBookingLocally(
  supabase: any,
  propertyId: string,
  checkfrontBooking: any,
  formData: any
) {
  try {
    const bookingCode = checkfrontBooking.booking?.code || checkfrontBooking.code;
    
    await supabase.from("pms_reservations").upsert({
      property_id: propertyId,
      system_type: "checkfront",
      external_reservation_id: bookingCode,
      status: checkfrontBooking.booking?.status || "PEND",
      arrival_date: formData.start_date,
      departure_date: formData.end_date,
      contact_name: formData.customer_name || formData.name,
      contact_email: formData.customer_email || formData.email,
      contact_phone: formData.customer_phone || formData.phone,
      total_amount: checkfrontBooking.booking?.total || null,
      currency: checkfrontBooking.booking?.currency || "ZAR",
      raw_data: checkfrontBooking,
      synced_at: new Date().toISOString(),
    }, {
      onConflict: "property_id,system_type,external_reservation_id"
    });
    
    console.log(`Stored booking ${bookingCode} locally`);
  } catch (error) {
    console.error("Error storing booking locally:", error);
  }
}

async function syncBookingsToLocal(
  supabase: any,
  propertyId: string,
  data: any
) {
  try {
    const bookings = data.bookings || data.booking || [];
    const bookingList = Array.isArray(bookings) ? bookings : Object.values(bookings);
    
    for (const booking of bookingList) {
      await supabase.from("pms_reservations").upsert({
        property_id: propertyId,
        system_type: "checkfront",
        external_reservation_id: booking.code || booking.id,
        status: booking.status,
        arrival_date: booking.start_date,
        departure_date: booking.end_date,
        contact_name: booking.customer?.name,
        contact_email: booking.customer?.email,
        contact_phone: booking.customer?.phone,
        total_amount: booking.total,
        currency: booking.currency || "ZAR",
        raw_data: booking,
        synced_at: new Date().toISOString(),
      }, {
        onConflict: "property_id,system_type,external_reservation_id"
      });
    }
    
    console.log(`Synced ${bookingList.length} bookings for property ${propertyId}`);
  } catch (error) {
    console.error("Error syncing bookings:", error);
  }
}
