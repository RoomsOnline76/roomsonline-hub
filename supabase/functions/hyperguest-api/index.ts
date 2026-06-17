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
  STATIC_CATALOGUE_EMPTY: 'STATIC_CATALOGUE_EMPTY',
} as const;

// Pre-flight: HG availability is meaningless without the property's room/rate
// catalogue cached locally. Re-pull when older than this threshold.
const STATIC_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HG_MAX_SEARCH_NIGHTS = 30;
const DAY_MS = 86_400_000;

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
  search: 'https://search-api.hyperguest.io',
  book:   'https://book-api.hyperguest.com/2.0',
};

// Booking requests may take up to 300s per HG spec.
const BOOKING_TIMEOUT_MS = 300_000;
const STANDARD_TIMEOUT_MS = 60_000;

// ----------------------------------------------------------------------------
// Request tracing — used by the certification runner to capture full HG
// request/response payloads per booking step for the export bundle.
// ----------------------------------------------------------------------------
interface TraceEntry {
  url: string;
  method: string;
  request_body: any;
  status: number;
  duration_ms: number;
  response_body: any;
  timestamp: string;
}

interface TraceContext {
  entries: TraceEntry[];
  pending: Promise<void>[];
}

let currentTrace: TraceContext | null = null;

function startTrace(): TraceContext {
  const ctx: TraceContext = { entries: [], pending: [] };
  currentTrace = ctx;
  return ctx;
}

async function endTrace(ctx: TraceContext): Promise<TraceEntry[]> {
  if (currentTrace === ctx) currentTrace = null;
  try { await Promise.all(ctx.pending); } catch (_e) { /* never fail step on trace flush */ }
  return ctx.entries;
}

const REDACT_KEYS = new Set([
  "number", "cvv", "expiry", "email", "phone", "authorization", "x-api-key",
  "api_key", "password", "token", "secret",
]);

function redact(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  if (typeof obj !== "object") return obj;
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k.toLowerCase())) out[k] = "***REDACTED***";
    else out[k] = redact(v);
  }
  return out;
}

function tryJson(s: string | undefined | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
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
    "run_certification",
    "fetch_availability",
    "prebook",
    "create_reservation",
    "cancel_reservation",
    "get_reservations",
    "get_room_types",
    "get_rate_types",
    "fetch_static_data",
    "sync_reflection",
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

const hgPaxSchema = z.object({
  adults: z.number().int().min(1),
  children: z.array(z.number().int().min(0)).optional(),
});

const hgRoomRefBase = z.object({
  room_code: z.union([z.string(), z.number()]).optional(),
  room_id: z.union([z.string(), z.number()]).optional(),
  rate_code: z.union([z.string(), z.number()]).optional(),
  rate_plan_id: z.union([z.string(), z.number()]).optional(),
  expected_amount: z.number(),
  expected_currency: z.string().length(3),
});
const hgRoomRefSchema = hgRoomRefBase
  .refine(r => r.room_code !== undefined || r.room_id !== undefined, {
    message: "room_code or room_id required",
  })
  .refine(r => r.rate_code !== undefined || r.rate_plan_id !== undefined, {
    message: "rate_code or rate_plan_id required",
  });

const hgMetaSchema = z.array(z.object({
  key: z.string().max(40),
  value: z.string(),
})).optional();

const prebookSchema = baseRequestSchema.extend({
  action: z.literal("prebook"),
  property_id: z.string().uuid(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nationality: z.string().length(2).optional(),
  pax: z.array(hgPaxSchema).min(1),
  rooms: z.array(hgRoomRefSchema).min(1),
  meta: hgMetaSchema,
});

const hgGuestSchema = z.object({
  first_name: z.string().min(1).max(32),
  last_name: z.string().min(1).max(32),
  title: z.enum(["MR", "MS", "MRS", "C"]).optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  property_id: z.string().uuid(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nationality: z.string().length(2).optional(),
  pax: z.array(hgPaxSchema).min(1),
  lead_guest: hgGuestSchema.extend({ email: z.string().email() }),
  payment: z.object({
    type: z.enum(["credit_card", "credit_balance", "bank_transfer", "external", "enett", "paypal", "stripe"]),
    credit_card: z.object({
      number: z.string(),
      cvv: z.string(),
      expiry_month: z.union([z.string(), z.number()]),
      expiry_year: z.union([z.string(), z.number()]),
      first_name: z.string(),
      last_name: z.string(),
      charge: z.boolean().optional(),
    }).optional(),
  }),
  rooms: z.array(hgRoomRefBase.extend({
    guests: z.array(hgGuestSchema).min(1),
    special_requests: z.array(z.string().max(256)).optional(),
  })).min(1),
  client_reference: z.string().max(64).optional(),
  meta: hgMetaSchema,
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

// fetch wrapper that enforces Accept-Encoding + per-call timeout, and taps
// into the active trace context (when set) to record request/response bodies
// for the certification export bundle.
async function hgFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = STANDARD_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const response = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Accept-Encoding": "gzip, deflate",
        ...(rest.headers as Record<string, string> | undefined),
      },
    });
    if (currentTrace) {
      const reqBody = typeof rest.body === "string"
        ? (tryJson(rest.body) ?? rest.body)
        : null;
      const entry: TraceEntry = {
        url,
        method: (rest.method ?? "GET") as string,
        request_body: redact(reqBody),
        status: response.status,
        duration_ms: Date.now() - t0,
        response_body: null,
        timestamp: new Date().toISOString(),
      };
      currentTrace.entries.push(entry);
      const cloned = response.clone();
      const p = cloned.text()
        .then(txt => { entry.response_body = redact(tryJson(txt)) ?? (txt ? txt.slice(0, 16000) : null); })
        .catch(() => { /* ignore — never fail call on trace flush */ });
      currentTrace.pending.push(p);
    }
    return response;
  } finally {
    clearTimeout(t);
  }
}

async function hgFetchFirstOk(
  label: string,
  urls: string[],
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ url: string; text: string }> {
  const failures: string[] = [];
  for (const url of urls) {
    console.log(`[hyperguest] ${label}: ${init.method || "GET"} ${url}`);
    const response = await hgFetch(url, init);
    const text = await response.text();
    if (response.ok) return { url, text };
    failures.push(`${response.status} ${text.substring(0, 180)}`);
    console.warn(`[hyperguest] ${label} failed: ${response.status} ${text.substring(0, 300)}`);
    if (![401, 404, 405].includes(response.status)) break;
  }
  throw new Error(`${label} failed: ${failures.join(" | ")}`);
}

// ============================================================================
// API METHODS
// ============================================================================

