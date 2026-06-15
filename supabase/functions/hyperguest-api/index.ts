import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// HYPERGUEST API ADAPTER
// Follows the standardized adapter contract from adapter-contract.ts
// HyperGuest Native PULL integration for distribution channel connectivity
//
// Authentication: API Key based (X-Api-Key header)
// Docs: https://docs.hyperguest.com
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
  supports_cancel_booking: true,
  supports_webhooks: false,
  supports_static_data_pull: true,
  supports_prebook: true,
  supports_nationality_search: true,
  supports_multi_room: true,
  supports_multi_rate: true,
  supports_bar_net_rates: true,
};

// HyperGuest certified endpoints (same hosts for sandbox/production;
// the sandbox is scoped by the auth token).
const HG_ENDPOINTS = {
  static: 'https://hg-static.hyperguest.com',
  search: 'https://search-api.hyperguest.io/2.0',
  book:   'https://book-api.hyperguest.com/2.0',
};

// Booking requests may take up to 300s per HG spec.
const BOOKING_TIMEOUT_MS = 300_000;
const STANDARD_TIMEOUT_MS = 60_000;
const CERTIFICATION_HOTEL_ID = '19912';

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
    source: "hyperguest",
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
    source: "hyperguest",
    fetched_at: new Date().toISOString(),
    action,
  };
}

// ============================================================================
// INPUT VALIDATION SCHEMAS
// ============================================================================

const baseRequestSchema = z.object({
  action: z.enum([
    "get_capabilities",
    "health_check",
    "fetch_availability",
    "prebook",
    "create_reservation",
    "cancel_reservation",
    "get_reservations",
    "get_room_types",
    "get_rate_types",
    "fetch_static_data",
  ]),
  property_id: z.string().uuid({ message: "Invalid property ID format" }).optional(),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  property_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Start date must be YYYY-MM-DD" }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be YYYY-MM-DD" }),
  occupancy: z.object({
    rooms: z.number().min(1).default(1),
    adults: z.number().min(1).default(2),
    children: z.number().min(0).default(0),
    children_ages: z.array(z.number()).optional(),
  }).optional(),
  nationality: z.string().length(2).optional(), // ISO 3166-1 alpha-2
  currency: z.string().length(3).optional(), // ISO 4217
});

const prebookSchema = baseRequestSchema.extend({
  action: z.literal("prebook"),
  property_id: z.string().uuid(),
  rate_key: z.string().min(1, "Rate key from availability search required"),
  rooms: z.array(z.object({
    room_code: z.string(),
    rate_code: z.string(),
    adults: z.number().min(1),
    children: z.number().min(0).default(0),
    children_ages: z.array(z.number()).optional(),
  })),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  property_id: z.string().uuid(),
  reservation_data: z.object({
    rate_key: z.string().min(1, "Rate key from prebook required"),
    holder: z.object({
      name: z.string().min(1),
      surname: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      nationality: z.string().length(2).optional(),
    }),
    rooms: z.array(z.object({
      room_code: z.string(),
      rate_code: z.string(),
      paxes: z.array(z.object({
        type: z.enum(["AD", "CH"]),
        name: z.string().optional(),
        surname: z.string().optional(),
        age: z.number().optional(),
      })),
      special_requests: z.string().optional(),
    })),
    client_reference: z.string().optional(),
    remarks: z.string().optional(),
  }),
});

const cancelReservationSchema = baseRequestSchema.extend({
  action: z.literal("cancel_reservation"),
  property_id: z.string().uuid(),
  reservation_id: z.string().min(1),
  cancellation_reason: z.string().optional(),
});

const getReservationsSchema = baseRequestSchema.extend({
  action: z.literal("get_reservations"),
  property_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reservation_id: z.string().optional(),
});

const fetchStaticDataSchema = baseRequestSchema.extend({
  action: z.literal("fetch_static_data"),
  property_id: z.string().uuid(),
  data_type: z.enum(["rooms", "rates", "all"]).default("all"),
});

