// ============================================================================
// ██████╗  ██████╗  ██████╗ ███╗   ███╗███████╗ ██████╗ ███╗   ██╗██╗     ██╗███╗   ██╗███████╗
// ██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║██╔════╝██╔═══██╗████╗  ██║██║     ██║████╗  ██║██╔════╝
// ██████╔╝██║   ██║██║   ██║██╔████╔██║███████╗██║   ██║██╔██╗ ██║██║     ██║██╔██╗ ██║█████╗  
// ██╔══██╗██║   ██║██║   ██║██║╚██╔╝██║╚════██║██║   ██║██║╚██╗██║██║     ██║██║╚██╗██║██╔══╝  
// ██║  ██║╚██████╔╝╚██████╔╝██║ ╚═╝ ██║███████║╚██████╔╝██║ ╚████║███████╗██║██║ ╚████║███████╗
// ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝╚═╝  ╚═══╝╚══════╝
//
// NATIVE PMS ADAPTER
// ============================================================================
// 
// RULE: This is RoomsOnline's native PMS adapter for properties without external PMS.
// It conforms to the same adapter contract as all other PMS adapters.
// 
// SOURCE OF TRUTH: This adapter reads/writes directly to cache tables.
// For booking creation, it validates availability in real-time before committing.
// 
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// CORS & CONSTANTS
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE = "roomsonline" as const;

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
  supports_modify_booking: "limited" as const,
  supports_webhooks: false,
};

// ============================================================================
// REQUEST VALIDATION SCHEMAS
// ============================================================================

const baseRequestSchema = z.object({
  action: z.enum([
    "get_capabilities",
    "fetch_availability",
    "get_room_types",
    "get_rate_types",
    "get_reservations",
    "create_reservation",
    "modify_reservation",
    "cancel_reservation",
    "set_availability",
    "set_rates",
  ]),
  propertyId: z.string().uuid().optional(),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  propertyId: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  propertyId: z.string().uuid(),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room_type_id: z.string(),
  rate_type_id: z.string(),
  guest: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  rooms: z.array(z.object({
    room_type_id: z.string(),
    adults: z.number().int().min(1),
    teens: z.number().int().min(0).default(0),
    children: z.number().int().min(0).default(0),
    infants: z.number().int().min(0).default(0),
  })),
  special_requests: z.string().optional(),
  voucher: z.string().optional(),
});

const modifyReservationSchema = baseRequestSchema.extend({
  action: z.literal("modify_reservation"),
  propertyId: z.string().uuid(),
  reservation_id: z.string(),
  new_arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  new_departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const cancelReservationSchema = baseRequestSchema.extend({
  action: z.literal("cancel_reservation"),
  propertyId: z.string().uuid(),
  reservation_id: z.string(),
  reason: z.string().optional(),
});

const setAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("set_availability"),
  propertyId: z.string().uuid(),
  room_type_id: z.string(),
  availability: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    available_units: z.number().int().min(0),
    restrictions: z.object({
      stop_sell: z.boolean().optional(),
      min_stay: z.number().int().min(1).nullable().optional(),
      max_stay: z.number().int().min(1).nullable().optional(),
      lead_days_advance: z.number().int().min(0).nullable().optional(),
      lead_days_post: z.number().int().min(0).nullable().optional(),
      closed_to_arrival: z.boolean().optional(),
      closed_to_departure: z.boolean().optional(),
    }).optional(),
  })),
});

const setRatesSchema = baseRequestSchema.extend({
  action: z.literal("set_rates"),
  propertyId: z.string().uuid(),
  room_type_id: z.string(),
  rate_type_id: z.string(),
  rates: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    room_amount: z.number().min(0),
    adult_amounts: z.record(z.number().min(0)).optional(),
    teen_amount: z.number().min(0).nullable().optional(),
    child_amount: z.number().min(0).nullable().optional(),
    infant_amount: z.number().min(0).nullable().optional(),
    currency: z.string().default("ZAR"),
  })),
});

