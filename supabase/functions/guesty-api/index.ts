import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// GUESTY API ADAPTER
// OAuth2 client_credentials flow → Bearer token
// Docs: https://open-api-docs.guesty.com/
// Base URL: https://open-api.guesty.com/v1
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  AUTH_FAILED: "AUTH_FAILED",
  ACCESS_DENIED: "ACCESS_DENIED",
  NOT_FOUND: "NOT_FOUND",
  AVAILABILITY_CHANGED: "AVAILABILITY_CHANGED",
  BOOKING_REJECTED: "BOOKING_REJECTED",
  MODIFICATION_NOT_SUPPORTED: "MODIFICATION_NOT_SUPPORTED",
  CANCELLATION_NOT_SUPPORTED: "CANCELLATION_NOT_SUPPORTED",
  INTERNAL_ADAPTER_ERROR: "INTERNAL_ADAPTER_ERROR",
  PMS_UNAVAILABLE: "PMS_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

// ============================================================================
// CAPABILITY DECLARATION
// ============================================================================

const CAPABILITIES = {
  supports_live_availability: true,
  supports_rate_fetch: true,
  supports_create_booking: true,
  supports_modify_booking: false, // Guesty modify is complex (quote-based)
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
  return { success: true, data, error: null, source: "guesty", fetched_at: new Date().toISOString(), action };
}

function createErrorResponse(code: string, message: string, action: string, details?: unknown): AdapterResponse<null> {
  return { success: false, data: null, error: { code, message, details }, source: "guesty", fetched_at: new Date().toISOString(), action };
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
    "fetch_listings",
    "fetch_listing",
    "create_reservation",
    "cancel_reservation",
    "get_reservations",
    "get_reservation",
  ]),
  property_id: z.string().uuid().optional(),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  reservation_data: z.object({
    listing_id: z.string().min(1),
    check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["reserved", "confirmed", "inquiry"]).default("reserved"),
    guest: z.object({
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }),
    money: z.object({
      fare_accommodation: z.number().min(0),
      currency: z.string().length(3).default("USD"),
    }).optional(),
    guests_count: z.number().min(1).optional(),
    notes: z.string().optional(),
  }),
});

const cancelReservationSchema = baseRequestSchema.extend({
  action: z.literal("cancel_reservation"),
  reservation_id: z.string().min(1),
});