// ============================================================================
// ENVIRONMENT & CREDENTIALS HELPER
// ============================================================================

interface HyperGuestCredentials {
  api_key: string;
  hotel_code: string;
  environment: "sandbox" | "production";
}

async function getCredentials(
  supabase: any,
  propertyId: string | null,
  overrides?: { hotel_id?: string; environment?: "sandbox" | "production" }
): Promise<HyperGuestCredentials> {
  // 1. Resolve environment — explicit override > property column > tracker > default sandbox
  let environment: "sandbox" | "production" = "sandbox";
  let propRow: any = null;

  if (propertyId) {
    const { data } = await supabase
      .from("properties")
      .select("hyperguest_hotel_id, hyperguest_environment, hyperguest_enabled")
      .eq("id", propertyId)
      .maybeSingle();
    propRow = data;
    if (data?.hyperguest_environment === "production") environment = "production";
  }

  if (!propRow) {
    const { data: tracker } = await supabase
      .from("pms_tracker_status")
      .select("active_environment, additional_info")
      .eq("system_type", "hyperguest")
      .maybeSingle();
    if (tracker?.active_environment === "production") environment = "production";
    propRow = propRow || { _tracker: tracker };
  }

  if (overrides?.environment) environment = overrides.environment;

  // 2. Token (env-scoped)
  const envSecret = environment === "production"
    ? Deno.env.get("HYPERGUEST_AUTH_TOKEN_PROD")
    : Deno.env.get("HYPERGUEST_AUTH_TOKEN");
  let apiKey = envSecret || null;

  if (!apiKey) {
    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("system_type", "hyperguest")
      .eq("key_name", "api_key")
      .maybeSingle();
    apiKey = apiKeyRow?.key_value ?? null;
  }

  if (!apiKey) {
    throw new Error(
      `HyperGuest auth token not configured for ${environment}. ` +
      `Add HYPERGUEST_AUTH_TOKEN${environment === 'production' ? '_PROD' : ''} secret.`
    );
  }

  // 3. Hotel code — overrides > property column > integration_configs > tracker demo > cert hotel (sandbox only)
  let hotelCode: string | null = overrides?.hotel_id || propRow?.hyperguest_hotel_id || null;

  if (!hotelCode && propertyId) {
    const { data: config } = await supabase
      .from("integration_configs")
      .select("config")
      .eq("property_id", propertyId)
      .eq("integration_type", "hyperguest")
      .maybeSingle();
    hotelCode = config?.config?.hotel_code ?? null;
  }

  if (!hotelCode) {
    hotelCode = propRow?._tracker?.additional_info?.demo_property_id
      || (environment === "sandbox" ? CERTIFICATION_HOTEL_ID : null);
  }

  if (!hotelCode) {
    throw new Error(
      `HyperGuest hotel code not configured${propertyId ? ` for property ${propertyId}` : ""}. ` +
      `Set properties.hyperguest_hotel_id or pass hotel_id in the request.`
    );
  }

  return {
    api_key: apiKey,
    hotel_code: String(hotelCode),
    environment,
  };
}

function getBaseUrl(_env: "sandbox" | "production"): string {
  // Legacy callers; default to the search-api host. New code should use
  // HG_ENDPOINTS.{static|search|book} directly.
  return HG_ENDPOINTS.search;
}

function getAuthHeaders(apiKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
    "User-Agent": "RoomsOnline/1.0",
  };
}

// fetch wrapper that enforces Accept-Encoding + per-call timeout.
async function hgFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = STANDARD_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Accept-Encoding": "gzip, deflate",
        ...(rest.headers as Record<string, string> | undefined),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

// ============================================================================
// API METHODS
// ============================================================================