// ============================================================================
// RESPONSE HELPERS (Adapter Contract Compliance)
// ============================================================================

interface AdapterResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  source: typeof SOURCE;
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
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    console.log("[roomsonline-pms-api] Request:", JSON.stringify(body, null, 2));

    const baseResult = baseRequestSchema.safeParse(body);
    if (!baseResult.success) {
      console.error("[roomsonline-pms-api] Validation error:", baseResult.error);
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request format", "unknown", baseResult.error.errors)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { action } = baseResult.data;

    switch (action) {
      case "get_capabilities":
        return handleGetCapabilities();

      case "fetch_availability":
        return await handleFetchAvailability(body, supabase);

      case "get_room_types":
        return await handleGetRoomTypes(body, supabase);

      case "get_rate_types":
        return await handleGetRateTypes(body, supabase);

      case "get_reservations":
        return await handleGetReservations(body, supabase);

      case "create_reservation":
        return await handleCreateReservation(body, supabase);

      case "modify_reservation":
        return await handleModifyReservation(body, supabase);

      case "cancel_reservation":
        return await handleCancelReservation(body, supabase);

      case "set_availability":
        return await handleSetAvailability(body, supabase);

      case "set_rates":
        return await handleSetRates(body, supabase);

      default:
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, `Unknown action: ${action}`, action)),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }
  } catch (error) {
    console.error("[roomsonline-pms-api] Unhandled error:", error);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Internal server error", "unknown", String(error))),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// ============================================================================
// ACTION HANDLERS
// ============================================================================

function handleGetCapabilities(): Response {
  console.log("[roomsonline-pms-api] Returning capabilities");
  return new Response(
    JSON.stringify(createSuccessResponse(CAPABILITIES, "get_capabilities")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleFetchAvailability(body: unknown, supabase: any): Promise<Response> {
  const parsed = fetchAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid fetch_availability request", "fetch_availability", parsed.error.errors)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  const { propertyId, start_date, end_date } = parsed.data;
  console.log(`[roomsonline-pms-api] Fetching availability for property ${propertyId} from ${start_date} to ${end_date}`);

  const { data: availabilityData, error: availError } = await supabase
    .from("pms_availability_cache")
    .select("*")
    .eq("property_id", propertyId)
    .eq("system_type", SOURCE)
    .gte("date", start_date)
    .lte("date", end_date)
    .order("date", { ascending: true });

  if (availError) {
    console.error("[roomsonline-pms-api] Error fetching availability:", availError);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch availability", "fetch_availability", availError)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  const { data: roomTypes, error: roomError } = await supabase
    .from("pms_room_types_cache")
    .select("*")
    .eq("property_id", propertyId)
    .eq("system_type", SOURCE);

  if (roomError) {
    console.error("[roomsonline-pms-api] Error fetching room types:", roomError);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch room types", "fetch_availability", roomError)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // deno-lint-ignore no-explicit-any
  const roomTypeMap = new Map<string, any>();

  // deno-lint-ignore no-explicit-any
  for (const rt of (roomTypes || []) as any[]) {
    roomTypeMap.set(rt.external_room_type_id, {
      room_type_id: rt.external_room_type_id,
      name: rt.name,
      availability_per_night: [],
      rate_types: [],
    });
  }

  // deno-lint-ignore no-explicit-any
  for (const avail of (availabilityData || []) as any[]) {
    const roomType = roomTypeMap.get(avail.external_room_type_id);
    if (!roomType) continue;

    // deno-lint-ignore no-explicit-any
    const restrictions = (avail.restrictions as Record<string, any>) || {};
    roomType.availability_per_night.push({
      date: avail.date,
      available_units: avail.available_units || 0,
      restrictions: {
        stop_sell: restrictions.stop_sell ?? false,
        min_stay: restrictions.min_stay ?? null,
        max_stay: restrictions.max_stay ?? null,
        lead_days_advance: restrictions.lead_days_advance ?? null,
        lead_days_post: restrictions.lead_days_post ?? null,
        closed_to_arrival: restrictions.closed_to_arrival ?? false,
        closed_to_departure: restrictions.closed_to_departure ?? false,
      },
    });

    // deno-lint-ignore no-explicit-any
    const rates = (avail.rates as Record<string, any>) || {};
    for (const [rateTypeId, rateData] of Object.entries(rates)) {
      // deno-lint-ignore no-explicit-any
      const rd = rateData as Record<string, any>;
      // deno-lint-ignore no-explicit-any
      let rateType = roomType.rate_types.find((r: any) => r.rate_type_id === rateTypeId);
      if (!rateType) {
        rateType = {
          rate_type_id: rateTypeId,
          name: rd.name || rateTypeId,
          price_type: rd.price_type || null,
          rates: [],
        };
        roomType.rate_types.push(rateType);
      }
      rateType.rates.push({
        date: avail.date,
        room_amount: rd.room_amount || 0,
        adult_amounts: rd.adult_amounts || {},
        teen_amount: rd.teen_amount ?? null,
        child_amount: rd.child_amount ?? null,
        infant_amount: rd.infant_amount ?? null,
        currency: rd.currency || "ZAR",
      });
    }
  }

  return new Response(
    JSON.stringify(createSuccessResponse({ room_types: Array.from(roomTypeMap.values()) }, "fetch_availability")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleGetRoomTypes(body: { propertyId?: string }, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId is required", "get_room_types")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  console.log(`[roomsonline-pms-api] Fetching room types for property ${body.propertyId}`);

  const { data, error } = await supabase
    .from("pms_room_types_cache")
    .select("*")
    .eq("property_id", body.propertyId)
    .eq("system_type", SOURCE);

  if (error) {
    console.error("[roomsonline-pms-api] Error fetching room types:", error);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch room types", "get_room_types", error)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // deno-lint-ignore no-explicit-any
  const roomTypes = ((data || []) as any[]).map(rt => ({
    room_type_id: rt.external_room_type_id,
    name: rt.name,
    description: rt.description,
    min_guests: rt.min_guests || 1,
    max_guests: rt.max_guests || 2,
    guest_rules: {
      allow_teens: rt.allow_teens ?? true,
      teen_min_age: rt.teen_min_age,
      teen_max_age: rt.teen_max_age,
      allow_children: rt.allow_children ?? true,
      child_min_age: rt.child_min_age,
      child_max_age: rt.child_max_age,
      allow_infants: rt.allow_infants ?? true,
      infant_min_age: rt.infant_min_age,
      infant_max_age: rt.infant_max_age,
    },
    linked_rate_type_ids: (rt.linked_rate_type_ids as string[]) || [],
  }));

  return new Response(
    JSON.stringify(createSuccessResponse({ room_types: roomTypes }, "get_room_types")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleGetRateTypes(body: { propertyId?: string }, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId is required", "get_rate_types")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  console.log(`[roomsonline-pms-api] Fetching rate types for property ${body.propertyId}`);

  const { data, error } = await supabase
    .from("pms_rate_types_cache")
    .select("*")
    .eq("property_id", body.propertyId)
    .eq("system_type", SOURCE);

  if (error) {
    console.error("[roomsonline-pms-api] Error fetching rate types:", error);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch rate types", "get_rate_types", error)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // deno-lint-ignore no-explicit-any
  const rateTypes = ((data || []) as any[]).map(rt => ({
    rate_type_id: rt.external_rate_type_id,
    name: rt.name,
    description: rt.description,
    price_type: rt.price_type,
    min_stay_days: rt.min_stay_days,
    max_stay_days: rt.max_stay_days,
    min_advance_days: rt.min_advance_days,
    max_advance_days: rt.max_advance_days,
  }));

  return new Response(
    JSON.stringify(createSuccessResponse({ rate_types: rateTypes }, "get_rate_types")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleGetReservations(body: { propertyId?: string; start_date?: string; end_date?: string }, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId is required", "get_reservations")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  console.log(`[roomsonline-pms-api] Fetching reservations for property ${body.propertyId}`);

  let query = supabase
    .from("pms_reservations")
    .select("*")
    .eq("property_id", body.propertyId)
    .eq("system_type", SOURCE)
    .order("arrival_date", { ascending: true });

  if (body.start_date) {
    query = query.gte("arrival_date", body.start_date);
  }
  if (body.end_date) {
    query = query.lte("departure_date", body.end_date);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[roomsonline-pms-api] Error fetching reservations:", error);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to fetch reservations", "get_reservations", error)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // deno-lint-ignore no-explicit-any
  const reservations = ((data || []) as any[]).map(res => ({
    reservation_id: res.external_reservation_id,
    status: res.status || "confirmed",
    arrival_date: res.arrival_date,
    departure_date: res.departure_date,
    contact: {
      name: res.contact_name || res.reservation_name || "",
      email: res.contact_email,
      phone: res.contact_phone,
    },
    rooms: res.rooms || [],
    total_amount: res.total_amount || 0,
    currency: res.currency || "ZAR",
    rate_type_name: res.rate_type_name,
    voucher: res.reservation_voucher,
    notes: null,
    created_at: res.created_at,
  }));

  return new Response(
    JSON.stringify(createSuccessResponse({ reservations }, "get_reservations")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleCreateReservation(body: unknown, supabase: any): Promise<Response> {
  const parsed = createReservationSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid create_reservation request", "create_reservation", parsed.error.errors)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  const { propertyId, arrival_date, departure_date, rate_type_id, guest, rooms, voucher } = parsed.data;
  console.log(`[roomsonline-pms-api] Creating reservation for property ${propertyId}`);

  // RULE: Never create booking from cached availability alone - validate real-time
  const roomTypeIds = [...new Set(rooms.map(r => r.room_type_id))];
  
  const { data: currentAvailability, error: availError } = await supabase
    .from("pms_availability_cache")
    .select("*")
    .eq("property_id", propertyId)
    .eq("system_type", SOURCE)
    .in("external_room_type_id", roomTypeIds)
    .gte("date", arrival_date)
    .lt("date", departure_date);

  if (availError) {
    console.error("[roomsonline-pms-api] Error checking availability:", availError);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to validate availability", "create_reservation", availError)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // Count required rooms per type
  const requiredRooms = new Map<string, number>();
  for (const room of rooms) {
    requiredRooms.set(room.room_type_id, (requiredRooms.get(room.room_type_id) || 0) + 1);
  }

  // Generate date range
  const dates = getDateRange(arrival_date, departure_date);

  // Validate availability for each date and room type
  for (const [roomTypeId, requiredCount] of requiredRooms.entries()) {
    for (const date of dates) {
      // deno-lint-ignore no-explicit-any
      const avail = ((currentAvailability || []) as any[]).find(a => a.external_room_type_id === roomTypeId && a.date === date);
      const availableUnits = avail?.available_units || 0;
      
      if (availableUnits < requiredCount) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.AVAILABILITY_CHANGED,
            `Not enough availability for room type ${roomTypeId} on ${date}. Required: ${requiredCount}, Available: ${availableUnits}`,
            "create_reservation"
          )),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
        );
      }

      // deno-lint-ignore no-explicit-any
      const restrictions = (avail?.restrictions as Record<string, any>) || {};
      if (restrictions.stop_sell) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.BOOKING_REJECTED,
            `Room type ${roomTypeId} is not available for booking on ${date} (stop sell active)`,
            "create_reservation"
          )),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
        );
      }
    }
  }

  // Generate reservation ID
  const reservationId = `ROL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const confirmationNumber = reservationId;

  // Calculate total
  let totalAmount = 0;
  // deno-lint-ignore no-explicit-any
  for (const avail of ((currentAvailability || []) as any[])) {
    // deno-lint-ignore no-explicit-any
    const rates = (avail.rates as Record<string, any>) || {};
    // deno-lint-ignore no-explicit-any
    const rateData = rates[rate_type_id] as Record<string, any>;
    if (rateData) {
      const roomCount = requiredRooms.get(avail.external_room_type_id) || 0;
      totalAmount += (rateData.room_amount || 0) * roomCount;
    }
  }

  // Create reservation in pms_reservations
  const { error: insertError } = await supabase
    .from("pms_reservations")
    .insert({
      property_id: propertyId,
      system_type: SOURCE,
      external_reservation_id: reservationId,
      status: "confirmed",
      arrival_date,
      departure_date,
      contact_name: guest.name,
      contact_email: guest.email,
      contact_phone: guest.phone,
      reservation_name: guest.name,
      reservation_voucher: voucher || confirmationNumber,
      rate_type_name: rate_type_id,
      rooms: rooms.map(r => ({
        room_type_id: r.room_type_id,
        adults: r.adults,
        teens: r.teens,
        children: r.children,
        infants: r.infants,
      })),
      total_amount: totalAmount,
      currency: "ZAR",
      synced_at: new Date().toISOString(),
    });

  if (insertError) {
    console.error("[roomsonline-pms-api] Error creating reservation:", insertError);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to create reservation", "create_reservation", insertError)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // Update availability cache - decrement available units
  for (const [roomTypeId, requiredCount] of requiredRooms.entries()) {
    for (const date of dates) {
      // deno-lint-ignore no-explicit-any
      const avail = ((currentAvailability || []) as any[]).find(a => a.external_room_type_id === roomTypeId && a.date === date);
      if (avail) {
        await supabase
          .from("pms_availability_cache")
          .update({
            available_units: Math.max(0, (avail.available_units || 0) - requiredCount),
            updated_at: new Date().toISOString(),
            source_timestamp: new Date().toISOString(),
          })
          .eq("id", avail.id);
      }
    }
  }

  console.log(`[roomsonline-pms-api] Reservation created successfully: ${reservationId}`);

  return new Response(
    JSON.stringify(createSuccessResponse({
      reservation_id: reservationId,
      confirmation_number: confirmationNumber,
      status: "confirmed",
    }, "create_reservation")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleModifyReservation(body: unknown, supabase: any): Promise<Response> {
  const parsed = modifyReservationSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid modify_reservation request", "modify_reservation", parsed.error.errors)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  const { propertyId, reservation_id, new_arrival_date, new_departure_date } = parsed.data;
  console.log(`[roomsonline-pms-api] Modifying reservation ${reservation_id}`);

  const { data: existing, error: fetchError } = await supabase
    .from("pms_reservations")
    .select("*")
    .eq("property_id", propertyId)
    .eq("external_reservation_id", reservation_id)
    .eq("system_type", SOURCE)
    .single();

  if (fetchError || !existing) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.NOT_FOUND, "Reservation not found", "modify_reservation")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
    );
  }

  if (existing.status === "cancelled") {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.BOOKING_REJECTED, "Cannot modify a cancelled reservation", "modify_reservation")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
    );
  }

  if (!new_arrival_date && !new_departure_date) {
    return new Response(
      JSON.stringify(createSuccessResponse({
        reservation_id,
        status: existing.status,
        message: "No changes requested",
      }, "modify_reservation")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const finalArrival = new_arrival_date || existing.arrival_date;
  const finalDeparture = new_departure_date || existing.departure_date;

  // deno-lint-ignore no-explicit-any
  const rooms = (existing.rooms as Array<{ room_type_id: string }>) || [];
  const roomTypeIds = [...new Set(rooms.map(r => r.room_type_id))];

  const { data: newAvailability, error: availError } = await supabase
    .from("pms_availability_cache")
    .select("*")
    .eq("property_id", propertyId)
    .eq("system_type", SOURCE)
    .in("external_room_type_id", roomTypeIds)
    .gte("date", finalArrival)
    .lt("date", finalDeparture);

  if (availError) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to validate availability", "modify_reservation", availError)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  const requiredRooms = new Map<string, number>();
  for (const room of rooms) {
    requiredRooms.set(room.room_type_id, (requiredRooms.get(room.room_type_id) || 0) + 1);
  }

  const newDates = getDateRange(finalArrival, finalDeparture);
  const originalDates = getDateRange(existing.arrival_date, existing.departure_date);

  for (const [roomTypeId, requiredCount] of requiredRooms.entries()) {
    for (const date of newDates) {
      // deno-lint-ignore no-explicit-any
      const avail = ((newAvailability || []) as any[]).find(a => a.external_room_type_id === roomTypeId && a.date === date);
      const isOriginalDate = originalDates.includes(date);
      const availableUnits = (avail?.available_units || 0) + (isOriginalDate ? requiredCount : 0);

      if (availableUnits < requiredCount) {
        return new Response(
          JSON.stringify(createErrorResponse(
            ERROR_CODES.MODIFICATION_NOT_SUPPORTED,
            `Cannot modify reservation - insufficient availability for new dates. Please contact the property directly.`,
            "modify_reservation"
          )),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
        );
      }
    }
  }

  const { error: updateError } = await supabase
    .from("pms_reservations")
    .update({
      arrival_date: finalArrival,
      departure_date: finalDeparture,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateError) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to update reservation", "modify_reservation", updateError)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  console.log(`[roomsonline-pms-api] Reservation modified successfully: ${reservation_id}`);

  return new Response(
    JSON.stringify(createSuccessResponse({
      reservation_id,
      status: existing.status,
      message: "Reservation modified successfully",
    }, "modify_reservation")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleCancelReservation(body: unknown, supabase: any): Promise<Response> {
  const parsed = cancelReservationSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid cancel_reservation request", "cancel_reservation", parsed.error.errors)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  const { propertyId, reservation_id, reason } = parsed.data;
  console.log(`[roomsonline-pms-api] Cancelling reservation ${reservation_id}`);

  const { data: existing, error: fetchError } = await supabase
    .from("pms_reservations")
    .select("*")
    .eq("property_id", propertyId)
    .eq("external_reservation_id", reservation_id)
    .eq("system_type", SOURCE)
    .single();

  if (fetchError || !existing) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.NOT_FOUND, "Reservation not found", "cancel_reservation")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
    );
  }

  if (existing.status === "cancelled") {
    return new Response(
      JSON.stringify(createSuccessResponse({
        reservation_id,
        status: "cancelled",
        message: "Reservation was already cancelled",
      }, "cancel_reservation")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { error: updateError } = await supabase
    .from("pms_reservations")
    .update({
      status: "cancelled",
      cancellation_date: new Date().toISOString(),
      cancellation_reason: reason,
      status_at_time_of_cancellation: existing.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateError) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to cancel reservation", "cancel_reservation", updateError)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // Restore availability
  // deno-lint-ignore no-explicit-any
  const rooms = (existing.rooms as Array<{ room_type_id: string }>) || [];
  const requiredRooms = new Map<string, number>();
  for (const room of rooms) {
    requiredRooms.set(room.room_type_id, (requiredRooms.get(room.room_type_id) || 0) + 1);
  }

  const dates = getDateRange(existing.arrival_date, existing.departure_date);
  for (const [roomTypeId, count] of requiredRooms.entries()) {
    for (const date of dates) {
      const { data: avail } = await supabase
        .from("pms_availability_cache")
        .select("id, available_units")
        .eq("property_id", propertyId)
        .eq("system_type", SOURCE)
        .eq("external_room_type_id", roomTypeId)
        .eq("date", date)
        .single();

      if (avail) {
        await supabase
          .from("pms_availability_cache")
          .update({
            available_units: (avail.available_units || 0) + count,
            updated_at: new Date().toISOString(),
            source_timestamp: new Date().toISOString(),
          })
          .eq("id", avail.id);
      }
    }
  }

  console.log(`[roomsonline-pms-api] Reservation cancelled successfully: ${reservation_id}`);

  return new Response(
    JSON.stringify(createSuccessResponse({
      reservation_id,
      status: "cancelled",
      message: "Reservation cancelled successfully",
    }, "cancel_reservation")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleSetAvailability(body: unknown, supabase: any): Promise<Response> {
  const parsed = setAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid set_availability request", "set_availability", parsed.error.errors)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  const { propertyId, room_type_id, availability } = parsed.data;
  console.log(`[roomsonline-pms-api] Setting availability for property ${propertyId}, room ${room_type_id}`);

  const now = new Date().toISOString();
  const upserts = availability.map(a => ({
    property_id: propertyId,
    system_type: SOURCE,
    external_room_type_id: room_type_id,
    date: a.date,
    available_units: a.available_units,
    restrictions: {
      stop_sell: a.restrictions?.stop_sell ?? false,
      min_stay: a.restrictions?.min_stay ?? null,
      max_stay: a.restrictions?.max_stay ?? null,
      lead_days_advance: a.restrictions?.lead_days_advance ?? null,
      lead_days_post: a.restrictions?.lead_days_post ?? null,
      closed_to_arrival: a.restrictions?.closed_to_arrival ?? false,
      closed_to_departure: a.restrictions?.closed_to_departure ?? false,
    },
    fetched_at: now,
    source_timestamp: now,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("pms_availability_cache")
    .upsert(upserts, {
      onConflict: "property_id,system_type,external_room_type_id,date",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("[roomsonline-pms-api] Error setting availability:", error);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to set availability", "set_availability", error)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  console.log(`[roomsonline-pms-api] Availability set successfully: ${availability.length} records`);

  return new Response(
    JSON.stringify(createSuccessResponse({
      updated_count: availability.length,
      room_type_id,
      message: "Availability updated successfully",
    }, "set_availability")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleSetRates(body: unknown, supabase: any): Promise<Response> {
  const parsed = setRatesSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid set_rates request", "set_rates", parsed.error.errors)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  const { propertyId, room_type_id, rate_type_id, rates } = parsed.data;
  console.log(`[roomsonline-pms-api] Setting rates for property ${propertyId}, room ${room_type_id}, rate ${rate_type_id}`);

  const now = new Date().toISOString();

  for (const rate of rates) {
    const { data: existing } = await supabase
      .from("pms_availability_cache")
      .select("id, rates")
      .eq("property_id", propertyId)
      .eq("system_type", SOURCE)
      .eq("external_room_type_id", room_type_id)
      .eq("date", rate.date)
      .single();

    // deno-lint-ignore no-explicit-any
    const existingRates = (existing?.rates as Record<string, any>) || {};
    const updatedRates = {
      ...existingRates,
      [rate_type_id]: {
        room_amount: rate.room_amount,
        adult_amounts: rate.adult_amounts || {},
        teen_amount: rate.teen_amount ?? null,
        child_amount: rate.child_amount ?? null,
        infant_amount: rate.infant_amount ?? null,
        currency: rate.currency || "ZAR",
      },
    };

    if (existing) {
      await supabase
        .from("pms_availability_cache")
        .update({
          rates: updatedRates,
          updated_at: now,
          source_timestamp: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("pms_availability_cache")
        .insert({
          property_id: propertyId,
          system_type: SOURCE,
          external_room_type_id: room_type_id,
          date: rate.date,
          available_units: 0,
          rates: updatedRates,
          restrictions: {},
          fetched_at: now,
          source_timestamp: now,
        });
    }
  }

  console.log(`[roomsonline-pms-api] Rates set successfully: ${rates.length} records`);

  return new Response(
    JSON.stringify(createSuccessResponse({
      updated_count: rates.length,
      room_type_id,
      rate_type_id,
      message: "Rates updated successfully",
    }, "set_rates")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}