const getReservationsSchema = baseRequestSchema.extend({
  action: z.literal("get_reservations"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  listing_id: z.string().optional(),
});

// ============================================================================
// GUESTY API CONFIG & AUTH
// ============================================================================

const GUESTY_API_URL = "https://open-api.guesty.com/v1";
const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";

interface GuestyCredentials {
  client_id: string;
  client_secret: string;
  guesty_account_id?: string;
}

// In-memory token cache (per isolate)
let cachedToken: { token: string; expires_at: number } | null = null;

async function getAccessToken(creds: GuestyCredentials): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
    return cachedToken.token;
  }

  console.log("[Guesty] Requesting new OAuth2 access token...");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "open-api",
    client_id: creds.client_id,
    client_secret: creds.client_secret,
  });

  const response = await fetch(GUESTY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Guesty] Token request failed: ${response.status} - ${errorText}`);
    throw new Error(`OAuth2 token request failed: ${response.status}`);
  }

  const data = await response.json();
  const expiresIn = data.expires_in || 86400; // Default 24h

  cachedToken = {
    token: data.access_token,
    expires_at: Date.now() + expiresIn * 1000,
  };

  console.log(`[Guesty] Token acquired, expires in ${expiresIn}s`);
  return cachedToken.token;
}

function getHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ============================================================================
// GUESTY API FUNCTIONS
// ============================================================================

async function guestyFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${GUESTY_API_URL}${path}`;
  console.log(`[Guesty] ${options.method || "GET"} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(token),
      ...(options.headers as Record<string, string> || {}),
    },
  });

  console.log(`[Guesty] Response: ${response.status}`);
  return response;
}

// --- Health Check ---
async function healthCheck(creds: GuestyCredentials): Promise<any> {
  const token = await getAccessToken(creds);
  const response = await guestyFetch("/listings?limit=1&fields=_id nickname", token);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Guesty health check failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    status: "ok",
    healthy: true,
    listings_count: data.count ?? data.results?.length ?? 0,
    message: "Connection successful",
  };
}

// --- Fetch Listings (room types equivalent) ---
async function fetchListings(creds: GuestyCredentials, guestyAccountId?: string): Promise<any> {
  const token = await getAccessToken(creds);
  const params = new URLSearchParams({
    limit: "100",
    fields: "_id nickname title address bedrooms bathrooms beds accommodates propertyType prices pictures tags active listed",
  });
  if (guestyAccountId) {
    params.set("accountId", guestyAccountId);
  }

  const response = await guestyFetch(`/listings?${params}`, token);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Guesty listings error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  // Normalize to room_types shape
  const room_types = (data.results || []).map((listing: any) => ({
    id: listing._id,
    name: listing.nickname || listing.title || "Unnamed",
    property_type: listing.propertyType,
    max_guests: listing.accommodates,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    beds: listing.beds,
    base_rate: listing.prices?.basePrice,
    currency: listing.prices?.currency,
    thumbnail_url: listing.pictures?.[0]?.thumbnail || listing.pictures?.[0]?.original,
    is_active: listing.active && listing.listed,
    tags: listing.tags,
    raw_data: listing,
  }));

  return { room_types, total: data.count || room_types.length };
}

// --- Fetch Single Listing ---
async function fetchListing(creds: GuestyCredentials, listingId: string): Promise<any> {
  const token = await getAccessToken(creds);
  const response = await guestyFetch(`/listings/${listingId}`, token);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Guesty listing error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// --- Fetch Availability (calendar) ---
async function fetchAvailability(
  creds: GuestyCredentials,
  listingId: string,
  startDate: string,
  endDate: string
): Promise<any> {
  const token = await getAccessToken(creds);

  // Guesty availability via listings endpoint with date filters
  const params = new URLSearchParams({
    limit: "100",
    fields: "_id nickname title accommodates prices pictures active listed",
    available: "true",
    "availabilityFrom": startDate,
    "availabilityTo": endDate,
  });

  const response = await guestyFetch(`/listings?${params}`, token);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Guesty availability error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Also try calendar endpoint for specific listing
  let calendarData: any[] = [];
  if (listingId && listingId !== "all") {
    try {
      const calResponse = await guestyFetch(
        `/availability-pricing/api/calendar/listings/${listingId}?startDate=${startDate}&endDate=${endDate}`,
        token
      );
      if (calResponse.ok) {
        const cal = await calResponse.json();
        calendarData = cal.data?.days || cal.days || [];
      }
    } catch (e) {
      console.log(`[Guesty] Calendar endpoint not available: ${e}`);
    }
  }

  // Normalize to standard availability shape
  const room_types = (data.results || []).map((listing: any) => ({
    id: listing._id,
    name: listing.nickname || listing.title || "Unnamed",
    max_guests: listing.accommodates,
    base_rate: listing.prices?.basePrice,
    currency: listing.prices?.currency,
    is_available: true,
    thumbnail_url: listing.pictures?.[0]?.thumbnail,
  }));

  return {
    room_types,
    calendar: calendarData,
    date_range: { start: startDate, end: endDate },
    total_available: room_types.length,
  };
}

// --- Create Reservation ---
async function createReservation(creds: GuestyCredentials, reservationData: any): Promise<any> {
  const token = await getAccessToken(creds);

  // Map to Guesty reservation format
  const guestyPayload: any = {
    listingId: reservationData.listing_id,
    checkInDateLocalized: reservationData.check_in,
    checkOutDateLocalized: reservationData.check_out,
    status: reservationData.status || "reserved",
    guest: {
      firstName: reservationData.guest.first_name,
      lastName: reservationData.guest.last_name,
      email: reservationData.guest.email,
      phone: reservationData.guest.phone,
    },
  };

  if (reservationData.money) {
    guestyPayload.money = {
      fareAccommodation: reservationData.money.fare_accommodation,
      currency: reservationData.money.currency || "USD",
    };
  }

  if (reservationData.guests_count) {
    guestyPayload.guestsCount = reservationData.guests_count;
  }

  if (reservationData.notes) {
    guestyPayload.note = reservationData.notes;
  }

  const response = await guestyFetch("/reservations", token, {
    method: "POST",
    body: JSON.stringify(guestyPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Guesty create reservation error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  return {
    reservation_id: result._id || result.id,
    confirmation_code: result.confirmationCode,
    status: result.status,
    listing_id: result.listingId,
    check_in: result.checkInDateLocalized,
    check_out: result.checkOutDateLocalized,
    guest_name: `${result.guest?.firstName || ""} ${result.guest?.lastName || ""}`.trim(),
    raw_data: result,
  };
}

// --- Cancel Reservation ---
async function cancelReservation(creds: GuestyCredentials, reservationId: string): Promise<any> {
  const token = await getAccessToken(creds);

  // Guesty uses PUT to update status to "canceled"
  const response = await guestyFetch(`/reservations/${reservationId}`, token, {
    method: "PUT",
    body: JSON.stringify({ status: "canceled" }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Guesty cancel reservation error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return {
    reservation_id: reservationId,
    status: "canceled",
    confirmation_code: result.confirmationCode,
    raw_data: result,
  };
}

// --- Get Reservations ---
async function getReservations(
  creds: GuestyCredentials,
  startDate?: string,
  endDate?: string,
  listingId?: string
): Promise<any> {
  const token = await getAccessToken(creds);

  const params = new URLSearchParams({
    limit: "100",
    fields: "_id confirmationCode status listingId checkIn checkOut guestsCount guest money",
    sort: "-checkIn",
  });

  if (startDate) params.set("checkInFrom", startDate);
  if (endDate) params.set("checkInTo", endDate);
  if (listingId) params.set("listingId", listingId);

  const response = await guestyFetch(`/reservations?${params}`, token);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Guesty get reservations error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const reservations = (data.results || []).map((r: any) => ({
    reservation_id: r._id,
    confirmation_code: r.confirmationCode,
    status: r.status,
    listing_id: r.listingId,
    check_in: r.checkIn,
    check_out: r.checkOut,
    guests_count: r.guestsCount,
    guest_name: r.guest ? `${r.guest.firstName || ""} ${r.guest.lastName || ""}`.trim() : null,
    total: r.money?.hostPayout || r.money?.fareAccommodation,
    currency: r.money?.currency,
  }));

  return { reservations, total: data.count || reservations.length };
}

// --- Get Single Reservation ---
async function getReservation(creds: GuestyCredentials, reservationId: string): Promise<any> {
  const token = await getAccessToken(creds);
  const response = await guestyFetch(`/reservations/${reservationId}`, token);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Guesty get reservation error: ${response.status} - ${errorText}`);
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
    // Guesty uses OAuth2: client_id + client_secret → Bearer token
    // Stored in pms_credentials as: api_key = client_id, api_secret = client_secret
    // ========================================================================

    async function resolveCredentials(propertyId?: string): Promise<GuestyCredentials> {
      // Try property-specific first
      if (propertyId) {
        const { data: creds } = await supabase
          .from("pms_credentials")
          .select("*")
          .eq("system_type", "guesty")
          .eq("property_id", propertyId)
          .eq("is_active", true)
          .maybeSingle();

        if (creds?.api_key && creds?.api_secret) {
          return {
            client_id: creds.api_key,
            client_secret: creds.api_secret,
            guesty_account_id: creds.external_property_id || undefined,
          };
        }
      }

      // Fall back to global guesty credentials
      const { data: globalCreds } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "guesty")
        .eq("is_active", true)
        .is("property_id", null)
        .limit(1)
        .maybeSingle();

      if (!globalCreds?.api_key || !globalCreds?.api_secret) {
        throw new Error("Guesty credentials not configured. Store client_id in api_key and client_secret in api_secret.");
      }

      return {
        client_id: globalCreds.api_key,
        client_secret: globalCreds.api_secret,
        guesty_account_id: globalCreds.external_property_id || undefined,
      };
    }

    // ========================================================================
    // ACTION DISPATCH
    // ========================================================================

    switch (action) {
      case "health_check":
      case "test_connection": {
        try {
          const creds = await resolveCredentials(property_id);
          const result = await healthCheck(creds);
          return new Response(
            JSON.stringify(createSuccessResponse(result, action)),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (error: any) {
          const code = error.message?.includes("401") || error.message?.includes("credentials")
            ? ERROR_CODES.AUTH_FAILED
            : ERROR_CODES.PMS_UNAVAILABLE;
          return new Response(
            JSON.stringify(createErrorResponse(code, error.message || "Health check failed", action)),
            { status: code === ERROR_CODES.AUTH_FAILED ? 401 : 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      case "fetch_listings": {
        const creds = await resolveCredentials(property_id);
        const result = await fetchListings(creds, creds.guesty_account_id);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_listing": {
        if (!normalizedBody.listing_id) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "listing_id is required", action)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const creds = await resolveCredentials(property_id);
        const result = await fetchListing(creds, normalizedBody.listing_id);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_availability": {
        const validation = fetchAvailabilitySchema.safeParse(normalizedBody);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid availability params", action, validation.error.issues)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const creds = await resolveCredentials(property_id);
        const listingId = normalizedBody.listing_id || "all";
        const result = await fetchAvailability(creds, listingId, normalizedBody.start_date, normalizedBody.end_date);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
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
        const creds = await resolveCredentials(property_id);
        const result = await createReservation(creds, validation.data.reservation_data);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cancel_reservation": {
        const validation = cancelReservationSchema.safeParse(normalizedBody);
        if (!validation.success) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "reservation_id is required", action)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const creds = await resolveCredentials(property_id);
        const result = await cancelReservation(creds, validation.data.reservation_id);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_reservations": {
        const creds = await resolveCredentials(property_id);
        const result = await getReservations(
          creds,
          normalizedBody.start_date,
          normalizedBody.end_date,
          normalizedBody.listing_id
        );
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_reservation": {
        if (!normalizedBody.reservation_id) {
          return new Response(
            JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "reservation_id is required", action)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const creds = await resolveCredentials(property_id);
        const result = await getReservation(creds, normalizedBody.reservation_id);
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
    console.error(`[Guesty] Unhandled error in ${action}:`, error);

    const isAuth = error.message?.includes("401") || error.message?.includes("credentials") || error.message?.includes("token");
    const code = isAuth ? ERROR_CODES.AUTH_FAILED : ERROR_CODES.INTERNAL_ADAPTER_ERROR;
    const status = isAuth ? 401 : 500;

    return new Response(
      JSON.stringify(createErrorResponse(code, error.message || "Internal adapter error", action)),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