async function healthCheck(creds: HyperGuestCredentials): Promise<any> {
  // Static endpoint is the canonical liveness check; it returns the hotel
  // catalogue and verifies our token + connectivity in one call.
  const response = await hgFetch(`${HG_ENDPOINTS.static}/hotels.json`, {
    headers: getAuthHeaders(creds.api_key),
  });

  if (!response.ok) {
    throw new Error(`HyperGuest health check failed: ${response.status}`);
  }

  // Confirm we can see the certification property in sandbox
  let hotelVisible: boolean | null = null;
  try {
    const data = await response.json();
    const hotels = Array.isArray(data) ? data : (data.hotels || []);
    hotelVisible = hotels.some((h: any) => String(h.id ?? h.hotel_id) === String(creds.hotel_code));
  } catch {
    // gzip stream not parsed — health still ok if 200
  }

  return {
    status: "connected",
    environment: creds.environment,
    hotel_code: creds.hotel_code,
    hotel_visible_in_static_feed: hotelVisible,
    certification_hotel_id: CERTIFICATION_HOTEL_ID,
    timestamp: new Date().toISOString(),
  };
}

async function fetchAvailability(
  creds: HyperGuestCredentials,
  startDate: string,
  endDate: string,
  occupancy?: { rooms: number; adults: number; children: number; children_ages?: number[] },
  nationality?: string,
  currency?: string
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.search;

  const searchPayload: any = {
    hotel_code: creds.hotel_code,
    check_in: startDate,
    check_out: endDate,
    occupancies: [{
      rooms: occupancy?.rooms ?? 1,
      adults: occupancy?.adults ?? 2,
      children: occupancy?.children ?? 0,
      children_ages: occupancy?.children_ages ?? [],
    }],
  };

  // Add nationality for rate filtering (HyperGuest feature)
  if (nationality) {
    searchPayload.nationality = nationality;
  }

  if (currency) {
    searchPayload.currency = currency;
  }

  console.log(`[hyperguest] Searching availability: ${JSON.stringify(searchPayload)}`);

  const response = await hgFetch(`${baseUrl}/hotels/availability`, {
    method: "POST",
    headers: getAuthHeaders(creds.api_key),
    body: JSON.stringify(searchPayload),
  });

  const responseText = await response.text();
  console.log(`[hyperguest] Availability response status: ${response.status}`);

  if (!response.ok) {
    console.error(`[hyperguest] Availability error: ${responseText.substring(0, 500)}`);
    throw new Error(`HyperGuest availability error: ${response.status}`);
  }

  const data = JSON.parse(responseText);

  // Normalize to standard adapter format (room_types[] with rooms_available_per_night and rate_types)
  const hotel = data.hotels?.[0];
  const room_types = (hotel?.rooms || []).map((room: any) => {
    // Build rooms_available_per_night from daily rates
    const allDailyRates = (room.rates || []).flatMap((rate: any) => rate.dailyRates || []);
    const dateSet = new Set<string>();
    const roomsAvailPerNight: any[] = [];
    for (const dr of allDailyRates) {
      if (dr.date && !dateSet.has(dr.date)) {
        dateSet.add(dr.date);
        roomsAvailPerNight.push({
          date: dr.date,
          available_units: dr.available ?? 1,
          stop_sell: false,
        });
      }
    }

    // Build rate_types from rates
    const rate_types = (room.rates || []).map((rate: any) => ({
      rate_type_id: rate.rateCode || rate.rateKey,
      rate_type_name: rate.rateName || rate.boardName || "Standard",
      price_type: "UnitRate",
      rate_key: rate.rateKey,
      board_code: rate.boardCode,
      board_name: rate.boardName,
      rate_type: rate.rateType, // BAR, NET
      net_total: rate.net,
      selling_rate: rate.sellingRate,
      commission: rate.commission,
      cancellation_policies: rate.cancellationPolicies,
      rates: (rate.dailyRates || []).map((dr: any) => ({
        date: dr.date,
        room_amount: dr.amount || dr.net || 0,
        adult_amounts: { adult_amount_1: dr.amount || dr.net || 0, adult_amount_2: dr.amount || dr.net || 0 },
        teen_amount: 0,
        child_amount: 0,
        infant_amount: 0,
        currency: rate.currency || currency || "EUR",
      })),
    }));

    return {
      room_type_id: room.code,
      room_type_name: room.name,
      name: room.name,
      max_guests: room.maxPax,
      rooms_available_per_night: roomsAvailPerNight,
      rate_types,
    };
  });

  return {
    hotel_code: creds.hotel_code,
    check_in: startDate,
    check_out: endDate,
    nationality: nationality || null,
    currency: currency || data.currency,
    room_types,
    total_rooms_found: room_types.length,
  };
}

