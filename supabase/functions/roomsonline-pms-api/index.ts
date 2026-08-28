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
import { z } from "npm:zod@3.23.8";
import { normalizeRevenueStream, resolveBreakfastConfig, postBookingStreamSplit } from "../_shared/revenueStreams.ts";
import { applyBookedInventory } from "../_shared/availabilityCache.ts";
import { expandPackageById, packageAddOnTotal } from "../_shared/packages.ts";
import { normaliseEmail, normaliseGuestName, rebuildGuestStats } from "../_shared/guestStats.ts";
import { reconcileBookingCharges, resolveBookingChargeContext, chargesBreakdownSnapshot } from "../_shared/propertyCharges.ts";

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
  supports_webhooks: true,
  webhook_events: [
    "booking.created",
    "booking.modified",
    "booking.cancelled",
    "booking.checked_in",
    "booking.checked_out",
  ],
};

// ============================================================================
// REQUEST VALIDATION SCHEMAS
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
    "set_availability",
    "set_rates",
    // ROL'OS Native PMS actions
    "get_physical_rooms",
    "create_physical_room",
    "update_room_status",
    "get_rolos_room_types",
    "create_rolos_room_type",
    "update_rolos_room_type",
    "get_rate_plans",
    "create_rate_plan",
    "get_rate_seasons",
    "create_rate_season",
    "set_rate_prices",
    "get_guest_profiles",
    "get_guest_profile",
    "create_guest_profile",
    "update_guest_profile",
    "delete_guest_profile",

    "check_in",
    "check_out",
    "get_folio",
    "add_folio_charge",
    "process_folio_payment",
    "get_housekeeping_board",
    "assign_housekeeping_task",
    "complete_housekeeping_task",
    "get_daily_metrics",
    // Service Charges & Refunds
    "apply_service_charges",
    "apply_package",
    "backfill_revenue_streams",
    "process_checkout_refunds",
    "get_booking_charges",
    // Phase 1: Inventory Calendar
    "update_inventory",
    "check_inventory",
    "backfill_inventory",
    // Static Content
    "get_cancellation_policies",
    "get_reservation_policies",
    "get_payment_methods",
    "get_property_contact_details",
    "get_contact_details",
    "get_property_profile",
    // UI Configurator
    "get_ui_config",
    // Webhooks
    "subscribe_webhook",
    "unsubscribe_webhook",
    "list_webhook_subscriptions",
    "test_webhook",
    "get_webhook_logs",
    // Owner account (ROL billing portal)
    "get_account_balance",
    "get_account_documents",

  ]),
  propertyId: z.string().uuid().optional(),
  // Pagination params
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const staticContentSchema = baseRequestSchema.extend({
  action: z.enum([
    "get_cancellation_policies",
    "get_reservation_policies",
    "get_payment_methods",
    "get_property_contact_details",
  ]),
  propertyId: z.string().uuid(),
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

// ============================================================================
// RATE LIMITER
// ============================================================================

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  propertyId: string | undefined,
  endpoint: string
): Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: string; headers: Record<string, string> }> {
  if (!propertyId) return { allowed: true, limit: 0, remaining: 0, resetAt: "", headers: {} };

  // Fetch rate limit config for this property
  const { data: rl } = await supabase
    .from("api_rate_limits")
    .select("*")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .maybeSingle();

  const perMinute = rl?.requests_per_minute ?? 60;
  const perHour = rl?.requests_per_hour ?? 1000;

  // Count requests in last minute
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: minuteCount } = await supabase
    .from("api_request_log")
    .select("*", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("endpoint", endpoint)
    .gte("created_at", oneMinuteAgo);

  const currentMinute = minuteCount ?? 0;
  const remaining = Math.max(0, perMinute - currentMinute);
  const resetAt = new Date(Date.now() + 60_000).toISOString();

  const rateLimitHeaders: Record<string, string> = {
    "X-RateLimit-Limit": String(perMinute),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": resetAt,
    "X-Api-Version": "v1",
  };

  if (currentMinute >= perMinute) {
    return { allowed: false, limit: perMinute, remaining: 0, resetAt, headers: { ...rateLimitHeaders, "Retry-After": "60" } };
  }

  return { allowed: true, limit: perMinute, remaining, resetAt, headers: rateLimitHeaders };
}