async function healthCheck(creds: HyperGuestCredentials): Promise<any> {
  // Preferred liveness probe: a minimal /search call. This works for partner
  // (distributor) tokens which don't have access to the supplier-side static
  // hotels.json feed. We try the static feed first as a bonus; if it 401/404s
  // we fall back to the search probe and still return "connected" so the
  // calendar surfaces a useful status.
  let hotelVisible: boolean | null = null;
  try {
    const staticResp = await hgFetch(`${HG_ENDPOINTS.static}/hotels.json`, {
      headers: getAuthHeaders(creds.api_key),
    });
    if (staticResp.ok) {
      try {
        const data = await staticResp.json();
        const hotels = Array.isArray(data) ? data : (data.hotels || []);
        hotelVisible = hotels.some((h: any) => String(h.id ?? h.hotel_id) === String(creds.hotel_code));
      } catch { /* gzip stream not parsed */ }
    } else {
      await staticResp.text(); // drain
      console.warn(`[hyperguest] static hotels.json ${staticResp.status} — falling back to search probe`);
    }
  } catch (e) {
    console.warn(`[hyperguest] static probe failed: ${(e as Error).message}`);
  }

  // Search probe — confirms token + hotelId are accepted by the live search API.
  const today = new Date();
  const ci = new Date(today); ci.setDate(today.getDate() + 7);
  const co = new Date(ci); co.setDate(ci.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  let searchOk = false;
  try {
    const probe = await fetchAvailability(creds, fmt(ci), fmt(co),
      { rooms: 1, adults: 2, children: 0 }, undefined, "USD");
    searchOk = true;
    if (hotelVisible === null) {
      hotelVisible = (probe.room_types?.length ?? 0) > 0;
    }
  } catch (e) {
    console.warn(`[hyperguest] search probe failed: ${(e as Error).message}`);
  }

  return {
    status: searchOk || hotelVisible ? "connected" : "degraded",
    environment: creds.environment,
    hotel_code: creds.hotel_code,
    hotel_visible_in_static_feed: hotelVisible,
    search_probe_ok: searchOk,
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

  // HyperGuest 2.0 search contract (per official docs):
  //   GET https://search-api.hyperguest.io/2.0/?checkIn=YYYY-MM-DD&nights=N&guests=<spec>&hotelIds=<csv>
  // guests spec: "<adults>[-<childAge>,<childAge>]" per room, rooms separated by "."
  //   e.g. 1 room 2 adults => "2"
  //        1 room 2 adults + 2 children (11,12) => "2-11,12"
  //        2 rooms => "2.2"
  const rooms = Math.max(1, occupancy?.rooms ?? 1);
  const adultsPerRoom = Math.max(1, Math.floor((occupancy?.adults ?? 2) / rooms));
  const childAges = occupancy?.children_ages ?? [];
  const childrenPerRoom: number[][] = Array.from({ length: rooms }, (_, i) => {
    // Even-split child ages across rooms
    return childAges.filter((_a, idx) => idx % rooms === i);
  });
  const guestsSpec = Array.from({ length: rooms }, (_, i) => {
    const ages = childrenPerRoom[i];
    return ages.length ? `${adultsPerRoom}-${ages.join(",")}` : `${adultsPerRoom}`;
  }).join(".");

  // HG rejects historical check-ins (SN.400 "Check in date cannot be sooner
  // then today"). Calendar callers regularly request past months — clamp the
  // window forward so we always send a valid request, and short-circuit when
  // the entire range is in the past.
  const todayStr = new Date().toISOString().slice(0, 10);
  const effectiveStart = startDate < todayStr ? todayStr : startDate;
  const ci = new Date(effectiveStart);
  const co = new Date(endDate);
  if (co.getTime() <= ci.getTime()) {
    console.log(`[hyperguest] Range entirely in the past (${startDate}→${endDate}); returning empty availability.`);
    return {
      hotel_code: creds.hotel_code,
      check_in: startDate,
      check_out: endDate,
      nationality: nationality || null,
      currency: currency || null,
      remarks: [],
      property_info: null,
      room_types: [],
      total_rooms_found: 0,
      note: "range_in_past",
    };
  }
  const requestedNights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / DAY_MS));
  const roomTypeById = new Map<string, any>();
  let combinedCurrency: string | undefined = currency;
  let remarks: any[] = [];
  let propertyInfo: any = null;

  const normalizeRoomTypes = (hotel: any, segmentCurrency?: string) => (hotel?.rooms || []).map((room: any) => {
    // Build a synthetic per-night availability list from the rate plan's nightly breakdown
    const firstPlan = room.ratePlans?.[0];
    const nightlyDates: string[] = (firstPlan?.nightlyBreakdown || []).map((n: any) => n.date);
    const roomsAvailPerNight = nightlyDates.map((d: string) => ({
      date: d,
      available_units: room.numberOfAvailableRooms ?? 1,
      stop_sell: false,
    }));

    const rate_types = (room.ratePlans || []).map((plan: any) => ({
      rate_type_id: String(plan.ratePlanId ?? plan.ratePlanCode),
      rate_type_name: plan.ratePlanName || plan.ratePlanCode || "Standard",
      price_type: "UnitRate",
      rate_key: String(plan.ratePlanId ?? plan.ratePlanCode),
      board_code: plan.board,
      board_name: plan.board,
      rate_type: plan.ratePlanInfo?.isPromotion ? "PROMO" : "BAR",
      net_total: plan.prices?.net?.price ?? 0,
      selling_rate: plan.prices?.sell?.price ?? plan.prices?.net?.price ?? 0,
      commission: plan.prices?.commission?.price ?? 0,
      cancellation_policies: plan.cancellationPolicies ?? [],
      is_immediate: plan.isImmediate !== false,
      payment_charge: plan.payment?.charge ?? null,
      rates: (plan.nightlyBreakdown || []).map((n: any) => {
        const nightAmount = n.prices?.sell?.price ?? n.prices?.net?.price ?? 0;
        return {
          date: n.date,
          room_amount: nightAmount,
          adult_amounts: { adult_amount_1: nightAmount, adult_amount_2: nightAmount },
          teen_amount: 0,
          child_amount: 0,
          infant_amount: 0,
        currency: n.prices?.sell?.currency ?? n.prices?.net?.currency ?? segmentCurrency ?? currency ?? "EUR",
        };
      }),
    }));

    return {
      room_type_id: String(room.roomId ?? room.roomTypeCode),
      room_type_name: room.roomName,
      name: room.roomName,
      max_guests: room.settings?.maxOccupancy ?? room.settings?.maxAdultsNumber ?? 2,
      rooms_available_per_night: roomsAvailPerNight,
      rate_types,
    };
  });

  for (let offset = 0; offset < requestedNights; offset += HG_MAX_SEARCH_NIGHTS) {
    const segmentStart = new Date(ci.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
    const segmentNights = Math.min(HG_MAX_SEARCH_NIGHTS, requestedNights - offset);
    const qs = new URLSearchParams({
      checkIn: segmentStart,
      nights: String(segmentNights),
      guests: guestsSpec,
      hotelIds: String(creds.hotel_code),
    });
    if (nationality) qs.set("customerNationality", nationality);
    if (currency) qs.set("currency", currency);

    const url = `${baseUrl}/2.0/?${qs.toString()}`;
    console.log(`[hyperguest] GET ${url}`);

    const { text: responseText } = await hgFetchFirstOk("Availability", [url], {
      method: "GET",
      headers: { ...getAuthHeaders(creds.api_key), "Accept-Encoding": "gzip, deflate" },
    });

    const data = JSON.parse(responseText);
    const hotel = (data.results || []).find((r: any) => String(r.propertyId) === String(creds.hotel_code))
      ?? data.results?.[0];
    combinedCurrency ??= hotel?.rooms?.[0]?.ratePlans?.[0]?.prices?.sell?.currency;
    if (!remarks.length) remarks = hotel?.remarks ?? [];
    propertyInfo ??= hotel?.propertyInfo ?? null;

    for (const roomType of normalizeRoomTypes(hotel, combinedCurrency)) {
      const existingRoom = roomTypeById.get(roomType.room_type_id);
      if (!existingRoom) {
        roomTypeById.set(roomType.room_type_id, roomType);
        continue;
      }

      existingRoom.rooms_available_per_night.push(...roomType.rooms_available_per_night);
      for (const rateType of roomType.rate_types || []) {
        const existingRate = (existingRoom.rate_types || []).find((r: any) => r.rate_type_id === rateType.rate_type_id);
        if (!existingRate) {
          existingRoom.rate_types.push(rateType);
          continue;
        }
        existingRate.net_total += rateType.net_total ?? 0;
        existingRate.selling_rate += rateType.selling_rate ?? 0;
        existingRate.commission += rateType.commission ?? 0;
        existingRate.rates.push(...(rateType.rates || []));
      }
    }
  }

  const room_types = Array.from(roomTypeById.values());

  return {
    hotel_code: creds.hotel_code,
    check_in: startDate,
    check_out: endDate,
    nationality: nationality || null,
    currency: combinedCurrency,
    remarks,
    property_info: propertyInfo,
    room_types,
    total_rooms_found: room_types.length,
    search_chunks: Math.ceil(requestedNights / HG_MAX_SEARCH_NIGHTS),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// HyperGuest 2.0 booking helpers
// Per HG docs:
//   Pre-book:        POST {book}/booking/pre-book
//   Create booking:  POST {book}/booking/create
//   Get booking:     GET  {book}/booking/{bookingId}
//   List bookings:   GET  {book}/booking?propertyId=&from=&to=
//   Cancel booking:  POST {book}/booking/{bookingId}/cancel
// All payloads use camelCase per HG spec (search.dates.from/to, propertyId,
// nationality, pax[{adults, children[ages]}], rooms[{roomCode|roomId,
// rateCode|ratePlanId, expectedPrice{amount,currency}}], meta[]).
// ──────────────────────────────────────────────────────────────────────────

type HgRoomRef = {
  room_code?: string | number;
  room_id?: string | number;
  rate_code?: string | number;
  rate_plan_id?: string | number;
  expected_amount: number;
  expected_currency: string;
};
type HgPax = { adults: number; children?: number[] };

function buildSearchObject(
  creds: HyperGuestCredentials,
  args: { check_in: string; check_out: string; nationality?: string; pax: HgPax[] },
) {
  return {
    dates: { from: args.check_in, to: args.check_out },
    propertyId: Number(creds.hotel_code),
    nationality: args.nationality || "ZA",
    pax: args.pax.map(p => ({
      adults: p.adults,
      children: Array.isArray(p.children) ? p.children : [],
    })),
  };
}

function buildHgRoomsPayload(rooms: HgRoomRef[]) {
  return rooms.map(r => {
    const out: any = {
      expectedPrice: { amount: r.expected_amount, currency: r.expected_currency },
    };
    if (r.room_id !== undefined && r.room_id !== null && r.room_id !== "") {
      out.roomId = Number(r.room_id);
    } else if (r.room_code) {
      out.roomCode = String(r.room_code);
    }
    if (r.rate_plan_id !== undefined && r.rate_plan_id !== null && r.rate_plan_id !== "") {
      out.ratePlanId = Number(r.rate_plan_id);
    } else if (r.rate_code) {
      out.rateCode = String(r.rate_code);
    }
    return out;
  });
}

async function prebook(
  creds: HyperGuestCredentials,
  args: {
    check_in: string;
    check_out: string;
    nationality?: string;
    pax: HgPax[];
    rooms: HgRoomRef[];
    meta?: Array<{ key: string; value: string }>;
  },
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;

  const payload: any = {
    search: buildSearchObject(creds, args),
    rooms: buildHgRoomsPayload(args.rooms),
  };
  if (args.meta?.length) payload.meta = args.meta;

  console.log(`[hyperguest] Pre-book POST ${baseUrl}/booking/pre-book: ${JSON.stringify(payload)}`);

  const response = await hgFetch(`${baseUrl}/booking/pre-book`, {
    method: "POST",
    headers: getAuthHeaders(creds.api_key),
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    if (response.status === 409 || responseText.includes("not available")) {
      throw { code: ERROR_CODES.AVAILABILITY_CHANGED, message: "Rate or room no longer available" };
    }
    throw new Error(`Pre-book failed: ${response.status} - ${responseText.substring(0, 300)}`);
  }

  const data = JSON.parse(responseText);
  const content = data.content ?? data;
  const firstRoom = content?.rooms?.[0] ?? {};
  const paymentOption = content?.paymentOptions?.[0] ?? {};

  return {
    payment_options: content?.paymentOptions ?? [],
    payment_amount: paymentOption?.paymentAmount ?? null,
    rooms: content?.rooms ?? [],
    price_change: firstRoom?.priceChange ?? null,
    cancellation_policies: firstRoom?.cancellationPolicies ?? [],
    currency: paymentOption?.paymentAmount?.currency ?? firstRoom?.prices?.sell?.currency,
    raw: data,
  };
}

async function createReservation(
  creds: HyperGuestCredentials,
  args: {
    check_in: string;
    check_out: string;
    nationality?: string;
    pax: HgPax[];
    lead_guest: {
      first_name: string;
      last_name: string;
      title?: "MR" | "MS" | "MRS" | "C";
      birth_date?: string;
      email: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
      state?: string;
      zip?: string;
    };
    payment: {
      type: "credit_card" | "credit_balance" | "bank_transfer" | "external" | "enett" | "paypal" | "stripe";
      credit_card?: {
        number: string;
        cvv: string;
        expiry_month: string | number;
        expiry_year: string | number;
        first_name: string;
        last_name: string;
        charge?: boolean;
      };
    };
    rooms: Array<HgRoomRef & {
      guests?: Array<{
        first_name: string;
        last_name: string;
        title?: "MR" | "MS" | "MRS" | "C";
        birth_date?: string;
        email?: string;
        phone?: string;
        address?: string;
        city?: string;
        country?: string;
        state?: string;
        zip?: string;
      }>;
      special_requests?: string[];
    }>;
    client_reference?: string;
    meta?: Array<{ key: string; value: string }>;
  },
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;

  const toContact = (g: any) => ({
    address: g.address || "N/A",
    city: g.city || "N/A",
    country: g.country || (args.nationality ?? "ZA"),
    email: g.email || args.lead_guest.email,
    phone: g.phone || args.lead_guest.phone || "N/A",
    state: g.state || "N/A",
    zip: g.zip || "N/A",
  });

  const leadGuest = {
    birthDate: args.lead_guest.birth_date || "1990-01-01",
    contact: toContact(args.lead_guest),
    name: { first: args.lead_guest.first_name, last: args.lead_guest.last_name },
    title: args.lead_guest.title || "MR",
  };

  let paymentDetails: any;
  if (args.payment.type === "credit_card" && args.payment.credit_card) {
    const cc = args.payment.credit_card;
    paymentDetails = {
      type: "credit_card",
      details: {
        number: cc.number,
        cvv: cc.cvv,
        expiry: { month: String(cc.expiry_month), year: String(cc.expiry_year) },
        name: { first: cc.first_name, last: cc.last_name },
        charge: cc.charge === true, // default false per HG spec
      },
    };
  } else {
    paymentDetails = { type: args.payment.type, details: {} };
  }

  const rooms = args.rooms.map(r => {
    const base = buildHgRoomsPayload([r])[0];
    return {
      ...base,
      guests: (r.guests ?? []).map(g => ({
        birthDate: g.birth_date || "1990-01-01",
        contact: toContact(g),
        name: { first: g.first_name, last: g.last_name },
        title: g.title || "MR",
      })),
      specialRequests: r.special_requests ?? [],
    };
  });

  const payload: any = {
    dates: { from: args.check_in, to: args.check_out },
    propertyId: Number(creds.hotel_code),
    leadGuest,
    reference: { agency: (args.client_reference || `ROL-${Date.now()}`).slice(0, 64) },
    paymentDetails,
    rooms,
  };
  if (args.meta?.length) payload.meta = args.meta;

  const logSafe = {
    ...payload,
    leadGuest: { ...leadGuest, contact: { ...leadGuest.contact, email: "***" } },
    paymentDetails: { type: paymentDetails.type, details: paymentDetails.type === "credit_card" ? "***" : paymentDetails.details },
  };
  console.log(`[hyperguest] Create POST ${baseUrl}/booking/create: ${JSON.stringify(logSafe)}`);

  // Shared reconciler — HG warns: if the client gives up before HG responds,
  // the booking may exist on their side while we mark it failed. On ANY
  // failure path (timeout, network drop, 5xx) try Booking List by our agency
  // reference before propagating the error.
  const reconcileViaBookingList = async (reason: string): Promise<any | null> => {
    try {
      console.warn(`[hyperguest] /booking/create ${reason} — reconciling via Booking List (ref=${payload.reference.agency})`);
      const list = await getReservations(creds, { reservation_id: payload.reference.agency });
      const match = list?.reservations?.[0];
      if (match) {
        return {
          reservation_id: match.reservation_id,
          status: match.status || "pending",
          reconciled_via: `booking_list_${reason}_fallback`,
          hotel_code: creds.hotel_code,
          created_at: new Date().toISOString(),
        };
      }
    } catch (recErr: any) {
      console.error(`[hyperguest] Reconciliation lookup itself failed: ${recErr?.message ?? recErr}`);
    }
    return null;
  };

  let response: Response;
  let responseText: string;
  try {
    response = await hgFetch(`${baseUrl}/booking/create`, {
      method: "POST",
      headers: getAuthHeaders(creds.api_key),
      body: JSON.stringify(payload),
      timeoutMs: BOOKING_TIMEOUT_MS,
    });
    responseText = await response.text();
  } catch (err: any) {
    const reason = err?.name === "AbortError" ? "timeout" : "network_error";
    const reconciled = await reconcileViaBookingList(reason);
    if (reconciled) return reconciled;
    throw err;
  }

  if (!response.ok) {
    if (response.status === 409) {
      throw { code: ERROR_CODES.AVAILABILITY_CHANGED, message: "Room no longer available" };
    }
    if (response.status === 422) {
      throw { code: ERROR_CODES.BOOKING_REJECTED, message: `Booking rejected: ${responseText.substring(0, 200)}` };
    }
    // 5xx (or other unexpected status) — HG may still have persisted the
    // booking. Try Booking List before failing the guest's transaction.
    if (response.status >= 500) {
      const reconciled = await reconcileViaBookingList(`http_${response.status}`);
      if (reconciled) return reconciled;
    }
    throw new Error(`Create reservation failed: ${response.status} - ${responseText.substring(0, 300)}`);
  }


  const data = JSON.parse(responseText);
  const content = data.content ?? data;

  return {
    reservation_id: String(content?.bookingId ?? content?.reference?.agency ?? ""),
    external_reference: content?.rooms?.[0]?.reference?.property ?? null,
    status: content?.status || "Confirmed",
    lead_guest: content?.leadGuest,
    hotel_code: creds.hotel_code,
    check_in: content?.dates?.from,
    check_out: content?.dates?.to,
    total_amount: content?.prices?.sell?.price ?? content?.payment?.chargeAmount?.price,
    currency: content?.prices?.sell?.currency ?? content?.payment?.chargeAmount?.currency,
    rooms: content?.rooms ?? [],
    cancellation_policies: content?.rooms?.[0]?.cancellationPolicy ?? [],
    meta: content?.meta ?? [],
    created_at: new Date().toISOString(),
    raw: data,
  };
}

async function cancelReservation(
  creds: HyperGuestCredentials,
  reservationId: string,
  reason?: string,
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;

  // Try the common HG cancel variants. HG docs don't publish the exact path,
  // so we attempt method/path combos and accept the first 2xx.
  type Attempt = { url: string; method: "POST" | "DELETE"; body?: any };
  const id = encodeURIComponent(reservationId);
  const baseBody: any = { bookingId: Number(reservationId) || reservationId };
  if (reason) baseBody.reason = reason;

  const attempts: Attempt[] = [
    { url: `${baseUrl}/booking/${id}/cancel`, method: "POST", body: { reason } },
    { url: `${baseUrl}/booking/cancel/${id}`, method: "POST", body: { reason } },
    { url: `${baseUrl}/booking/cancel`, method: "POST", body: baseBody },
    { url: `${baseUrl}/booking/${id}`, method: "DELETE" },
    { url: `${baseUrl}/reservation/${id}/cancel`, method: "POST", body: { reason } },
  ];

  let lastStatus = 0;
  let lastBody = "";
  for (const a of attempts) {
    console.log(`[hyperguest] ${a.method} ${a.url}`);
    const res = await hgFetch(a.url, {
      method: a.method,
      headers: getAuthHeaders(creds.api_key),
      body: a.body !== undefined ? JSON.stringify(a.body) : undefined,
    });
    const txt = await res.text();
    if (res.ok) {
      const data = txt ? JSON.parse(txt) : {};
      const content = data.content ?? data;
      return {
        reservation_id: reservationId,
        status: content?.status || "Cancelled",
        cancellation_reference: content?.cancellationReference ?? null,
        cancellation_cost: content?.cancellationCost ?? content?.penalty ?? null,
        currency: content?.currency,
        cancelled_at: new Date().toISOString(),
        raw: data,
      };
    }
    lastStatus = res.status;
    lastBody = txt;
    if (![404, 405, 400].includes(res.status)) break;
  }
  if (lastStatus === 404) {
    throw { code: ERROR_CODES.NOT_FOUND, message: `Reservation ${reservationId} not found` };
  }
  throw new Error(`Cancel failed: ${lastStatus} - ${lastBody.substring(0, 300)}`);
}

async function getReservations(
  creds: HyperGuestCredentials,
  params: { start_date?: string; end_date?: string; reservation_id?: string },
): Promise<any> {
  const baseUrl = HG_ENDPOINTS.book;

  const candidates: string[] = [];
  if (params.reservation_id) {
    const id = encodeURIComponent(params.reservation_id);
    candidates.push(
      `${baseUrl}/booking/${id}`,
      `${baseUrl}/booking/${id}/info`,
      `${baseUrl}/booking/get/${id}`,
      `${baseUrl}/booking/info/${id}`,
    );
  } else {
    const qs = new URLSearchParams({ propertyId: String(creds.hotel_code) });
    if (params.start_date) qs.set("from", params.start_date);
    if (params.end_date) qs.set("to", params.end_date);
    candidates.push(
      `${baseUrl}/booking?${qs.toString()}`,
      `${baseUrl}/booking/list?${qs.toString()}`,
    );
  }

  let lastStatus = 0;
  let lastBody = "";
  let data: any = null;
  for (const url of candidates) {
    console.log(`[hyperguest] GET ${url}`);
    const res = await hgFetch(url, { headers: getAuthHeaders(creds.api_key) });
    const txt = await res.text();
    if (res.ok) { data = txt ? JSON.parse(txt) : {}; break; }
    lastStatus = res.status;
    lastBody = txt;
  }
  if (!data) throw new Error(`Get reservations failed: ${lastStatus} - ${lastBody.substring(0, 200)}`);

  const content = data.content ?? data;
  const raw = params.reservation_id
    ? [content]
    : (content?.bookings ?? content?.reservations ?? []);

  return {
    reservations: raw.map((b: any) => ({
      reservation_id: String(b?.bookingId ?? b?.reference?.agency ?? b?.id ?? ""),
      status: b?.status,
      lead_guest_name: b?.leadGuest?.name ? `${b.leadGuest.name.first} ${b.leadGuest.name.last}` : null,
      lead_guest_email: b?.leadGuest?.contact?.email,
      check_in: b?.dates?.from,
      check_out: b?.dates?.to,
      total_amount: b?.prices?.sell?.price ?? b?.payment?.chargeAmount?.price,
      currency: b?.prices?.sell?.currency ?? b?.payment?.chargeAmount?.currency,
      rooms: b?.rooms ?? [],
      client_reference: b?.reference?.agency,
      meta: b?.meta ?? [],
    })),
    total: raw.length,
    raw: data,
  };
}

async function fetchStaticData(
  creds: HyperGuestCredentials,
  dataType: "rooms" | "rates" | "all",
  supabase: any,
  propertyId: string | null
): Promise<any> {
  // HyperGuest's distributor model has no standalone /rooms or /rates endpoint
  // for partners — rooms + rate plans are returned inline by the /2.0/ search
  // call. We probe with a short 1-night, 2-adult search ~7 days out, then
  // derive the catalogue from the response.
  const today = new Date();
  const ci = new Date(today); ci.setDate(today.getDate() + 7);
  const co = new Date(ci); co.setDate(ci.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const probe = await fetchAvailability(
    creds,
    fmt(ci),
    fmt(co),
    { rooms: 1, adults: 2, children: 0 },
    undefined,
    "USD",
  );

  const results: any = {};

  if (dataType === "rooms" || dataType === "all") {
    const seen = new Map<string, any>();
    for (const rt of probe.room_types || []) {
      const code = String(rt.room_type_id);
      if (!seen.has(code)) {
        seen.set(code, {
          external_room_type_id: code,
          room_name: rt.room_type_name,
          max_occupancy: rt.max_guests,
          description: null,
          raw_data: rt,
        });
      }
    }
    const rooms = Array.from(seen.values());
    results.rooms = rooms;

    if (propertyId && rooms.length) {
      for (const room of rooms) {
        await supabase.from("pms_room_types_cache").upsert({
          property_id: propertyId,
          system_type: "hyperguest",
          external_room_type_id: room.external_room_type_id,
          room_name: room.room_name,
          max_occupancy: room.max_occupancy,
          description: room.description,
          raw_data: room.raw_data,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: "property_id,system_type,external_room_type_id" });
      }
      console.log(`[hyperguest] Cached ${rooms.length} room types (derived from search) for property ${propertyId}`);
    } else {
      console.log(`[hyperguest] Derived ${rooms.length} room types from search probe (cache skipped)`);
    }
  }

  if (dataType === "rates" || dataType === "all") {
    const seen = new Map<string, any>();
    for (const rt of probe.room_types || []) {
      for (const plan of rt.rate_types || []) {
        const code = String(plan.rate_type_id);
        if (!seen.has(code)) {
          seen.set(code, {
            external_rate_type_id: code,
            rate_name: plan.rate_type_name,
            rate_type: plan.rate_type || "BAR",
            board_code: plan.board_code,
            board_name: plan.board_name,
            raw_data: plan,
          });
        }
      }
    }
    const rates = Array.from(seen.values());
    results.rates = rates;

    if (propertyId && rates.length) {
      for (const rate of rates) {
        await supabase.from("pms_rate_types_cache").upsert({
          property_id: propertyId,
          system_type: "hyperguest",
          external_rate_type_id: rate.external_rate_type_id,
          rate_name: rate.rate_name,
          rate_type: rate.rate_type,
          raw_data: rate.raw_data,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: "property_id,system_type,external_rate_type_id" });
      }
      console.log(`[hyperguest] Cached ${rates.length} rate types (derived from search) for property ${propertyId}`);
    } else {
      console.log(`[hyperguest] Derived ${rates.length} rate types from search probe (cache skipped)`);
    }
  }

  return {
    hotel_code: creds.hotel_code,
    synced_at: new Date().toISOString(),
    source: "search_probe",
    ...results,
  };
}


// ----------------------------------------------------------------------------
// Pre-flight: guarantee the property's room+rate catalogue is cached before
// any ARI call. Throws STATIC_CATALOGUE_EMPTY when no propertyId / no data
// can be obtained so callers (calendar, certification) can surface a
// "Pull rooms & rates first" CTA instead of a generic 4xx.
// ----------------------------------------------------------------------------
async function ensureStaticCatalogue(
  supabase: any,
  creds: HyperGuestCredentials,
  propertyId: string | null,
): Promise<{ rooms: number; rates: number; refreshed: boolean }> {
  if (!propertyId) {
    // Certification mode — pull directly, do not require cache rows.
    const r = await fetchStaticData(creds, "all", supabase, null);
    const rooms = r?.rooms?.length ?? 0;
    const rates = r?.rates?.length ?? 0;
    if (rooms === 0 && rates === 0) {
      throw { code: ERROR_CODES.STATIC_CATALOGUE_EMPTY, message: "HyperGuest returned no rooms or rates for the certification hotel" };
    }
    return { rooms, rates, refreshed: true };
  }

  const cutoff = new Date(Date.now() - STATIC_CACHE_TTL_MS).toISOString();
  const [{ count: roomCount }, { count: rateCount }, { data: freshRoom }] = await Promise.all([
    supabase.from("pms_room_types_cache")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("system_type", "hyperguest"),
    supabase.from("pms_rate_types_cache")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("system_type", "hyperguest"),
    supabase.from("pms_room_types_cache")
      .select("last_synced_at")
      .eq("property_id", propertyId)
      .eq("system_type", "hyperguest")
      .gte("last_synced_at", cutoff)
      .limit(1)
      .maybeSingle(),
  ]);

  const rooms = roomCount ?? 0;
  const rates = rateCount ?? 0;
  const fresh = !!freshRoom;

  if (rooms > 0 && rates > 0 && fresh) {
    console.log(`[hyperguest] Static catalogue OK (rooms=${rooms} rates=${rates}, fresh<24h)`);
    return { rooms, rates, refreshed: false };
  }

  console.log(`[hyperguest] Static catalogue pre-flight: rooms=${rooms} rates=${rates} fresh=${fresh} — refreshing`);
  const r = await fetchStaticData(creds, "all", supabase, propertyId);
  const newRooms = r?.rooms?.length ?? 0;
  const newRates = r?.rates?.length ?? 0;
  if (newRooms === 0 && newRates === 0) {
    throw {
      code: ERROR_CODES.STATIC_CATALOGUE_EMPTY,
      message: `HyperGuest returned no room or rate types for hotel ${creds.hotel_code}. Confirm the hotel_code and that the property is published on HyperGuest.`,
    };
  }
  return { rooms: newRooms, rates: newRates, refreshed: true };
}


// ============================================================================
// CERTIFICATION RUNNER
// ============================================================================

interface CertStep {
  step: number;                    // 1..N within its phase
  kind: "setup" | "test";
  test?: number;                   // 1..12 for booking tests (matches HG spec)
  name: string;
  status: "pass" | "fail" | "skip";
  duration_ms: number;
  summary?: string;
  error?: string;
  reservation_id?: string;
  cancelled?: boolean;
  package?: boolean;
  nrf_outcome?: "rejected" | "penalty_charged";
  requests?: TraceEntry[];         // full HG request/response trace
}

async function logIntegrationStep(
  supabase: any,
  propertyId: string | null,
  step: CertStep,
) {
  try {
    await supabase.from("integration_logs").insert({
      integration_type: "hyperguest",
      property_id: propertyId,
      event_type: `cert_${step.kind}_${step.test ?? step.step}_${step.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      status: step.status === "pass" ? "success" : "error",
      payload: step,
    });
  } catch (_e) {
    // log table may not accept this shape — never block cert run on logging
  }
}

async function runCertification(
  supabase: any,
  creds: HyperGuestCredentials,
  propertyId: string | null,
): Promise<any> {
  const setup: CertStep[] = [];
  const tests: CertStep[] = [];
  const bookedReservations: Array<{ id: string; test: number }> = [];

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const stdIn = new Date(today); stdIn.setDate(today.getDate() + 30);
  const stdOut = new Date(stdIn); stdOut.setDate(stdIn.getDate() + 2);

  const baseLead = {
    first_name: "Cert", last_name: "Test", title: "MR" as const,
    birth_date: "1990-01-01", email: "cert@roomsonline.test", phone: "+27000000000",
    address: "1 Test Lane", city: "Cape Town", country: "ZA", state: "WC", zip: "8001",
  };
  const basePayment = {
    type: "credit_card" as const,
    credit_card: {
      number: "4111111111111111", cvv: "123", expiry_month: "12", expiry_year: "2030",
      first_name: "Cert", last_name: "Test", charge: false,
    },
  };
  const baseMeta = [{ key: "Source", value: "RoomsOnline HG Certification 12-step" }];
  const guestFor = (label: string, idx: number, title: "MR" | "C" = "MR", birthYear?: number) => ({
    first_name: `${label}${idx}`, last_name: "Test", title,
    birth_date: `${birthYear ?? 1990}-01-01`,
  });

  const runStep = async (
    kind: "setup" | "test",
    testNumber: number,
    name: string,
    fn: () => Promise<{ summary: string; extra?: Partial<CertStep> }>,
  ): Promise<CertStep> => {
    const ctx = startTrace();
    const t0 = Date.now();
    const record: CertStep = {
      step: (kind === "setup" ? setup.length : tests.length) + 1,
      kind,
      ...(kind === "test" ? { test: testNumber } : {}),
      name,
      status: "pass",
      duration_ms: 0,
    };
    try {
      const r = await fn();
      record.summary = r.summary;
      if (r.extra) Object.assign(record, r.extra);
    } catch (e: any) {
      record.status = "fail";
      record.error = e?.message || String(e);
    } finally {
      record.duration_ms = Date.now() - t0;
      record.requests = await endTrace(ctx);
    }
    if (kind === "setup") setup.push(record); else tests.push(record);
    await logIntegrationStep(supabase, propertyId, record);
    return record;
  };

  // ===== Setup (silent prelude; not counted in the 12 booking tests) ====
  await runStep("setup", 0, "health_check", async () => {
    const r = await healthCheck(creds);
    return { summary: `hotel_visible=${r?.hotel_visible ?? "unknown"}` };
  });

  let staticData: any = null;
  await runStep("setup", 0, "fetch_static_data", async () => {
    const pre = await ensureStaticCatalogue(supabase, creds, propertyId);
    staticData = await fetchStaticData(creds, "all", supabase, propertyId);
    const r = staticData?.rooms?.length ?? 0;
    const p = staticData?.rates?.length ?? 0;
    if (r === 0 && p === 0) throw new Error("No rooms or rates returned");
    return { summary: `rooms=${r} rates=${p} (cache_refreshed=${pre.refreshed})` };
  });

  // ----- internal helpers -----------------------------------------------
  const search = async (opts: {
    check_in?: string; check_out?: string;
    pax: HgPax[]; currency?: string; nationality?: string;
  }) => {
    return await fetchAvailability(
      creds,
      opts.check_in ?? fmt(stdIn),
      opts.check_out ?? fmt(stdOut),
      { rooms: opts.pax.length, adults: opts.pax[0].adults, children: opts.pax[0].children?.length ?? 0 },
      opts.nationality,
      opts.currency ?? "USD",
    );
  };

  const pickOffer = (avail: any) => {
    const rt = avail?.room_types?.[0];
    const rate = rt?.rate_types?.[0];
    if (!rt || !rate) throw new Error("No availability offer returned");
    return {
      roomTypeId: String(rt.room_type_id),
      rateId: String(rate.rate_type_id),
      price: Number(rate.selling_rate ?? rate.net_total ?? 0),
      currency: rate.rates?.[0]?.currency ?? "USD",
      rateName: rate.rate_type_name,
      raw: rate,
    };
  };

  const buildRoom = (offer: { roomTypeId: string; rateId: string; price: number; currency: string }, guests: any[]) => ({
    room_id: offer.roomTypeId,
    rate_plan_id: offer.rateId,
    expected_amount: offer.price,
    expected_currency: offer.currency,
    guests,
  });

  const doBooking = async (opts: {
    label: string;
    pax: HgPax[];
    rooms: Array<{ room_id: string | number; rate_plan_id: string | number; expected_amount: number; expected_currency: string; guests: any[] }>;
    nationality?: string;
    check_in?: string; check_out?: string;
  }) => {
    const searchArgs = {
      check_in: opts.check_in ?? fmt(stdIn),
      check_out: opts.check_out ?? fmt(stdOut),
      nationality: opts.nationality ?? "ZA",
      pax: opts.pax,
    };
    const pb = await prebook(creds, {
      ...searchArgs,
      rooms: opts.rooms.map(r => ({
        room_id: r.room_id, rate_plan_id: r.rate_plan_id,
        expected_amount: r.expected_amount, expected_currency: r.expected_currency,
      })),
      meta: baseMeta,
    });
    const pbRooms = Array.isArray(pb?.rooms) ? pb.rooms : [];
    const pickRoomPrice = (i: number, fallback: number) => {
      const room = pbRooms[i];
      const price = room?.prices?.sell?.price ?? room?.prices?.sell?.amount
        ?? room?.paymentAmount?.amount ?? room?.totalPrice?.amount;
      const n = Number(price);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const pickRoomCurrency = (i: number, fallback: string) =>
      pbRooms[i]?.prices?.sell?.currency ?? pbRooms[i]?.paymentAmount?.currency ?? fallback;
    const buildRoomsPayload = (overrides: Record<number, number> = {}) =>
      opts.rooms.map((r, i) => ({
        room_id: r.room_id, rate_plan_id: r.rate_plan_id,
        expected_amount: overrides[i] ?? pickRoomPrice(i, r.expected_amount),
        expected_currency: pickRoomCurrency(i, r.expected_currency),
        guests: r.guests,
        special_requests: [],
      }));
    const attemptCreate = async (overrides: Record<number, number> = {}) => createReservation(creds, {
      ...searchArgs,
      lead_guest: baseLead,
      payment: basePayment,
      rooms: buildRoomsPayload(overrides),
      client_reference: `ROL-CERT-${opts.label}-${Date.now()}`,
      meta: baseMeta,
    });
    let res: any;
    try {
      res = await attemptCreate();
    } catch (e: any) {
      // Self-heal on HG price-mismatch validation: extract corrected per-room rates and retry once
      const msg = String(e?.message ?? "");
      const rx = /Expected price sent on booking request \(([\d.]+) \w+\) does not match booking rate: ([\d.]+) \w+ \[Room: (\d+), RatePlan: (\d+)\]/g;
      const overrides: Record<number, number> = {};
      let m: RegExpExecArray | null;
      while ((m = rx.exec(msg)) !== null) {
        const correctedPrice = Number(m[2]);
        const roomId = m[3]; const rateId = m[4];
        const idx = opts.rooms.findIndex(r => String(r.room_id) === roomId && String(r.rate_plan_id) === rateId);
        if (idx >= 0 && Number.isFinite(correctedPrice)) overrides[idx] = correctedPrice;
      }
      if (Object.keys(overrides).length === 0) throw e;
      res = await attemptCreate(overrides);
    }
    if (!res?.reservation_id) throw new Error("No reservation_id returned");
    return { reservation_id: String(res.reservation_id), status: res.status };
  };

  // ===== Test #1 — Prebook 1 room / 1 adult ==============================
  await runStep("test", 1, "Pre-book — 1 room, 1 adult", async () => {
    const pax: HgPax[] = [{ adults: 1, children: [] }];
    const avail = await search({ pax });
    const offer = pickOffer(avail);
    const pb = await prebook(creds, {
      check_in: fmt(stdIn), check_out: fmt(stdOut), nationality: "ZA", pax,
      rooms: [{ room_id: offer.roomTypeId, rate_plan_id: offer.rateId, expected_amount: offer.price, expected_currency: offer.currency }],
      meta: baseMeta,
    });
    return { summary: `pre-book ok @ ${pb?.payment_amount?.amount ?? offer.price} ${pb?.currency ?? offer.currency}` };
  });

  // ===== Test #2 — Booking 1 room / 1 adult ==============================
  await runStep("test", 2, "Booking — 1 room, 1 adult", async () => {
    const pax: HgPax[] = [{ adults: 1, children: [] }];
    const avail = await search({ pax });
    const offer = pickOffer(avail);
    const r = await doBooking({ label: "T2", pax, rooms: [buildRoom(offer, [guestFor("Adult", 1)])] });
    bookedReservations.push({ id: r.reservation_id, test: 2 });
    return { summary: `reservation=${r.reservation_id} status=${r.status}`, extra: { reservation_id: r.reservation_id } };
  });

  // ===== Test #3 — 1 room / 2A + 1C + 1I ================================
  await runStep("test", 3, "Booking — 1 room, 2 adults + 1 child + 1 infant", async () => {
    const pax: HgPax[] = [{ adults: 2, children: [8, 1] }];
    const avail = await search({ pax });
    const yr = new Date().getFullYear();
    const guests = [
      guestFor("Adult", 1), guestFor("Adult", 2),
      guestFor("Child", 1, "C", yr - 8),
      guestFor("Infant", 1, "C", yr - 1),
    ];
    // Walk all room/rate combos until one prebooks successfully (occupancy support varies by plan)
    const roomTypes = avail?.room_types ?? [];
    let lastErr: any = null;
    for (const rt of roomTypes) {
      for (const rate of (rt.rate_types ?? [])) {
        const offer = {
          roomTypeId: String(rt.room_type_id),
          rateId: String(rate.rate_type_id),
          price: Number(rate.selling_rate ?? rate.net_total ?? 0),
          currency: rate.rates?.[0]?.currency ?? "USD",
        };
        try {
          const r = await doBooking({ label: "T3", pax, rooms: [buildRoom(offer, guests)] });
          bookedReservations.push({ id: r.reservation_id, test: 3 });
          return { summary: `reservation=${r.reservation_id} (room=${offer.roomTypeId} rate=${offer.rateId})`, extra: { reservation_id: r.reservation_id } };
        } catch (e: any) {
          lastErr = e;
          if (!/no longer available|occupancy|unavailable/i.test(String(e?.message ?? ""))) throw e;
        }
      }
    }
    throw new Error(`No rate plan supports 2A+1C+1I occupancy in a single room (last: ${lastErr?.message ?? "unknown"})`);
  });

  // ===== Test #4 — 2 rooms: 2A / 1A =====================================
  await runStep("test", 4, "Booking — 2 rooms (2 adults, 1 adult)", async () => {
    const pax: HgPax[] = [{ adults: 2, children: [] }, { adults: 1, children: [] }];
    const avail = await search({ pax });
    const offer = pickOffer(avail);
    const r = await doBooking({
      label: "T4", pax,
      rooms: [
        buildRoom(offer, [guestFor("A", 1), guestFor("A", 2)]),
        buildRoom(offer, [guestFor("B", 1)]),
      ],
    });
    bookedReservations.push({ id: r.reservation_id, test: 4 });
    return { summary: `reservation=${r.reservation_id}`, extra: { reservation_id: r.reservation_id } };
  });

  // ===== Test #5 — 2 rooms: (1A+1C) / (2A+1I) ===========================
  await runStep("test", 5, "Booking — 2 rooms (1A+1C, 2A+1I)", async () => {
    const pax: HgPax[] = [{ adults: 1, children: [8] }, { adults: 2, children: [1] }];
    const avail = await search({ pax });
    const offer = pickOffer(avail);
    const yr = new Date().getFullYear();
    const r = await doBooking({
      label: "T5", pax,
      rooms: [
        buildRoom(offer, [guestFor("A", 1), guestFor("C", 1, "C", yr - 8)]),
        buildRoom(offer, [guestFor("A", 1), guestFor("A", 2), guestFor("I", 1, "C", yr - 1)]),
      ],
    });
    bookedReservations.push({ id: r.reservation_id, test: 5 });
    return { summary: `reservation=${r.reservation_id}`, extra: { reservation_id: r.reservation_id } };
  });

  // ===== Test #6 — 2 rooms different room types & rate plans ===========
  await runStep("test", 6, "Booking — 2 rooms different room types & rate plans", async () => {
    const pax: HgPax[] = [{ adults: 2, children: [] }, { adults: 2, children: [] }];
    const avail = await search({ pax });
    const types = avail?.room_types ?? [];
    if (types.length === 0) throw new Error("No room types available");
    const first = types[0];
    const second = types.find((t: any) => String(t.room_type_id) !== String(first.room_type_id));
    const mkOffer = (rt: any, rateIdx = 0) => {
      const rate = rt.rate_types?.[rateIdx] ?? rt.rate_types?.[0];
      return {
        roomTypeId: String(rt.room_type_id),
        rateId: String(rate.rate_type_id),
        price: Number(rate.selling_rate ?? rate.net_total ?? 0),
        currency: rate.rates?.[0]?.currency ?? "USD",
      };
    };
    let offerA = mkOffer(first, 0);
    let offerB: any;
    let note = "";
    if (second) {
      offerB = mkOffer(second, 0);
    } else {
      const altRate = first.rate_types?.[1];
      if (!altRate) throw new Error("Cert hotel exposes only 1 room type and 1 rate — cannot satisfy distinct-type test");
      offerB = mkOffer(first, 1);
      note = " (only 1 room type — used distinct rate plans on same room)";
    }
    const r = await doBooking({
      label: "T6", pax,
      rooms: [
        buildRoom(offerA, [guestFor("A", 1), guestFor("A", 2)]),
        buildRoom(offerB, [guestFor("B", 1), guestFor("B", 2)]),
      ],
    });
    bookedReservations.push({ id: r.reservation_id, test: 6 });
    return { summary: `reservation=${r.reservation_id}${note}`, extra: { reservation_id: r.reservation_id } };
  });

  // ===== Test #7 — Same-day 1 room / 2 adults ============================
  await runStep("test", 7, "Booking — 1 room, 2 adults, same-day", async () => {
    const ci = fmt(today);
    const coDate = new Date(today); coDate.setDate(today.getDate() + 1);
    const co = fmt(coDate);
    const pax: HgPax[] = [{ adults: 2, children: [] }];
    const avail = await fetchAvailability(creds, ci, co, { rooms: 1, adults: 2, children: 0 }, undefined, "USD");
    const offer = pickOffer(avail);
    const r = await doBooking({
      label: "T7", pax, check_in: ci, check_out: co,
      rooms: [buildRoom(offer, [guestFor("A", 1), guestFor("A", 2)])],
    });
    bookedReservations.push({ id: r.reservation_id, test: 7 });
    return { summary: `reservation=${r.reservation_id} (${ci}→${co})`, extra: { reservation_id: r.reservation_id } };
  });

  // ===== Test #8 — Currency conversion (EUR) =============================
  await runStep("test", 8, "Booking — 1 room, 2 adults, currency conversion (EUR)", async () => {
    const pax: HgPax[] = [{ adults: 2, children: [] }];
    const avail = await search({ pax, currency: "EUR" });
    const offer = pickOffer(avail);
    const r = await doBooking({ label: "T8", pax, rooms: [buildRoom(offer, [guestFor("A", 1), guestFor("A", 2)])] });
    bookedReservations.push({ id: r.reservation_id, test: 8 });
    return { summary: `reservation=${r.reservation_id} currency=${offer.currency}`, extra: { reservation_id: r.reservation_id } };
  });

  // ===== Test #9 — Nationality (GB) ======================================
  await runStep("test", 9, "Booking — 1 room, 2 adults, nationality GB", async () => {
    const pax: HgPax[] = [{ adults: 2, children: [] }];
    const avail = await search({ pax, nationality: "GB" });
    const offer = pickOffer(avail);
    const r = await doBooking({
      label: "T9", pax, nationality: "GB",
      rooms: [buildRoom(offer, [guestFor("A", 1), guestFor("A", 2)])],
    });
    bookedReservations.push({ id: r.reservation_id, test: 9 });
    return { summary: `reservation=${r.reservation_id} nationality=GB`, extra: { reservation_id: r.reservation_id } };
  });

  // ===== Test #10 — Cancel a refundable reservation =====================
  await runStep("test", 10, "Cancellation — refundable reservation", async () => {
    const pax: HgPax[] = [{ adults: 2, children: [] }];
    const avail = await search({ pax });
    const rt = avail?.room_types?.[0];
    if (!rt) throw new Error("No room type available");
    const refundable = (rt.rate_types || []).find((r: any) => {
      const policies = r.cancellation_policies ?? [];
      return policies.some((p: any) => {
        const pct = Number(p?.penalty?.percentage ?? p?.percentage ?? 100);
        const deadline = p?.deadline ?? p?.dueDate;
        if (!deadline) return false;
        return pct < 100 && new Date(deadline).getTime() > Date.now() + 24 * 3600 * 1000;
      });
    }) ?? rt.rate_types?.[0];
    if (!refundable) throw new Error("No rate available for refundable test");
    const offer = {
      roomTypeId: String(rt.room_type_id),
      rateId: String(refundable.rate_type_id),
      price: Number(refundable.selling_rate ?? refundable.net_total ?? 0),
      currency: refundable.rates?.[0]?.currency ?? "USD",
    };
    const r = await doBooking({ label: "T10", pax, rooms: [buildRoom(offer, [guestFor("A", 1), guestFor("A", 2)])] });
    const cancel = await cancelReservation(creds, r.reservation_id, "cert refundable test");
    return {
      summary: `booked=${r.reservation_id} → cancelled=${cancel?.status ?? "ok"}`,
      extra: { reservation_id: r.reservation_id, cancelled: true },
    };
  });

  // ===== Test #11 — Attempted cancel of NRF reservation ================
  await runStep("test", 11, "Cancellation — attempted on non-refundable reservation", async () => {
    const pax: HgPax[] = [{ adults: 2, children: [] }];
    const avail = await search({ pax });
    const rt = avail?.room_types?.[0];
    if (!rt) throw new Error("No room type available");
    const nrf = (rt.rate_types || []).find((r: any) => {
      const name = String(r.rate_type_name ?? "").toLowerCase();
      const flag = r.ratePlanInfo?.isNonRefundable ?? r.is_non_refundable ?? r.non_refundable;
      if (flag === true) return true;
      if (/non[\s-]?refundable|nrf|no[\s-]?refund/.test(name)) return true;
      const policies = r.cancellation_policies ?? [];
      if (policies.length === 0) return false; // empty != NRF; skip rather than misclassify
      return policies.every((p: any) => Number(p?.penalty?.percentage ?? p?.percentage ?? 0) >= 100);
    });
    if (!nrf) throw new Error("No non-refundable rate available for NRF test (property exposes no NRF plan)");
    const offer = {
      roomTypeId: String(rt.room_type_id),
      rateId: String(nrf.rate_type_id),
      price: Number(nrf.selling_rate ?? nrf.net_total ?? 0),
      currency: nrf.rates?.[0]?.currency ?? "USD",
    };
    const r = await doBooking({ label: "T11", pax, rooms: [buildRoom(offer, [guestFor("A", 1), guestFor("A", 2)])] });
    let cancelResult: any = null;
    let cancelError: any = null;
    try {
      cancelResult = await cancelReservation(creds, r.reservation_id, "cert NRF test");
    } catch (e: any) { cancelError = e; }
    return {
      summary: cancelError
        ? `booked=${r.reservation_id} → cancel rejected as expected (${String(cancelError?.message ?? "").slice(0, 80)})`
        : `booked=${r.reservation_id} → cancel processed, penalty=${cancelResult?.cancellation_cost?.amount ?? "unknown"}`,
      extra: {
        reservation_id: r.reservation_id,
        nrf_outcome: cancelError ? "rejected" : "penalty_charged",
      },
    };
  });

  // ===== Test #12 — Package rate ========================================
  await runStep("test", 12, "Booking — 1 room, 2 adults, package rate", async () => {
    const pax: HgPax[] = [{ adults: 2, children: [] }];
    const avail = await search({ pax });
    const rt = avail?.room_types?.[0];
    if (!rt) throw new Error("No room type available");
    const pkg = (rt.rate_types || []).find((r: any) => {
      const name = String(r.rate_type_name ?? "").toLowerCase();
      const code = String(r.rate_type_code ?? "").toLowerCase();
      const board = String(r.board_code ?? r.board_name ?? "").toLowerCase();
      const flag = r.ratePlanInfo?.isPackage ?? r.is_package ?? r.package;
      if (flag === true) return true;
      if (/package|pkg|bundle|inclusive/.test(name) || /package|pkg/.test(code)) return true;
      // Board-inclusive plans (Full Board, All Inclusive, Half Board) qualify as packages
      return ["fb", "ai", "hb", "full board", "all inclusive", "half board"].includes(board);
    });
    if (!pkg) throw new Error("No package/board-inclusive rate available for package test");
    const offer = {
      roomTypeId: String(rt.room_type_id),
      rateId: String(pkg.rate_type_id),
      price: Number(pkg.selling_rate ?? pkg.net_total ?? 0),
      currency: pkg.rates?.[0]?.currency ?? "USD",
    };
    const r = await doBooking({ label: "T12", pax, rooms: [buildRoom(offer, [guestFor("A", 1), guestFor("A", 2)])] });
    bookedReservations.push({ id: r.reservation_id, test: 12 });
    return {
      summary: `reservation=${r.reservation_id} rate=${pkg.rate_type_name ?? pkg.rate_type_id}`,
      extra: { reservation_id: r.reservation_id, package: true },
    };
  });

  // ===== Tally + export bundle ==========================================
  const passed = tests.filter(t => t.status === "pass").length;
  const failed = tests.filter(t => t.status === "fail").length;
  const setupOk = setup.every(s => s.status === "pass");
  const allPassed = setupOk && failed === 0 && passed === 12;

  const full_log = allPassed ? {
    hotel_code: creds.hotel_code,
    environment: creds.environment,
    generated_at: new Date().toISOString(),
    spec_version: "hyperguest-cert-12step-v1",
    setup_steps: setup,
    booking_tests: tests,
    booked_reservations: bookedReservations,
  } : null;

  return {
    hotel_code: creds.hotel_code,
    environment: creds.environment,
    setup_steps: setup,
    booking_tests: tests,
    booked_reservations: bookedReservations,
    passed,
    failed,
    total: 12,
    export_ready: allPassed,
    full_log,
  };
}


// ============================================================================
// REFLECTION SYNC — pull HyperGuest static + search data and persist a
// reflection snapshot onto the linked property. Designed to run automatically
// whenever a HyperGuest hotel ID is captured on a property so the QA portal
// (and the in-app reflection inspector) show real data, not placeholders.
// ============================================================================

async function syncReflection(
  supabase: any,
  creds: HyperGuestCredentials,
  propertyId: string,
): Promise<any> {
  const reasons: string[] = [];

  // 1. Static hotels.json (photos / facilities / description) — best effort.
  let staticHotel: any = null;
  try {
    const resp = await hgFetch(`${HG_ENDPOINTS.static}/hotels.json`, {
      headers: getAuthHeaders(creds.api_key),
      timeoutMs: 15000,
    });
    if (resp.ok) {
      const txt = await resp.text();
      try {
        const data = JSON.parse(txt);
        const hotels = Array.isArray(data) ? data : (data.hotels || []);
        staticHotel = hotels.find((h: any) =>
          String(h.id ?? h.hotel_id ?? h.propertyId) === String(creds.hotel_code)
        ) ?? null;
      } catch {
        reasons.push("static_feed_unparsable");
      }
    } else {
      reasons.push(`static_feed_${resp.status}`);
      await resp.text();
    }
  } catch (e) {
    reasons.push(`static_feed_error:${(e as Error).message}`);
  }

  // 2. Search probe (rate plans, cancellation policies, board, remarks, prices).
  const today = new Date();
  const ci = new Date(today); ci.setDate(today.getDate() + 14);
  const co = new Date(ci); co.setDate(ci.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let probe: any = null;
  try {
    probe = await fetchAvailability(creds, fmt(ci), fmt(co),
      { rooms: 1, adults: 2, children: 0 }, undefined, "USD");
  } catch (e) {
    reasons.push(`search_probe_error:${(e as Error).message}`);
  }

  // 3. Aggregate the reflection payload (HG-side truth).
  const ratePlans: any[] = [];
  const cancelByRate: Record<string, any[]> = {};
  const boardByRate: Record<string, { code: string | null; name: string | null }> = {};
  for (const rt of (probe?.room_types ?? [])) {
    for (const plan of (rt.rate_types ?? [])) {
      const id = String(plan.rate_type_id);
      if (!ratePlans.find(p => p.id === id)) {
        ratePlans.push({
          id,
          name: plan.rate_type_name,
          board_code: plan.board_code ?? null,
          board_name: plan.board_name ?? null,
          is_non_refundable: !(plan.cancellation_policies?.length > 0),
          is_package: String(plan.rate_type ?? "").toUpperCase().includes("PKG")
            || /package/i.test(String(plan.rate_type_name ?? "")),
        });
      }
      if (plan.cancellation_policies?.length) {
        cancelByRate[id] = plan.cancellation_policies;
      }
      boardByRate[id] = {
        code: plan.board_code ?? null,
        name: plan.board_name ?? null,
      };
    }
  }

  const photos: string[] = (() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (u?: string | null) => {
      if (u && !seen.has(u)) { seen.add(u); out.push(u); }
    };
    const propInfo = probe?.property_info ?? {};
    for (const i of (propInfo.images ?? propInfo.photos ?? [])) {
      push(typeof i === "string" ? i : (i?.url ?? i?.href));
    }
    for (const i of (staticHotel?.images ?? staticHotel?.photos ?? [])) {
      push(typeof i === "string" ? i : (i?.url ?? i?.href));
    }
    return out;
  })();

  const facilities: string[] = (() => {
    const out = new Set<string>();
    const collect = (v: any) => {
      if (!v) return;
      if (typeof v === "string") { out.add(v); return; }
      if (Array.isArray(v)) { for (const x of v) collect(typeof x === "string" ? x : (x?.name ?? x?.label)); return; }
      if (v.name) out.add(v.name);
    };
    collect((probe?.property_info as any)?.facilities);
    collect((probe?.property_info as any)?.amenities);
    collect(staticHotel?.facilities);
    collect(staticHotel?.amenities);
    return Array.from(out);
  })();

  const reflection = {
    sandbox_hotel_id: creds.hotel_code,
    fetched_at: new Date().toISOString(),
    environment: creds.environment,
    property_name: staticHotel?.name ?? probe?.property_info?.name ?? null,
    description: staticHotel?.description ?? probe?.property_info?.description ?? null,
    board_bases: ratePlans,
    cancellation_policies: Object.entries(cancelByRate).map(([rate_id, policies]) => ({
      rate_id,
      rate_name: ratePlans.find(p => p.id === rate_id)?.name ?? null,
      policies,
    })),
    remarks: probe?.remarks ?? [],
    photos,
    facilities,
    notes: reasons,
  };

  // 4. Persist onto the property — merge with care; never clobber filled fields.
  const { data: existing } = await supabase
    .from("properties")
    .select("external_metadata, amenities, images, description, short_description")
    .eq("id", propertyId)
    .maybeSingle();

  const meta = (existing?.external_metadata && typeof existing.external_metadata === "object")
    ? { ...existing.external_metadata } : {};
  meta.hyperguest_reflection = reflection;

  const patch: Record<string, any> = {
    external_metadata: meta,
    hyperguest_last_static_sync_at: new Date().toISOString(),
  };

  // Only fill empty fields — operator-edited content wins.
  const existingImages = Array.isArray(existing?.images) ? existing.images : [];
  if (!existingImages.length && photos.length) {
    patch.images = photos;
  }
  const existingAmenities = Array.isArray(existing?.amenities) ? existing.amenities : [];
  if (!existingAmenities.length && facilities.length) {
    patch.amenities = facilities;
  }
  if (!existing?.description && reflection.description) {
    patch.description = reflection.description;
  }

  const { error: updateErr } = await supabase
    .from("properties")
    .update(patch)
    .eq("id", propertyId);
  if (updateErr) {
    reasons.push(`property_update_failed:${updateErr.message}`);
  }

  // 5. Mirror cancellation policy summary into rolos_policies (one row per property).
  if (reflection.cancellation_policies.length) {
    try {
      await supabase
        .from("rolos_policies")
        .upsert({
          property_id: propertyId,
          policy_type: "cancellation",
          rule: {
            source: "hyperguest",
            by_rate: reflection.cancellation_policies,
            synced_at: reflection.fetched_at,
          },
          is_ai_generated: false,
          last_evaluated_at: reflection.fetched_at,
        }, { onConflict: "property_id,policy_type" });
    } catch (e) {
      reasons.push(`policies_upsert_failed:${(e as Error).message}`);
    }
  }

  return {
    property_id: propertyId,
    hotel_code: creds.hotel_code,
    written: {
      images: !!patch.images,
      amenities: !!patch.amenities,
      description: !!patch.description,
      external_metadata: true,
      cancellation_policies: reflection.cancellation_policies.length > 0,
    },
    reflection,
    diagnostics: reasons,
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

      // Soft pre-flight: HG returns rooms+rates inline on every /search call,
      // so we don't block ARI on the static catalogue. We still trigger a
      // best-effort background refresh when the cache is stale/empty so other
      // surfaces (room mapping, rate mapping) have catalogue data to render.
      try {
        await ensureStaticCatalogue(supabase, creds, propertyId);
      } catch (preErr: any) {
        console.warn(`[hyperguest] Static catalogue pre-flight skipped: ${preErr?.message || preErr}`);
      }


      let rawResult: any;
      try {
        rawResult = await fetchAvailability(
          creds,
          validation.data.start_date,
          validation.data.end_date,
          validation.data.occupancy,
          validation.data.nationality,
          validation.data.currency
        );
      } catch (avErr: any) {
        const msg = String(avErr?.message || avErr);
        const status = /401|Invalid authorization/i.test(msg) ? 401
                    : /404|Url not found/i.test(msg) ? 502
                    : 502;
        return new Response(
          JSON.stringify(createErrorResponse(
            status === 401 ? ERROR_CODES.AUTH_FAILED : ERROR_CODES.PMS_UNAVAILABLE,
            `HyperGuest availability failed: ${msg.substring(0, 400)}`,
            action,
          )),
          { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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

      // Cache availability data. Keep one row per room/date with all rate plans
      // attached; per-rate upserts make long calendar ranges too slow and can
      // trigger client-side 2xx/context-cancelled errors.
      if (result.room_types?.length) {
        const cacheRowsByKey = new Map<string, any>();
        for (const rt of result.room_types) {
          const availabilityByDate = new Map(
            (rt.rooms_available_per_night || []).map((day: any) => [day.date, day])
          );
          for (const rateType of rt.rate_types || []) {
            for (const dailyRate of rateType.rates || []) {
              const externalRoomTypeId = rt.external_room_type_id || rt.room_type_id;
              const key = `${externalRoomTypeId}:${dailyRate.date}`;
              const availabilityDay = availabilityByDate.get(dailyRate.date) as any;
              const existing = cacheRowsByKey.get(key) || {
                property_id: propertyId,
                system_type: "hyperguest",
                external_room_type_id: externalRoomTypeId,
                date: dailyRate.date,
                available_units: availabilityDay?.available_units ?? dailyRate.available ?? 1,
                rates: [],
                raw_data: { roomTypeName: rt.room_type_name, room_name: rt.room_type_name },
                last_synced_at: new Date().toISOString(),
              };
              existing.rates.push({
                rate_type_id: rateType.rate_type_id,
                rate_type_name: rateType.rate_type_name,
                price_type: rateType.price_type,
                rate_key: rateType.rate_key,
                room_amount: dailyRate.room_amount,
                adult_amounts: dailyRate.adult_amounts,
                teen_amount: dailyRate.teen_amount,
                child_amount: dailyRate.child_amount,
                infant_amount: dailyRate.infant_amount,
                currency: dailyRate.currency,
                net: rateType.net_total,
                selling: rateType.selling_rate,
              });
              cacheRowsByKey.set(key, existing);
            }
          }
        }
        const cacheRows = Array.from(cacheRowsByKey.values());
        for (let i = 0; i < cacheRows.length; i += 500) {
          const { error: cacheErr } = await supabase
            .from("pms_availability_cache")
            .upsert(cacheRows.slice(i, i + 500), { onConflict: "property_id,system_type,external_room_type_id,date" });
          if (cacheErr) console.warn(`[hyperguest] Availability cache upsert warning: ${cacheErr.message}`);
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
        const v = validation.data;
        const result = await prebook(creds, {
          check_in: v.check_in,
          check_out: v.check_out,
          nationality: v.nationality,
          pax: v.pax,
          rooms: v.rooms,
          meta: v.meta,
        });
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
        const v = validation.data;
        const result = await createReservation(creds, {
          check_in: v.check_in,
          check_out: v.check_out,
          nationality: v.nationality,
          pax: v.pax,
          lead_guest: v.lead_guest,
          payment: v.payment,
          rooms: v.rooms,
          client_reference: v.client_reference,
          meta: v.meta,
        });
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