async function prebook(
  creds: HyperGuestCredentials,
  rateKey: string,
  rooms: any[]
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;

  const payload = {
    rate_key: rateKey,
    rooms: rooms.map(r => ({
      room_code: r.room_code,
      rate_code: r.rate_code,
      paxes: {
        adults: r.adults,
        children: r.children || 0,
        children_ages: r.children_ages || [],
      },
    })),
  };

  console.log(`[hyperguest] Prebook request: ${JSON.stringify(payload)}`);

  const response = await hgFetch(`${baseUrl}/bookings/prebook`, {
    method: "POST",
    headers: getAuthHeaders(creds.api_key),
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    if (response.status === 409 || responseText.includes("not available")) {
      throw { code: ERROR_CODES.AVAILABILITY_CHANGED, message: "Rate or room no longer available" };
    }
    throw new Error(`Prebook failed: ${response.status} - ${responseText.substring(0, 300)}`);
  }

  const data = JSON.parse(responseText);

  return {
    prebook_id: data.prebookId || data.id,
    rate_key: rateKey,
    status: data.status || "confirmed",
    total_amount: data.totalAmount,
    currency: data.currency,
    cancellation_policies: data.cancellationPolicies,
    expires_at: data.expiresAt,
    rooms: data.rooms,
  };
}

async function createReservation(
  creds: HyperGuestCredentials,
  reservationData: any
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;

  const payload = {
    rate_key: reservationData.rate_key,
    holder: {
      name: reservationData.holder.name,
      surname: reservationData.holder.surname,
      email: reservationData.holder.email,
      phone: reservationData.holder.phone,
      nationality: reservationData.holder.nationality,
    },
    rooms: reservationData.rooms.map((r: any) => ({
      room_code: r.room_code,
      rate_code: r.rate_code,
      paxes: r.paxes,
      special_requests: r.special_requests,
    })),
    client_reference: reservationData.client_reference || `ROL-${Date.now()}`,
    remarks: reservationData.remarks,
    agency: {
      name: "RoomsOnline",
      reference: reservationData.client_reference,
    },
  };

  console.log(`[hyperguest] Creating reservation: ${JSON.stringify({ ...payload, holder: { ...payload.holder, email: '***' } })}`);

  let response: Response;
  let responseText: string;
  try {
    response = await hgFetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: getAuthHeaders(creds.api_key),
      body: JSON.stringify(payload),
      timeoutMs: BOOKING_TIMEOUT_MS,
    });
    responseText = await response.text();
  } catch (err: any) {
    // 300s spec fallback: if our request times out, reconcile via Booking List
    if (err?.name === "AbortError") {
      console.warn(`[hyperguest] Booking timed out after ${BOOKING_TIMEOUT_MS}ms — reconciling via Booking List`);
      const list = await getReservations(creds, { reservation_id: payload.client_reference });
      const match = list?.reservations?.[0];
      if (match) {
        return {
          reservation_id: match.reservation_id,
          status: match.status || "pending",
          reconciled_via: "booking_list_timeout_fallback",
          hotel_code: creds.hotel_code,
          created_at: new Date().toISOString(),
        };
      }
    }
    throw err;
  }

  if (!response.ok) {
    if (response.status === 409) {
      throw { code: ERROR_CODES.AVAILABILITY_CHANGED, message: "Room no longer available" };
    }
    if (response.status === 422) {
      throw { code: ERROR_CODES.BOOKING_REJECTED, message: `Booking rejected: ${responseText.substring(0, 200)}` };
    }
    throw new Error(`Create reservation failed: ${response.status}`);
  }

  const data = JSON.parse(responseText);

  return {
    reservation_id: data.bookingId || data.reference,
    external_reference: data.supplierReference,
    status: data.status || "confirmed",
    holder: data.holder,
    hotel_code: creds.hotel_code,
    check_in: data.checkIn,
    check_out: data.checkOut,
    total_amount: data.totalAmount,
    currency: data.currency,
    rooms: data.rooms,
    cancellation_policies: data.cancellationPolicies,
    created_at: new Date().toISOString(),
  };
}