async function logApiRequest(
  supabase: ReturnType<typeof createClient>,
  propertyId: string | undefined,
  action: string,
  statusCode: number,
  responseTimeMs: number,
  req: Request,
  errorCode?: string
) {
  try {
    await supabase.from("api_request_log").insert({
      property_id: propertyId || null,
      api_version: "v1",
      action,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
      user_agent: req.headers.get("user-agent") || null,
      error_code: errorCode || null,
      endpoint: "roomsonline-pms-api",
    });
  } catch (e) {
    console.error("[api-request-log] Failed to log:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    console.log("[roomsonline-pms-api] Request:", JSON.stringify(body, null, 2));

    const baseResult = baseRequestSchema.safeParse(body);
    if (!baseResult.success) {
      console.error("[roomsonline-pms-api] Validation error:", baseResult.error);
      const elapsed = Date.now() - startTime;
      logApiRequest(supabase, undefined, "unknown", 400, elapsed, req, ERROR_CODES.INVALID_REQUEST);
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid request format", "unknown", baseResult.error.errors)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { action } = baseResult.data;
    const propertyId = body.propertyId;

    // Rate limit check
    const rateCheck = await checkRateLimit(supabase, propertyId, "roomsonline-pms-api");
    if (!rateCheck.allowed) {
      const elapsed = Date.now() - startTime;
      logApiRequest(supabase, propertyId, action, 429, elapsed, req, "RATE_LIMITED");
      return new Response(
        JSON.stringify(createErrorResponse("RATE_LIMITED", "Rate limit exceeded. Try again later.", action)),
        { headers: { ...corsHeaders, ...rateCheck.headers, "Content-Type": "application/json" }, status: 429 }
      );
    }

    const mergedHeaders = { ...corsHeaders, ...rateCheck.headers, "Content-Type": "application/json" };

    // Every action runs inside a deadline: the platform kills an idle request at
    // 150s with an opaque 504, so we answer with a clear timeout error before that.
    const dispatch = async (): Promise<Response> => {
      let result: Response;

      switch (action) {
      case "get_capabilities":
        result = handleGetCapabilities();
        break;
      case "health_check":
        result = await handleHealthCheck(supabase);
        break;
      case "fetch_availability":
        result = await handleFetchAvailability(body, supabase);
        break;
      case "get_room_types":
        result = await handleGetRoomTypes(body, supabase);
        break;
      case "get_rate_types":
        result = await handleGetRateTypes(body, supabase);
        break;
      case "get_reservations":
        result = await handleGetReservations(body, supabase);
        break;
      case "create_reservation":
        result = await handleCreateReservation(body, supabase);
        break;
      case "modify_reservation":
        result = await handleModifyReservation(body, supabase);
        break;
      case "cancel_reservation":
        result = await handleCancelReservation(body, supabase);
        break;
      case "set_availability":
        result = await handleSetAvailability(body, supabase);
        break;
      case "set_rates":
        result = await handleSetRates(body, supabase);
        break;
      case "get_physical_rooms":
        result = await handleGetPhysicalRooms(body, supabase);
        break;
      case "create_physical_room":
        result = await handleCreatePhysicalRoom(body, supabase);
        break;
      case "update_room_status":
        result = await handleUpdateRoomStatus(body, supabase);
        break;
      case "get_rolos_room_types":
        result = await handleGetRolosRoomTypes(body, supabase);
        break;
      case "create_rolos_room_type":
        result = await handleCreateRolosRoomType(body, supabase);
        break;
      case "update_rolos_room_type":
        result = await handleUpdateRolosRoomType(body, supabase);
        break;
      case "get_rate_plans":
        result = await handleGetRatePlans(body, supabase);
        break;
      case "create_rate_plan":
        result = await handleCreateRatePlan(body, supabase);
        break;
      case "get_rate_seasons":
        result = await handleGetRateSeasons(body, supabase);
        break;
      case "create_rate_season":
        result = await handleCreateRateSeason(body, supabase);
        break;
      case "set_rate_prices":
        result = await handleSetRatePrices(body, supabase);
        break;
      case "get_guest_profiles":
        result = await handleGetGuestProfiles(body, supabase);
        break;
      case "get_guest_profile":
        result = await handleGetGuestProfile(body, supabase);
        break;
      case "create_guest_profile":
        result = await handleCreateGuestProfile(body, supabase);
        break;
      case "update_guest_profile":
        result = await handleUpdateGuestProfile(body, supabase);
        break;
      case "delete_guest_profile":
        result = await handleDeleteGuestProfile(body, supabase);
        break;

      case "check_in":
        result = await handleCheckIn(body, supabase);
        break;
      case "check_out":
        result = await handleCheckOut(body, supabase);
        break;
      case "get_folio":
        result = await handleGetFolio(body, supabase);
        break;
      case "add_folio_charge":
        result = await handleAddFolioCharge(body, supabase);
        break;
      case "process_folio_payment":
        result = await handleProcessFolioPayment(body, supabase);
        break;
      case "get_housekeeping_board":
        result = await handleGetHousekeepingBoard(body, supabase);
        break;
      case "assign_housekeeping_task":
        result = await handleAssignHousekeepingTask(body, supabase);
        break;
      case "complete_housekeeping_task":
        result = await handleCompleteHousekeepingTask(body, supabase);
        break;
      case "get_daily_metrics":
        result = await handleGetDailyMetrics(body, supabase);
        break;
      case "apply_service_charges":
        result = await handleApplyServiceCharges(body, supabase);
        break;
      case "apply_package":
        result = await handleApplyPackage(body, supabase);
        break;
      case "backfill_revenue_streams":
        result = await handleBackfillRevenueStreams(body, supabase);
        break;
      case "process_checkout_refunds":
        result = await handleProcessCheckoutRefunds(body, supabase);
        break;
      case "get_booking_charges":
        result = await handleGetBookingCharges(body, supabase);
        break;
      case "update_inventory":
        result = await handleUpdateInventory(body, supabase);
        break;
      case "check_inventory":
        result = await handleCheckInventory(body, supabase);
        break;
      case "backfill_inventory":
        result = await handleBackfillInventory(body, supabase);
        break;
      case "get_cancellation_policies":
        result = await handleGetCancellationPolicies(body, supabase);
        break;
      case "get_reservation_policies":
        result = await handleGetReservationPolicies(body, supabase);
        break;
      case "get_payment_methods":
        result = await handleGetPaymentMethods(body, supabase);
        break;
      case "get_property_contact_details":
      case "get_contact_details":
        result = await handleGetPropertyContactDetails(body, supabase);
        break;
      case "get_property_profile":
        result = await handleGetPropertyProfile(body, supabase);
        break;
      case "get_ui_config":
        result = await handleGetUiConfig(body, supabase);
        break;
      case "subscribe_webhook":
        result = await handleSubscribeWebhook(body, supabase);
        break;
      case "unsubscribe_webhook":
        result = await handleUnsubscribeWebhook(body, supabase);
        break;
      case "list_webhook_subscriptions":
        result = await handleListWebhookSubscriptions(body, supabase);
        break;
      case "test_webhook":
        result = await handleTestWebhook(body, supabase);
        break;
      case "get_webhook_logs":
        result = await handleGetWebhookLogs(body, supabase);
        break;
      case "get_account_balance":
        result = await handleGetAccountBalance(body, supabase, req);
        break;
      case "get_account_documents":
        result = await handleGetAccountDocuments(body, supabase, req);
        break;
      default: {

        const elapsed = Date.now() - startTime;
        logApiRequest(supabase, propertyId, action, 400, elapsed, req, ERROR_CODES.INVALID_REQUEST);
        return new Response(
          JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, `Unknown action: ${action}`, action)),
          { headers: { ...mergedHeaders }, status: 400 }
        );
      }
      }

      return result;
    };

    const ACTION_DEADLINE_MS = 110_000;
    let timer: number | undefined;
    let result: Response;
    try {
      result = await Promise.race([
        dispatch(),
        new Promise<Response>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("ACTION_TIMEOUT")), ACTION_DEADLINE_MS);
        }),
      ]);
    } catch (raceError) {
      if (raceError instanceof Error && raceError.message === "ACTION_TIMEOUT") {
        const elapsedT = Date.now() - startTime;
        logApiRequest(supabase, propertyId, action, 504, elapsedT, req, "TIMEOUT");
        return new Response(
          JSON.stringify(
            createErrorResponse(
              "TIMEOUT",
              `Action "${action}" did not finish within ${Math.round(ACTION_DEADLINE_MS / 1000)}s. Narrow the date range or retry.`,
              action
            )
          ),
          { headers: { ...mergedHeaders }, status: 504 }
        );
      }
      throw raceError;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    // Log and return with rate limit headers
    const elapsed = Date.now() - startTime;
    logApiRequest(supabase, propertyId, action, result.status, elapsed, req);

    // Clone response to add rate limit headers
    const body2 = await result.text();
    return new Response(body2, {
      status: result.status,
      headers: { ...Object.fromEntries(result.headers.entries()), ...rateCheck.headers },
    });
  } catch (error) {
    console.error("[roomsonline-pms-api] Unhandled error:", error);
    const elapsed = Date.now() - startTime;
    logApiRequest(supabase, undefined, "unknown", 500, elapsed, req, ERROR_CODES.INTERNAL_ADAPTER_ERROR);
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
async function handleHealthCheck(supabase: any): Promise<Response> {
  console.log("[roomsonline-pms-api] Performing health check");
  
  try {
    // Test database connectivity by checking cache tables
    const { error: dbError } = await supabase
      .from("pms_room_types_cache")
      .select("id")
      .eq("system_type", SOURCE)
      .limit(1);

    if (dbError) {
      return new Response(
        JSON.stringify(createErrorResponse(ERROR_CODES.PMS_UNAVAILABLE, `Database error: ${dbError.message}`, "health_check")),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 }
      );
    }

    return new Response(
      JSON.stringify(createSuccessResponse({
        status: "ok",
        healthy: true,
        message: "RoomsOnline native PMS is operational",
      }, "health_check")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, String(error), "health_check")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
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

  // FIX: Support both 'roomsonline' and 'rol' system_type for backward compatibility
  const { data: availabilityData, error: availError } = await supabase
    .from("pms_availability_cache")
    .select("*")
    .eq("property_id", propertyId)
    .in("system_type", [SOURCE, "rol"])
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
    .in("system_type", [SOURCE, "rol"]);

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
    .in("system_type", [SOURCE, "rol"]);

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
    .in("system_type", [SOURCE, "rol"]);

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
async function handleGetReservations(body: { propertyId?: string; start_date?: string; end_date?: string; limit?: number; offset?: number }, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId is required", "get_reservations")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  const queryLimit = Math.min(body.limit || 100, 500);
  const queryOffset = body.offset || 0;

  console.log(`[roomsonline-pms-api] Fetching reservations for property ${body.propertyId} (limit=${queryLimit}, offset=${queryOffset})`);

  // Query from both pms_reservations cache AND rolos_reservations
  let cacheQuery = supabase
    .from("pms_reservations")
    .select("*", { count: "exact" })
    .eq("property_id", body.propertyId)
    .in("system_type", [SOURCE, "rol"])
    .order("arrival_date", { ascending: true })
    .range(queryOffset, queryOffset + queryLimit - 1);

  if (body.start_date) cacheQuery = cacheQuery.gte("arrival_date", body.start_date);
  if (body.end_date) cacheQuery = cacheQuery.lte("departure_date", body.end_date);

  const { data, error, count } = await cacheQuery;

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

  const totalCount = count || 0;

  return new Response(
    JSON.stringify(createSuccessResponse({ 
      reservations,
      total_count: totalCount,
      has_more: queryOffset + queryLimit < totalCount,
    }, "get_reservations")),
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
  // FIX: Resolve UUID room_type_ids to slug-based external_room_type_ids used in cache
  const rawRoomTypeIds = [...new Set(rooms.map(r => r.room_type_id))];
  const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  
  // Build a map from UUID → slug for any UUID-format room_type_ids
  const uuidToSlugMap = new Map<string, string>();
  const uuidIds = rawRoomTypeIds.filter(isUuid);
  
  if (uuidIds.length > 0) {
    console.log(`[roomsonline-pms-api] Resolving ${uuidIds.length} UUID room_type_ids to cache slugs`);
    
    // Check hostfully_room_types first (overview table)
    const { data: hfTypes } = await supabase
      .from("hostfully_room_types")
      .select("id, name, linked_rolos_id")
      .in("id", uuidIds);
    
    // Also check rolos_room_types  
    const { data: rolosTypes } = await supabase
      .from("rolos_room_types")
      .select("id, name, linked_overview_id")
      .in("id", uuidIds);
    
    // Check pms_room_types_cache for matching slug IDs
    const { data: cacheTypes } = await supabase
      .from("pms_room_types_cache")
      .select("external_room_type_id, name")
      .eq("property_id", propertyId)
      .in("system_type", [SOURCE, "rol"]);
    
    const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cacheSlugMap = new Map<string, string>();
    for (const ct of (cacheTypes || [])) {
      cacheSlugMap.set(slugify(ct.name), ct.external_room_type_id);
      cacheSlugMap.set(ct.external_room_type_id, ct.external_room_type_id);
    }
    
    for (const uuid of uuidIds) {
      const hfMatch = (hfTypes || []).find(h => h.id === uuid);
      const rolosMatch = (rolosTypes || []).find(r => r.id === uuid);
      const name = hfMatch?.name || rolosMatch?.name;
      
      if (name) {
        const slug = slugify(name);
        const cacheId = cacheSlugMap.get(slug);
        if (cacheId) {
          uuidToSlugMap.set(uuid, cacheId);
          console.log(`[roomsonline-pms-api] Mapped UUID ${uuid} → slug "${cacheId}" (via name "${name}")`);
        } else {
          // Use slug directly as the external_room_type_id
          uuidToSlugMap.set(uuid, slug);
          console.log(`[roomsonline-pms-api] Mapped UUID ${uuid} → slugified "${slug}" (no cache match)`);
        }
      }
    }
  }
  
  // Resolve room type IDs: use slug if UUID was mapped, otherwise keep original
  const resolvedRoomTypeIds = rawRoomTypeIds.map(id => uuidToSlugMap.get(id) || id);
  
  // FIX: Support both 'roomsonline' and 'rol' system_type for backward compatibility
  const { data: currentAvailability, error: availError } = await supabase
    .from("pms_availability_cache")
    .select("*")
    .eq("property_id", propertyId)
    .in("system_type", [SOURCE, "rol"])
    .in("external_room_type_id", resolvedRoomTypeIds)
    .gte("date", arrival_date)
    .lt("date", departure_date);

  if (availError) {
    console.error("[roomsonline-pms-api] Error checking availability:", availError);
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, "Failed to validate availability", "create_reservation", availError)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // Count required rooms per type (using resolved slug IDs)
  const requiredRooms = new Map<string, number>();
  for (const room of rooms) {
    const resolvedId = uuidToSlugMap.get(room.room_type_id) || room.room_type_id;
    requiredRooms.set(resolvedId, (requiredRooms.get(resolvedId) || 0) + 1);
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

  // Create reservation in pms_reservations (cache)
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

  // Also create in rolos_reservations (operational table)
  const { data: rolosRes, error: rolosInsertErr } = await supabase
    .from("rolos_reservations")
    .insert({
      property_id: propertyId,
      status: "confirmed",
      confirmation_number: confirmationNumber,
      check_in: arrival_date,
      check_out: departure_date,
      guest_name: guest.name,
      guest_email: guest.email || null,
      guest_phone: guest.phone || null,
      total_amount: totalAmount,
      currency: "ZAR",
      special_requests: parsed.data.special_requests || null,
      source: "direct",
    })
    .select("id")
    .single();

  if (rolosInsertErr) {
    console.warn("[roomsonline-pms-api] Warning: Failed to insert rolos_reservation:", rolosInsertErr.message);
  } else if (rolosRes) {
    // Insert reservation rooms
    const roomInserts = rooms.map(r => ({
      reservation_id: rolosRes.id,
      room_type_id: r.room_type_id,
      adults: r.adults,
      children: r.children,
      teens: r.teens,
      infants: r.infants,
    }));
    await supabase.from("rolos_reservation_rooms").insert(roomInserts);

    // Log status history
    await supabase.from("rolos_reservation_status_history").insert({
      reservation_id: rolosRes.id,
      new_status: "confirmed",
      reason: "Reservation created",
    });
  }

  // Hold inventory on the authoritative calendar and mirror it into the
  // availability cache the booking engine + channel pushes read. Derived (not
  // delta-applied) and upserted, so missing cache rows are created instead of
  // leaving sold rooms sellable online. Runs regardless of whether the
  // operational rolos_reservations insert succeeded — inventory must not drift.
  for (const [roomTypeId, requiredCount] of requiredRooms.entries()) {
    await applyBookedInventory(supabase, propertyId, roomTypeId, arrival_date, departure_date, requiredCount);
  }

  console.log(`[roomsonline-pms-api] Reservation created successfully: ${reservationId}`);

  // Fire webhook event
  await queueWebhookEvent(supabase, propertyId, "booking.created", {
    booking_id: rolosRes?.id || reservationId,
    reservation_id: reservationId,
    guest_name: guest.name,
    arrival_date,
    departure_date,
    status: "confirmed",
    total_amount: totalAmount,
    rooms,
  });

  return new Response(
    JSON.stringify(createSuccessResponse({
      reservation_id: reservationId,
      confirmation_number: confirmationNumber,
      status: "confirmed",
      rolos_reservation_id: rolosRes?.id || null,
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

  // Move inventory: release the original stay, hold the new one, then mirror
  // both ranges into the availability cache from the authoritative calendar.
  if (finalArrival !== existing.arrival_date || finalDeparture !== existing.departure_date) {
    for (const [roomTypeId, count] of requiredRooms.entries()) {
      await applyBookedInventory(supabase, propertyId, roomTypeId, existing.arrival_date, existing.departure_date, -count);
      await applyBookedInventory(supabase, propertyId, roomTypeId, finalArrival, finalDeparture, count);
    }
  }

  // Also update rolos_reservations if exists
  const { data: rolosRes } = await supabase.from("rolos_reservations")
    .select("id, status")
    .eq("property_id", propertyId)
    .eq("confirmation_number", reservation_id)
    .maybeSingle();
  if (rolosRes) {
    await supabase.from("rolos_reservations").update({
      check_in: finalArrival,
      check_out: finalDeparture,
    }).eq("id", rolosRes.id);
    await supabase.from("rolos_reservation_status_history").insert({
      reservation_id: rolosRes.id,
      old_status: rolosRes.status,
      new_status: rolosRes.status,
      reason: `Dates modified: ${finalArrival} to ${finalDeparture}`,
    });
  }

  console.log(`[roomsonline-pms-api] Reservation modified successfully: ${reservation_id}`);

  // Fire webhook event
  await queueWebhookEvent(supabase, propertyId, "booking.modified", {
    booking_id: rolosRes?.id || reservation_id,
    reservation_id,
    arrival_date: finalArrival,
    departure_date: finalDeparture,
    status: existing.status,
  });

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

  // Release inventory on the authoritative calendar, then mirror to the cache
  // (derive-and-upsert: never delta-patch only pre-existing cache rows).
  for (const [roomTypeId, count] of requiredRooms.entries()) {
    await applyBookedInventory(
      supabase,
      propertyId,
      roomTypeId,
      existing.arrival_date,
      existing.departure_date,
      -count,
    );
  }

  // Also cancel in rolos_reservations if exists
  const { data: rolosRes } = await supabase.from("rolos_reservations")
    .select("id, status")
    .eq("property_id", propertyId)
    .eq("confirmation_number", reservation_id)
    .maybeSingle();
  if (rolosRes && rolosRes.status !== "cancelled") {
    await supabase.from("rolos_reservations").update({ status: "cancelled" }).eq("id", rolosRes.id);
    await supabase.from("rolos_reservation_status_history").insert({
      reservation_id: rolosRes.id,
      old_status: rolosRes.status,
      new_status: "cancelled",
      reason: reason || "Cancellation requested",
    });
  }

  console.log(`[roomsonline-pms-api] Reservation cancelled successfully: ${reservation_id}`);

  // Fire webhook event
  await queueWebhookEvent(supabase, propertyId, "booking.cancelled", {
    booking_id: rolosRes?.id || reservation_id,
    reservation_id,
    arrival_date: existing.arrival_date,
    departure_date: existing.departure_date,
    status: "cancelled",
    reason: reason || null,
  });

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
// ROL'OS NATIVE PMS HANDLERS
// ============================================================================

// deno-lint-ignore no-explicit-any
async function handleGetPhysicalRooms(body: any, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId is required", "get_physical_rooms")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase
    .from("rolos_rooms")
    .select("*, room_type:rolos_room_types(*)")
    .eq("property_id", body.propertyId)
    .order("floor", { ascending: true })
    .order("room_number", { ascending: true });
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_physical_rooms")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse({ rooms: data || [] }, "get_physical_rooms")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleCreatePhysicalRoom(body: any, supabase: any): Promise<Response> {
  const { propertyId, room_number, room_name, room_type_id, floor, max_occupancy, bed_configuration, amenities } = body;
  if (!propertyId || !room_number) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId and room_number required", "create_physical_room")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_rooms").insert({
    property_id: propertyId, room_number, room_name, room_type_id, floor, max_occupancy, bed_configuration, amenities,
  }).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "create_physical_room")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "create_physical_room")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleUpdateRoomStatus(body: any, supabase: any): Promise<Response> {
  const { room_id, status } = body;
  if (!room_id || !status) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "room_id and status required", "update_room_status")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_rooms").update({ status }).eq("id", room_id).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "update_room_status")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "update_room_status")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetRolosRoomTypes(body: any, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId is required", "get_rolos_room_types")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const [{ data, error }, { data: property }] = await Promise.all([
    supabase.from("rolos_room_types").select("*").eq("property_id", body.propertyId).eq("is_active", true),
    supabase.from("properties").select("amenities").eq("id", body.propertyId).maybeSingle(),
  ]);
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_rolos_room_types")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  const legacyRooms: any[] = Array.isArray(property?.amenities?.room_types) ? property.amenities.room_types : [];
  const findLegacy = (rt: any) => legacyRooms.find((lr) =>
    (lr.name && rt.name && String(lr.name).toLowerCase() === String(rt.name).toLowerCase()) ||
    (lr.id && rt.code && String(lr.id) === String(rt.code))
  ) || {};

  const enriched = (data || []).map((rt: any) => {
    const legacy = findLegacy(rt);
    return {
      ...rt,
      standard_occupancy: rt.base_occupancy ?? legacy.maxAdults ?? null,
      bathrooms: legacy.bathrooms ?? null,
      bed_configuration: legacy.bedConfiguration ?? null,
      room_size: legacy.roomSize ?? null,
      min_stay: legacy.minStay ?? null,
      max_stay: legacy.maxStay ?? null,
      max_adults: legacy.maxAdults ?? null,
      max_children: legacy.maxChildren ?? null,
      num_rooms: legacy.numRooms ?? null,
    };
  });

  return new Response(JSON.stringify(createSuccessResponse({ room_types: enriched }, "get_rolos_room_types")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleCreateRolosRoomType(body: any, supabase: any): Promise<Response> {
  const { propertyId, name, code, description, base_occupancy, max_occupancy, default_rate, amenities, images } = body;
  if (!propertyId || !name) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId and name required", "create_rolos_room_type")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_room_types").insert({
    property_id: propertyId, name, code, description, base_occupancy, max_occupancy, default_rate, amenities, images,
  }).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "create_rolos_room_type")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "create_rolos_room_type")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleUpdateRolosRoomType(body: any, supabase: any): Promise<Response> {
  const { room_type_id, ...updates } = body;
  if (!room_type_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "room_type_id required", "update_rolos_room_type")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { propertyId, action, ...safeUpdates } = updates;
  const { data, error } = await supabase.from("rolos_room_types").update(safeUpdates).eq("id", room_type_id).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "update_rolos_room_type")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "update_rolos_room_type")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetRatePlans(body: any, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId is required", "get_rate_plans")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_rate_plans").select("*").eq("property_id", body.propertyId);
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_rate_plans")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse({ rate_plans: data || [] }, "get_rate_plans")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleCreateRatePlan(body: any, supabase: any): Promise<Response> {
  const { propertyId, name, code, description, is_tax_inclusive, min_stay, max_stay, requires_deposit, deposit_percentage, deposit_amount } = body;
  if (!propertyId || !name) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId and name required", "create_rate_plan")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_rate_plans").insert({
    property_id: propertyId, name, code, description, is_tax_inclusive, min_stay, max_stay, requires_deposit, deposit_percentage, deposit_amount,
  }).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "create_rate_plan")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "create_rate_plan")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetRateSeasons(body: any, supabase: any): Promise<Response> {
  if (!body.rate_plan_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "rate_plan_id is required", "get_rate_seasons")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_rate_seasons").select("*, prices:rolos_rate_prices(*)").eq("rate_plan_id", body.rate_plan_id).order("start_date");
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_rate_seasons")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse({ seasons: data || [] }, "get_rate_seasons")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleCreateRateSeason(body: any, supabase: any): Promise<Response> {
  const { rate_plan_id, name, start_date, end_date, day_of_week_multipliers, min_stay_override, is_peak } = body;
  if (!rate_plan_id || !name || !start_date || !end_date) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "rate_plan_id, name, start_date, end_date required", "create_rate_season")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_rate_seasons").insert({
    rate_plan_id, name, start_date, end_date, day_of_week_multipliers, min_stay_override, is_peak,
  }).select().single();
  if (error) {
    if (error.message?.includes("exclusion")) {
      return new Response(JSON.stringify(createErrorResponse("CONFLICT", "Season dates overlap with existing season", "create_rate_season")),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 });
    }
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "create_rate_season")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
  return new Response(JSON.stringify(createSuccessResponse(data, "create_rate_season")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleSetRatePrices(body: any, supabase: any): Promise<Response> {
  const { season_id, room_type_id, base_rate, extra_adult_rate, extra_child_rate } = body;
  if (!season_id || !room_type_id || base_rate === undefined) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "season_id, room_type_id, base_rate required", "set_rate_prices")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_rate_prices").upsert({
    season_id, room_type_id, base_rate, extra_adult_rate, extra_child_rate,
  }, { onConflict: "season_id,room_type_id" }).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "set_rate_prices")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "set_rate_prices")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetGuestProfiles(body: any, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId is required", "get_guest_profiles")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const queryLimit = Math.min(body.limit || 100, 500);
  const queryOffset = body.offset || 0;
  let query = supabase.from("rolos_guest_profiles").select("*", { count: "exact" }).eq("property_id", body.propertyId).order("last_stay_date", { ascending: false, nullsFirst: false });
  if (body.search) {
    query = query.or(`full_name.ilike.%${body.search}%,email.ilike.%${body.search}%`);
  }
  query = query.range(queryOffset, queryOffset + queryLimit - 1);
  const { data, error, count } = await query;
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_guest_profiles")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  const totalCount = count || 0;
  return new Response(JSON.stringify(createSuccessResponse({ guests: data || [], total_count: totalCount, has_more: queryOffset + queryLimit < totalCount }, "get_guest_profiles")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetGuestProfile(body: any, supabase: any): Promise<Response> {
  if (!body.guest_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "guest_id required", "get_guest_profile")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_guest_profiles").select("*").eq("id", body.guest_id).single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.NOT_FOUND, "Guest not found", "get_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
  // Get comments
  const { data: comments } = await supabase.from("rolos_guest_comments").select("*, created_by_profile:profiles(full_name)").eq("guest_id", body.guest_id).order("created_at", { ascending: false });
  return new Response(JSON.stringify(createSuccessResponse({ ...data, comments: comments || [] }, "get_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleCreateGuestProfile(body: any, supabase: any): Promise<Response> {
  const { propertyId, full_name, email, phone, nationality, tags, notes } = body;
  if (!propertyId || !full_name) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId and full_name required", "create_guest_profile")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_guest_profiles").insert({
    property_id: propertyId, full_name, email, phone, nationality, tags, notes,
  }).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "create_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "create_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/**
 * Fields a CRM editor may write. Derived read-model columns
 * (total_stays / total_received / total_outstanding / total_cancelled_value /
 * last_stay_date) are owned by rebuild_guest_stats and never accepted here.
 */
const GUEST_EDITABLE_FIELDS = [
  "full_name", "email", "phone", "nationality", "date_of_birth", "address",
  "notes", "tags", "is_blacklisted", "is_archived", "preferences",
  "communication_preferences", "complaints",
] as const;

// deno-lint-ignore no-explicit-any
async function handleUpdateGuestProfile(body: any, supabase: any): Promise<Response> {
  const { guest_id } = body;
  if (!guest_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "guest_id required", "update_guest_profile")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  // deno-lint-ignore no-explicit-any
  const safeUpdates: Record<string, any> = {};
  for (const key of GUEST_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) safeUpdates[key] = body[key];
  }
  if (!Object.keys(safeUpdates).length) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "No editable fields supplied", "update_guest_profile")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  if (typeof safeUpdates.full_name === "string") {
    safeUpdates.full_name = safeUpdates.full_name.trim();
    if (!safeUpdates.full_name) {
      return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "full_name cannot be empty", "update_guest_profile")),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }
  }
  safeUpdates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("rolos_guest_profiles").update(safeUpdates).eq("id", guest_id).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "update_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "update_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/**
 * Permanent delete — refused when booking history exists so records never
 * end up orphaned. The caller is told to archive instead.
 */
// deno-lint-ignore no-explicit-any
async function handleDeleteGuestProfile(body: any, supabase: any): Promise<Response> {
  const { guest_id } = body;
  if (!guest_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "guest_id required", "delete_guest_profile")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { count, error: countError } = await supabase
    .from("bookings").select("id", { count: "exact", head: true }).eq("rolos_guest_id", guest_id);
  if (countError) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, countError.message, "delete_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  if ((count || 0) > 0) {
    return new Response(JSON.stringify({
      ...createErrorResponse(ERROR_CODES.INVALID_REQUEST, `Guest has ${count} booking(s) — archive instead of deleting`, "delete_guest_profile"),
      reason: "HAS_BOOKINGS",
      booking_count: count,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 });
  }
  await supabase.from("rolos_guest_comments").delete().eq("guest_id", guest_id);
  const { error } = await supabase.from("rolos_guest_profiles").delete().eq("id", guest_id);
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "delete_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse({ deleted: true, guest_id }, "delete_guest_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}



/**
 * Tell the Channel Manager about a lifecycle change. Check-in is what accepts a still-held channel
 * request, so this must run even though the local status write already happened — the trigger's
 * background job is deduped per booking and can drop a status change queued behind another.
 */
// deno-lint-ignore no-explicit-any
async function notifyChannelOfLifecycle(supabase: any, bookingId: string, change: "confirmed" | "status", source: string) {
  try {
    await supabase.functions.invoke("channel-booking-sync", {
      body: { booking_id: bookingId, change, source },
    });
  } catch (err) {
    console.warn("[pms-api] channel lifecycle sync failed:", err);
  }
}

// deno-lint-ignore no-explicit-any
async function handleCheckIn(body: any, supabase: any): Promise<Response> {
  const { booking_id, override_room_ids, override_total_price } = body;
  if (!booking_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id required", "check_in")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  // Fetch booking first to check room readiness
  const { data: existingBooking, error: fetchErr } = await supabase.from("bookings").select("*").eq("id", booking_id).single();
  if (fetchErr || !existingBooking) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, fetchErr?.message || "Booking not found", "check_in")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
  }

  // Determine which rooms to use (override or original)
  const roomIdsToUse: string[] = override_room_ids || existingBooking.rolos_room_ids || [];

  // Check room readiness
  if (roomIdsToUse.length > 0) {
    const { data: roomStatuses } = await supabase.from("rolos_rooms").select("id, room_number, status").in("id", roomIdsToUse);
    const unreadyRooms = (roomStatuses || []).filter((r: any) => r.status !== "available" && r.status !== "occupied");
    if (unreadyRooms.length > 0 && !override_room_ids) {
      // Return error with room status details so UI can offer reassignment
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "ROOMS_NOT_READY",
          message: `Room(s) not ready: ${unreadyRooms.map((r: any) => `${r.room_number} (${r.status})`).join(", ")}`,
          details: { unready_rooms: unreadyRooms },
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 });
    }
  }

  // If overriding rooms, update booking with new room assignments and optional price
  const updatePayload: any = {
    status: "checked_in",
    rolos_check_in_time: new Date().toISOString(),
  };
  if (override_room_ids) {
    updatePayload.rolos_room_ids = override_room_ids;
  }
  if (override_total_price !== undefined && override_total_price !== null) {
    updatePayload.total_price = override_total_price;
  }

  const { data: booking, error } = await supabase.from("bookings").update(updatePayload).eq("id", booking_id).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "check_in")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  // Ensure guest profile exists and link
  if (booking && !booking.rolos_guest_id && booking.guest_email) {
    const guestId = await ensureGuestProfile(supabase, booking.property_id, booking.guest_name, booking.guest_email, booking.guest_phone, booking.total_price, booking.guest_nationality);
    if (guestId) {
      await supabase.from("bookings").update({ rolos_guest_id: guestId }).eq("id", booking_id);
      await rebuildGuestStats(supabase, [guestId]);
    }
  }

  // Mark assigned rooms as occupied (use final room list)
  const finalRoomIds = booking?.rolos_room_ids || [];
  if (finalRoomIds.length > 0) {
    await supabase.from("rolos_rooms").update({ status: "occupied" }).in("id", finalRoomIds);
  }
  // Also try rolos_booking_rooms table
  const { data: assignedRooms } = await supabase.from("rolos_booking_rooms").select("room_id").eq("booking_id", booking_id);
  if (assignedRooms?.length) {
    const extraIds = assignedRooms.map((r: any) => r.room_id).filter((id: string) => !finalRoomIds.includes(id));
    if (extraIds.length) await supabase.from("rolos_rooms").update({ status: "occupied" }).in("id", extraIds);
  }

  // Fire webhook event
  if (booking) {
    await queueWebhookEvent(supabase, booking.property_id, "booking.checked_in", {
      booking_id,
      guest_name: booking.guest_name,
      arrival_date: booking.check_in_date,
      departure_date: booking.check_out_date,
      status: "checked_in",
      rooms_assigned: finalRoomIds,
    });
  }

  // Accept the request / confirm the reservation at the channel.
  await notifyChannelOfLifecycle(supabase, booking_id, "confirmed", "pms_check_in");

  return new Response(JSON.stringify(createSuccessResponse(booking, "check_in")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleCheckOut(body: any, supabase: any): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id required", "check_out")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data: booking, error } = await supabase.from("bookings").update({
    status: "checked_out",
    rolos_check_out_time: new Date().toISOString(),
  }).eq("id", booking_id).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "check_out")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  // Ensure guest profile on checkout too
  if (booking && !booking.rolos_guest_id && booking.guest_email) {
    const guestId = await ensureGuestProfile(supabase, booking.property_id, booking.guest_name, booking.guest_email, booking.guest_phone, booking.total_price, booking.guest_nationality);
    if (guestId) {
      await supabase.from("bookings").update({ rolos_guest_id: guestId }).eq("id", booking_id);
      await rebuildGuestStats(supabase, [guestId]);
    }
  }
  // Get room IDs from booking_rooms table OR fallback to rolos_room_ids on the booking
  const { data: assignedRooms } = await supabase.from("rolos_booking_rooms").select("room_id").eq("booking_id", booking_id);
  let roomIds: string[] = assignedRooms?.length ? assignedRooms.map((r: any) => r.room_id) : [];
  // Fallback: use rolos_room_ids from the booking record itself
  if (!roomIds.length && booking?.rolos_room_ids?.length) {
    roomIds = booking.rolos_room_ids;
  }
  if (roomIds.length) {
    console.log(`[check_out] Marking ${roomIds.length} room(s) as dirty:`, roomIds);
    await supabase.from("rolos_rooms").update({ status: "dirty" }).in("id", roomIds);
    // Create cleaning tasks
    const { data: existingTasks } = await supabase.from("rolos_housekeeping_tasks")
      .select("room_id").in("room_id", roomIds).eq("status", "pending").eq("task_type", "clean");
    const existingRoomIds = new Set((existingTasks || []).map((t: any) => t.room_id));
    const newTaskRoomIds = roomIds.filter((id: string) => !existingRoomIds.has(id));
    if (newTaskRoomIds.length) {
      await supabase.from("rolos_housekeeping_tasks").insert(
        newTaskRoomIds.map((room_id: string) => ({
          room_id, task_type: "clean", priority: "normal", status: "pending",
          scheduled_date: new Date().toISOString().split("T")[0],
        }))
      );
    }
  }
  // Process on_checkout refunds before closing folio
  const { data: pendingRefunds } = await supabase.from("rolos_booking_charges")
    .select("id, name, amount, folio_transaction_id")
    .eq("booking_id", booking_id)
    .eq("is_refundable", true)
    .eq("refund_timing", "on_checkout")
    .eq("refund_status", "pending");
  if (pendingRefunds?.length) {
    let { data: folio } = await supabase.from("rolos_folios").select("id").eq("booking_id", booking_id).single();
    if (!folio) {
      const { data: newFolio } = await supabase.from("rolos_folios").insert({ booking_id }).select("id").single();
      folio = newFolio;
    }
    for (const charge of pendingRefunds) {
      const { data: refundTx } = await supabase.from("rolos_folio_transactions").insert({
        folio_id: folio.id,
        transaction_type: "refund",
        description: `Refund: ${charge.name}`,
        amount: -Math.abs(charge.amount),
      }).select("id").single();
      await supabase.from("rolos_booking_charges").update({
        refund_status: "processed",
        refund_transaction_id: refundTx?.id || null,
      }).eq("id", charge.id);
    }
    console.log(`[check_out] Processed ${pendingRefunds.length} on-checkout refund(s)`);
  }
  // Close folio
  await supabase.from("rolos_folios").update({ status: "closed", closed_at: new Date().toISOString() }).eq("booking_id", booking_id);

  // Fire webhook event
  if (booking) {
    await queueWebhookEvent(supabase, booking.property_id, "booking.checked_out", {
      booking_id,
      guest_name: booking.guest_name,
      arrival_date: booking.check_in_date,
      departure_date: booking.check_out_date,
      status: "checked_out",
    });
  }

  await notifyChannelOfLifecycle(supabase, booking_id, "status", "pms_check_out");

  return new Response(JSON.stringify(createSuccessResponse(booking, "check_out")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Stable references so folio seeding is a lookup, not a heuristic. */
const SEED_ACCOMMODATION_REF = "ROL-SEED-ACCOMMODATION";
const SEED_SETTLEMENT_REF = "ROL-SEED-EXTERNAL-SETTLEMENT";

/** Seeds an empty folio from the booking (accommodation charge + already-collected payment).
 *  Idempotent: only runs when the folio has zero transactions. */
// deno-lint-ignore no-explicit-any
async function seedFolioFromBooking(supabase: any, folioId: string, booking: any): Promise<void> {
  const total = Number(booking?.total_price) || 0;
  const paid = Number(booking?.amount_paid) || 0;
  if (total <= 0 && paid <= 0) return;

  const rows: Record<string, unknown>[] = [];
  if (total > 0) {
    rows.push({
      folio_id: folioId,
      transaction_type: "charge",
      description: "Accommodation",
      amount: total,
      revenue_stream: "accommodation",
      reference: SEED_ACCOMMODATION_REF,
    });
  }
  if (paid > 0) {
    const viaChannel = booking?.amount_paid_source === "channel";
    rows.push({
      folio_id: folioId,
      transaction_type: "payment",
      description: viaChannel
        ? `Settled externally via ${booking?.booking_channel ?? "channel"}`
        : "Settled externally (paid direct to property)",
      amount: -Math.abs(paid),
      revenue_stream: "accommodation",
      reference: SEED_SETTLEMENT_REF,
    });
  }
  if (rows.length) await supabase.from("rolos_folio_transactions").insert(rows);
}

// deno-lint-ignore no-explicit-any
async function handleGetFolio(body: any, supabase: any): Promise<Response> {
  if (!body.booking_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id required", "get_folio")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const folioSelect = "*, transactions:rolos_folio_transactions(*)";
  let { data: folio } = await supabase.from("rolos_folios").select(folioSelect).eq("booking_id", body.booking_id).maybeSingle();
  if (!folio) {
    const { data: newFolio, error: createError } = await supabase.from("rolos_folios")
      .insert({ booking_id: body.booking_id }).select(folioSelect).single();
    if (createError) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, createError.message, "get_folio")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
    folio = newFolio;
  }

  const { data: booking } = await supabase.from("bookings")
    .select("payment_status, total_price, amount_paid, amount_paid_source, booking_channel")
    .eq("id", body.booking_id).maybeSingle();

  // Seed once from the booking so externally settled stays never open on an empty folio.
  if (booking && (folio.transactions || []).length === 0) {
    await seedFolioFromBooking(supabase, folio.id, booking);
    const { data: reloaded } = await supabase.from("rolos_folios").select(folioSelect).eq("id", folio.id).maybeSingle();
    if (reloaded) folio = reloaded;
  }

  const paidExternally = booking?.payment_status === "paid_externally";
  const payload = {
    ...folio,
    external_settlement: paidExternally,
    settlement_source: paidExternally ? (booking?.amount_paid_source ?? null) : null,
    booking_total: Number(booking?.total_price) || 0,
    amount_paid: Number(booking?.amount_paid) || 0,
  };

  return new Response(JSON.stringify(createSuccessResponse(payload, "get_folio")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


// deno-lint-ignore no-explicit-any
async function handleAddFolioCharge(body: any, supabase: any): Promise<Response> {
  const { booking_id, description, amount, tax_amount, transaction_type, revenue_stream } = body;
  if (!booking_id || !description || amount === undefined) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id, description, amount required", "add_folio_charge")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  // Ensure folio exists
  let { data: folio } = await supabase.from("rolos_folios").select("id").eq("booking_id", booking_id).single();
  if (!folio) {
    const { data: newFolio } = await supabase.from("rolos_folios").insert({ booking_id }).select("id").single();
    folio = newFolio;
  }
  const { data, error } = await supabase.from("rolos_folio_transactions").insert({
    folio_id: folio.id, transaction_type: transaction_type || "charge", description, amount, tax_amount,
    revenue_stream: normalizeRevenueStream(revenue_stream),
  }).select().single();

  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "add_folio_charge")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "add_folio_charge")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleProcessFolioPayment(body: any, supabase: any): Promise<Response> {
  const { booking_id, amount, payment_method, reference } = body;
  if (!booking_id || amount === undefined) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id and amount required", "process_folio_payment")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  let { data: folio } = await supabase.from("rolos_folios").select("id").eq("booking_id", booking_id).maybeSingle();
  if (!folio) {
    const { data: newFolio } = await supabase.from("rolos_folios").insert({ booking_id }).select("id").single();
    folio = newFolio;
  }

  // Guard: never collect again on a stay the channel/property already settled.
  const { data: guardBooking } = await supabase.from("bookings")
    .select("payment_status").eq("id", booking_id).maybeSingle();
  if (guardBooking?.payment_status === "paid_externally") {
    const { data: existing } = await supabase.from("rolos_folio_transactions")
      .select("amount").eq("folio_id", folio.id);
    // deno-lint-ignore no-explicit-any
    const rows = (existing || []) as any[];
    const charges = rows.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
    const payments = rows.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const outstanding = charges - payments;
    if (Math.abs(amount) > outstanding + 0.01) {
      return new Response(JSON.stringify(createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        outstanding <= 0
          ? "This booking is settled externally — there is nothing to collect."
          : `This booking is settled externally — at most ${outstanding.toFixed(2)} is outstanding.`,
        "process_folio_payment",
      )), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }
  }

  const { data, error } = await supabase.from("rolos_folio_transactions").insert({
    folio_id: folio.id, transaction_type: "payment", description: `Payment - ${payment_method || "cash"}`,
    amount: -Math.abs(amount), reference,
  }).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "process_folio_payment")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "process_folio_payment")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetHousekeepingBoard(body: any, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "get_housekeeping_board")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data: rooms, error } = await supabase.from("rolos_rooms")
    .select("*, room_type:rolos_room_types(name), tasks:rolos_housekeeping_tasks(*, assigned_profile:profiles(full_name))")
    .eq("property_id", body.propertyId)
    .order("floor", { ascending: true })
    .order("room_number", { ascending: true });
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_housekeeping_board")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse({ rooms: rooms || [] }, "get_housekeeping_board")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleAssignHousekeepingTask(body: any, supabase: any): Promise<Response> {
  const { task_id, assigned_to } = body;
  if (!task_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "task_id required", "assign_housekeeping_task")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_housekeeping_tasks").update({ assigned_to, status: "assigned" }).eq("id", task_id).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "assign_housekeeping_task")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  return new Response(JSON.stringify(createSuccessResponse(data, "assign_housekeeping_task")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleCompleteHousekeepingTask(body: any, supabase: any): Promise<Response> {
  const { task_id, notes } = body;
  if (!task_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "task_id required", "complete_housekeeping_task")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data: task, error } = await supabase.from("rolos_housekeeping_tasks").update({
    status: "completed", completed_date: new Date().toISOString(), notes,
  }).eq("id", task_id).select().single();
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "complete_housekeeping_task")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  // If cleaning task completed, mark room as available (but NOT for maintenance tasks)
  if (task.task_type === "clean" || task.task_type === "deep_clean") {
    await supabase.from("rolos_rooms").update({ status: "available" }).eq("id", task.room_id);
  }
  // Maintenance tasks: room stays in maintenance/out_of_order until room_ready_confirmed via frontend
  return new Response(JSON.stringify(createSuccessResponse(task, "complete_housekeeping_task")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetDailyMetrics(body: any, supabase: any): Promise<Response> {
  if (!body.propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "get_daily_metrics")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const startDate = body.start_date || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const endDate = body.end_date || new Date().toISOString().split("T")[0];
  const queryLimit = Math.min(body.limit || 100, 500);
  const queryOffset = body.offset || 0;
  const { data, error, count } = await supabase.from("rolos_daily_metrics").select("*", { count: "exact" })
    .eq("property_id", body.propertyId).gte("date", startDate).lte("date", endDate).order("date")
    .range(queryOffset, queryOffset + queryLimit - 1);
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_daily_metrics")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  const totalCount = count || 0;
  return new Response(JSON.stringify(createSuccessResponse({ metrics: data || [], total_count: totalCount, has_more: queryOffset + queryLimit < totalCount }, "get_daily_metrics")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// INVENTORY CALENDAR HANDLERS
// ============================================================================

// deno-lint-ignore no-explicit-any
async function handleUpdateInventory(body: any, supabase: any): Promise<Response> {
  const { propertyId, room_type_id, entries } = body;
  if (!propertyId || !room_type_id || !entries || !Array.isArray(entries)) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId, room_type_id, entries[] required", "update_inventory")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const upserts = entries.map((e: any) => ({
    property_id: propertyId,
    room_type_id,
    date: e.date,
    total_units: e.total_units ?? 0,
    booked_units: e.booked_units ?? 0,
    blocked_units: e.blocked_units ?? 0,
    restrictions: e.restrictions ?? {},
  }));

  const { error } = await supabase.from("rolos_inventory_calendar").upsert(upserts, {
    onConflict: "property_id,room_type_id,date",
  });

  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "update_inventory")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  return new Response(JSON.stringify(createSuccessResponse({ updated_count: upserts.length }, "update_inventory")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleCheckInventory(body: any, supabase: any): Promise<Response> {
  const { propertyId, room_type_id, start_date, end_date } = body;
  if (!propertyId || !start_date || !end_date) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId, start_date, end_date required", "check_inventory")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  let query = supabase.from("rolos_inventory_calendar").select("*")
    .eq("property_id", propertyId)
    .gte("date", start_date)
    .lte("date", end_date)
    .order("date");
  
  if (room_type_id) query = query.eq("room_type_id", room_type_id);

  const { data, error } = await query;
  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "check_inventory")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  return new Response(JSON.stringify(createSuccessResponse({ inventory: data || [] }, "check_inventory")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleBackfillInventory(body: any, supabase: any): Promise<Response> {
  const { propertyId, days_ahead } = body;
  if (!propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "backfill_inventory")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  // Get all room types for this property
  const { data: roomTypes, error: rtError } = await supabase.from("rolos_room_types").select("id").eq("property_id", propertyId).eq("is_active", true);
  if (rtError) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, rtError.message, "backfill_inventory")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  const daysToFill = days_ahead || 395;
  let totalInserted = 0;

  for (const rt of (roomTypes || [])) {
    // Count physical rooms of this type
    const { count: roomCount } = await supabase.from("rolos_rooms").select("id", { count: "exact", head: true })
      .eq("room_type_id", rt.id).eq("property_id", propertyId);

    const totalUnits = roomCount || 1;
    const upserts = [];
    for (let i = 0; i < daysToFill; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      upserts.push({
        property_id: propertyId,
        room_type_id: rt.id,
        date: d.toISOString().split("T")[0],
        total_units: totalUnits,
        booked_units: 0,
        blocked_units: 0,
      });
    }

    const { error } = await supabase.from("rolos_inventory_calendar").upsert(upserts, {
      onConflict: "property_id,room_type_id,date",
    });
    if (!error) totalInserted += upserts.length;
  }

  return new Response(JSON.stringify(createSuccessResponse({ backfilled_count: totalInserted, room_types: (roomTypes || []).length }, "backfill_inventory")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Resolves (or creates) the guest profile for a booking. Matching is on email first,
 * then the normalised name, so casing never mints a second profile. Stay totals are
 * never incremented by hand — `rebuildGuestStats` derives them from the bookings.
 */
// deno-lint-ignore no-explicit-any
async function ensureGuestProfile(supabase: any, propertyId: string, guestName: string, guestEmail: string | null, guestPhone: string | null, _bookingAmount: number, guestNationality?: string | null): Promise<string | null> {
  const email = normaliseEmail(guestEmail);
  const norm = normaliseGuestName(guestName);
  if (!email && !norm) return null;
  try {
    let existing: any = null;
    if (email) {
      const { data } = await supabase.from("rolos_guest_profiles")
        .select("id").eq("property_id", propertyId).ilike("email", email).maybeSingle();
      existing = data ?? null;
    }
    if (!existing && norm) {
      const { data } = await supabase.from("rolos_guest_profiles")
        .select("id").eq("property_id", propertyId).eq("normalised_name", norm).maybeSingle();
      existing = data ?? null;
    }
    if (existing) {
      const updateData: any = { full_name: guestName };
      if (guestPhone) updateData.phone = guestPhone;
      if (email) updateData.email = guestEmail;
      if (guestNationality) updateData.nationality = guestNationality;
      await supabase.from("rolos_guest_profiles").update(updateData).eq("id", existing.id);
      return existing.id;
    }
    const insertData: any = {
      property_id: propertyId,
      full_name: String(guestName || "").trim().replace(/\s+/g, " "),
      email: guestEmail || null,
      phone: guestPhone || null,
    };
    if (guestNationality) insertData.nationality = guestNationality;
    const { data: newGuest } = await supabase.from("rolos_guest_profiles")
      .upsert(insertData, { onConflict: "property_id,normalised_name" })
      .select("id").single();
    return newGuest?.id || null;
  } catch { return null; }
}


function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// ============================================================================
// PACKAGES (non-group bookings)
// Same expansion logic the group pickup path uses, so packages produce
// stream-tagged folio lines for ordinary reservations too.
// ============================================================================

// deno-lint-ignore no-explicit-any
async function handleApplyPackage(body: any, supabase: any): Promise<Response> {
  const jsonRes = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

  const bookingId = body?.booking_id as string | undefined;
  const packageId = body?.package_id as string | undefined;
  if (!bookingId || !packageId) {
    return jsonRes(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id and package_id are required", "apply_package"), 400);
  }

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, property_id, check_in_date, check_out_date, adults, children, total_price, rolos_room_ids")
    .eq("id", bookingId)
    .single();
  if (bErr || !booking) {
    return jsonRes(createErrorResponse(ERROR_CODES.NOT_FOUND, "Booking not found", "apply_package"), 404);
  }

  // Idempotent: never post the same package twice on the same booking.
  let { data: folio } = await supabase.from("rolos_folios").select("id").eq("booking_id", bookingId).maybeSingle();
  if (!folio) {
    const { data: newFolio } = await supabase.from("rolos_folios").insert({ booking_id: bookingId, property_id: booking.property_id }).select("id").single();
    folio = newFolio;
  }
  if (!folio?.id) {
    return jsonRes(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, "Could not open a folio for this booking", "apply_package"), 500);
  }

  const { data: already } = await supabase
    .from("rolos_folio_transactions")
    .select("id")
    .eq("folio_id", folio.id)
    .eq("reference", `package:${packageId}`)
    .limit(1);
  if (already?.length) {
    return jsonRes(createSuccessResponse({ message: "Package already applied", skipped: true }, "apply_package"));
  }

  const nights = Math.max(
    1,
    Math.ceil((new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / 86400000),
  );
  const { data: rooms } = await supabase
    .from("rolos_booking_rooms")
    .select("id")
    .eq("booking_id", bookingId);
  const roomCount = rooms?.length || booking.rolos_room_ids?.length || 1;

  const { name: packageName, lines } = await expandPackageById(supabase, packageId, {
    subtotal: Number(booking.total_price || 0),
    nights,
    rooms: roomCount,
    adults: booking.adults || 1,
    children: booking.children || 0,
  });
  const addOn = packageAddOnTotal(lines);

  if (lines.length) {
    const { error: txErr } = await supabase.from("rolos_folio_transactions").insert(
      lines.map((l) => ({
        folio_id: folio.id,
        transaction_type: "charge",
        description: `${packageName} — ${l.name}${l.includedInRate ? " (included)" : ""}`,
        amount: l.includedInRate ? 0 : l.amount,
        revenue_stream: l.stream,
        reference: `package:${packageId}`,
      })),
    );
    if (txErr) {
      return jsonRes(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, txErr.message, "apply_package"), 500);
    }

    const { data: txns } = await supabase.from("rolos_folio_transactions").select("amount").eq("folio_id", folio.id);
    const balance = (txns || []).reduce((s: number, t: { amount: number | null }) => s + Number(t.amount || 0), 0);
    await supabase
      .from("rolos_folios")
      .update({ balance: Math.round(balance * 100) / 100, updated_at: new Date().toISOString() })
      .eq("id", folio.id);
  }

  // Record the package on the booking's room lines and lift the total by add-ons.
  await supabase.from("rolos_booking_rooms").update({ package_id: packageId }).eq("booking_id", bookingId);
  if (addOn > 0) {
    await supabase
      .from("bookings")
      .update({ total_price: Math.round((Number(booking.total_price || 0) + addOn) * 100) / 100 })
      .eq("id", bookingId);
  }

  return jsonRes(createSuccessResponse(
    { package_name: packageName, lines, add_on_total: addOn, folio_id: folio.id },
    "apply_package",
  ));
}

// ============================================================================
// SERVICE CHARGES & REFUNDS
// ============================================================================


// deno-lint-ignore no-explicit-any
async function handleApplyServiceCharges(body: any, supabase: any): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id required", "apply_service_charges")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data: booking, error: bErr } = await supabase.from("bookings")
    .select("id, property_id, check_in_date, check_out_date, adults, children, infants, total_price, deposit_amount, charges_breakdown, room_type_id, rolos_room_ids")
    .eq("id", booking_id).single();
  if (bErr || !booking) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.NOT_FOUND, "Booking not found", "apply_service_charges")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
  }

  const context = await resolveBookingChargeContext(supabase, booking);

  // Reconcile (never blindly re-add): create missing rule-based charges, correct
  // changed ones, drop those that no longer apply. Manual folio postings untouched.
  const quote = await reconcileBookingCharges(supabase, {
    bookingId: booking.id,
    propertyId: booking.property_id,
    accommodation: context.accommodation,
    checkIn: booking.check_in_date,
    checkOut: booking.check_out_date,
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    rooms: context.rooms,
    baseOccupancy: context.baseOccupancy,
    roomTypeIds: context.roomTypeIds,

    currency: booking.currency,
  });

  await supabase.from("bookings").update({
    total_price: quote.guestTotal,
    deposit_amount: quote.depositTotal,
    charges_breakdown: chargesBreakdownSnapshot(quote),
  }).eq("id", booking.id);

  // Post the accommodation / F&B split for the room revenue when breakfast is
  // included in the rate. Total posted equals the accommodation total.
  const breakfastConfig = await resolveBreakfastConfig(supabase, booking_id, booking.property_id);
  const applied: any[] = [...quote.lines];
  if (breakfastConfig && quote.folioId) {
    const split = await postBookingStreamSplit(supabase, {
      bookingId: booking_id,
      propertyId: booking.property_id,
      folioId: quote.folioId,
      nights: quote.nights,
      guests: quote.adults + quote.children,
      rooms: quote.rooms,
      total: context.accommodation,
      config: breakfastConfig,
    });
    if (split.posted) applied.push({ split: split.lines });
  }

  return new Response(JSON.stringify(createSuccessResponse({
    applied,
    count: quote.lines.length,
    created: quote.created,
    updated: quote.updated,
    removed: quote.removed,
    accommodation: quote.accommodation,
    extras_total: quote.extrasTotal,
    deposit_total: quote.depositTotal,
    guest_total: quote.guestTotal,
  }, "apply_service_charges")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


// deno-lint-ignore no-explicit-any
async function handleBackfillRevenueStreams(body: any, supabase: any): Promise<Response> {
  const propertyId = body.propertyId || body.property_id;
  const bookingId = body.booking_id || null;
  if (!propertyId && !bookingId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId or booking_id required", "backfill_revenue_streams")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  let query = supabase.from("bookings")
    .select("id, property_id, check_in_date, check_out_date, adults, children, total_price, rolos_folio_id, rolos_room_ids, status")
    .not("rolos_folio_id", "is", null)
    .in("status", ["confirmed", "checked_in", "paid"]);
  query = bookingId ? query.eq("id", bookingId) : query.eq("property_id", propertyId).limit(500);
  const { data: bookings, error } = await query;
  if (error) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "backfill_revenue_streams")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }

  let split = 0;
  const skipped: Record<string, number> = {};
  for (const b of (bookings || [])) {
    const nights = Math.max(1, Math.ceil((new Date(b.check_out_date).getTime() - new Date(b.check_in_date).getTime()) / 86400000));
    const res = await postBookingStreamSplit(supabase, {
      bookingId: b.id,
      propertyId: b.property_id,
      folioId: b.rolos_folio_id,
      nights,
      guests: (b.adults || 1) + (b.children || 0),
      rooms: b.rolos_room_ids?.length || 1,
      total: Number(b.total_price) || 0,
    });
    if (res.posted) split++;
    else skipped[res.reason || "unknown"] = (skipped[res.reason || "unknown"] || 0) + 1;
  }

  return new Response(JSON.stringify(createSuccessResponse({ examined: bookings?.length || 0, split, skipped }, "backfill_revenue_streams")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleProcessCheckoutRefunds(body: any, supabase: any): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id required", "process_checkout_refunds")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data: pendingRefunds } = await supabase.from("rolos_booking_charges")
    .select("id, name, amount, booking_id")
    .eq("booking_id", booking_id)
    .eq("is_refundable", true)
    .eq("refund_status", "pending");

  if (!pendingRefunds?.length) {
    return new Response(JSON.stringify(createSuccessResponse({ message: "No pending refunds", processed: [] }, "process_checkout_refunds")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let { data: folio } = await supabase.from("rolos_folios").select("id").eq("booking_id", booking_id).single();
  if (!folio) {
    const { data: newFolio } = await supabase.from("rolos_folios").insert({ booking_id }).select("id").single();
    folio = newFolio;
  }

  const processed: any[] = [];
  for (const charge of pendingRefunds) {
    const { data: refundTx } = await supabase.from("rolos_folio_transactions").insert({
      folio_id: folio.id,
      transaction_type: "refund",
      description: `Refund: ${charge.name}`,
      amount: -Math.abs(charge.amount),
    }).select("id").single();

    await supabase.from("rolos_booking_charges").update({
      refund_status: "processed",
      refund_transaction_id: refundTx?.id || null,
    }).eq("id", charge.id);

    processed.push({ charge_id: charge.id, name: charge.name, refund_amount: charge.amount });
  }

  return new Response(JSON.stringify(createSuccessResponse({ processed, count: processed.length }, "process_checkout_refunds")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetBookingCharges(body: any, supabase: any): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "booking_id required", "get_booking_charges")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
  const { data, error } = await supabase.from("rolos_booking_charges")
    .select("*")
    .eq("booking_id", booking_id)
    .order("created_at", { ascending: true });
  if (error) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_booking_charges")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
  return new Response(JSON.stringify(createSuccessResponse({ charges: data || [] }, "get_booking_charges")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleGetUiConfig(body: any, supabase: any): Promise<Response> {
  const { propertyId } = body;

  // Fetch global defaults (property_id IS NULL)
  const { data: globalConfigs } = await supabase.from("rolos_ui_configs")
    .select("component_type, config, is_active")
    .is("property_id", null);

  let propertyConfigs: any[] = [];
  if (propertyId) {
    const { data } = await supabase.from("rolos_ui_configs")
      .select("component_type, config, is_active")
      .eq("property_id", propertyId);
    propertyConfigs = data || [];
  }

  // Merge: property overrides global
  const merged: Record<string, any> = {};
  for (const row of (globalConfigs || [])) {
    if (row.is_active) merged[row.component_type] = row.config;
  }
  for (const row of propertyConfigs) {
    if (row.is_active) {
      merged[row.component_type] = { ...(merged[row.component_type] || {}), ...row.config };
    }
  }

  return new Response(JSON.stringify(createSuccessResponse({ config: merged, property_id: propertyId || null }, "get_ui_config")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// STATIC CONTENT HANDLERS
// ============================================================================

// Helper: resolve linked_rate_plans[] for a set of policy ids (via rolos_policy_rate_links)
// deno-lint-ignore no-explicit-any
async function fetchPolicyRatePlanLinks(supabase: any, propertyId: string, policyIds: string[]): Promise<Record<string, { id: string; name: string; channel: string | null }[]>> {
  const result: Record<string, { id: string; name: string; channel: string | null }[]> = {};
  if (policyIds.length === 0) return result;
  const { data: links } = await supabase
    .from("rolos_policy_rate_links")
    .select("policy_id, rate_plan_id, channel")
    .in("policy_id", policyIds);
  const planIds = Array.from(new Set((links || []).map((l: any) => l.rate_plan_id)));
  const planMap = new Map<string, string>();
  if (planIds.length > 0) {
    const { data: plans } = await supabase
      .from("rolos_rate_plans")
      .select("id, name")
      .eq("property_id", propertyId)
      .in("id", planIds);
    (plans || []).forEach((p: any) => planMap.set(p.id, p.name));
  }
  (links || []).forEach((l: any) => {
    (result[l.policy_id] ||= []).push({
      id: l.rate_plan_id,
      name: planMap.get(l.rate_plan_id) || "(unknown)",
      channel: l.channel || null,
    });
  });
  return result;
}

// deno-lint-ignore no-explicit-any
async function handleGetCancellationPolicies(body: any, supabase: any): Promise<Response> {
  const { propertyId } = body;
  if (!propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "get_cancellation_policies")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data: policies, error } = await supabase
    .from("rolos_policies")
    .select("id, policy_type, rule, is_ai_generated, last_evaluated_at, created_at, updated_at")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_cancellation_policies")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }

  let fallbackText: string | null = null;
  if (!policies || policies.length === 0) {
    const { data: hostfullyRoom } = await supabase
      .from("hostfully_room_types")
      .select("cancellation_policy")
      .eq("property_id", propertyId)
      .not("cancellation_policy", "is", null)
      .limit(1)
      .maybeSingle();
    fallbackText = hostfullyRoom?.cancellation_policy || null;
  }

  const linksByPolicy = await fetchPolicyRatePlanLinks(supabase, propertyId, (policies || []).map((p: any) => p.id));

  const formatted = (policies || []).map((p: any) => ({
    id: p.id,
    policy_type: p.policy_type,
    name: (typeof p.rule === "object" && p.rule?.name) || p.policy_type,
    rule: p.rule,
    description: (typeof p.rule === "object" && p.rule?.description) || null,
    is_ai_generated: !!p.is_ai_generated,
    linked_rate_plans: linksByPolicy[p.id] || [],
  }));

  return new Response(
    JSON.stringify(createSuccessResponse({ policies: formatted, fallback_text: fallbackText }, "get_cancellation_policies")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleGetReservationPolicies(body: any, supabase: any): Promise<Response> {
  const { propertyId } = body;
  if (!propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "get_reservation_policies")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data: policies, error } = await supabase
    .from("rolos_reservation_policies")
    .select("id, name, kind, rule, is_default, created_at, updated_at")
    .eq("property_id", propertyId)
    .order("is_default", { ascending: false });

  if (error) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_reservation_policies")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }

  const linksByPolicy = await fetchPolicyRatePlanLinks(supabase, propertyId, (policies || []).map((p: any) => p.id));

  const formatted = (policies || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    is_default: !!p.is_default,
    rule: p.rule,
    description: (typeof p.rule === "object" && p.rule?.description) || null,
    linked_rate_plans: linksByPolicy[p.id] || [],
  }));

  return new Response(
    JSON.stringify(createSuccessResponse({ policies: formatted }, "get_reservation_policies")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleGetPaymentMethods(body: any, supabase: any): Promise<Response> {
  const { propertyId } = body;
  if (!propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "get_payment_methods")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("payment_providers, payment_provider, allow_custom_payment_provider")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, propertyError.message, "get_payment_methods")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }

  if (!property) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.NOT_FOUND, "Property not found", "get_payment_methods")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
  }

  const keys = Array.isArray(property.payment_providers) && property.payment_providers.length > 0
    ? property.payment_providers
    : property.payment_provider
      ? [property.payment_provider]
      : [];

  const { data: registry, error: registryError } = await supabase
    .from("payment_gateway_registry")
    .select("gateway_key, display_name, payment_method, supported_currencies, supported_countries, is_active, website_url, edge_function_name, docs_url")
    .in("gateway_key", keys.length > 0 ? keys : ["__none__"]);

  if (registryError) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, registryError.message, "get_payment_methods")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }

  const registryMap = new Map((registry || []).map((r: any) => [r.gateway_key, r]));

  const methods = keys.map((key: string) => {
    const reg = registryMap.get(key);
    return {
      key,
      logo_key: key,
      name: reg?.display_name || key,
      methods: Array.isArray(reg?.payment_method) ? reg.payment_method : (reg?.payment_method ? [reg.payment_method] : []),
      currencies: Array.isArray(reg?.supported_currencies) ? reg.supported_currencies : [],
      countries: Array.isArray(reg?.supported_countries) ? reg.supported_countries : [],
      is_active: reg?.is_active ?? true,
      website_url: reg?.website_url || null,
      docs_url: reg?.docs_url || null,
      edge_function_name: reg?.edge_function_name || null,
    };
  });

  return new Response(
    JSON.stringify(createSuccessResponse({ payment_methods: methods, allow_custom_payment_provider: !!property.allow_custom_payment_provider }, "get_payment_methods")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleGetPropertyContactDetails(body: any, supabase: any): Promise<Response> {
  const { propertyId } = body;
  if (!propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "get_property_contact_details")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data: contacts, error } = await supabase
    .from("property_contact_details")
    .select("id, role, name, email, phone, hours, sort_order")
    .eq("property_id", propertyId)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_property_contact_details")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }

  let mergedContacts = contacts || [];

  // Fallback: if no reception/manager row exists but amenities.contact_email is present, surface it
  if (!mergedContacts.some((c: any) => ["reception", "manager", "concierge"].includes(c.role))) {
    const { data: property } = await supabase
      .from("properties")
      .select("amenities")
      .eq("id", propertyId)
      .maybeSingle();

    const contactEmail = property?.amenities?.contact_email || property?.amenities?.email;
    if (contactEmail) {
      mergedContacts = [
        {
          id: "fallback",
          role: "reception",
          name: property?.amenities?.contact_name || null,
          email: contactEmail,
          phone: property?.amenities?.contact_phone || null,
          hours: property?.amenities?.reception_hours || null,
          sort_order: 0,
        },
        ...mergedContacts,
      ];
    }
  }

  return new Response(
    JSON.stringify(createSuccessResponse({ contacts: mergedContacts }, "get_property_contact_details")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// deno-lint-ignore no-explicit-any
export function buildPropertyProfile(property: any): Record<string, unknown> {
  const amenities = property?.amenities || {};
  const addr = amenities.address_details || {};
  const rules = amenities.house_rules || {};

  // Flatten amenities into a de-duped string list
  const facilities: string[] = Array.isArray(amenities.facilities)
    ? amenities.facilities.filter((x: any) => typeof x === "string")
    : [];
  const flagKeys: string[] = [];
  const skipGroups = new Set(["address_details", "house_rules", "contact", "house_style", "banking", "external_ids", "room_types", "seasons", "packages", "addons", "cancellation_policies", "templates", "offerings", "meal_types", "facilities", "announcements"]);
  for (const [k, v] of Object.entries(amenities)) {
    if (skipGroups.has(k)) continue;
    if (v === true) flagKeys.push(k);
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (sv === true) flagKeys.push(sk);
      }
    }
  }
  const allAmenities = Array.from(new Set([...facilities, ...flagKeys]));

  const bathrooms = property?.bathrooms ?? null;
  const bedrooms = property?.bedrooms ?? null;

  return {
    id: property.id,
    name: property.name,
    slug: property.slug,
    property_type: property.property_type || null,
    description: property.description || null,
    short_description: property.short_description || null,
    timezone: property.timezone || null,
    location: {
      address: property.address || null,
      city: property.city || null,
      country: property.country || null,
      postal_code: addr.postal_code || null,
      suburb: addr.suburb || null,
      latitude: property.latitude ?? null,
      longitude: property.longitude ?? null,
      google_maps_link: addr.google_maps_link || null,
      no_street_address: !!addr.no_street_address,
    },
    occupancy: {
      max_guests: property.max_guests ?? null,
      standard_guests: property.max_guests ?? null,
      bedrooms,
      bathrooms,
    },
    check_in: {
      from: rules.check_in_from || null,
      to: rules.check_in_to || null,
      is_24h: !!rules.check_in_24h,
      same_day_cutoff: rules.same_day_cutoff || null,
    },
    check_out: {
      from: rules.check_out_from || null,
      to: rules.check_out_to || null,
    },
    house_rules: {
      pets_allowed: !!rules.pets_allowed,
      smoking_allowed: !!rules.smoking_allowed,
      parties_allowed: !!rules.parties_allowed,
      children_allowed: rules.children_allowed !== false,
      children_policy: rules.children_policy || null,
      same_day_bookings: !!rules.same_day_bookings,
    },
    arrival_instructions: rules.arrival_instructions
      || (rules.check_in_24h
        ? "Self check-in available 24/7."
        : (rules.check_in_from && rules.check_in_to
            ? `Check-in from ${rules.check_in_from} to ${rules.check_in_to}.`
            : null)),
    amenities: allAmenities,
    meal_types: Array.isArray(amenities.meal_types) ? amenities.meal_types : [],
    currency: amenities.currency || null,
    star_rating: amenities.star_rating || null,
    images: Array.isArray(property.images) ? property.images : [],
  };
}

// deno-lint-ignore no-explicit-any
async function handleGetPropertyProfile(body: any, supabase: any): Promise<Response> {
  const { propertyId } = body;
  if (!propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "get_property_profile")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data: property, error } = await supabase
    .from("properties")
    .select("id, name, slug, property_type, description, short_description, address, city, country, latitude, longitude, timezone, images, amenities, bedrooms, bathrooms, max_guests")
    .eq("id", propertyId)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_property_profile")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
  if (!property) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.NOT_FOUND, "Property not found", "get_property_profile")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
  }

  return new Response(
    JSON.stringify(createSuccessResponse({ property: buildPropertyProfile(property) }, "get_property_profile")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}



// ============================================================================
// WEBHOOK HELPERS & HANDLERS
// ============================================================================

// deno-lint-ignore no-explicit-any
async function queueWebhookEvent(supabase: any, propertyId: string, event: string, payload: Record<string, unknown>) {
  try {
    // Find active subscriptions for this property+event
    const { data: subs } = await supabase
      .from("rolos_webhook_subscriptions")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true);

    const matchingSubs = (subs || []).filter((s: any) =>
      s.events.includes(event) || s.events.includes("*")
    );

    if (!matchingSubs.length) return;

    const logs = matchingSubs.map((sub: any) => ({
      subscription_id: sub.id,
      property_id: propertyId,
      event,
      payload,
      status: "pending",
      attempts: 0,
      max_attempts: 3,
    }));

    const { error } = await supabase.from("rolos_webhook_logs").insert(logs);
    if (error) {
      console.error(`[webhook] Failed to queue ${event} event:`, error.message);
    } else {
      console.log(`[webhook] Queued ${logs.length} delivery(ies) for ${event}`);
    }
  } catch (err) {
    console.error(`[webhook] Error queuing ${event}:`, err);
  }
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
async function handleSubscribeWebhook(body: any, supabase: any): Promise<Response> {
  const { propertyId, url, secret, events } = body;
  if (!propertyId || !url || !secret || !events?.length) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId, url, secret, and events[] required", "subscribe_webhook")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data, error } = await supabase
    .from("rolos_webhook_subscriptions")
    .upsert({ property_id: propertyId, url, secret, events, is_active: true, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select()
    .single();

  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "subscribe_webhook")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  return new Response(JSON.stringify(createSuccessResponse({ subscription: data }, "subscribe_webhook")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleUnsubscribeWebhook(body: any, supabase: any): Promise<Response> {
  const { subscription_id } = body;
  if (!subscription_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "subscription_id required", "unsubscribe_webhook")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { error } = await supabase
    .from("rolos_webhook_subscriptions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", subscription_id);

  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "unsubscribe_webhook")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  return new Response(JSON.stringify(createSuccessResponse({ subscription_id, is_active: false }, "unsubscribe_webhook")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleListWebhookSubscriptions(body: any, supabase: any): Promise<Response> {
  const { propertyId } = body;
  if (!propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "list_webhook_subscriptions")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data, error } = await supabase
    .from("rolos_webhook_subscriptions")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "list_webhook_subscriptions")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  return new Response(JSON.stringify(createSuccessResponse({ subscriptions: data || [] }, "list_webhook_subscriptions")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function handleTestWebhook(body: any, supabase: any): Promise<Response> {
  const { subscription_id } = body;
  if (!subscription_id) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "subscription_id required", "test_webhook")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data: sub } = await supabase
    .from("rolos_webhook_subscriptions")
    .select("*")
    .eq("id", subscription_id)
    .single();

  if (!sub) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.NOT_FOUND, "Subscription not found", "test_webhook")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
  }

  const testPayload = JSON.stringify({
    event: "test.ping",
    property_id: sub.property_id,
    payload: { message: "This is a test webhook from ROL'OS", timestamp: new Date().toISOString() },
    delivery_id: "test-" + crypto.randomUUID(),
  });

  const signature = await hmacSign(sub.secret, testPayload);

  try {
    const resp = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ROL-Signature": signature,
        "X-ROL-Event": "test.ping",
      },
      body: testPayload,
      signal: AbortSignal.timeout(10000),
    });

    return new Response(JSON.stringify(createSuccessResponse({
      delivered: resp.ok,
      status_code: resp.status,
      message: resp.ok ? "Ping delivered successfully" : `Ping failed with HTTP ${resp.status}`,
    }, "test_webhook")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify(createSuccessResponse({
      delivered: false,
      message: err instanceof Error ? err.message : "Connection failed",
    }, "test_webhook")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// deno-lint-ignore no-explicit-any
async function handleGetWebhookLogs(body: any, supabase: any): Promise<Response> {
  const { propertyId, limit: logLimit } = body;
  if (!propertyId) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", "get_webhook_logs")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }

  const { data, error } = await supabase
    .from("rolos_webhook_logs")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(logLimit || 50);

  if (error) return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, error.message, "get_webhook_logs")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });

  return new Response(JSON.stringify(createSuccessResponse({ logs: data || [] }, "get_webhook_logs")),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// OWNER ACCOUNT HANDLERS (ROL billing portal)
// Financial data — always requires a signed-in user with access to the property.
// ============================================================================

// deno-lint-ignore no-explicit-any
async function requirePropertyAccess(body: any, supabase: any, req: Request, action: string) {
  if (!body.propertyId) {
    return { error: new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "propertyId required", action)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }) };
  }
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: new Response(JSON.stringify(createErrorResponse("UNAUTHORIZED", "Authentication required", action)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }) };
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: new Response(JSON.stringify(createErrorResponse("UNAUTHORIZED", "Invalid session", action)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }) };
  }
  const { data: allowed } = await supabase.rpc("can_access_property", {
    _property_id: body.propertyId,
    _user_id: userData.user.id,
  });
  if (!allowed) {
    return { error: new Response(JSON.stringify(createErrorResponse("FORBIDDEN", "No access to this property", action)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }) };
  }
  return { userId: userData.user.id as string };
}

const OPEN_INVOICE_STATUSES = ["pending", "sent", "overdue", "partially_paid"];

// deno-lint-ignore no-explicit-any
async function handleGetAccountBalance(body: any, supabase: any, req: Request): Promise<Response> {
  const gate = await requirePropertyAccess(body, supabase, req, "get_account_balance");
  if (gate.error) return gate.error;
  const propertyId = body.propertyId;

  const [subs, rol, payouts, cfg] = await Promise.all([
    supabase.from("subscription_invoices").select("id, invoice_number, status, amount, currency, period_start, period_end, created_at, paid_at, invoice_kind")
      .eq("property_id", propertyId).order("created_at", { ascending: false }),
    supabase.from("rol_property_invoices").select("id, invoice_reference, status, total, amount_paid, currency, issued_at, due_date, paid_at")
      .eq("property_id", propertyId).order("due_date", { ascending: false }),
    supabase.from("property_payout_statements").select("id, statement_reference, status, net_payable, currency, period_start, period_end, paid_at")
      .eq("property_id", propertyId).order("period_end", { ascending: false }),
    supabase.from("property_billing_configs").select("*").eq("property_id", propertyId).maybeSingle(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  // deno-lint-ignore no-explicit-any
  const sum = (rows: any[], field: string) => rows.reduce((t, r) => t + Number(r[field] || 0), 0);

  const subRows = subs.data || [];
  const rolRows = rol.data || [];
  const payoutRows = payouts.data || [];

  const openSubs = subRows.filter((r: { status: string }) => OPEN_INVOICE_STATUSES.includes(r.status));
  const openRol = rolRows.filter((r: { status: string }) => OPEN_INVOICE_STATUSES.includes(r.status));
  const overdueRol = openRol.filter((r: { due_date?: string }) => r.due_date && r.due_date < today);
  const unpaidPayouts = payoutRows.filter((r: { status: string }) => r.status !== "paid");

  const currency = rolRows[0]?.currency || subRows[0]?.currency || payoutRows[0]?.currency || "ZAR";

  return new Response(JSON.stringify(createSuccessResponse({
    currency,
    due: sum(openSubs, "amount") + sum(openRol, "total") - sum(openRol, "amount_paid"),
    overdue: sum(overdueRol, "total") - sum(overdueRol, "amount_paid"),
    due_to_you: sum(unpaidPayouts, "net_payable"),
    paid_to_rol: sum(subRows.filter((r: { status: string }) => r.status === "paid"), "amount")
      + sum(rolRows, "amount_paid"),
    received_from_rol: sum(payoutRows.filter((r: { status: string }) => r.status === "paid"), "net_payable"),
    subscription: {
      status: cfg.data?.subscription_status ?? null,
      billing_enabled: cfg.data?.billing_enabled ?? null,
      engagement_date: cfg.data?.engagement_date ?? null,
      current_period_end: cfg.data?.current_period_end ?? null,
      switched_off_at: cfg.data?.billing_switched_off_at ?? null,
      reset_pending: cfg.data?.subscription_reset_pending ?? false,
      plan_changed_at: cfg.data?.plan_changed_at ?? null,
      monthly_fee: cfg.data?.subscription_fee_monthly ?? null,
    },
    open_invoice_count: openSubs.length + openRol.length,
  }, "get_account_balance")), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


// deno-lint-ignore no-explicit-any
async function handleGetAccountDocuments(body: any, supabase: any, req: Request): Promise<Response> {
  const gate = await requirePropertyAccess(body, supabase, req, "get_account_documents");
  if (gate.error) return gate.error;
  const propertyId = body.propertyId;
  const from = body.start_date || null;
  const to = body.end_date || null;

  let subQ = supabase.from("subscription_invoices")
    .select("id, invoice_number, invoice_kind, status, amount, once_off_amount, subscription_amount, currency, period_start, period_end, created_at, paid_at, pdf_url")
    .eq("property_id", propertyId);
  if (from) subQ = subQ.gte("created_at", from);
  if (to) subQ = subQ.lte("created_at", `${to}T23:59:59`);

  let rolQ = supabase.from("rol_property_invoices")
    .select("id, invoice_reference, status, subtotal, vat_amount, total, amount_paid, currency, issued_at, period_start, period_end, due_date, paid_at, pay_token, pdf_path")
    .eq("property_id", propertyId);
  if (from) rolQ = rolQ.gte("period_end", from);
  if (to) rolQ = rolQ.lte("period_start", to);

  let payQ = supabase.from("property_payout_statements")
    .select("id, statement_reference, status, gross_amount, rol_commission, ota_commission, transaction_fees, recurring_fees, other_recoveries, adjustments, net_payable, currency, period_start, period_end, paid_at, statement_pdf_path, invoice_reference, invoice_total")
    .eq("property_id", propertyId);
  if (from) payQ = payQ.gte("period_end", from);
  if (to) payQ = payQ.lte("period_start", to);

  const [subs, rol, payouts] = await Promise.all([
    subQ.order("created_at", { ascending: false }),
    rolQ.order("period_end", { ascending: false }),
    payQ.order("period_end", { ascending: false }),
  ]);


  const err = subs.error || rol.error || payouts.error;
  if (err) {
    return new Response(JSON.stringify(createErrorResponse(ERROR_CODES.INTERNAL_ADAPTER_ERROR, err.message, "get_account_documents")),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }

  return new Response(JSON.stringify(createSuccessResponse({
    subscription_invoices: subs.data || [],
    rol_invoices: rol.data || [],
    payout_statements: payouts.data || [],
  }, "get_account_documents")), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