async function cancelReservation(
  creds: HyperGuestCredentials,
  reservationId: string,
  reason?: string
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;

  const payload: any = {};
  if (reason) payload.cancellation_reason = reason;

  const response = await hgFetch(`${baseUrl}/bookings/${reservationId}/cancel`, {
    method: "POST",
    headers: getAuthHeaders(creds.api_key),
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    if (response.status === 404) {
      throw { code: ERROR_CODES.NOT_FOUND, message: `Reservation ${reservationId} not found` };
    }
    throw new Error(`Cancel failed: ${response.status} - ${responseText.substring(0, 300)}`);
  }

  const data = JSON.parse(responseText);

  return {
    reservation_id: reservationId,
    status: "cancelled",
    cancellation_reference: data.cancellationReference,
    cancellation_cost: data.cancellationCost,
    currency: data.currency,
    cancelled_at: new Date().toISOString(),
  };
}

async function getReservations(
  creds: HyperGuestCredentials,
  params: { start_date?: string; end_date?: string; reservation_id?: string }
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;

  let url = `${baseUrl}/bookings?hotel_code=${creds.hotel_code}`;
  if (params.reservation_id) {
    url = `${baseUrl}/bookings/${params.reservation_id}`;
  } else {
    if (params.start_date) url += `&from=${params.start_date}`;
    if (params.end_date) url += `&to=${params.end_date}`;
  }

  const response = await hgFetch(url, {
    headers: getAuthHeaders(creds.api_key),
  });

  if (!response.ok) {
    throw new Error(`Get reservations failed: ${response.status}`);
  }

  const data = await response.json();
  const bookings = params.reservation_id ? [data] : (data.bookings || []);

  return {
    reservations: bookings.map((b: any) => ({
      reservation_id: b.bookingId || b.reference,
      status: b.status,
      holder_name: b.holder?.name ? `${b.holder.name} ${b.holder.surname}` : null,
      holder_email: b.holder?.email,
      check_in: b.checkIn,
      check_out: b.checkOut,
      total_amount: b.totalAmount,
      currency: b.currency,
      rooms: b.rooms,
      created_at: b.createdAt,
      client_reference: b.clientReference,
    })),
    total: bookings.length,
  };
}

async function fetchStaticData(
  creds: HyperGuestCredentials,
  dataType: "rooms" | "rates" | "all",
  supabase: any,
  propertyId: string
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;
  const results: any = {};

  // Fetch room types
  if (dataType === "rooms" || dataType === "all") {
    const roomsResponse = await hgFetch(`${baseUrl}/hotels/${creds.hotel_code}/rooms`, {
      headers: getAuthHeaders(creds.api_key),
    });

    if (roomsResponse.ok) {
      const roomsData = await roomsResponse.json();
      const rooms = (roomsData.rooms || []).map((r: any) => ({
        external_room_type_id: r.code,
        room_name: r.name,
        room_type: r.type,
        description: r.description,
        max_occupancy: r.maxPax,
        max_adults: r.maxAdults,
        max_children: r.maxChildren,
        min_occupancy: r.minPax,
        bed_type: r.bedType,
        size_sqm: r.size,
        images: r.images,
        facilities: r.facilities,
      }));
      results.rooms = rooms;

      // Upsert into pms_room_types_cache
      for (const room of rooms) {
        await supabase.from("pms_room_types_cache").upsert({
          property_id: propertyId,
          system_type: "hyperguest",
          external_room_type_id: room.external_room_type_id,
          room_name: room.room_name,
          max_occupancy: room.max_occupancy,
          description: room.description,
          raw_data: room,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: "property_id,system_type,external_room_type_id" });
      }

      console.log(`[hyperguest] Cached ${rooms.length} room types for property ${propertyId}`);
    }
  }

  // Fetch rate types
  if (dataType === "rates" || dataType === "all") {
    const ratesResponse = await hgFetch(`${baseUrl}/hotels/${creds.hotel_code}/rates`, {
      headers: getAuthHeaders(creds.api_key),
    });

    if (ratesResponse.ok) {
      const ratesData = await ratesResponse.json();
      const rates = (ratesData.rates || []).map((r: any) => ({
        external_rate_type_id: r.code,
        rate_name: r.name,
        rate_type: r.rateType, // BAR, NET
        board_code: r.boardCode,
        board_name: r.boardName,
        currency: r.currency,
        cancellation_policy: r.cancellationPolicy,
        packaging: r.packaging || false,
      }));
      results.rates = rates;

      // Upsert into pms_rate_types_cache
      for (const rate of rates) {
        await supabase.from("pms_rate_types_cache").upsert({
          property_id: propertyId,
          system_type: "hyperguest",
          external_rate_type_id: rate.external_rate_type_id,
          rate_name: rate.rate_name,
          rate_type: rate.rate_type,
          raw_data: rate,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: "property_id,system_type,external_rate_type_id" });
      }

      console.log(`[hyperguest] Cached ${rates.length} rate types for property ${propertyId}`);
    }
  }

  return {
    hotel_code: creds.hotel_code,
    synced_at: new Date().toISOString(),
    ...results,
  };
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let action = "unknown";

  try {
    const body = await req.json();
    action = body.action || "unknown";

    console.log(`[hyperguest] Action: ${action}`);

    // ── Get Capabilities (no auth needed) ──
    if (action === "get_capabilities") {
      return new Response(
        JSON.stringify(createSuccessResponse(CAPABILITIES, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Resolve property + override context (property_id optional for health_check & run_certification) ──
    const propertyId: string | null = body.property_id ?? null;
    const overrides = {
      hotel_id: body.hotel_id ? String(body.hotel_id) : undefined,
      environment: (body.environment === "production" || body.environment === "sandbox")
        ? body.environment as "sandbox" | "production"
        : undefined,
    };

    const ANONYMOUS_ACTIONS = new Set(["health_check", "run_certification"]);

    if (!propertyId && !ANONYMOUS_ACTIONS.has(action)) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "property_id is required", action)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let creds: HyperGuestCredentials;
    try {
      creds = await getCredentials(supabase, propertyId, overrides);
    } catch (credError: any) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.AUTH_FAILED, credError.message, action)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Certification Runner (no property_id required; uses cert hotel by default) ──
    if (action === "run_certification") {
      const result = await runCertification(supabase, creds, propertyId);
      return new Response(
        JSON.stringify(createSuccessResponse(result, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Health Check ──
    if (action === "health_check") {
      const result = await healthCheck(creds);
      return new Response(
        JSON.stringify(createSuccessResponse(result, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch Availability ──
    if (action === "fetch_availability") {
      const validation = fetchAvailabilitySchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, validation.error.errors.map(e => e.message).join(", "), action)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rawResult = await fetchAvailability(
        creds,
        validation.data.start_date,
        validation.data.end_date,
        validation.data.occupancy,
        validation.data.nationality,
        validation.data.currency
      );

      // Map PMS-native room codes to DB UUIDs (adapter contract enforcement)
      const { data: dbRooms } = await supabase
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

      // Replace PMS codes with DB UUIDs
      const result = {
        ...rawResult,
        room_types: (rawResult.room_types || []).map((rt: any) => ({
          ...rt,
          external_room_type_id: rt.room_type_id,
          room_type_id: pmsCodeToDbUuid[rt.room_type_id] || rt.room_type_id,
        })),
      };

      // Cache availability data
      if (result.room_types?.length) {
        for (const rt of result.room_types) {
          for (const rateType of rt.rate_types || []) {
            for (const dailyRate of rateType.rates || []) {
              await supabase.from("pms_availability_cache").upsert({
                property_id: propertyId,
                system_type: "hyperguest",
                external_room_type_id: rt.external_room_type_id || rt.room_type_id,
                date: dailyRate.date,
                available_units: dailyRate.available ?? 1,
                rates: { net: rateType.net_total, selling: rateType.selling_rate, currency: dailyRate.currency },
                raw_data: { room_name: rt.room_type_name, rate_key: rateType.rate_key, rate_name: rateType.rate_type_name },
                last_synced_at: new Date().toISOString(),
              }, { onConflict: "property_id,system_type,external_room_type_id,date" });
            }
          }
        }
      }

      return new Response(
        JSON.stringify(createSuccessResponse(result, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Prebook ──
    if (action === "prebook") {
      const validation = prebookSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, validation.error.errors.map(e => e.message).join(", "), action)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const result = await prebook(creds, validation.data.rate_key, validation.data.rooms);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        if (err.code === ERROR_CODES.AVAILABILITY_CHANGED) {
          return new Response(
            JSON.stringify(createErrorResponse(err.code, err.message, action)),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw err;
      }
    }

    // ── Create Reservation ──
    if (action === "create_reservation") {
      const validation = createReservationSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, validation.error.errors.map(e => e.message).join(", "), action)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const result = await createReservation(creds, validation.data.reservation_data);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        if (err.code) {
          return new Response(
            JSON.stringify(createErrorResponse(err.code, err.message, action)),
            { status: err.code === ERROR_CODES.AVAILABILITY_CHANGED ? 409 : 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw err;
      }
    }

    // ── Cancel Reservation ──
    if (action === "cancel_reservation") {
      const validation = cancelReservationSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, validation.error.errors.map(e => e.message).join(", "), action)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const result = await cancelReservation(creds, validation.data.reservation_id, validation.data.cancellation_reason);
        return new Response(
          JSON.stringify(createSuccessResponse(result, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        if (err.code === ERROR_CODES.NOT_FOUND) {
          return new Response(
            JSON.stringify(createErrorResponse(err.code, err.message, action)),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw err;
      }
    }

    // ── Get Reservations ──
    if (action === "get_reservations") {
      const validation = getReservationsSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, validation.error.errors.map(e => e.message).join(", "), action)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await getReservations(creds, {
        start_date: validation.data.start_date,
        end_date: validation.data.end_date,
        reservation_id: validation.data.reservation_id,
      });

      return new Response(
        JSON.stringify(createSuccessResponse(result, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get Room Types (alias for static data) ──
    if (action === "get_room_types") {
      const result = await fetchStaticData(creds, "rooms", supabase, propertyId);
      return new Response(
        JSON.stringify(createSuccessResponse(result, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get Rate Types (alias for static data) ──
    if (action === "get_rate_types") {
      const result = await fetchStaticData(creds, "rates", supabase, propertyId);
      return new Response(
        JSON.stringify(createSuccessResponse(result, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch Static Data ──
    if (action === "fetch_static_data") {
      const validation = fetchStaticDataSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, validation.error.errors.map(e => e.message).join(", "), action)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await fetchStaticData(creds, validation.data.data_type, supabase, propertyId);
      return new Response(
        JSON.stringify(createSuccessResponse(result, action)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Unknown Action ──
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, `Unknown action: ${action}`, action)),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[hyperguest] Error in ${action}:`, error);

    return new Response(
      JSON.stringify(createErrorResponse(
        ERROR_CODES.INTERNAL_ADAPTER_ERROR,
        error.message || "Internal adapter error",
        action,
        { stack: error.stack?.substring(0, 200) }
      )),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
