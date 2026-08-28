import { normalizeRuTimeZone } from '../_shared/ruTimeZones.ts';
import { toWireChangeover } from '../_shared/ruChangeover.ts';
import {
  RU_EMPLOYEE_RANGES,
  RU_PROPERTY_RANGES,
  RU_YEARS_RANGES,
  isRangeId,
  rangeIdForCount,
  type RuRange,
} from '../_shared/ruRanges.ts';
import {
  DEFAULT_LNM_CHANGE_TYPES,
  KNOWN_LNM_CHANGE_TYPE_IDS,
  parseLnmChangeTypes,
  parseLnmSubscriptions,
} from '../_shared/ruLnm.ts';
import { extractAllBlocks, parseRuReservation } from '../_shared/ruReservationParsing.ts';
import {
  isGenericDestination,
  normalizeDestinationName,
  type RuDistanceEntry,
} from '../_shared/ruDistances.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AsyncLocalStorage } from 'node:async_hooks';
import { logRuExchange, logRuNotAttempted, newRuTraceId, type RuApiLogContext, type RuTransportStatus } from '../_shared/ruApiLog.ts';
import { RU_RATE_DEFERRED_CODE, RU_RATE_WINDOW_SECONDS, RuRateDeferredError, reserveRuSlot, enqueueRuCall, isDeferrableRuCall, ruQueuePriority, ruGateWaitMs, isReservationWriteAction } from '../_shared/ruRateGate.ts';
import { fetchRetiredRuOwnerIds } from '../_shared/ruRetiredAccounts.ts';
import { readRuOwnerListingCache, writeRuOwnerListingCache } from '../_shared/ruOwnerListingCache.ts';
import { buildCreateApiKeyXml } from '../_shared/ruApiKeyXml.ts';

/**
 * Request-scoped logging context for the durable RU exchange log.
 *
 * `AsyncLocalStorage` keeps the context correct when the isolate serves concurrent requests, so
 * `callRentalsUnited()` can stay a two-argument helper across its ~40 call sites.
 */
const ruLogContext = new AsyncLocalStorage<RuApiLogContext>();

let logClient: ReturnType<typeof createClient> | null = null;

/** Service-role client used only to write `ru_api_log` (staff-read-only table). */
function getLogClient() {
  if (!logClient) {
    logClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
  }
  return logClient;
}



/**
 * Rentals United XML API Adapter
 * 
 * Pull (read) actions:
 * - health_check: Verify API connectivity and credentials
 * - list_properties: Pull_ListOwnerProp_RQ
 * - get_property: Pull_ListSpecProp_RQ
 * - get_availability: Pull_ListPropertyAvailabilityCalendar_RQ
 * - get_prices: Pull_ListPropertyPrices_RQ
 * - list_reservations: Pull_ListReservations_RQ
 * - get_leads: Pull_GetLeads_RQ
 * - list_users: Pull_ListMyUsers_RQ
 * 
 * Push (write) actions:
 * - push_property: Push_PutProperty_RQ
 * - push_availability: Push_PutAvbUnits_RQ
 * - push_prices: Push_PutPrices_RQ (standard <Season> with optional EGPS/LOSS)
 * - push_prices_fsp: Push_PutPrices_RQ (Full Stay Pricing matrix)
 * - subscribe_notifications: LNM_PutHandlerUrl_RQ (RLNM — reservations)
 * - put_lnm_subscriptions: Push_PutLiveNotificationMechanismSubscriptions_RQ (LNM — content/ARI)
 * - list_lnm_subscriptions: Pull_ListLiveNotificationMechanismSubscriptions_RQ
 * - list_lnm_change_types: Pull_ListLiveNotificationMechanismChangeTypes_RQ
 * - list_sales_channels: Pull_ListSalesChannels_RQ
 * - list_property_types: Pull_ListPropTypes_RQ (cached in ru_property_types)

 * - push_long_stay_discounts: Push_PutLongStayDiscounts_RQ
 * - push_last_minute_discounts: Push_PutLastMinuteDiscounts_RQ
 * - create_user: Push_CreateUser_RQ
 * - fill_company_details: Push_FillCompanyDetails_RQ
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Types ────────────────────────────────────────────────────

interface RUCredentials {
  api_key: string;
  api_secret: string;
  endpoint: string;
  source: 'runtime_secrets' | 'database';
  /**
   * Which account the credentials speak for. Set by `effectiveCreds()` and carried through to
   * every `<Authentication>` envelope so a master credential object is never mistaken for a
   * sub-user one in logs or evidence exports.
   */
  auth_scope?: 'master' | 'child_keys' | 'child_password';
}


interface RUAmenity {
  id: number;
  count?: number;
}

interface RURoom {
  room_id: number;
  amenities: RUAmenity[];
}

interface RUDescription {
  language_id: number;
  text: string;
}

interface RUImage {
  url: string;
  type_id?: number;
  /** Additional RU tags for the same photo (emitted as repeated <Image> nodes). */
  extra_type_ids?: number[];
  is_main?: boolean;
}

interface RUCancellationPolicy {
  valid_from: number;
  valid_to: number;
  percentage: number;
}

interface RUBuildingUnitType {
  name: string;
  quantity: number;
}

interface RUPropertyPayload {
  name: string;
  property_type_id: number;
  object_type_id?: number; // Required when BuildingID is set; identifies the unit type within the building's Composition
  /**
   * RU CurrencyID (mandatory). Examples: ZAR=48, USD=144, NAD=91, EUR=47, GBP=49, BWP=24.
   * Without this RU silently falls back to the master account default currency, which is
   * why downstream channel checks (e.g. LekkeSlaap "ZAR currency not met") fail.
   */
  currency_id: number;
  can_sleep_max: number;
  standard_guests: number;
  number_of_beds?: number; // No longer emitted at Property root (RU XSD removed it); kept for back-compat / fallback bed count
  floor: number;
  space: number;
  street: string;
  detailed_location_id: number;
  zip_code: string;
  latitude: number;
  longitude: number;
  amenities: RUAmenity[];
  rooms: RURoom[];
  descriptions: RUDescription[];
  images: RUImage[];
  payment_methods: number[];
  deposit?: number;
  deposit_type_id?: number;
  cancellation_policies: RUCancellationPolicy[];
  owner_id?: number;
  no_of_units?: number;
  cleaning_price?: number;
  security_deposit?: number;
  arrival_landlord?: string;
  arrival_email?: string;
  arrival_phone?: string;
  arrival_days_before?: number;
  arrival_pickup_service?: string | null;
  arrival_how_to_arrive?: string | null;
  check_in_from?: string;
  check_in_to?: string;
  check_out_until?: string;
  check_in_place?: string;
  building_id?: number;
  /**
   * Gate #10 nice-to-have: distances to nearby attractions. Emitted only when non-empty —
   * an empty <Distances/> wrapper is rejected by the channel parser.
   */
  distances?: RuDistanceEntry[];
}

const PAYMENT_METHOD_LABELS: Record<number, string> = {
  1: 'Cash',
  2: 'Credit card',
  3: 'Mastercard',
  4: 'American Express',
  5: 'Bank transfer',
  6: 'PayPal',
};

interface RUAvailabilityEntry {
  date_from: string;
  date_to: string;
  units: number;
  min_stay?: number;
  max_stay?: number;
  /** ROL'OS internal changeover code (0=none, 1=arrival only, 2=departure only, 3=both).
   *  Translated to the wire scale (1..4) by `toWireChangeover` at XML build time. */
  changeover?: number;
}

interface RUExtraGuestPrice {
  extra_guests: number; // ExtraGuests attribute (1, 2, …)
  price: number;
}

interface RULosNightlyByGuests {
  nr_of_guests: number;
  price: number;
}

interface RULosPricing {
  nights: number; // <LOS Nights="N">
  price: number; // base nightly price for that LOS
  losps?: RULosNightlyByGuests[]; // optional per-guest overrides
}

interface RUPriceEntry {
  date_from: string;
  date_to: string;
  price: number;
  extra_guest_price?: number;
  /** Optional <EGPS> block — extra guest pricing per # of extra guests */
  extra_guest_prices?: RUExtraGuestPrice[];
  /** Optional <LOSS> block — length-of-stay nightly pricing */
  los_pricing?: RULosPricing[];
}

// Full Stay Pricing matrix (alternative to <Season>)
interface RUFspPriceCell {
  nr_of_nights: number;
  price: number;
}

interface RUFspRow {
  nr_of_guests: number;
  prices: RUFspPriceCell[];
}

interface RUFspSeason {
  date: string; // YYYY-MM-DD
  default_price: number;
  rows: RUFspRow[];
}

interface RUDiscountEntry {
  date_from: string;
  date_to: string;
  nights_from: number;
  nights_to?: number;
  discount_percentage: number;
}

/** Current state of an RU reservation, required by Push_ModifyStay_RQ. */
interface RUStayState {
  ru_property_id: number | string;
  date_from: string;
  date_to: string;
  res_apa_id?: number | string | null;
}

/** New state for Push_ModifyStay_RQ. Only supplied fields are emitted. */
interface RUStayModification {
  ru_property_id?: number | string | null;
  date_from?: string | null;
  date_to?: string | null;
  number_of_guests?: number | null;
  client_price?: number | null;
  already_paid?: number | null;
  arrival_time?: string | null;
  use_current_price?: boolean | null;
}

interface RequestBody {

  action: string;
  property_id?: string;
  ru_property_id?: number;
  date_from?: string;
  date_to?: string;
  test_mode?: boolean;
  metadata?: Record<string, unknown>;
  // Durable exchange log correlation (see _shared/ruApiLog.ts)
  trace_id?: string;
  parent_action?: string;
  unit_id?: string;
  ru_user_id?: string | number;
  /** Which PMS fields drove this push (audit evidence for a field-scoped delta). */
  changed_fields?: string[];
  push_type?: 'delta' | 'full';
  fingerprint?: string;
  /**
   * Archive-only escalation for a RETIRED, unbound sub-account: allows the status write
   * to run on MASTER credentials scoped by OwnerID. Only honoured when the OwnerID is
   * present in ru_retired_accounts and the write archives/deactivates the listing.
   */
  archive_retired?: boolean;


  // Push payloads
  property?: RUPropertyPayload;
  availability?: RUAvailabilityEntry[];
  prices?: RUPriceEntry[];
  fsp_seasons?: RUFspSeason[];
  handler_url?: string;
  discounts?: RUDiscountEntry[];
  search_terms?: string;
  // Building payloads
  building_name?: string;
  building_id?: number;
  unit_types?: RUBuildingUnitType[];
  property_ids?: number[];
  // Dry-run / mapping persistence
  dry_run?: boolean;
  property_uuid?: string;
  // User management payloads
  user?: { first_name: string; last_name: string; email: string; password: string };
  company?: { name: string; address?: string; city?: string; country?: string; phone?: string; email?: string; vat_number?: string };
  owner_id?: string | number;
  // Sub-user ("child") authentication. API keys are mandatory for RU accounts created
  // after the Nov-2025 rollout; username/password remains for legacy accounts only.
  auth_access_key?: string;
  auth_secret_key?: string;
  auth_username?: string;
  auth_password?: string;
  // API key management
  key_label?: string;
  target_access_key?: string;
  /** Mint the pair with the master envelope + <OwnerID> after a child-login refusal. */
  owner_scoped_mint?: boolean;

  // Reservation / request lifecycle
  reservation_id?: string | number;
  reject_reason?: string;
  /** Push_CancelReservation_RQ CancelTypeID: 1 = property provider, 2 = guest. */
  cancel_type_id?: number | string;
  /** Push_ModifyStay_RQ current + new state. */
  current_stay?: RUStayState;
  modify_stay?: RUStayModification;
  /** Push_PutConfirmedReservationMulti_RQ — a ROL'OS-created stay handed to the channel. */
  stay?: {
    ru_property_id: string | number;
    date_from: string;
    date_to: string;
    number_of_guests?: number | null;
    client_price?: number | null;
    already_paid?: number | null;
  };
  guest?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    comments?: string | null;
  };


  // Live Notification Mechanism (LNM) subscriptions
  url_base?: string;
  change_types?: string[];
  observed_owners?: (string | number)[];
  /** Sales channel scoping (CM_LNM_* methods). */
  channel_id?: number | string;
  /** Free-text sales-channel name to resolve against Pull_ListSalesChannels_RQ. */
  channel_name?: string;
  /** Force an auth scope ('master') for account-level reads. */
  auth_scope?: string;
  /**
   * Opt in/out of the background call queue when the channel rate window is busy.
   * Reads default to queueable; booking/push paths stay synchronous unless set explicitly.
   */
  deferrable?: boolean;
  /** Set by the queue drainer so a replayed call is never re-queued. */
  queued_replay?: boolean;
}



// ── XML Helpers ──────────────────────────────────────────────

function buildAuthXml(creds: RUCredentials): string {
  return `<Authentication>
    <AccessKey>${escapeXml(creds.api_key)}</AccessKey>
    <SecretKey>${escapeXml(creds.api_secret)}</SecretKey>
  </Authentication>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractStatusId(xml: string): { id: string; message: string } {
  // Check for <error ID="..."> responses first (XML parse errors, auth failures)
  const errorMatch = xml.match(/<error\s+ID="([^"]+)"[^>]*>([\s\S]*?)<\/error>/i);
  if (errorMatch) {
    return { id: errorMatch[1], message: errorMatch[2]?.trim() || 'RU error' };
  }
  // RU failure and throttling statuses are signed (for example -4, -5 and -6).
  // Treating the sign as absent made these responses fall back to ID 0 (success).
  const idMatch = xml.match(/<Status\s+ID="(-?\d+)"/);
  const msgMatch = xml.match(/<Status[^>]*>(.*?)<\/Status>/s);
  return {
    id: idMatch?.[1] || '0',
    message: msgMatch?.[1]?.trim() || 'Unknown',
  };
}

/**
 * Pull_ListOwnerProp_RS carries the listing state as attributes on <Property>:
 * `IsActive` and `IsArchived`. Reconciliation needs those, so they are surfaced
 * alongside the id/name pair (additive — existing callers ignore them).
 */
function extractPropertyIds(xml: string): { id: string; name: string; is_active: boolean; is_archived: boolean }[] {
  // Real shape: <Property><ID BuildingID="-1">5763145</ID><Name>Seester</Name>
  //             ... <LastMod NLA="false" Active="true">…</LastMod></Property>
  // Status lives on LastMod, not on the <Property> tag.
  const blocks = xml.match(/<Property\b[^>]*>[\s\S]*?<\/Property>/g) || [];
  const results: { id: string; name: string; is_active: boolean; is_archived: boolean }[] = [];
  for (const block of blocks) {
    const id = block.match(/<ID\b[^>]*>\s*(\d+)\s*<\/ID>/i)?.[1];
    if (!id) continue;
    const lastMod = block.match(/<LastMod\b([^>]*)>/i)?.[1] || '';
    const active = lastMod.match(/\bActive="([^"]+)"/i)?.[1];
    const nla = lastMod.match(/\bNLA="([^"]+)"/i)?.[1];
    results.push({
      id,
      name: (block.match(/<Name>([\s\S]*?)<\/Name>/i)?.[1] || '').trim(),
      is_active: active == null ? true : /^(true|1)$/i.test(active),
      is_archived: nla == null ? false : /^(true|1)$/i.test(nla),
    });
  }
  return results;
}


/**
 * The listing id RU returns for a push. Creates answer `<ID>5772722</ID>`; older/other shapes
 * use `<PropertyID>`. Both are read here so a create is never repeated blindly — a repeated
 * create is exactly how duplicate listings appeared on the account.
 */
function extractReturnedPropertyId(xml: string): number | null {
  const direct = xml.match(/<PropertyID[^>]*>\s*(\d+)\s*<\/PropertyID>/i)?.[1]
    ?? xml.match(/<\/Status>\s*(?:<ResponseID>[^<]*<\/ResponseID>\s*)?<ID[^>]*>\s*(\d+)\s*<\/ID>/i)?.[1]
    ?? xml.match(/<ID[^>]*>\s*(\d+)\s*<\/ID>/i)?.[1];
  const id = direct ? parseInt(direct, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}



function compactXml(xml: string): string {
  return xml.replace(/<\?xml[^?]*\?>\s*/gi, '').replace(/>\s+</g, '><').trim();
}

function sanitizeXmlForLogs(xml: string): string {
  return xml
    .replace(/<AccessKey>.*?<\/AccessKey>/gi, '<AccessKey>[REDACTED]</AccessKey>')
    .replace(/<SecretKey>.*?<\/SecretKey>/gi, '<SecretKey>[REDACTED]</SecretKey>')
    .replace(/<Password>.*?<\/Password>/gi, '<Password>[REDACTED]</Password>');
}

function previewXml(xml: string, limit = 1200): string {
  return xml.length > limit ? `${xml.substring(0, limit)}…` : xml;
}

// ── API Call Helper ──────────────────────────────────────────

async function callRentalsUnited(creds: RUCredentials, xmlBody: string): Promise<string> {
  const compactRequestXml = compactXml(xmlBody);
  console.log(`[rentalsunited-api] Compact XML first 500: "${previewXml(sanitizeXmlForLogs(compactRequestXml), 500)}"`);

  // Certification requirement: the full request, the full response and RU's ResponseID must be
  // retrievable for >= 30 days. This is the single choke point for every outbound RU call, so the
  // exchange is persisted here — including HTTP-level failures, which used to throw unrecorded.
  const context = ruLogContext.getStore();
  const startedAt = Date.now();
  let httpStatus: number | null = null;
  let responseText: string | null = null;
  let errorMessage: string | null = null;
  let transportStatus: RuTransportStatus | null = null;
  let errorReason: string | null = null;

  // The channel allows one request per method with the same parameters per sliding minute.
  // Claim the shared slot (waiting out a short remainder) before spending the call — a deferral
  // is raised as RuRateDeferredError and answered with 429 + RU_RATE_DEFERRED by the handler.
  try {
    await reserveRuSlot(getLogClient(), compactRequestXml, {
      ownerId: context?.ru_owner_id ?? null,
      // An operator is watching a reservation dialog: wait briefly, then park at the front of the
      // queue instead of holding the request for the full sliding-minute remainder.
      maxWaitMs: ruGateWaitMs(context?.parent_action ?? null),
    });
  } catch (gateErr) {
    if (gateErr instanceof RuRateDeferredError) {
      await logRuExchange(getLogClient(), {
        ...(context ?? {}),
        action: context?.parent_action ?? 'ru_api_call',
        endpoint: creds.endpoint,
        request_xml: compactRequestXml,
        response_xml: null,
        http_status: 429,
        success: false,
        elapsed_ms: Date.now() - startedAt,
        error_message: `${RU_RATE_DEFERRED_CODE}: ${gateErr.message}`,
        // The call never left ROLOS — say so explicitly instead of leaving a silent null response.
        transport_status: 'rate_deferred',
        error_reason: `channel_rate_limit: ${gateErr.message}`,
      });
    }
    throw gateErr;
  }

  try {

    const response = await fetch(creds.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: compactRequestXml,
    });

    httpStatus = response.status;
    responseText = await response.text();

    if (!response.ok) {
      errorMessage = `RU API returned HTTP ${response.status}`;
      throw new Error(`RU API returned HTTP ${response.status}: ${responseText}`);
    }

    return responseText;
  } catch (err) {
    errorMessage = errorMessage ?? (err instanceof Error ? err.message : String(err));
    // Distinguish "RU never answered" from "RU answered with something unusable" — an auditor must
    // never see an unexplained empty response.
    if (responseText === null) {
      transportStatus = /timeout|timed out|abort|deadline/i.test(errorMessage) ? 'timeout' : 'transport_error';
      errorReason = `${transportStatus}: ${errorMessage}`;
    }
    throw err;
  } finally {
    if (!transportStatus) {
      const body = (responseText ?? '').trim();
      if (!body) {
        transportStatus = 'empty_response';
        errorReason = `empty_response: HTTP ${httpStatus ?? 'unknown'} with an empty body`;
      } else if (!/<\s*[A-Za-z?]/.test(body)) {
        transportStatus = 'non_xml_response';
        errorReason = `non_xml_body: HTTP ${httpStatus ?? 'unknown'} — ${body.slice(0, 160)}`;
      } else {
        transportStatus = 'completed';
        errorReason = errorMessage ? `channel_error: ${errorMessage}` : null;
      }
    }
    await logRuExchange(getLogClient(), {
      ...(context ?? {}),
      action: context?.parent_action ?? 'ru_api_call',
      endpoint: creds.endpoint,
      request_xml: compactRequestXml,
      response_xml: responseText,
      http_status: httpStatus,
      success: !errorMessage,
      elapsed_ms: Date.now() - startedAt,
      error_message: errorMessage,
      transport_status: transportStatus,
      error_reason: errorReason,
    });
  }
}

// ── Credential Loader ────────────────────────────────────────

async function loadCredentials(): Promise<RUCredentials | null> {
  const normalizeCredential = (value: string | null | undefined): string => (value ?? '').trim();
  const looksLikePlaceholder = (value: string): boolean => {
    const normalized = value.toLowerCase().trim();
    return !normalized
      || normalized === 'configured'
      || normalized.includes('placeholder')
      || normalized.includes('••')
      || normalized.includes('xxxx')
      || normalized.includes('enter accesskey')
      || normalized.includes('enter secretkey');
  };

  const envApiKey = normalizeCredential(Deno.env.get('RENTALS_UNITED_API_KEY'));
  const envApiSecret = normalizeCredential(Deno.env.get('RENTALS_UNITED_API_SECRET'));

  if (envApiKey && envApiSecret) {
    if (looksLikePlaceholder(envApiKey) || looksLikePlaceholder(envApiSecret)) return null;
    return {
      api_key: envApiKey,
      api_secret: envApiSecret,
      endpoint: normalizeCredential(Deno.env.get('RENTALS_UNITED_ENDPOINT')) || 'https://rm.rentalsunited.com/api/Handler.ashx',
      source: 'runtime_secrets',
    };
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('pms_credentials')
      .select('api_key, api_secret, base_url')
      .eq('system_type', 'rentalsunited')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    const apiKey = normalizeCredential(data.api_key);
    const apiSecret = normalizeCredential(data.api_secret);
    if (looksLikePlaceholder(apiKey) || looksLikePlaceholder(apiSecret)) return null;

    return {
      api_key: apiKey,
      api_secret: apiSecret,
      endpoint: normalizeCredential(data.base_url) || 'https://rm.rentalsunited.com/api/Handler.ashx',
      source: 'database',
    };
  } catch {
    return null;
  }
}

// ── JSON Response Helper ─────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ success: false, error: { code, message } }, status);
}

// ── Pull XML Builders ────────────────────────────────────────

function buildListPropertiesXml(creds: RUCredentials, ownerId: number): string {
  // RU rejects Pull_ListOwnerProp_RQ without an <OwnerID> (status 94).
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListOwnerProp_RQ>
  ${buildAuthXml(creds)}
  <OwnerID>${ownerId}</OwnerID>
</Pull_ListOwnerProp_RQ>`;
}

function buildVerifyOwnerAccessXml(creds: RUCredentials, ownerId: number): string {
  return buildListPropertiesXml(creds, ownerId);
}

/**
 * Owner listing snapshot, shared across invocations on the same warm worker.
 *
 * `Pull_ListOwnerProp_RQ` for one owner is byte-identical for every unit of a property push, so
 * the sliding-minute gate legitimately refused units 2..N and whole units went unpublished. The
 * first unit pays for the read; the rest of the push adopts from this snapshot and never touches
 * the channel again inside the same window.
 */
interface OwnerListingRow { id: string; name: string; is_archived: boolean }
const OWNER_LISTING_SNAPSHOTS = new Map<number, { at: number; listings: OwnerListingRow[] }>();
const OWNER_LISTING_TTL_MS = RU_RATE_WINDOW_SECONDS * 1000;

function readOwnerListingSnapshot(ownerId: number): OwnerListingRow[] | null {
  const hit = OWNER_LISTING_SNAPSHOTS.get(ownerId);
  if (!hit) return null;
  if (Date.now() - hit.at > OWNER_LISTING_TTL_MS) {
    OWNER_LISTING_SNAPSHOTS.delete(ownerId);
    return null;
  }
  return hit.listings;
}

function writeOwnerListingSnapshot(ownerId: number, listings: OwnerListingRow[]): void {
  OWNER_LISTING_SNAPSHOTS.set(ownerId, { at: Date.now(), listings });
}


/**
 * Resolve the RU OwnerID to list properties for: explicit param → RU_OWNER_ID
 * secret → first owner returned by Pull_ListMyUsers_RQ.
 */
// No hardcoded master OwnerID: an unresolved OwnerID is a hard error so inventory
// is never silently attributed to the RoomsOnline master account.

async function resolveOwnerId(creds: RUCredentials, explicit?: number | string | null): Promise<number | null> {
  const direct = Number(explicit ?? Deno.env.get('RU_OWNER_ID') ?? '');
  if (Number.isFinite(direct) && direct > 0) return direct;
  try {
    const usersXml = await callRentalsUnited(creds, buildListUsersXml(creds));
    for (const u of extractUsers(usersXml)) {
      const id = Number(u.owner_id || u.user_account_id);
      if (Number.isFinite(id) && id > 0) return id;
    }
  } catch (_e) { /* fall through */ }
  return null;
}

function buildGetPropertyXml(creds: RUCredentials, propertyId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListSpecProp_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
</Pull_ListSpecProp_RQ>`;
}

/**
 * ARI pull endpoints accept ONLY `YYYY-MM-DD`. Datetime or locale-formatted values
 * return RU status -3 "String was not recognized as a valid DateTime".
 */
function ruDay(value: string): string {
  const s = (value || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? s : parsed.toISOString().slice(0, 10);
}

function buildGetAvailabilityXml(creds: RUCredentials, propertyId: number, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyAvailabilityCalendar_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <DateFrom>${ruDay(dateFrom)}</DateFrom>
  <DateTo>${ruDay(dateTo)}</DateTo>
</Pull_ListPropertyAvailabilityCalendar_RQ>`;
}

function buildGetPricesXml(creds: RUCredentials, propertyId: number, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyPrices_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <DateFrom>${ruDay(dateFrom)}</DateFrom>
  <DateTo>${ruDay(dateTo)}</DateTo>
</Pull_ListPropertyPrices_RQ>`;
}

// RU's Pull_ListReservations_RQ / Pull_GetLeads_RQ require full datetime
// (`YYYY-MM-DD HH:MM:SS`). A bare `YYYY-MM-DD` triggers RU status -3
// "String was not recognized as a valid DateTime". Normalize defensively.
function normalizeRUDateTime(value: string, endOfDay = false): string {
  const trimmed = (value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} ${endOfDay ? '23:59:59' : '00:00:00'}`;
  }
  // Already datetime-ish — pass through.
  return trimmed;
}

/**
 * RU reservation status IDs (as shown in the multicalendar):
 *   1 Confirmed · 2 Cancelled · 4 Request (pending) · 6 Approved · 7 Rejected · 8 Expired
 *
 * ⚠️ Without an explicit <Statuses> block RU defaults to Confirmed + Cancelled only, so
 * pending requests visible in the RU multicalendar are silently omitted from the pull.
 */
export const RU_DEFAULT_RESERVATION_STATUSES = [1, 2, 4, 6];

function buildListReservationsXml(
  creds: RUCredentials,
  dateFrom: string,
  dateTo: string,
  statuses: number[] = RU_DEFAULT_RESERVATION_STATUSES,
): string {
  const wanted = (statuses.length ? statuses : RU_DEFAULT_RESERVATION_STATUSES)
    .map((s) => Number(s))
    .filter((s) => Number.isFinite(s) && s > 0);
  const statusXml = wanted.map((s) => `    <StatusID>${s}</StatusID>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListReservations_RQ>
  ${buildAuthXml(creds)}
  <DateFrom>${normalizeRUDateTime(dateFrom)}</DateFrom>
  <DateTo>${normalizeRUDateTime(dateTo, true)}</DateTo>
  <LocationID>0</LocationID>
  <Statuses>
${statusXml}
  </Statuses>
</Pull_ListReservations_RQ>`;
}


/**
 * `Pull_GetReservationByID_RQ` — full detail for one RU reservation.
 *
 * Required by certification's reservation-detail tests and by support cases where an
 * operator needs the channel's own view of a single booking without pulling a whole
 * date window. Must be called with the sub-user's credentials: a white-label account's
 * reservation is invisible to the master account.
 */
function buildGetReservationByIdXml(creds: RUCredentials, reservationId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_GetReservationByID_RQ>
  ${buildAuthXml(creds)}
  <ReservationID>${escapeXml(reservationId)}</ReservationID>
</Pull_GetReservationByID_RQ>`;
}

function buildGetLeadsXml(creds: RUCredentials, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_GetLeads_RQ>
  ${buildAuthXml(creds)}
  <DateFrom>${normalizeRUDateTime(dateFrom)}</DateFrom>
  <DateTo>${normalizeRUDateTime(dateTo, true)}</DateTo>
  <LocationID>0</LocationID>
</Pull_GetLeads_RQ>`;
}


/**
 * Decline / withdraw an unconfirmed RU request. `Push_RejectRequest_RQ` is RU's preferred
 * method; `Push_CancelReservation_RQ` remains for backwards compatibility with older
 * integrations where reject is not enabled.
 */
function buildRejectRequestXml(creds: RUCredentials, reservationId: string, reason: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_RejectRequest_RQ>
  ${buildAuthXml(creds)}
  <ReservationID>${escapeXml(reservationId)}</ReservationID>${reason ? `
  <Reason>${escapeXml(reason)}</Reason>
  <MessageToChannel>${escapeXml(reason)}</MessageToChannel>` : ''}
</Push_RejectRequest_RQ>`;
}

/**
 * Accept an unconfirmed RU request (StatusID 4 → 1). This is the counterpart of
 * `Push_RejectRequest_RQ`: until a request is accepted the channel holds it as a lead and
 * refuses every stay modification, so an operator who extends the stay of a held request has
 * to accept it first or the change never reaches the channel.
 *
 * Verb verified live against the account on 2026-08-20: `Push_ConfirmRequest_RQ` answers
 * "The XML contains not implemented method"; `Push_ConfirmReservation_RQ` is the implemented
 * one (it answered Status 28 "Reservation does not exist" for a probe id).
 */
function buildConfirmRequestXml(creds: RUCredentials, reservationId: string, _comments: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_ConfirmReservation_RQ>
  ${buildAuthXml(creds)}
  <ReservationID>${escapeXml(reservationId)}</ReservationID>
</Push_ConfirmReservation_RQ>`;
}


/**
 * Cancel a confirmed RU reservation. `CancelTypeID` is mandatory:
 * 1 = cancelled by the property provider (us), 2 = cancelled by the guest.
 */
function buildCancelReservationXml(creds: RUCredentials, reservationId: string, cancelTypeId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_CancelReservation_RQ>
  ${buildAuthXml(creds)}
  <ReservationID>${escapeXml(reservationId)}</ReservationID>
  <CancelTypeID>${cancelTypeId}</CancelTypeID>
</Push_CancelReservation_RQ>`;
}

/**
 * Push_PutConfirmedReservationMulti_RQ — hand a stay that was created in ROL'OS to the channel so
 * the channel stops selling those nights and the reservation is visible in the portal.
 * RU answers with its own ReservationID, which we store as the booking's channel reservation id.
 */
function buildPutConfirmedReservationXml(
  creds: RUCredentials,
  stay: {
    ru_property_id: string | number;
    date_from: string;
    date_to: string;
    number_of_guests?: number | null;
    client_price?: number | null;
    already_paid?: number | null;
  },
  guest: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    comments?: string | null;
  },
): string {
  const day = (value: string) => escapeXml(String(value).slice(0, 10));
  const money = (value: unknown) => Number(value ?? 0).toFixed(2);
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutConfirmedReservationMulti_RQ>
  ${buildAuthXml(creds)}
  <Reservation>
    <StayInfos>
      <StayInfo>
        <PropertyID>${escapeXml(String(stay.ru_property_id))}</PropertyID>
        <DateFrom>${day(stay.date_from)}</DateFrom>
        <DateTo>${day(stay.date_to)}</DateTo>
        <NumberOfGuests>${Math.max(1, Math.round(Number(stay.number_of_guests ?? 1)))}</NumberOfGuests>
        <Costs>
          <RUPrice>${money(stay.client_price)}</RUPrice>
          <ClientPrice>${money(stay.client_price)}</ClientPrice>
          <AlreadyPaid>${money(stay.already_paid)}</AlreadyPaid>
          <ChannelCommission>0.00</ChannelCommission>
        </Costs>
      </StayInfo>
    </StayInfos>
    <CustomerInfo>
      <Name>${escapeXml(guest.first_name?.trim() || 'Guest')}</Name>
      <SurName>${escapeXml(guest.last_name?.trim() || 'Booking')}</SurName>
      <Email>${escapeXml(guest.email?.trim() || '')}</Email>
      <Phone>${escapeXml(guest.phone?.trim() || '')}</Phone>
    </CustomerInfo>${guest.comments ? `
    <Comments>${escapeXml(guest.comments)}</Comments>` : ''}
  </Reservation>
</Push_PutConfirmedReservationMulti_RQ>`;
}


/**
 * Push_ModifyStay_RQ — RU requires BOTH the current state and the new state.
 * Only works on confirmed reservations (StatusID 1).
 */
function buildModifyStayXml(
  creds: RUCredentials,
  reservationId: string,
  current: RUStayState,
  modify: RUStayModification,
): string {
  const day = (value: string) => escapeXml(String(value).slice(0, 10));
  const modifyNodes: string[] = [];
  const newPropertyId = modify.ru_property_id ?? current.ru_property_id;
  modifyNodes.push(`<PropertyID>${escapeXml(String(newPropertyId))}</PropertyID>`);
  modifyNodes.push(`<DateFrom>${day(modify.date_from || current.date_from)}</DateFrom>`);
  modifyNodes.push(`<DateTo>${day(modify.date_to || current.date_to)}</DateTo>`);
  if (modify.number_of_guests != null) {
    modifyNodes.push(`<NumberOfGuests>${Math.max(1, Math.round(Number(modify.number_of_guests)))}</NumberOfGuests>`);
  }
  if (modify.client_price != null) {
    modifyNodes.push(`<ClientPrice>${Number(modify.client_price).toFixed(2)}</ClientPrice>`);
  }
  if (modify.already_paid != null) {
    modifyNodes.push(`<AlreadyPaid>${Number(modify.already_paid).toFixed(2)}</AlreadyPaid>`);
  }
  if (modify.arrival_time) {
    modifyNodes.push(`<ArrivalTime>${escapeXml(String(modify.arrival_time))}</ArrivalTime>`);
  }

  // AllowOverbooking / UseCurrentPrice are documented as siblings of <Modify>, at the
  // request root — nesting them inside <Modify> means the channel never sees them.
  const rootFlags = modify.use_current_price != null
    ? `\n  <UseCurrentPrice>${modify.use_current_price ? 'true' : 'false'}</UseCurrentPrice>`
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_ModifyStay_RQ>
  ${buildAuthXml(creds)}
  <ReservationID>${escapeXml(reservationId)}</ReservationID>
  <Current>
    <PropertyID>${escapeXml(String(current.ru_property_id))}</PropertyID>
    <DateFrom>${day(current.date_from)}</DateFrom>
    <DateTo>${day(current.date_to)}</DateTo>${current.res_apa_id ? `
    <ResApaID>${escapeXml(String(current.res_apa_id))}</ResApaID>` : ''}
  </Current>
  <Modify>
    ${modifyNodes.join('\n    ')}
  </Modify>${rootFlags}
</Push_ModifyStay_RQ>`;
}


// ── Push XML Builders ────────────────────────────────────────


function buildPushPropertyXml(creds: RUCredentials, propertyId: number, prop: RUPropertyPayload): string {
  const buildOptionalNode = (tag: string, value?: string | null) => {
    const normalized = value?.trim();
    return normalized ? `<${tag}>${escapeXml(normalized)}</${tag}>` : `<${tag} />`;
  };

  // Build CompositionRoomsAmenities. Per RU spec the attribute name is `CompositionRoomID`
  // (NOT `RoomID`). Wrong attribute name → RU silently parses 0 → "Wrong composition room id:0".
  const roomsXml = prop.rooms && prop.rooms.length > 0
    ? `<CompositionRoomsAmenities>
      ${prop.rooms.map(r => `<CompositionRoomAmenities CompositionRoomID="${r.room_id}">
        <Amenities>
          ${r.amenities.map(a => `<Amenity Count="${a.count || 1}">${a.id}</Amenity>`).join('\n          ')}
        </Amenities>
      </CompositionRoomAmenities>`).join('\n      ')}
    </CompositionRoomsAmenities>` : '';

  const amenitiesXml = prop.amenities
    .map(a => `<Amenity Count="${a.count || 1}">${a.id}</Amenity>`)
    .join('\n      ');

  const descriptionsXml = prop.descriptions
    .map(d => `<Description LanguageID="${d.language_id}"><Text>${escapeXml(d.text)}</Text></Description>`)
    .join('\n      ');

  // RU accepts one ImageTypeID per <Image> node, so a photo carrying multiple tags is
  // repeated with the same URL and a distinct tag on each node.
  let imageRefId = 0;
  const imagesXml = prop.images
    .flatMap((img, index) => {
      const primary = index === 0 ? 1 : (img.type_id && img.type_id !== 1 ? img.type_id : 3);
      const extras = (img.extra_type_ids || []).filter(
        (id) => Number.isFinite(id) && id > 0 && id !== 1 && id !== primary,
      );
      return [primary, ...Array.from(new Set(extras))].map((typeId) => {
        imageRefId += 1;
        return `<Image ImageTypeID="${typeId}" ImageReferenceID="${imageRefId}">${escapeXml(img.url)}</Image>`;
      });
    })
    .join('\n      ');

  const paymentMethodsXml = prop.payment_methods
    .map(pm => `<PaymentMethod PaymentMethodID="${pm}">${escapeXml(PAYMENT_METHOD_LABELS[pm] || `Method ${pm}`)}</PaymentMethod>`)
    .join('\n      ');

  const depositXml = `<Deposit DepositTypeID="${prop.deposit_type_id || 1}">${prop.deposit ?? 0}</Deposit>`;

  const cancellationPoliciesXml = prop.cancellation_policies
    .map(cp => `<CancellationPolicy ValidFrom="${cp.valid_from}" ValidTo="${cp.valid_to}">${cp.percentage}</CancellationPolicy>`)
    .join('\n      ');

  const cleaningPriceXml = `<CleaningPrice>${prop.cleaning_price ?? 0}</CleaningPrice>`;
  const arrivalInstructionsXml = `<ArrivalInstructions>
      <Landlord>${escapeXml(prop.arrival_landlord || 'RoomsOnline')}</Landlord>
      <Email>${escapeXml(prop.arrival_email || 'dev@roomsonline.co.za')}</Email>
      <Phone>${escapeXml(prop.arrival_phone || '+27 824602220')}</Phone>
      <DaysBeforeArrival>${Math.max(0, Math.trunc(prop.arrival_days_before ?? 0))}</DaysBeforeArrival>
      ${buildOptionalNode('PickupService', prop.arrival_pickup_service)}
      ${buildOptionalNode('HowToArrive', prop.arrival_how_to_arrive)}
    </ArrivalInstructions>`;

  // Build CheckInOut block. RU rejects the listing when CheckOutUntil > CheckInFrom or when
  // CheckInTo is not after CheckInFrom, so pad the values and clamp them here as the last gate.
  const padTime = (value: unknown, fallback: string): string => {
    const raw = String(value ?? '').trim();
    const m = raw.match(/^(\d{1,2})\s*[:h.]?\s*(\d{2})?/);
    if (!m) return fallback;
    const h = Number(m[1]);
    const mi = Number(m[2] ?? '0');
    if (!Number.isFinite(h) || h < 0 || h > 23 || !Number.isFinite(mi) || mi < 0 || mi > 59) return fallback;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  };
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const ciFrom = padTime(prop.check_in_from, '14:00');
  let ciTo = padTime(prop.check_in_to, '22:00');
  let coUntil = padTime(prop.check_out_until, '10:00');
  if (mins(ciTo) <= mins(ciFrom)) ciTo = '23:59';
  if (mins(coUntil) > mins(ciFrom)) coUntil = ciFrom;
  const checkInOutXml = `<CheckInOut>
      <CheckInFrom>${ciFrom}</CheckInFrom>
      <CheckInTo>${ciTo}</CheckInTo>
      <CheckOutUntil>${coUntil}</CheckOutUntil>
      <Place>${escapeXml(prop.check_in_place || 'at_the_apartment')}</Place>
    </CheckInOut>`;

  // SecurityDeposit is REQUIRED by RU XSD (must be the final element). Int32 only — no decimals.
  const secVal = prop.security_deposit != null ? Math.trunc(Number(prop.security_deposit)) : 0;
  const securityDepositXml = `\n    <SecurityDeposit DepositTypeID="${secVal > 0 ? 5 : 1}">${secVal}</SecurityDeposit>`;

  // Strict XSD element order per RU schema (validated against live RS errors):
  // ID > Name > OwnerID > CurrencyID > DetailedLocationID > IsActive > IsArchived >
  // CleaningPrice > Space > StandardGuests > CanSleepMax > PropertyTypeID > ObjectTypeID >
  // Floor > BuildingID > Street > ZipCode > Coordinates(Longitude+Latitude) >
  // CompositionRoomsAmenities > ArrivalInstructions > Amenities > Images > CheckInOut >
  // PaymentMethods > Deposit > CancellationPolicies > Descriptions > SecurityDeposit
  //
  // CurrencyID positioning: RU's XSD accepts <CurrencyID> immediately after <OwnerID>.
  // Without it RU silently inherits the master account's default currency — this is the
  // root cause of LekkeSlaap "ZAR currency not met" errors for South African properties.
  //
  // NOTES:
  //  - <NoOfUnits> was REMOVED — RU's XSD rejects it at this position with
  //    "invalid child element 'NoOfUnits'. List of possible elements expected: 'Floor'."
  //  - <Coordinates> wrapper is MANDATORY — loose <Longitude>/<Latitude> siblings produce
  //    "Missing mandatory element: Coordinates."
  //  - <NumberOfBeds> at root removed — bed counts go inside <CompositionRoomsAmenities> as
  //    bed amenities from RU's "Bedroom & Beds" dictionary (61 double, 323 single, 324 king,
  //    485 queen, 440 twin pair, 444 bunk, 237 sofabed, 833 cot, 209 extra) inside Bedroom
  //    blocks (RoomID=257). IDs 97-101 are Living-Area items (Hall/Corridor/Lounge/Terrace/
  //    Kitchen) and must never be used as beds. Per Pull_ListCompositionRooms_RQ
  //    the only valid IDs are: 53(WC), 81(Bathroom), 94(Kitchen+Living), 101(Kitchen),
  //    249(LivingRoom), 257(Bedroom), 372(LivingRoom/Bedroom), 517(Bedroom/LR/Kitchen).
  //    There is NO 81/82/83 per-bedroom variant — all bedrooms repeat RoomID=257.
  //  - <ObjectTypeID> is REQUIRED when <BuildingID> is set. Falls back to PropertyTypeID at
  //    the orchestrator layer when RU's building composition lookup is unavailable.
  //  - <ArrivalInstructions> MUST come AFTER <CompositionRoomsAmenities>. Placing it directly
  //    after Coordinates triggers schema error: "List of possible elements expected:
  //    'Distances, CompositionRooms, CompositionRoomsAmenities'."
  const objectTypeIdXml = prop.object_type_id && prop.object_type_id > 0
    ? `\n    <ObjectTypeID>${prop.object_type_id}</ObjectTypeID>` : '';

  /**
   * Gate #10 — optional <Distances>. Per the schema note above, the slot right after
   * <Coordinates> accepts 'Distances, CompositionRooms, CompositionRoomsAmenities', so the
   * block goes in ahead of the composition rooms. Omitted entirely when nothing maps.
   */
  const distanceEntries = Array.isArray(prop.distances)
    ? prop.distances.filter((d) => Number(d?.destination_id) > 0 && Number(d?.value) > 0)
    : [];
  // Shape: the id is a child element, not an attribute. With the attribute form RU parsed the
  // destination as 0 ("Wrong destination id:0", and "Duplicate value in distances" when several
  // entries all collapsed to 0).
  const distancesXml = distanceEntries.length > 0
    ? `\n    <Distances>\n${distanceEntries
        .map((d) => `      <Distance>\n        <DestinationID>${Number(d.destination_id)}</DestinationID>\n        <DistanceUnitID>1</DistanceUnitID>\n        <DistanceValue>${(Math.round(Number(d.value) * 10) / 10).toFixed(1)}</DistanceValue>\n      </Distance>`)
        .join('\n')}\n    </Distances>`
    : '';



  return `<Push_PutProperty_RQ>
  ${buildAuthXml(creds)}
  <Property>
    <ID>${propertyId}</ID>
    <Name>${escapeXml(prop.name)}</Name>
    <OwnerID>${prop.owner_id}</OwnerID>
    <CurrencyID>${prop.currency_id}</CurrencyID>
    <DetailedLocationID TypeID="4">${prop.detailed_location_id}</DetailedLocationID>
    <IsActive>true</IsActive>
    <IsArchived>false</IsArchived>
    ${cleaningPriceXml}
    <Space>${prop.space}</Space>
    <StandardGuests>${Math.min(prop.standard_guests, prop.can_sleep_max)}</StandardGuests>
    <CanSleepMax>${prop.can_sleep_max}</CanSleepMax>
    <PropertyTypeID>${prop.property_type_id}</PropertyTypeID>${objectTypeIdXml}
    <Floor>${prop.floor}</Floor>${prop.building_id ? `\n    <BuildingID>${prop.building_id}</BuildingID>` : ''}
    <Street>${escapeXml(prop.street)}</Street>
    <ZipCode>${escapeXml(prop.zip_code)}</ZipCode>
    <Coordinates>
      <Longitude>${prop.longitude}</Longitude>
      <Latitude>${prop.latitude}</Latitude>
    </Coordinates>${distancesXml}${roomsXml ? `\n    ${roomsXml}` : ''}
    <Amenities>
      ${amenitiesXml}
    </Amenities>
    <Images>
      ${imagesXml}
    </Images>
    ${arrivalInstructionsXml}
    ${checkInOutXml}
    <PaymentMethods>
      ${paymentMethodsXml}
    </PaymentMethods>
    ${depositXml}
    <CancellationPolicies>
      ${cancellationPoliciesXml}
    </CancellationPolicies>
    <Descriptions>
      ${descriptionsXml}
    </Descriptions>${securityDepositXml}
  </Property>
</Push_PutProperty_RQ>`;
}

function buildPushAvailabilityXml(creds: RUCredentials, propertyId: number, availability: RUAvailabilityEntry[]): string {
  // Push_PutAvbUnits_RQ — canonical schema per RU docs:
  //   https://developer.rentalsunited.com/#upload-available-units
  // Wrapper is <MuCalendar PropertyID="X"> with <Date From="..." To="..." MSMXTypeID="1">
  // child elements: <U> units, <MS> min stay, <MX> max stay, <C> changeover.
  const datesXml = availability
    .map(a => {
      const u = a.units ?? 0;
      const ms = a.min_stay ?? 1;
      const mx = a.max_stay ?? 30;
      // Internal 0..3 → wire 1..4; RU rejects anything outside 1..4 with status 147.
      const c = toWireChangeover(a.changeover);
      return `<Date From="${a.date_from}" To="${a.date_to}" MSMXTypeID="1">
      <U>${u}</U>
      <MS>${ms}</MS>
      <MX>${mx}</MX>
      <C>${c}</C>
    </Date>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutAvbUnits_RQ>
  ${buildAuthXml(creds)}
  <MuCalendar PropertyID="${propertyId}">
    ${datesXml}
  </MuCalendar>
</Push_PutAvbUnits_RQ>`;
}

function buildPushPricesXml(creds: RUCredentials, propertyId: number, prices: RUPriceEntry[]): string {
  // Canonical RU schema (https://developer.rentalsunited.com/#put-prices):
  //   <Prices PropertyID="X">
  //     <Season DateFrom="..." DateTo="...">
  //       <Price>...</Price>
  //       <Extra>...</Extra>           <!-- optional -->
  //       <LOSS>...</LOSS>             <!-- optional, length-of-stay nightly pricing -->
  //       <EGPS>...</EGPS>             <!-- optional, extra-guest pricing -->
  //     </Season>
  //   </Prices>
  // Element ordering inside <Season>: Price → Extra → LOSS → EGPS.
  const seasonsXml = prices
    .map(p => {
      const parts: string[] = [`<Price>${p.price}</Price>`];
      if (p.extra_guest_price != null) {
        parts.push(`<Extra>${p.extra_guest_price}</Extra>`);
      }
      if (p.los_pricing && p.los_pricing.length > 0) {
        const losXml = p.los_pricing
          .map(los => {
            const lospsXml = los.losps && los.losps.length > 0
              ? `\n          <LOSPS>${los.losps.map(lp => `\n            <LOSP NrOfGuests="${lp.nr_of_guests}"><Price>${lp.price}</Price></LOSP>`).join('')}\n          </LOSPS>`
              : '';
            return `<LOS Nights="${los.nights}"><Price>${los.price}</Price>${lospsXml}</LOS>`;
          })
          .join('\n        ');
        parts.push(`<LOSS>\n        ${losXml}\n      </LOSS>`);
      }
      if (p.extra_guest_prices && p.extra_guest_prices.length > 0) {
        const egpsXml = p.extra_guest_prices
          .map(eg => `<EGP ExtraGuests="${eg.extra_guests}"><Price>${eg.price}</Price></EGP>`)
          .join('\n        ');
        parts.push(`<EGPS>\n        ${egpsXml}\n      </EGPS>`);
      }
      return `<Season DateFrom="${p.date_from}" DateTo="${p.date_to}">\n      ${parts.join('\n      ')}\n    </Season>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutPrices_RQ>
  ${buildAuthXml(creds)}
  <Prices PropertyID="${propertyId}">
    ${seasonsXml}
  </Prices>
</Push_PutPrices_RQ>`;
}

function buildPushFspPricesXml(creds: RUCredentials, propertyId: number, fspSeasons: RUFspSeason[]): string {
  // Full Stay Pricing matrix (https://developer.rentalsunited.com/#put-prices, Example 2):
  //   <Prices PropertyID><FSPSeasons><FSPSeason Date DefaultPrice>
  //     <FSPRows><FSPRow NrOfGuests><Prices><Price NrOfNights>...</Price></Prices></FSPRow></FSPRows>
  //   </FSPSeason></FSPSeasons></Prices>
  // Mutually exclusive with the standard <Season> form.
  const seasonsXml = fspSeasons
    .map(s => {
      const rowsXml = s.rows
        .map(r => {
          const pricesXml = r.prices
            .map(c => `<Price NrOfNights="${c.nr_of_nights}">${c.price}</Price>`)
            .join('\n              ');
          return `<FSPRow NrOfGuests="${r.nr_of_guests}">
            <Prices>
              ${pricesXml}
            </Prices>
          </FSPRow>`;
        })
        .join('\n          ');
      return `<FSPSeason Date="${s.date}" DefaultPrice="${s.default_price}">
        <FSPRows>
          ${rowsXml}
        </FSPRows>
      </FSPSeason>`;
    })
    .join('\n      ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutPrices_RQ>
  ${buildAuthXml(creds)}
  <Prices PropertyID="${propertyId}">
    <FSPSeasons>
      ${seasonsXml}
    </FSPSeasons>
  </Prices>
</Push_PutPrices_RQ>`;
}

function validatePriceEntry(p: RUPriceEntry): string | null {
  if (!p.date_from || !p.date_to) return 'date_from and date_to are required';
  if (p.date_from > p.date_to) return `DateFrom (${p.date_from}) must be <= DateTo (${p.date_to})`;
  if (p.price == null || p.price < 0) return 'price must be >= 0';
  if (p.los_pricing) {
    for (const los of p.los_pricing) {
      if (los.nights == null || los.nights <= 0) return 'LOS nights must be > 0';
      if (los.price == null || los.price < 0) return 'LOS price must be >= 0';
    }
  }
  if (p.extra_guest_prices) {
    for (const eg of p.extra_guest_prices) {
      if (eg.extra_guests == null || eg.extra_guests <= 0) return 'EGP extra_guests must be > 0';
      if (eg.price == null || eg.price < 0) return 'EGP price must be >= 0';
    }
  }
  return null;
}

function validateFspSeason(s: RUFspSeason): string | null {
  if (!s.date) return 'FSP date is required';
  if (s.default_price == null || s.default_price < 0) return 'FSP default_price must be >= 0';
  if (!s.rows || s.rows.length === 0) return 'FSP rows are required';
  for (const r of s.rows) {
    if (r.nr_of_guests == null || r.nr_of_guests <= 0) return 'FSP nr_of_guests must be > 0';
    if (!r.prices || r.prices.length === 0) return 'FSP row prices required';
    for (const c of r.prices) {
      if (c.nr_of_nights == null || c.nr_of_nights <= 0) return 'FSP nr_of_nights must be > 0';
      if (c.price == null || c.price < 0) return 'FSP price must be >= 0';
    }
  }
  return null;
}

/**
 * Pull_ListPropertyDiscounts_RQ — the ONLY documented discount read-back method.
 * It returns BOTH ladders in one response:
 *   <Discounts PropertyID="1"><LongStays>…</LongStays><LastMinutes>…</LastMinutes></Discounts>
 * There is no per-feature pull method: `Pull_ListPropertyLongStayDiscounts_RQ` /
 * `Pull_ListPropertyLastMinuteDiscounts_RQ` do not exist in the channel API and were
 * answered with Status -1 ("The XML contains not implemented method") on every call.
 */
function buildGetPropertyDiscountsXml(creds: RUCredentials, propertyId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyDiscounts_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
</Pull_ListPropertyDiscounts_RQ>`;
}


function buildSubscribeNotificationsXml(creds: RUCredentials, handlerUrl: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<LNM_PutHandlerUrl_RQ>
  ${buildAuthXml(creds)}
  <HandlerUrl>${escapeXml(handlerUrl)}</HandlerUrl>
</LNM_PutHandlerUrl_RQ>`;
}

/**
 * Push_PutLiveNotificationMechanismSubscriptions_RQ — content/ARI change webhooks.
 * Element order is fixed by RU's XSD: ChangeTypes → ObservedOwners → UrlBase.
 */
function buildPutLnmSubscriptionsXml(
  creds: RUCredentials,
  changeTypes: string[],
  observedOwners: string[],
  urlBase: string,
): string {
  const types = changeTypes.map((t) => `    <Type>${escapeXml(t)}</Type>`).join('\n');
  const owners = observedOwners.map((o) => `    <Owner>${escapeXml(String(o))}</Owner>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutLiveNotificationMechanismSubscriptions_RQ>
  ${buildAuthXml(creds)}
  <ChangeTypes>
${types}
  </ChangeTypes>
  <ObservedOwners>
${owners}
  </ObservedOwners>
  <UrlBase>${escapeXml(urlBase)}</UrlBase>
</Push_PutLiveNotificationMechanismSubscriptions_RQ>`;
}

function buildListLnmSubscriptionsXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListLiveNotificationMechanismSubscriptions_RQ>
  ${buildAuthXml(creds)}
</Pull_ListLiveNotificationMechanismSubscriptions_RQ>`;
}

function buildListLnmChangeTypesXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListLiveNotificationMechanismChangeTypes_RQ>
  ${buildAuthXml(creds)}
</Pull_ListLiveNotificationMechanismChangeTypes_RQ>`;
}

/**
 * Pull_ListSalesChannels_RQ — the sales channels (OTAs) available to this channel-manager
 * account. The ChannelID returned here is what CM_LNM_* methods (content quality check)
 * require, so this is how a channel such as LekkeSlaap is resolved to its numeric ID.
 */
function buildListSalesChannelsXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListSalesChannels_RQ>
  ${buildAuthXml(creds)}
</Pull_ListSalesChannels_RQ>`;
}

/**
 * Pull_ListPropTypes_RQ — the closed list of property/unit types RU accepts.
 * This is the dictionary that backs the "Channel property type" dropdown, so the
 * editor never offers a value the channel cannot map.
 */
function buildListPropertyTypesXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropTypes_RQ>
  ${buildAuthXml(creds)}
</Pull_ListPropTypes_RQ>`;
}

export interface RUPropertyType {
  ru_type_id: number;
  name: string;
  slug: string;
}

/** ROL'OS slug for an RU type name (mirrors normalizeChannelPropertyType on the client). */
function slugifyPropertyType(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parse Pull_ListPropTypes_RS. RU has shipped both attribute-style
 * (`<PropertyType PropertyTypeID="1">Apartment</PropertyType>`) and element-style
 * (`<PropertyType><ID>1</ID><Name>Apartment</Name></PropertyType>`) payloads, and
 * uses `<ObjectType>` in some responses, so both shapes are accepted.
 */
function parsePropertyTypes(xml: string): RUPropertyType[] {
  const out = new Map<number, RUPropertyType>();
  const blocks = xml.match(/<(?:PropertyType|ObjectType)\b[^>]*>[\s\S]*?<\/(?:PropertyType|ObjectType)>/g) ?? [];
  for (const block of blocks) {
    const attr = block.match(/\b(?:PropertyTypeID|ObjectTypeID|ID)\s*=\s*"(\d+)"/i);
    const idEl = block.match(/<(?:PropertyTypeID|ObjectTypeID|ID)[^>]*>\s*(\d+)\s*</i);
    const id = Number(attr?.[1] ?? idEl?.[1] ?? 0);
    if (!Number.isFinite(id) || id <= 0) continue;
    const nameEl = block.match(/<(?:PropertyTypeName|ObjectTypeName|Name)[^>]*>([\s\S]*?)<\//i);
    const text = block.replace(/<[^>]+>/g, ' ').trim();
    const name = (nameEl?.[1] ?? text).replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const slug = slugifyPropertyType(name);
    if (!slug) continue;
    if (!out.has(id)) out.set(id, { ru_type_id: id, name, slug });
  }
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name));
}



export interface RUSalesChannel {
  channel_id: number;
  company_name: string;
  reservation_creator_name: string | null;
  configuration_complete: boolean | null;
  raw_flags: Record<string, string>;
}

/** Parse Pull_ListSalesChannels_RS into a flat channel list. */
function parseSalesChannels(xml: string): RUSalesChannel[] {
  const channels: RUSalesChannel[] = [];
  const blocks = xml.match(/<Channel\b[^>]*>[\s\S]*?<\/Channel>/g) ?? [];
  for (const block of blocks) {
    const pick = (tag: string): string | null => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m ? m[1].trim() : null;
    };
    const id = Number(pick('ChannelID') ?? 0);
    if (!Number.isFinite(id) || id <= 0) continue;
    const flags: Record<string, string> = {};
    for (const m of block.matchAll(/<(\w+)[^>]*>([^<>]*)<\/\1>/g)) {
      flags[m[1]] = m[2].trim();
    }
    const complete = pick('YourConfigurationComplete');
    channels.push({
      channel_id: id,
      company_name: pick('CompanyName') ?? '',
      reservation_creator_name: pick('ReservationCreatorName'),
      configuration_complete: complete == null ? null : /^(true|1|yes)$/i.test(complete),
      raw_flags: flags,
    });
  }
  return channels;
}




function validateDiscountEntry(d: RUDiscountEntry): string | null {
  if (!d.date_from || !d.date_to) return 'date_from and date_to are required';
  if (d.date_from > d.date_to) return `DateFrom (${d.date_from}) must be <= DateTo (${d.date_to})`;
  if (d.nights_from == null || d.nights_from < 0) return 'nights_from must be >= 0';
  if (d.nights_to != null && d.nights_to < d.nights_from) return `nights_to (${d.nights_to}) must be >= nights_from (${d.nights_from})`;
  if (d.discount_percentage == null || d.discount_percentage < 0 || d.discount_percentage > 100) return 'discount_percentage must be 0-100';
  return null;
}

function buildPushLongStayDiscountsXml(creds: RUCredentials, propertyId: number, discounts: RUDiscountEntry[]): string {
  // Push_PutLongStayDiscounts_RQ — canonical RU schema:
  //   https://developer.rentalsunited.com/#put-long-stay-discounts
  //   <LongStays PropertyID="X">
  //     <LongStay DateFrom="..." DateTo="..." Bigger="N" Smaller="N">PERCENT</LongStay>
  //   </LongStays>
  // Bigger = min nights (inclusive), Smaller = max nights (inclusive), inner text = % off.
  const longStaysXml = discounts
    .map(d => {
      const smaller = d.nights_to != null ? ` Smaller="${d.nights_to}"` : '';
      return `<LongStay DateFrom="${d.date_from}" DateTo="${d.date_to}" Bigger="${d.nights_from}"${smaller}>${d.discount_percentage}</LongStay>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutLongStayDiscounts_RQ>
  ${buildAuthXml(creds)}
  <LongStays PropertyID="${propertyId}">
    ${longStaysXml}
  </LongStays>
</Push_PutLongStayDiscounts_RQ>`;
}

function buildPushLastMinuteDiscountsXml(creds: RUCredentials, propertyId: number, discounts: RUDiscountEntry[]): string {
  // Push_PutLastMinuteDiscounts_RQ — canonical RU schema:
  //   https://developer.rentalsunited.com/#put-last-minute-discounts
  //   <LastMinutes PropertyID="X">
  //     <LastMinute DateFrom="..." DateTo="..." DaysToArrivalFrom="N" DaysToArrivalTo="N">PERCENT</LastMinute>
  //   </LastMinutes>
  // For last-minute: nights_from -> DaysToArrivalFrom, nights_to -> DaysToArrivalTo, inner text = % off.
  const lastMinutesXml = discounts
    .map(d => {
      const to = d.nights_to != null ? ` DaysToArrivalTo="${d.nights_to}"` : '';
      return `<LastMinute DateFrom="${d.date_from}" DateTo="${d.date_to}" DaysToArrivalFrom="${d.nights_from}"${to}>${d.discount_percentage}</LastMinute>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutLastMinuteDiscounts_RQ>
  ${buildAuthXml(creds)}
  <LastMinutes PropertyID="${propertyId}">
    ${lastMinutesXml}
  </LastMinutes>
</Push_PutLastMinuteDiscounts_RQ>`;
}

function buildSetPropertyStatusXml(creds: RUCredentials, propertyId: number, isActive: boolean, isArchived: boolean): string {
  return `<Push_SetPropertiesStatus_RQ>
  ${buildAuthXml(creds)}
  <IsActive>${isActive ? 1 : 0}</IsActive>
  <IsArchived>${isArchived ? 1 : 0}</IsArchived>
  <PropertyIDs>
    <PropertyID>${propertyId}</PropertyID>
  </PropertyIDs>
</Push_SetPropertiesStatus_RQ>`;
}

/**
 * Hard removal of a listing. RU has shipped this verb under two names across
 * account generations, so the caller probes both and keeps whichever the account
 * honours — archiving is only a fallback when neither is recognised.
 */
function buildDeletePropertyXml(creds: RUCredentials, propertyId: number, verb: string): string {
  return `<${verb}>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
</${verb}>`;
}



function buildBuildingCompositionXml(unitTypes?: RUBuildingUnitType[]): string {
  if (!unitTypes || unitTypes.length === 0) return '';

  const unitTypeNodes = unitTypes
    .filter((unitType) => unitType.name?.trim() && Number.isFinite(unitType.quantity) && unitType.quantity > 0)
    .map((unitType) => `<UnitType><UnitTypeName>${escapeXml(unitType.name.trim())}</UnitTypeName><Quantity>${Math.trunc(unitType.quantity)}</Quantity></UnitType>`)
    .join('');

  return unitTypeNodes ? `<Composition><UnitsComposition>${unitTypeNodes}</UnitsComposition></Composition>` : '';
}

function buildPushBuildingXml(creds: RUCredentials, buildingId: number, buildingName: string, unitTypes?: RUBuildingUnitType[], childAuth?: ChildAuth | null): string {
  const truncatedName = buildingName.substring(0, 20);
  const buildingIdXml = buildingId > 0 ? `<BuildingID>${buildingId}</BuildingID>` : '';
  const compositionXml = buildBuildingCompositionXml(unitTypes);
  // Element order matters: RU's XSD expects <BuildingID> (update key) before
  // <BuildingName>. With the wrong order RU ignores the ID and creates a new
  // building on every push, which duplicates inventory.
  return `<Push_PutBuilding_RQ>${childAuth ? buildChildAuthXml(childAuth) : buildAuthXml(creds)}${buildingIdXml}<BuildingName>${escapeXml(truncatedName)}</BuildingName>${compositionXml}</Push_PutBuilding_RQ>`;
}

function buildListBuildingsXml(creds: RUCredentials, childAuth?: ChildAuth | null): string {
  return `<Pull_ListBuildings_RQ>${childAuth ? buildChildAuthXml(childAuth) : buildAuthXml(creds)}</Pull_ListBuildings_RQ>`;
}

function buildGetBuildingXml(creds: RUCredentials, buildingId: number, childAuth?: ChildAuth | null): string {
  return `<Pull_GetBuilding_RQ>${childAuth ? buildChildAuthXml(childAuth) : buildAuthXml(creds)}<BuildingID>${buildingId}</BuildingID></Pull_GetBuilding_RQ>`;
}


/**
 * Pull_ListCompositionRooms_RQ — fetch the global RU dictionary of valid
 * CompositionRoom IDs (e.g. bedroom variants like "1 single bed", "1 double bed").
 * These IDs are required when populating <CompositionRoomsAmenities> in property pushes.
 * Status 6 ("Wrong composition room id") is raised when an unknown ID is sent, so we
 * use this dictionary to resolve a valid ID per room rather than guessing.
 */
function buildListCompositionRoomsXml(creds: RUCredentials): string {
  return `<Pull_ListCompositionRooms_RQ>${buildAuthXml(creds)}</Pull_ListCompositionRooms_RQ>`;
}

/**
 * Pull_ListAmenities_RQ — fetch RU's global amenity dictionary (AmenityID + name,
 * optionally grouped by StaticName/AmenityTypeID). Used to populate the ROLOS
 * room/unit amenity picker with RU's real option set instead of hand-written labels.
 */
function buildListAmenitiesXml(creds: RUCredentials): string {
  return `<Pull_ListAmenities_RQ>${buildAuthXml(creds)}</Pull_ListAmenities_RQ>`;
}

/**
 * Parse Pull_ListAmenities_RS. RU has shipped several shapes over time:
 *  A) <Amenity AmenityID="6" AmenityTypeID="3">Internet</Amenity>
 *  B) <Amenity ID="6">Internet</Amenity>
 *  C) <Amenity><AmenityID>6</AmenityID><AmenityName>Internet</AmenityName></Amenity>
 */
function extractAmenities(xml: string): { id: number; name: string; group_id: number | null }[] {
  const results: { id: number; name: string; group_id: number | null }[] = [];
  const seen = new Set<number>();
  const decode = (s: string) =>
    s
      .replace(/&amp;amp;/gi, '&')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  const push = (rawId: string, rawName: string, rawGroup?: string | null) => {
    const id = parseInt(rawId, 10);
    const name = decode(rawName.replace(/<[^>]+>/g, ''));
    if (!Number.isFinite(id) || id <= 0 || !name || seen.has(id)) return;
    seen.add(id);
    const group = rawGroup ? parseInt(rawGroup, 10) : NaN;
    results.push({ id, name, group_id: Number.isFinite(group) ? group : null });
  };


  // Format A/B: attribute id + text content
  const attrRegex = /<Amenity\b([^>]*)>([\s\S]*?)<\/Amenity>/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(xml)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const idMatch = attrs.match(/\bAmenityID\s*=\s*"(\d+)"/i) || attrs.match(/\bID\s*=\s*"(\d+)"/i);
    const groupMatch = attrs.match(/\bAmenityTypeID\s*=\s*"(\d+)"/i) || attrs.match(/\bTypeID\s*=\s*"(\d+)"/i);
    if (idMatch && inner.trim() && !/<Amenity(ID|Name)>/i.test(inner)) {
      push(idMatch[1], inner, groupMatch?.[1] ?? null);
      continue;
    }
    // Format C: child elements
    const cId = inner.match(/<AmenityID>(\d+)<\/AmenityID>/i);
    const cName = inner.match(/<AmenityName>([\s\S]*?)<\/AmenityName>/i);
    const cGroup = inner.match(/<AmenityTypeID>(\d+)<\/AmenityTypeID>/i);
    if (cId && cName) push(cId[1], cName[1], cGroup?.[1] ?? null);
  }

  return results;
}

/**
 * RU's dictionary is ~1600 entries deep and mixes clean amenity names with legacy
 * free-text fragments. We classify each entry into a readable category and flag a
 * curated "recommended" subset so the ROLOS picker can lead with the useful options
 * while still exposing the full catalogue through search.
 */
const AMENITY_CATEGORY_RULES: { category: string; re: RegExp }[] = [
  { category: 'Internet & Workspace', re: /(wi-?fi|internet|broadband|adsl|laptop|desk|work ?space|printer|computer|office|fax|copy service)/i },
  { category: 'Kitchen & Dining', re: /(kitchen|kettle|oven|hob|cooker|stove|microwave|toaster|fridge|freezer|dishwasher|crockery|cutlery|cookware|coffee|tea|dining|plates|pans|utensil|breakfast bar|wine|blender|bread maker|baking|dish rack|kitchenette|espresso)/i },
  { category: 'Bathroom', re: /(bath|shower|toilet|wc|bidet|towel|toiletr|hair ?dryer|washbasin|bathrobe|slipper|shampoo|conditioner|soap|sauna towel|vanity)/i },
  { category: 'Bedroom & Beds', re: /(bed|mattress|linen|pillow|blanket|duvet|wardrobe|cupboard|closet|chest of drawers|night ?table|bedside|bedroom|cot|bunk|sofabed|sofa bed)/i },
  { category: 'Laundry & Cleaning', re: /(washing machine|laundry|dryer|drier|drying|iron|ironing|vacuum|clean|maid|housekeep|dry cleaning)/i },
  { category: 'Entertainment & Media', re: /(tv|television|dvd|cd |cd player|stereo|radio|netflix|playstation|xbox|console|games|book|library|billiard|pool table|table tennis|darts|piano|music|cinema|blu-?ray|satellite|cable)/i },
  { category: 'Heating & Cooling', re: /(air ?conditioning|aircon|\bac\b|heating|heater|radiator|fan|fireplace|chimney|wood burner|ventilation|climate)/i },
  { category: 'Outdoor & Garden', re: /(balcon|terrace|patio|garden|yard|bbq|braai|grill|sun ?lounger|deck|veranda|courtyard|outdoor|porch|hammock|fire pit|roof)/i },
  { category: 'Pool, Spa & Leisure', re: /(pool|jacuzzi|hot ?tub|sauna|spa|steam|gym|fitness|tennis|golf|sport|bicycle|bike|kayak|surf|ski|beach|massage|wellness|yoga)/i },
  { category: 'Family & Children', re: /(baby|child|kid|cot|high ?chair|creche|playground|toys|babysit|stroller|crib)/i },
  { category: 'Safety & Security', re: /(smoke detector|carbon monoxide|fire ext|first aid|alarm|safe\b|security|cctv|surveillance|gated|lock ?box|guard|sprinkler|emergency)/i },
  { category: 'Accessibility', re: /(wheelchair|accessib|disabled|braille|lift|elevator|step-?free|grab rail|hoist|ramp)/i },
  { category: 'Parking & Transport', re: /(parking|garage|car ?port|shuttle|transfer|airport|car rental|charging|ev charg|bus|train|metro|taxi)/i },
  { category: 'Services & Facilities', re: /(reception|concierge|help desk|room service|breakfast|restaurant|bar\b|shop|atm|currency|conference|meeting|business centre|luggage|check-?in|check-?out|host|welcome|chef|pet|smoking|towel change|linen change)/i },
  { category: 'Views & Location', re: /(view|sea|ocean|lake|river|mountain|city cent|beachfront|canal|panoram|garden view|quiet area|busy area)/i },
  { category: 'Living Areas', re: /(living|lounge|sofa|armchair|coffee table|hall|corridor|conservator|dining room|study|room$|rooms$)/i },
];

const RECOMMENDED_AMENITY_IDS = new Set<number>([
  6, 7, 8, 9, 11, 13, 19, 21, 2, 3, 4, 5, 17, 81, 87, 89, 100, 101, 124, 125, 130, 131, 135,
  140, 143, 152, 157, 167, 174, 180, 181, 187, 227, 235, 249, 250, 408, 444, 445, 461, 589,
  620, 661, 667, 674, 780, 833, 838, 880, 943, 1846, 1867, 1868,
]);

function classifyAmenity(name: string, id: number): { category: string; is_recommended: boolean } {
  for (const rule of AMENITY_CATEGORY_RULES) {
    if (rule.re.test(name)) {
      return { category: rule.category, is_recommended: RECOMMENDED_AMENITY_IDS.has(id) };
    }
  }
  return { category: 'General', is_recommended: RECOMMENDED_AMENITY_IDS.has(id) };
}





/**
 * Parse the response of Pull_ListCompositionRooms_RQ.
 * RU returns: <CompositionRooms><CompositionRoom CompositionRoomID="1">Single bed</CompositionRoom>...</CompositionRooms>
 * Some accounts return child elements: <CompositionRoom><CompositionRoomID>1</CompositionRoomID><CompositionRoomName>...</CompositionRoomName></CompositionRoom>
 */
function extractCompositionRooms(xml: string): { id: number; name: string }[] {
  const results: { id: number; name: string }[] = [];

  // Format A: attribute + text content
  const attrRegex = /<CompositionRoom\b[^>]*\bCompositionRoomID\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/CompositionRoom>/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(xml)) !== null) {
    const inner = m[2].trim();
    // strip any nested tags, fall back to inner text
    const name = inner.replace(/<[^>]+>/g, '').trim();
    results.push({ id: parseInt(m[1], 10), name });
  }

  // Format B: child elements
  if (results.length === 0) {
    const childRegex = /<CompositionRoom>[\s\S]*?<CompositionRoomID>(\d+)<\/CompositionRoomID>[\s\S]*?<CompositionRoomName>([\s\S]*?)<\/CompositionRoomName>[\s\S]*?<\/CompositionRoom>/gi;
    while ((m = childRegex.exec(xml)) !== null) {
      results.push({ id: parseInt(m[1], 10), name: m[2].trim() });
    }
  }

  return results;
}

function extractBuildingId(xml: string): string | null {
  const match = xml.match(/<BuildingID>(\d+)<\/BuildingID>/);
  return match?.[1] || null;
}

/**
 * Parse the UnitsComposition block from a Push_PutBuilding_RS response.
 * RU returns: <UnitsComposition><UnitType><UnitTypeName>STUDIO</UnitTypeName><UnitTypeID>123</UnitTypeID>...</UnitType>...</UnitsComposition>
 * The UnitTypeID is the ObjectTypeID required when pushing units that reference this building.
 */
function extractUnitTypeObjectIds(xml: string): { name: string; object_type_id: number }[] {
  const results: { name: string; object_type_id: number }[] = [];
  const blockRegex = /<UnitType\b[^>]*>([\s\S]*?)<\/UnitType>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(xml)) !== null) {
    const block = m[1];
    const nameMatch = block.match(/<UnitTypeName>([\s\S]*?)<\/UnitTypeName>/i);
    const idMatch = block.match(/<UnitTypeID>(\d+)<\/UnitTypeID>/i);
    if (nameMatch && idMatch) {
      results.push({ name: nameMatch[1].trim(), object_type_id: parseInt(idMatch[1], 10) });
    }
  }
  return results;
}

function extractBuildings(xml: string): { id: string; name: string }[] {
  const results: { id: string; name: string }[] = [];
  // RU returns buildings as self-closing or open tags with attributes:
  // <Building BuildingID="123" BuildingName="Foo" /> or <Building BuildingID="123" BuildingName="Foo">...</Building>
  const attrRegex = /<Building\b[^>]*\bBuildingID\s*=\s*"(\d+)"[^>]*\bBuildingName\s*=\s*"([^"]*)"[^>]*\/?>/g;
  let match;
  while ((match = attrRegex.exec(xml)) !== null) {
    results.push({ id: match[1], name: match[2].trim() });
  }
  // Fallback: handle attribute order reversed (BuildingName before BuildingID)
  if (results.length === 0) {
    const reverseRegex = /<Building\b[^>]*\bBuildingName\s*=\s*"([^"]*)"[^>]*\bBuildingID\s*=\s*"(\d+)"[^>]*\/?>/g;
    while ((match = reverseRegex.exec(xml)) !== null) {
      results.push({ id: match[2], name: match[1].trim() });
    }
  }
  // Fallback: legacy child-element format
  if (results.length === 0) {
    const childRegex = /<Building>[\s\S]*?<BuildingID>(\d+)<\/BuildingID>[\s\S]*?<BuildingName>(.*?)<\/BuildingName>[\s\S]*?<\/Building>/g;
    while ((match = childRegex.exec(xml)) !== null) {
      results.push({ id: match[1], name: match[2].trim() });
    }
  }
  return results;
}

// ── User Management XML Builders ─────────────────────────────

/** Push_CreateUser_RQ/FirstName and /LastName are String(50) at the channel. */
const RU_NAME_MAX_LENGTH = 50;



function buildCreateUserXml(
  creds: RUCredentials,
  user: { first_name: string; last_name: string; email: string; password: string },
  locationIds: number[],
  pmsId?: number | null,
): string {
  // Per RU spec: FirstName/LastName/Email/Password are DIRECT children of the root
  // (no <User> wrapper) and <Locations> with at least one <LocationId> is mandatory.
  // FirstName/LastName are String(50) at the channel: an over-long owner or property
  // name was previously sent unchanged and rejected outright, exactly like the
  // over-long email was before the 50-character login cap.
  const first = String(user.first_name).trim().slice(0, RU_NAME_MAX_LENGTH);
  const last = String(user.last_name).trim().slice(0, RU_NAME_MAX_LENGTH);
  const locations = locationIds.map((id) => `    <LocationId>${id}</LocationId>`).join('\n');
  // Optional per spec, and it must sit between <Password> and <Locations>. It associates
  // the new sub-user with the PMS service provided by the channel; without it a child
  // account is not tied to our provider, which is the documented shape of accounts that
  // refuse automatic API-key creation.
  const pms = Number.isFinite(Number(pmsId)) && Number(pmsId) > 0
    ? `\n  <PMSId>${Number(pmsId)}</PMSId>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_CreateUser_RQ>
  ${buildAuthXml(creds)}
  <FirstName>${escapeXml(first)}</FirstName>
  <LastName>${escapeXml(last)}</LastName>
  <Email>${escapeXml(user.email)}</Email>
  <Password>${escapeXml(user.password)}</Password>${pms}
  <Locations>
${locations}
  </Locations>
</Push_CreateUser_RQ>`;
}



function buildListUsersXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListMyUsers_RQ>
  ${buildAuthXml(creds)}
</Pull_ListMyUsers_RQ>`;
}

/**
 * Push_FillCompanyDetails_RQ — the RU schema has NO UserAccountId: the details are
 * applied to whichever account authenticates. To fill a sub-user's profile we must
 * therefore authenticate as that sub-user (UserName/Password), not with the master
 * AccessKey/SecretKey. `auth` carries those child credentials when supplied.
 */
interface RUCompanyPayload {
  // ContactInfo (all mandatory on RU)
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  country_id: number;
  address: string;
  zip_code: string;
  birth_date?: string;
  language_id?: number;
  // CompanyInfo
  name: string;
  website?: string;
  company_city?: string;
  company_address?: string;
  company_country_id?: number;
  post_code?: string;
  company_phone?: string;
  vat_number?: string;
  merchant_name?: string;
  location_ids?: number[];
  // CompanyInfo extras — verified against the RU reference (Fill company details).
  time_zone?: string;
  region?: string;
  manager_identification_number?: string;
  number_of_properties?: number;
  number_of_employees?: number;
  years_in_business?: number;
  describe_your_business?: string;
  // LegalRepresentativeInfo — the only block that carries a nationality.
  legal_rep?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    city?: string;
    country_of_residence_id?: number;
    address?: string;
    post_code?: string;
    birthday?: string;
    nationality_id?: number;
    region?: string;
  } | null;
}

const RU_COMPANY_REQUIRED: (keyof RUCompanyPayload)[] = [
  'first_name', 'last_name', 'email', 'phone', 'city', 'country_id', 'address', 'zip_code', 'name',
  // RU stores the contact birth date permanently; a derived placeholder used to
  // leak onto the profile, so it is now a caller-supplied requirement.
  'birth_date',
];

/** Placeholder values previous versions substituted for missing contact data. */
const RU_COMPANY_PLACEHOLDERS: Partial<Record<keyof RUCompanyPayload, string[]>> = {
  phone: ['+27000000000', '27000000000'],
  last_name: ['owner'],
  birth_date: ['1990-01-01'],
};

function missingCompanyFields(company: Partial<RUCompanyPayload>): string[] {
  const missing = RU_COMPANY_REQUIRED.filter((k) => {
    const v = (company as Record<string, unknown>)[k as string];
    return v === undefined || v === null || String(v).trim() === '' || (k === 'country_id' && !Number(v));
  }).map(String);
  for (const [key, values] of Object.entries(RU_COMPANY_PLACEHOLDERS)) {
    const raw = String((company as Record<string, unknown>)[key] ?? '').replace(/[\s-]/g, '').toLowerCase();
    if (raw && values!.includes(raw)) missing.push(`${key} (placeholder — enter the real value)`);
  }
  if (!Array.isArray(company.location_ids) || company.location_ids.length === 0) missing.push('location_ids');
  return missing;
}


/**
 * Sub-user ("child") authentication envelope. RU treats every sub-user as a separate
 * account: since the API-keys rollout (Nov 2025) new accounts MUST authenticate with
 * that sub-user's own AccessKey/SecretKey. Legacy accounts may still use the portal
 * UserName/Password pair, so both shapes are supported.
 *
 * 🔒 ADAPTER LOCK (RU child isolation): never substitute the MASTER AccessKey/SecretKey
 * here — child-scoped methods (buildings, company details, archive) have no OwnerID and
 * would be applied to the master account.
 */
type ChildAuth =
  | { mode: 'keys'; access_key: string; secret_key: string }
  | { mode: 'password'; username: string; password: string };

function buildChildAuthXml(auth: ChildAuth): string {
  if (auth.mode === 'keys') {
    return `<Authentication>
    <AccessKey>${escapeXml(auth.access_key)}</AccessKey>
    <SecretKey>${escapeXml(auth.secret_key)}</SecretKey>
  </Authentication>`;
  }
  return `<Authentication>
    <UserName>${escapeXml(auth.username)}</UserName>
    <Password>${escapeXml(auth.password)}</Password>
  </Authentication>`;
}

/**
 * Key-mint only: the owner-scoped variant authenticates with the master pair and names
 * the sub-account in <OwnerID>. It is deliberately NOT part of `ChildAuth`, so it can
 * never reach a child-scoped write path.
 */
type ChildAuthForKeyMint = ChildAuth | { mode: 'owner_scoped'; access_key: string; secret_key: string; owner_id: string };

function childAuthMode(auth: ChildAuthForKeyMint | null): string {
  if (!auth) return 'parent_access_key';
  if (auth.mode === 'owner_scoped') return 'master_owner_scoped';
  return auth.mode === 'keys' ? 'child_api_keys' : 'child_user_password';
}


/**
 * 🔒 ADAPTER LOCK (RU child isolation): Rentals United treats every sub-user as its
 * own account. An authenticated MASTER request creates/updates the listing on the
 * master account regardless of the <OwnerID> carried in the payload — that is why
 * property, ARI and discount pushes for white-label sub-users landed on the ROL
 * master account. Swapping the credentials that build the <Authentication> envelope
 * for the sub-user's own AccessKey/SecretKey is the fix.
 *
 * Legacy accounts with only a portal UserName/Password fall back to master auth +
 * <OwnerID> (the pre-migration behaviour) — nothing that works today breaks.
 */
function effectiveCreds(creds: RUCredentials, childAuth: ChildAuth | null): RUCredentials {
  if (childAuth && childAuth.mode === 'keys') {
    return {
      ...creds,
      api_key: childAuth.access_key,
      api_secret: childAuth.secret_key,
      auth_scope: 'child_keys',
    };
  }
  if (childAuth && childAuth.mode === 'password') {
    return { ...creds, auth_scope: 'child_password' };
  }
  return { ...creds, auth_scope: 'master' };
}


/** Actions that operate on a single sub-user's inventory and must authenticate as that sub-user. */
const CHILD_SCOPED_ACTIONS = new Set([
  'push_property',
  'push_availability',
  'push_prices',
  'push_prices_fsp',
  'push_long_stay_discounts',
  'push_last_minute_discounts',
  'set_property_status',
  'get_property',
  'get_availability',
  'get_prices',
  'get_long_stay_discounts',
  'get_last_minute_discounts',
  'list_properties',
  'order_mcq',
  'push_change_currency',
  // Reservation / lead pulls are account-scoped: a white-label sub-user's bookings do NOT
  // appear in the master account's Pull_ListReservations_RQ response.
  'list_reservations',
  'get_reservation_by_id',
  'get_leads',
  'reject_request',
  'confirm_request',
  'cancel_reservation',
  'modify_stay',
  'subscribe_notifications',
  // LNM subscriptions are per-account: subscribing on master credentials leaves the
  // sub-user's content/ARI changes unnotified.
  'put_lnm_subscriptions',
  'list_lnm_subscriptions',
  'list_lnm_change_types',

]);


/**
 * Child-scoped actions that WRITE (or accept/reject money-bearing requests). A master
 * fallback here is never acceptable: RU either answers "You are not the owner of the
 * apartment" or silently applies the write to OUR master account. These must carry an
 * explicit owner_id so the credential choice is never inferred.
 */
const CHILD_SCOPED_WRITE_ACTIONS = new Set([
  'push_property',
  'push_availability',
  'push_prices',
  'push_prices_fsp',
  'push_long_stay_discounts',
  'push_last_minute_discounts',
  'set_property_status',
  'order_mcq',
  'push_change_currency',
  'reject_request',
  'confirm_request',
  'cancel_reservation',
  'modify_stay',
  'subscribe_notifications',
  'put_lnm_subscriptions',
]);

/**
 * The RU master OwnerID (our own account). A child-scoped call that names this OwnerID is
 * legitimately a master-account operation; anything else is a sub-user's inventory and may
 * only be executed with that sub-user's own AccessKey/SecretKey.
 */
function masterOwnerId(): string {
  return (Deno.env.get('RU_OWNER_ID') ?? '').trim();
}

function isMasterOwnerId(value: unknown): boolean {
  const supplied = value == null ? '' : String(value).trim();
  const master = masterOwnerId();
  return supplied !== '' && master !== '' && supplied === master;
}


/**
 * The RU verb behind a ROLOS action, used when an exchange has to be logged BEFORE the request
 * XML exists (a pre-transport abort). Auditors search the log by RU verb, so a "never attempted"
 * cancel must appear under `Push_CancelReservation_RQ`, not under an internal action name.
 */
const RU_VERB_BY_ACTION: Record<string, string> = {
  reject_request: 'Push_RejectRequest_RQ',
  confirm_request: 'Push_ConfirmReservation_RQ',
  cancel_reservation: 'Push_CancelReservation_RQ',
  modify_stay: 'Push_ModifyStay_RQ',
  push_confirmed_reservation: 'Push_PutConfirmedReservationMulti_RQ',

  push_property: 'Push_PutProperty_RQ',
  push_availability: 'Push_PutAvbUnits_RQ',
  push_prices: 'Push_PutPrices_RQ',
  push_prices_fsp: 'Push_PutPrices_RQ',
  list_reservations: 'Pull_ListReservations_RQ',
  get_leads: 'Pull_GetLeads_RQ',
  fill_company_details: 'Push_FillCompanyDetails_RQ',
  create_user: 'Push_CreateUser_RQ',
  archive_user: 'Push_ArchiveUser_RQ',

};



/**
 * Resolve the credentials to use for a child-scoped RU call.
 *
 * Order: keys supplied on the request → keys stored for that sub-user in
 * ru_owner_accounts → username/password supplied on the request (pre-migration
 * accounts only). Returns null when nothing usable is available.
 */
async function resolveChildAuthDetailed(
  body: RequestBody,
): Promise<{ auth: ChildAuth | null; reason: string | null }> {
  const suppliedKey = typeof body.auth_access_key === 'string' ? body.auth_access_key.trim() : '';
  const suppliedSecret = typeof body.auth_secret_key === 'string' ? body.auth_secret_key.trim() : '';
  if (suppliedKey && suppliedSecret) {
    return { auth: { mode: 'keys', access_key: suppliedKey, secret_key: suppliedSecret }, reason: null };
  }

  const username = typeof body.auth_username === 'string' ? body.auth_username.trim() : '';
  const ownerId = body.owner_id != null ? String(body.owner_id).trim() : '';
  // Distinguish "no keys stored" from "stored secret could not be decrypted" so the
  // operator knows whether to generate keys or simply re-save the secret.
  let keyFound = false;
  let decryptFailed = false;

  if (username || ownerId) {
    try {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const decrypt = async (enc: unknown): Promise<string | null> => {
        if (!enc) return null;
        const { data: secret } = await admin.rpc('decrypt_sensitive_text', { encrypted_data: enc });
        const plain = typeof secret === 'string' ? secret : '';
        if (!plain || plain === '[ENCRYPTED]' || plain === '[DECRYPTION_ERROR]') return null;
        return plain;
      };

      // Preferred store: per-OwnerID credentials (never overwritten by another sub-user)
      let credQuery = admin
        .from('ru_api_credentials')
        .select('access_key, secret_enc')
        .not('access_key', 'is', null)
        .limit(1);
      credQuery = ownerId ? credQuery.eq('ru_owner_id', ownerId) : credQuery.eq('login_email', username);
      const { data: credRow } = await credQuery.maybeSingle();
      if (credRow?.access_key) {
        keyFound = true;
        const plain = await decrypt(credRow.secret_enc);
        if (plain) return { auth: { mode: 'keys', access_key: String(credRow.access_key), secret_key: plain }, reason: null };
        decryptFailed = true;
      }

      // Legacy store: keys held on the bound ru_owner_accounts row
      let query = admin
        .from('ru_owner_accounts')
        .select('ru_api_access_key, ru_api_secret_enc')
        .not('ru_api_access_key', 'is', null)
        .limit(1);
      query = ownerId ? query.eq('ru_owner_id', ownerId) : query.eq('ru_login_email', username);
      const { data } = await query.maybeSingle();
      if (data?.ru_api_access_key && data?.ru_api_secret_enc) {
        keyFound = true;
        const plain = await decrypt(data.ru_api_secret_enc);
        if (plain) return { auth: { mode: 'keys', access_key: String(data.ru_api_access_key), secret_key: plain }, reason: null };
        decryptFailed = true;
      }
    } catch (e) {
      console.warn('[rentalsunited-api] child key lookup failed', e);
      return {
        auth: null,
        reason: `Sub-user key lookup failed${ownerId ? ` for OwnerID ${ownerId}` : ''}: ${e instanceof Error ? e.message : 'unknown error'}`,
      };
    }
  }


  const password = typeof body.auth_password === 'string' ? body.auth_password : '';
  if (username && password) return { auth: { mode: 'password', username, password }, reason: null };

  const scope = ownerId ? ` for OwnerID ${ownerId}` : username ? ` for ${username}` : '';
  const reason = decryptFailed
    ? `The stored SecretKey${scope} could not be decrypted — re-save the sub-user's AccessKey + SecretKey in Portfolios → RU accounts.`
    : keyFound
      ? `An AccessKey is on file${scope} but no usable SecretKey — re-save the key pair in Portfolios → RU accounts.`
      : `No Rentals United sub-user API keys stored${scope} — generate them in the RU dashboard (Security settings) and save them in Portfolios → RU accounts.`;
  return { auth: null, reason };
}

async function resolveChildAuth(body: RequestBody): Promise<ChildAuth | null> {
  return (await resolveChildAuthDetailed(body)).auth;
}

/**
 * 🔒 ADAPTER LOCK (RU child isolation): a key pair minted with the MASTER envelope
 * (Push_CreateApiKey_RQ + <OwnerID>) belongs to the MASTER account, not to the named
 * sub-user — the channel ignores <OwnerID> when issuing keys. Storing such a pair as
 * "child keys" makes every later write authenticate as the master account, so the
 * listing lands in the master account's footprint while only being tagged with the
 * sub-account's OwnerID (this is how listing 5948442 "Leopard" reached the master).
 *
 * Only a parent account can run Pull_ListMyUsers_RQ, so that call is the definitive
 * probe: if the pair can enumerate the roster, it is a master pair and must never be
 * used for a sub-account write. The verdict is cached on ru_api_credentials.
 */
async function assertChildKeysAreNotMaster(
  creds: RUCredentials,
  childAuth: ChildAuth | null,
  ownerId: string,
): Promise<{ ok: boolean; message?: string; visible_owner_ids?: string[] }> {
  if (!childAuth || childAuth.mode !== 'keys' || !ownerId) return { ok: true };

  const admin = getLogClient();
  let rowId: string | null = null;
  try {
    const { data } = await admin
      .from('ru_api_credentials')
      .select('id, key_scope')
      .eq('ru_owner_id', ownerId)
      .eq('access_key', childAuth.access_key)
      .maybeSingle();
    if (data) {
      rowId = String(data.id);
      if (data.key_scope === 'child') return { ok: true };
      if (data.key_scope === 'master_pair') {
        return {
          ok: false,
          message:
            `The API key pair stored for OwnerID ${ownerId} authenticates as our MASTER channel account, not as the sub-account. ` +
            'Writing with it would create the listing on the master account, so it is refused. Re-mint the sub-account key pair (Step A) before pushing.',
        };
      }
    }
  } catch (e) {
    console.warn('[rentalsunited-api] key scope lookup failed', e);
  }

  // Unverified (or supplied ad hoc): probe once.
  let visible: string[] = [];
  let probed = false;
  try {
    const keyCreds = effectiveCreds(creds, childAuth);
    const response = await callRentalsUnited(creds, buildListUsersXml(keyCreds));
    if (handleRUStatus(response).ok) {
      visible = extractUsers(response).map((u) => String(u.owner_id)).filter(Boolean);
      probed = true;
    } else {
      probed = true; // roster refused ⇒ not a parent pair
    }
  } catch (e) {
    console.warn('[rentalsunited-api] key scope probe failed', e);
  }

  const isMasterPair = visible.some((id) => id !== ownerId);
  if (probed && rowId) {
    try {
      await admin
        .from('ru_api_credentials')
        .update({
          key_scope: isMasterPair ? 'master_pair' : 'child',
          key_scope_verified_at: new Date().toISOString(),
          key_scope_detail: { visible_owner_ids: visible.slice(0, 60), probe: 'Pull_ListMyUsers_RQ' },
        })
        .eq('id', rowId);
    } catch (e) {
      console.warn('[rentalsunited-api] key scope persist failed', e);
    }
  }

  if (isMasterPair) {
    return {
      ok: false,
      visible_owner_ids: visible,
      message:
        `The API key pair on file for OwnerID ${ownerId} can enumerate the whole channel roster, which only our MASTER account can do. ` +
        'It is a master key pair, so writing with it would create inventory on the master account. Re-mint the sub-account key pair (Step A) before pushing.',
    };
  }
  return { ok: true };
}




const CHILD_AUTH_REQUIRED_MESSAGE =
  'This action must authenticate as the RU sub-user. Rentals United requires the sub-user\'s own API keys (AccessKey + SecretKey) — generate them in the RU dashboard under Security settings and save them in Portfolios → RU accounts, then retry.';

function buildFillCompanyDetailsXml(
  creds: RUCredentials,
  company: RUCompanyPayload,
  ownerId: number,
  childAuth?: ChildAuth | null,
): string {
  const optNode = (tag: string, val?: string | number) =>
    val !== undefined && val !== null && String(val).trim() !== '' ? `<${tag}>${escapeXml(String(val))}</${tag}>` : '';
  const locations = (company.location_ids ?? []).map((id) => `      <Location Id="${Number(id)}" />`).join('\n');
  /**
   * NumberOfProperties / NumberOfEmployees / YearsInBusiness are RU range option
   * IDs. A caller that still passes a raw count is mapped onto its bucket here so
   * "4 units" can never be stored as the 4th range ("20 - 29").
   */
  const rangeNode = (tag: string, ranges: RuRange[], val?: number) => {
    if (val === undefined || val === null || !Number.isFinite(Number(val))) return '';
    const n = Number(val);
    const id = isRangeId(ranges, n) ? n : rangeIdForCount(ranges, n);
    return id !== undefined ? `<${tag}>${id}</${tag}>` : '';
  };

  // LegalRepresentativeInfo is optional, but RU's XSD fixes the element order:
  // FirstName → LastName → Email → City → CountryOfResidenceId → Address → PostCode
  // → Birthday → NationalityId → Region.
  const rep = company.legal_rep ?? null;
  const repNodes = rep
    ? [
        optNode('FirstName', rep.first_name),
        optNode('LastName', rep.last_name),
        optNode('Email', rep.email),
        optNode('City', rep.city),
        optNode('CountryOfResidenceId', rep.country_of_residence_id),
        optNode('Address', rep.address),
        optNode('PostCode', rep.post_code),
        optNode('Birthday', rep.birthday),
        optNode('NationalityId', rep.nationality_id),
        optNode('Region', rep.region),
      ].filter(Boolean)
    : [];
  const legalRepXml = repNodes.length > 0
    ? `\n  <LegalRepresentativeInfo>\n    ${repNodes.join('\n    ')}\n  </LegalRepresentativeInfo>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_FillCompanyDetails_RQ>
  ${childAuth ? buildChildAuthXml(childAuth) : buildAuthXml(creds)}
  ${childAuth ? '' : `<OwnerID>${ownerId}</OwnerID>`}

  <ContactInfo>
    <FirstName>${escapeXml(company.first_name)}</FirstName>
    <LastName>${escapeXml(company.last_name)}</LastName>
    <Email>${escapeXml(company.email)}</Email>
    <Phone>${escapeXml(company.phone)}</Phone>
    <City>${escapeXml(company.city)}</City>
    <CountryId>${Number(company.country_id)}</CountryId>
    <Address>${escapeXml(company.address)}</Address>
    <ZipCode>${escapeXml(company.zip_code)}</ZipCode>
    <BirthDate>${escapeXml(company.birth_date || '')}</BirthDate>
    <LanguageId>${Number(company.language_id ?? 1)}</LanguageId>
  </ContactInfo>
  <CompanyInfo>
    <CompanyName>${escapeXml(company.name)}</CompanyName>
    <WebsiteAddress>${escapeXml(company.website || 'https://sleepinafrica.roomsonline.co.za')}</WebsiteAddress>
    <CompanyCity>${escapeXml(company.company_city || company.city)}</CompanyCity>
    ${optNode('Address', company.company_address || company.address)}
    ${optNode('CountryId', company.company_country_id ?? company.country_id)}
    ${optNode('PostCode', company.post_code || company.zip_code)}
    ${optNode('TimeZone', normalizeRuTimeZone(company.time_zone))}
    ${optNode('Region', company.region)}
    ${optNode('PhoneNumber', company.company_phone || company.phone)}
    ${optNode('VATNumber', company.vat_number)}
    ${optNode('ManagerIdentificationNumber', company.manager_identification_number)}
    <MerchantName>${escapeXml(company.merchant_name || company.name)}</MerchantName>
    <Locations>
${locations}
    </Locations>
    ${rangeNode('NumberOfProperties', RU_PROPERTY_RANGES, company.number_of_properties)}
    ${rangeNode('NumberOfEmployees', RU_EMPLOYEE_RANGES, company.number_of_employees)}
    ${rangeNode('YearsInBusiness', RU_YEARS_RANGES, company.years_in_business)}
    ${optNode('DescribeYourBusiness', company.describe_your_business)}
  </CompanyInfo>${legalRepXml}
</Push_FillCompanyDetails_RQ>`;
}


function extractUserAccountId(xml: string): string | null {
  // The roster spells it `UserAccountID`; older payloads use `UserAccountId`. Accept both.
  const match = xml.match(/<UserAccountI[dD]>(\d+)<\/UserAccountI[dD]>/);
  return match?.[1] || null;
}


interface RUListedUser {
  user_account_id: string;
  email: string;
  /**
   * The sub-user's actual RU login (`<UserName>`). It can differ from the `<Email>` in
   * Pull_ListMyUsers_RQ, which lags the portal's contact email — OwnerID 741765 uses
   * connect@… for both login and contact while the list still reports rooms@… as
   * `<Email>`. An email-only lookup therefore wrongly reports "no sub-user for this
   * login", so every owner lookup must match on `login_email` too.
   */
  login_email: string;
  first_name: string;
  last_name: string;
  owner_id: string;
  archived: boolean;
}


/**
 * OwnerIDs that must never be offered in the UI again (abandoned test sub-users we
 * cannot sign into to mint API keys, so they can neither be used nor archived).
 */
const RU_SUPPRESSED_OWNER_IDS = new Set(['741769', '741776']);

/** RU renames a closed sub-user's login to `Archived_<email>` / `Archived.<email>`. */
function isArchivedRuLogin(email: string, ownerId: string, block?: string): boolean {
  if (RU_SUPPRESSED_OWNER_IDS.has(String(ownerId).trim())) return true;
  if (/^archived[._-]/i.test(email.trim())) return true;
  if (block && /<(IsArchived|Archived)>\s*(true|1)\s*<\/(IsArchived|Archived)>/i.test(block)) return true;
  if (block && /<IsActive>\s*(false|0)\s*<\/IsActive>/i.test(block)) return true;
  return false;
}

function extractUsers(xml: string): RUListedUser[] {
  const results: RUListedUser[] = [];
  // Current RU format: <Owner OwnerID="741761"><FirstName/><SurName/><Email/>...<UserAccountId>0</UserAccountId></Owner>
  const ownerRegex = /<Owner\b[^>]*\bOwnerID\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/Owner>/gi;
  let m: RegExpExecArray | null;
  while ((m = ownerRegex.exec(xml)) !== null) {
    const ownerId = m[1];
    const block = m[2];
    const val = (tag: string) => block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]?.trim() ?? '';
    const userName = val('UserName');
    const email = val('Email') || userName;
    results.push({
      user_account_id: val('UserAccountId') || '',
      first_name: val('FirstName'),
      last_name: val('SurName') || val('LastName'),
      email,
      login_email: userName || email,
      owner_id: ownerId,
      archived: isArchivedRuLogin(email, ownerId, block),
    });

  }
  if (results.length > 0) return results;

  // Legacy format: <User><UserAccountId/><FirstName/><LastName/><Email/><OwnerID/></User>
  const regex = /<User>[\s\S]*?<UserAccountId>(\d+)<\/UserAccountId>[\s\S]*?<FirstName>(.*?)<\/FirstName>[\s\S]*?<LastName>(.*?)<\/LastName>[\s\S]*?<Email>(.*?)<\/Email>[\s\S]*?(?:<OwnerID>(\d+)<\/OwnerID>)?[\s\S]*?<\/User>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const email = match[4]?.trim() || '';
    const ownerId = match[5] || '';
    results.push({
      user_account_id: match[1],
      first_name: match[2]?.trim() || '',
      last_name: match[3]?.trim() || '',
      email,
      login_email: email,
      owner_id: ownerId,
      archived: isArchivedRuLogin(email, ownerId),
    });
  }

  return results;
}


// ── Action Handlers ──────────────────────────────────────────

function handleRUStatus(response: string): { ok: boolean; status: { id: string; message: string } } {
  const status = extractStatusId(response);
  return { ok: status.id === '0', status };
}

interface RUNotif {
  status_id: string;
  date_from?: string;
  date_to?: string;
  message: string;
}

function parseRUNotifs(xml: string): RUNotif[] {
  const notifs: RUNotif[] = [];
  const regex = /<Notif\s+([^>]*)>([\s\S]*?)<\/Notif>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const attrs = m[1];
    const message = m[2].trim();
    const sid = attrs.match(/StatusID="([^"]*)"/)?.[1] ?? '';
    const df = attrs.match(/DateFrom="([^"]*)"/)?.[1];
    const dt = attrs.match(/DateTo="([^"]*)"/)?.[1];
    notifs.push({ status_id: sid, date_from: df, date_to: dt, message });
  }
  return notifs;
}

// For Push_PutLongStayDiscounts_RQ / Push_PutLastMinuteDiscounts_RQ:
//   Status ID 0 = full success, Status ID 5 = partial (some ranges failed, see <Notifs>),
//   anything else = full failure.
function parseDiscountResponse(response: string): { ok: boolean; partial: boolean; status: { id: string; message: string }; notifs: RUNotif[] } {
  const status = extractStatusId(response);
  const notifs = parseRUNotifs(response);
  const ok = status.id === '0';
  const partial = status.id === '5';
  return { ok, partial, status, notifs };
}

function ruErrorResponse(status: { id: string; message: string }, diagnostics?: Record<string, unknown>): Response {
  return jsonResponse({
    success: false,
    error: { code: 'RU_ERROR', message: status.message, ru_status_id: status.id },
    ...(diagnostics ? { diagnostics } : {}),
  });
}

function parseXmlErrorPosition(message: string): number | null {
  const match = message.match(/\(\d+,\s*(\d+)\)/);
  return match ? parseInt(match[1], 10) : null;
}

function buildDiagnostics(compactRequestXml: string, status: { id: string; message: string }, stage: string, responseXml?: string): Record<string, unknown> {
  const safeXml = sanitizeXmlForLogs(compactRequestXml);
  const xmlPos = parseXmlErrorPosition(status.message);
  return {
    error_stage: stage,
    xml_length: safeXml.length,
    xml_error_position: xmlPos,
    xml_context: xmlPos ? safeXml.substring(Math.max(0, xmlPos - 60), xmlPos + 60) : null,
    request_preview: previewXml(safeXml, 600),
    request_xml: safeXml,
    response_preview: responseXml ? previewXml(responseXml, 600) : null,
  };
}

// ── Main Handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Hoisted so the catch can replay a rate-deferred call into the background queue.
  let requestBody: RequestBody | null = null;
  try {
    const body: RequestBody = await req.json();
    requestBody = body;
    const { action, ru_property_id, date_from, date_to, test_mode, metadata } = body;


    // Bind the durable-log context for this request. `enterWith` scopes it to the current async
    // execution, so concurrent invocations in the same isolate never share context.
    ruLogContext.enterWith({
      trace_id: body.trace_id ?? newRuTraceId(),
      parent_action: body.parent_action ?? `rentalsunited-api:${action}`,
      property_id: body.property_id ?? body.property_uuid ?? null,
      unit_id: body.unit_id ?? null,
      ru_property_id: ru_property_id ?? null,
      ru_owner_id: body.owner_id ?? null,
      ru_user_id: body.ru_user_id ?? null,
      // Field-scoped delta provenance: certification requires proof that a specific PMS change
      // (name, capacity, min stay, price period…) is what triggered this exchange.
      changed_fields: Array.isArray(body.changed_fields) ? body.changed_fields.map(String) : null,
      push_type: body.push_type ?? null,
      fingerprint: body.fingerprint ?? null,
    });

    console.log(`[rentalsunited-api] Action: ${action}, test_mode: ${test_mode}`);


    const creds = await loadCredentials();

    // ── health_check ──
    if (action === 'health_check') {
      if (!creds || (!creds.api_key && !creds.api_secret)) {
        return jsonResponse({
          healthy: false,
          status: 'not_configured',
          message: 'Rentals United credentials not configured',
          integration_status: 'in_development',
          metadata: { ...metadata, checked_at: new Date().toISOString() },
        });
      }

      try {
        const today = new Date().toISOString().split('T')[0];
        const yesterdayDate = new Date();
        yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];
        const xml = buildListReservationsXml(creds, yesterday, today);
        const response = await callRentalsUnited(creds, xml);
        const { ok, status } = handleRUStatus(response);

        return jsonResponse({
          healthy: ok,
          status: ok ? 'ok' : 'error',
          message: ok
            ? 'Rentals United XML API AccessKey / SecretKey accepted successfully'
            : `Rentals United API error: ${status.message}`,
          ru_status_id: status.id,
          ru_status_message: status.message,
          integration_status: 'in_development',
          capabilities: {
            health_check: true,
            list_properties: true,
            get_property: true,
            get_availability: true,
            get_prices: true,
            list_reservations: true,
            get_leads: true,
            push_property: true,
            push_availability: true,
            push_prices: true,
            subscribe_notifications: true,
            put_lnm_subscriptions: true,
            list_lnm_subscriptions: true,
            list_lnm_change_types: true,
            list_sales_channels: true,
            list_property_types: true,

            push_long_stay_discounts: true,
            push_last_minute_discounts: true,
            create_user: true,
            list_users: true,
            fill_company_details: true,
          },
          metadata: { ...metadata, checked_at: new Date().toISOString(), credential_source: creds.source, probe: 'Pull_ListReservations_RQ' },
        });
      } catch (err) {
        return jsonResponse({
          healthy: false,
          status: 'connection_error',
          message: `Could not reach Rentals United: ${err instanceof Error ? err.message : 'Unknown error'}`,
          metadata: { ...metadata, checked_at: new Date().toISOString() },
        });
      }
    }

    // All other actions require credentials
    if (!creds || !creds.api_key || !creds.api_secret) {
      return errorResponse('NOT_CONFIGURED', 'Rentals United credentials not configured');
    }

    // ── verify_owner_api_access / verify_subuser_credentials (legacy alias) ──
    // RU portal credentials and XML API credentials are distinct surfaces. Verify
    // that the configured parent API account can reach the bound child OwnerID;
    // never report a valid portal password as invalid based on an API-only probe.
    if (action === 'verify_owner_api_access' || action === 'verify_subuser_credentials') {
      const ownerId = Number(body.owner_id);
      if (!Number.isFinite(ownerId) || ownerId <= 0) {
        return errorResponse('MISSING_PARAM', 'A valid owner_id is required');
      }
      const xml = buildVerifyOwnerAccessXml(creds, ownerId);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return jsonResponse({
          success: false,
          verified: false,
          error: {
            code: 'RU_OWNER_API_ACCESS_FAILED',
            message: `Rentals United API access to OwnerID ${ownerId} failed (${status.message || 'access rejected'}).`,
            ru_status_id: status.id,
          },
        }, 200);
      }
      return jsonResponse({
        success: true,
        verified: true,
        api_access_verified: true,
        auth_mode: 'parent_access_key_owner_scope',
        owner_id: String(ownerId),
      });
    }

    // ── verify_child_login ──
    // Real sub-user login test on RU's XML surface, KEY PAIR ONLY.
    //
    // Since RU's API-keys rollout a UserName/Password envelope is refused on the read
    // surfaces, and the only account-level read available to it (Pull_ListBuildings_RQ,
    // no OwnerID) is also the most rate-limited method we call. Probing with a password
    // therefore returned "Incorrect login or password" whether or not the password was
    // right — a guaranteed-failure call made before any key pair exists. The password's
    // password-mode probes are refused here instead of burning a doomed buildings read.
    //
    // With keys we probe the OWNER-SCOPED listing read (Pull_ListOwnerProp_RQ) whenever an
    // owner_id is supplied: a fresh pair can be refused on buildings with RU's generic auth
    // text even though the pair is fine for its own inventory.
    if (action === 'verify_child_login') {
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return errorResponse(
          'MISSING_PARAM',
          'auth_access_key + auth_secret_key (preferred) or auth_username + auth_password are required',
        );
      }
      if (childAuth.mode !== 'keys') {
        return errorResponse(
          'RU_PASSWORD_PROBE_UNSUPPORTED',
          'Rentals United cannot validate a portal password on the API surface. Mint a key pair (Push_CreateApiKey_RQ) — that call is the password verdict.',
        );
      }
      const probeOwnerId = parseInt(String(body.owner_id ?? '').trim(), 10);
      if (!Number.isFinite(probeOwnerId) || probeOwnerId <= 0) {
        return errorResponse(
          'MISSING_PARAM',
          'owner_id is required for key verification; unscoped buildings reads are intentionally disabled',
        );
      }

      const method = 'Pull_ListOwnerProp_RQ';
      const xml = buildListPropertiesXml(effectiveCreds(creds, childAuth), probeOwnerId);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      return jsonResponse({
        success: true,
        verified: ok,
        auth_mode: childAuthMode(childAuth),
        method,
        owner_id: String(probeOwnerId),
        ru_status_id: status.id ?? null,
        ru_status_message: status.message ?? null,
      });
    }


    // ── verify_child_key_owner ──
    // Read-only ownership probe: confirm a supplied AccessKey/SecretKey pair really belongs to
    // the OwnerID it is about to be stored against. Validity alone is not enough — one
    // sub-user's keys can be pasted onto another sub-user's row, after which every
    // "sub-account scoped" call silently reads/writes the wrong RU account.
    if (action === 'verify_child_key_owner') {
      const childAuth = await resolveChildAuth(body);
      if (!childAuth || childAuth.mode !== 'keys') {
        return errorResponse('MISSING_PARAM', 'auth_access_key + auth_secret_key are required');
      }
      const targetOwnerId = parseInt(String(body.owner_id ?? '').trim(), 10);
      if (!Number.isFinite(targetOwnerId) || targetOwnerId <= 0) {
        return errorResponse('MISSING_PARAM', 'owner_id (RU OwnerID) is required');
      }
      const keyCreds = effectiveCreds(creds, childAuth);

      // 1) Can these keys read that OwnerID's inventory? RU answers "not the owner" otherwise.
      const ownerXml = buildListPropertiesXml(keyCreds, targetOwnerId);
      const ownerResponse = await callRentalsUnited(creds, ownerXml);
      const ownerStatus = handleRUStatus(ownerResponse);

      // 2) Best effort: which account do these keys actually authenticate as? A master pair can
      //    read any OwnerID, so a positive read alone must not be treated as ownership.
      let identifiedOwnerIds: string[] = [];
      let identifiedEmails: string[] = [];
      try {
        const usersResponse = await callRentalsUnited(creds, buildListUsersXml(keyCreds));
        if (handleRUStatus(usersResponse).ok) {
          const users = extractUsers(usersResponse);
          identifiedOwnerIds = users.map((u) => String(u.owner_id)).filter(Boolean);
          identifiedEmails = users.map((u) => u.email).filter(Boolean);
        }
      } catch (_e) {
        // identification is advisory only
      }

      // Only a parent/master pair can enumerate the roster, so ANY other OwnerID in the
      // listing proves these keys are not the sub-account's own pair — a positive
      // Pull_ListOwnerProp read is exactly what a master pair would also produce.
      const seesOtherAccounts =
        identifiedOwnerIds.some((id) => id !== String(targetOwnerId));
      const seesOtherAccountsOnly =
        identifiedOwnerIds.length > 0 && !identifiedOwnerIds.includes(String(targetOwnerId));
      const owns = ownerStatus.ok && !seesOtherAccounts;

      return jsonResponse({
        success: true,
        owns,
        verified: ownerStatus.ok,
        key_scope: seesOtherAccounts ? 'master_pair' : ownerStatus.ok ? 'child' : 'unverified',
        method: 'Pull_ListOwnerProp_RQ',
        auth_mode: childAuthMode(childAuth),
        owner_id: targetOwnerId,
        ru_status_id: ownerStatus.status.id ?? null,
        ru_status_message: ownerStatus.status.message ?? null,
        identified_owner_ids: identifiedOwnerIds,
        identified_emails: identifiedEmails,
        reason: owns
          ? null
          : seesOtherAccountsOnly
            ? 'KEYS_BELONG_TO_ANOTHER_ACCOUNT'
            : seesOtherAccounts
              ? 'KEYS_ARE_MASTER_PAIR'
              : 'OWNER_READ_REJECTED',

      });
    }

    // ── create_child_api_key: Push_CreateApiKey_RQ (authenticated AS the sub-user) ──
    // RU only returns the SecretKey once, at creation time, so the caller must persist it.
    if (action === 'create_child_api_key') {
      /**
       * Owner-scoped mint: the channel returns "Incorrect login or password" for the
       * sub-account's own login envelope even on an account it created seconds earlier,
       * so Step A may ask for a master-authenticated mint that carries <OwnerID>. This
       * is key creation only — child-scoped company/building writes still authenticate
       * as the child (see the RU child isolation lock).
       */
      const ownerScopedId = body.owner_scoped_mint === true && body.owner_id != null
        ? String(body.owner_id).trim()
        : '';
      const childAuth: ChildAuthForKeyMint | null = ownerScopedId
        ? { mode: 'owner_scoped', access_key: creds.api_key, secret_key: creds.api_secret, owner_id: ownerScopedId }
        : await resolveChildAuth(body);
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_CHILD_AUTH_REQUIRED',
            message: 'The sub-account login and password or an existing key pair are required to create its API key pair.',
          },
        }, 422);
      }
      const label = (typeof body.key_label === 'string' && body.key_label.trim())
        ? body.key_label.trim().substring(0, 255)
        : 'ROLOS';
      const xml = buildCreateApiKeyXml(childAuth, label);

      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        if (/incorrect login|incorrect password|login or password/i.test(String(status.message ?? ''))) {
          return jsonResponse({
            success: false,
            auth_mode: childAuthMode(childAuth),
            ru_status_id: status.id ?? null,
            ru_status_message: status.message ?? null,
            error: {
              code: 'RU_CREATE_KEY_API_REJECTED',
              code_detail: 'RU_CREATE_KEY_API_REJECTED',
              ru_status_id: status.id ?? null,
              message: 'The sub-account password was stored, but the channel XML API refused automatic key creation. Portal login can still be valid; retry Step A or escalate this OwnerID for API key creation enablement.',
            },
          }, 422);
        }
        return ruErrorResponse(
          status,
          buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'create_child_api_key', response),
        );
      }

      const accessKey = response.match(/<AccessKey>([\s\S]*?)<\/AccessKey>/i)?.[1]?.trim() ?? null;
      const secretKey = response.match(/<SecretKey>([\s\S]*?)<\/SecretKey>/i)?.[1]?.trim() ?? null;
      return jsonResponse({
        success: true,
        auth_mode: childAuthMode(childAuth),
        access_key: accessKey,
        secret_key: secretKey,
        label,
        message: accessKey && secretKey
          ? 'API key created. The secret is only returned once — store it now.'
          : 'RU accepted the request but no key pair was found in the response.',
      });
    }

    // ── list_child_api_keys: Pull_GetApiKeys_RQ (authenticated AS the sub-user) ──
    if (action === 'list_child_api_keys') {
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: { code: 'RU_CHILD_AUTH_REQUIRED', message: CHILD_AUTH_REQUIRED_MESSAGE },
        }, 422);
      }
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<Pull_GetApiKeys_RQ>${buildChildAuthXml(childAuth)}</Pull_GetApiKeys_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return ruErrorResponse(
          status,
          buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'list_child_api_keys', response),
        );
      }
      const keys = [...response.matchAll(/<ApiKeys>([\s\S]*?)<\/ApiKeys>/gi)].map((m) => {
        const block = m[1];
        const pick = (tag: string) =>
          block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]?.trim() ?? null;
        return {
          access_key: pick('AccessKey'),
          label: pick('Label'),
          scope: pick('Scope'),
          created_at: pick('CreationTime'),
          last_used_at: pick('LastUsageDate'),
        };
      });
      return jsonResponse({ success: true, auth_mode: childAuthMode(childAuth), keys, count: keys.length });
    }

    // ── delete_child_api_key: Push_DeleteApiKey_RQ (authenticated AS the sub-user) ──
    if (action === 'delete_child_api_key') {
      const target = typeof body.target_access_key === 'string' ? body.target_access_key.trim() : '';
      if (!target) return errorResponse('MISSING_PARAM', 'target_access_key is required');
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: { code: 'RU_CHILD_AUTH_REQUIRED', message: CHILD_AUTH_REQUIRED_MESSAGE },
        }, 422);
      }
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<Push_DeleteApiKey_RQ>${buildChildAuthXml(childAuth)}<AccessKey>${escapeXml(target)}</AccessKey></Push_DeleteApiKey_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return ruErrorResponse(
          status,
          buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'delete_child_api_key', response),
        );
      }
      return jsonResponse({ success: true, deleted_access_key: target });
    }

    /**
     * ── archive_user: Push_ArchiveUser_RQ (authenticated AS the sub-account) ──
     * The channel's "close user account" verb. It carries NO account selector: whoever the
     * <Authentication> block resolves to is the account that gets closed. That makes a
     * MASTER pair catastrophic here, so this action refuses anything that is not a proven
     * child pair (or the sub-account's own portal login), and refuses outright when the
     * OwnerID still has a live ROLOS binding.
     *
     * The channel warns the call is resource-heavy, can take minutes, and that a timeout
     * should be retried with the same request — so transport failures are retried here, and
     * the rate-limit statuses (-5 concurrency, -6 sliding window) are surfaced as a distinct
     * RATE_LIMITED outcome instead of a hard failure.
     */
    if (action === 'archive_user') {
      const targetOwnerId = String(body.owner_id ?? '').trim();
      if (!/^\d+$/.test(targetOwnerId)) {
        return errorResponse('MISSING_PARAM', 'owner_id (RU OwnerID) is required to close a sub-account');
      }
      if (isMasterOwnerId(targetOwnerId)) {
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_MASTER_ACCOUNT_REFUSED',
            message: 'That OwnerID is our own master channel account. Closing it is refused.',
          },
        }, 422);
      }

      // A bound account is live inventory: the retire flow must disconnect it first.
      try {
        const { data: bound } = await getLogClient()
          .from('ru_owner_accounts')
          .select('id')
          .eq('ru_owner_id', targetOwnerId)
          .limit(1);
        if ((bound ?? []).length > 0) {
          return jsonResponse({
            success: false,
            error: {
              code: 'RU_ACCOUNT_STILL_BOUND',
              message: `OwnerID ${targetOwnerId} is still bound to a property or portfolio. Retire the binding before closing the account.`,
            },
          }, 409);
        }
      } catch (e) {
        console.warn('[rentalsunited-api] archive_user binding check failed', e);
      }

      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_CHILD_AUTH_REQUIRED',
            message: `${CHILD_AUTH_REQUIRED_MESSAGE} The close verb has no account selector, so it can only run as the sub-account itself.`,
          },
        }, 422);
      }
      const scopeCheck = await assertChildKeysAreNotMaster(creds, childAuth, targetOwnerId);
      if (!scopeCheck.ok) {
        return jsonResponse({
          success: false,
          auth_mode: childAuthMode(childAuth),
          error: {
            code: 'RU_KEYS_ARE_MASTER_PAIR',
            message: `${scopeCheck.message} Closing an account with a master pair would close OUR master account, so it is refused.`,
          },
        }, 422);
      }

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<Push_ArchiveUser_RQ>${buildChildAuthXml(childAuth)}</Push_ArchiveUser_RQ>`;

      // The channel explicitly says a timeout does not mean the close failed: retry the
      // very same request. Transport errors get the same treatment, with a widening pause.
      const maxAttempts = 3;
      let response: string | null = null;
      let transportError: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          response = await callRentalsUnited(creds, xml);
          transportError = null;
          break;
        } catch (e) {
          transportError = e;
          if (e instanceof RuRateDeferredError) throw e;
          console.warn(`[rentalsunited-api] archive_user attempt ${attempt}/${maxAttempts} failed`, e);
          if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, attempt * 5000));
        }
      }
      if (response == null) {
        return jsonResponse({
          success: false,
          auth_mode: childAuthMode(childAuth),
          error: {
            code: 'RU_TRANSPORT_FAILED',
            message: `The close request could not be completed after ${maxAttempts} attempts: ${transportError instanceof Error ? transportError.message : String(transportError)}. The channel may still be processing it — re-read the roster before retrying.`,
          },
        }, 502);
      }

      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        const rateLimited = status.id === '-5' || status.id === '-6';
        return jsonResponse({
          success: false,
          auth_mode: childAuthMode(childAuth),
          ru_status_id: status.id ?? null,
          ru_status_message: status.message ?? null,
          error: {
            code: rateLimited ? 'RU_RATE_LIMITED' : 'RU_ERROR',
            ru_status_id: status.id ?? null,
            message: rateLimited
              ? `The channel rate limited the close request: ${status.message} Wait out the window and run it again.`
              : status.message,
          },
          diagnostics: buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'archive_user', response),
        }, rateLimited ? 429 : 200);
      }

      return jsonResponse({
        success: true,
        auth_mode: childAuthMode(childAuth),
        owner_id: targetOwnerId,
        response_id: response.match(/<ResponseID>([\s\S]*?)<\/ResponseID>/i)?.[1]?.trim() ?? null,
        message: `The channel accepted the close request for OwnerID ${targetOwnerId}.`,
      });
    }





    // ── Child-scoped auth resolution ─────────────────────────
    // Every action below that touches ONE sub-user's inventory authenticates as that
    // sub-user when API keys are on file, so the listing lands on the sub-account.
    const childScoped = CHILD_SCOPED_ACTIONS.has(action);
    const childResolution = childScoped
      ? await resolveChildAuthDetailed(body)
      : { auth: null, reason: null };
    const childAuth = childResolution.auth;
    const authMode = childAuthMode(childAuth);
    const ownerScope = body.owner_id == null ? '' : String(body.owner_id).trim();
    if (childScoped) {
      console.log(`[rentalsunited-api] ${action} auth_mode=${authMode} owner_id=${ownerScope || 'n/a'}`);
    }

    /**
     * 🔒 Archive-only escalation. A retired, unbound sub-account holds no inventory worth
     * protecting, and the channel refuses to mint keys for it — so removing its footprint
     * is the ONE write allowed to run on master credentials scoped by OwnerID. Granted only
     * when the caller asks for it, the verb archives/deactivates, and the OwnerID is proven
     * to sit in our retired registry. Every other write keeps the master-pair prohibition.
     */
    let archiveRetiredGranted = false;
    const archiveIntentAction =
      (action === 'set_property_status' &&
        (body.metadata?.is_archived === true || body.metadata?.is_active === false)) ||
      // The enumeration that feeds the archive run needs the same envelope, otherwise we
      // would be archiving ids we never read back from the channel.
      action === 'list_properties';
    if (
      body.archive_retired === true &&
      archiveIntentAction &&
      ownerScope &&
      !isMasterOwnerId(ownerScope)
    ) {

      try {
        const { data: retired } = await getLogClient()
          .from('ru_retired_accounts')
          .select('ru_owner_id')
          .eq('ru_owner_id', ownerScope)
          .maybeSingle();
        archiveRetiredGranted = Boolean(retired);
      } catch (e) {
        console.warn('[rentalsunited-api] retired registry lookup failed', e);
      }
      console.log(
        `[rentalsunited-api] archive_retired intent for OwnerID ${ownerScope}: ${archiveRetiredGranted ? 'granted (master-scoped archive)' : 'refused — not in the retired registry'}`,
      );
    }

    // A master pair (or no keys at all) must not decide the envelope for the archive write:
    // fall back to explicit master credentials so the call is honest about what it is.
    const archiveOnMaster = archiveRetiredGranted;
    const scopedCreds = archiveOnMaster ? creds : effectiveCreds(creds, childAuth);

    if (childScoped && !childAuth && !archiveRetiredGranted) {

      // One rule for every child-scoped action (there is no longer a second, laxer set):
      //  • a named OwnerID that is not OUR master account ⇒ sub-user keys are mandatory;
      //  • a WRITE with no OwnerID at all ⇒ the credential choice would be inferred, refuse;
      //  • a READ with no OwnerID ⇒ explicit master-account scope, allowed and logged.
      const failure = ownerScope
        ? isMasterOwnerId(ownerScope)
          ? null
          : {
              code: 'RU_CHILD_AUTH_REQUIRED',
              message: `${childResolution.reason ?? CHILD_AUTH_REQUIRED_MESSAGE} Master-account fallback is prohibited for sub-user inventory.`,
              reason: `no_subuser_keys: ${childResolution.reason ?? CHILD_AUTH_REQUIRED_MESSAGE} Master-account fallback is prohibited for sub-user inventory.`,
            }
        : CHILD_SCOPED_WRITE_ACTIONS.has(action)
          ? {
              code: 'RU_OWNER_ID_REQUIRED',
              message: `${action} writes to a single Rentals United account, so it must name the owner_id it is writing to. Master-account fallback is prohibited.`,
              reason: `missing_owner_id: ${action} was invoked without an owner_id; master-account fallback is prohibited for sub-user writes.`,
            }
          : null;

      if (failure) {
        // Certification evidence: a cancel/reject/push that never left ROLOS must still be
        // retrievable, otherwise "no log row" is indistinguishable from "it worked".
        await logRuNotAttempted(getLogClient(), {
          ...(ruLogContext.getStore() ?? {}),
          action: RU_VERB_BY_ACTION[action] ?? `rentalsunited-api:${action}`,
          error_reason: failure.reason,
        });
        return jsonResponse({
          success: false,
          auth_mode: 'master',
          error: { code: failure.code, message: failure.message },
        }, 422);
      }

      console.log(
        `[rentalsunited-api] ${action} running on MASTER credentials (owner_id=${ownerScope || 'unscoped read'})`,
      );
    }

    // 🔒 Master-footprint guard: a sub-account WRITE may never run on a key pair that
    // actually authenticates as our master account (see assertChildKeysAreNotMaster).
    if (
      childScoped &&
      CHILD_SCOPED_WRITE_ACTIONS.has(action) &&
      childAuth?.mode === 'keys' &&
      ownerScope &&
      !archiveRetiredGranted &&
      !isMasterOwnerId(ownerScope)
    ) {

      const scopeCheck = await assertChildKeysAreNotMaster(creds, childAuth, ownerScope);
      if (!scopeCheck.ok) {
        await logRuNotAttempted(getLogClient(), {
          ...(ruLogContext.getStore() ?? {}),
          action: RU_VERB_BY_ACTION[action] ?? `rentalsunited-api:${action}`,
          error_reason: `master_pair_keys: ${scopeCheck.message}`,
        });
        return jsonResponse({
          success: false,
          auth_mode: authMode,
          error: { code: 'RU_KEYS_ARE_MASTER_PAIR', message: scopeCheck.message },
        }, 422);
      }
    }





    // ── list_properties ──
    if (action === 'list_properties') {
      const ownerId = await resolveOwnerId(creds, body.owner_id);
      if (!ownerId) {
        return errorResponse('MISSING_PARAM', 'Rentals United OwnerID could not be resolved. Pass owner_id or set the RU_OWNER_ID secret.');
      }

      const forceFresh = body.force_fresh === true || body.force_cache_refresh === true;
      const cacheOnly = body.cache_only === true;
      if (!forceFresh) {
        const cached = await readRuOwnerListingCache(getLogClient(), ownerId, { allowStale: cacheOnly });
        if (cached.hit) {
          return jsonResponse({
            success: true,
            properties: cached.listings,
            count: cached.listings.length,
            owner_id: ownerId,
            auth_mode: childAuthMode(childAuth),
            cached: true,
            cache_fetched_at: cached.fetchedAt,
            cache_stale: cached.stale,
          });
        }
        if (cacheOnly) {
          return jsonResponse({
            success: true,
            queued: true,
            properties: [],
            count: 0,
            owner_id: ownerId,
            auth_mode: childAuthMode(childAuth),
            cached: false,
            message: 'No cached channel listing snapshot yet — run a manual reconciliation refresh.',
          }, 202);
        }
      }

      const xml = buildListPropertiesXml(scopedCreds, ownerId);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);

      const properties = extractPropertyIds(response);
      const cacheFetchedAt = await writeRuOwnerListingCache(getLogClient(), ownerId, properties, String(body.parent_action ?? `rentalsunited-api:${action}`));
      return jsonResponse({
        success: true,
        properties,
        count: properties.length,
        owner_id: ownerId,
        auth_mode: childAuthMode(childAuth),
        cached: false,
        cache_fetched_at: cacheFetchedAt,
      });
    }

    // ── get_property ──
    if (action === 'get_property') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const xml = buildGetPropertyXml(scopedCreds, ru_property_id);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      // Surface the currency RU actually holds so callers can verify instead of assume.
      // Pull_ListSpecProp_RS carries it as an ISO attribute: <Property Currency="USD">.
      const RU_ISO_BY_ID: Record<number, string> = { 48: 'ZAR', 144: 'USD', 47: 'EUR', 49: 'GBP', 91: 'NAD', 24: 'BWP' };
      const RU_ID_BY_ISO: Record<string, number> = Object.fromEntries(Object.entries(RU_ISO_BY_ID).map(([id, iso]) => [iso, Number(id)]));
      const isoMatch = response.match(/<Property\b[^>]*\bCurrency="([A-Za-z]{3})"/i);
      const ccyMatch = response.match(/<CurrencyID>\s*(\d+)\s*<\/CurrencyID>/i);
      let currencyIso: string | null = isoMatch ? isoMatch[1].toUpperCase() : null;
      let currencyId: number | null = ccyMatch ? parseInt(ccyMatch[1], 10) : null;
      if (!currencyIso && currencyId != null) currencyIso = RU_ISO_BY_ID[currencyId] ?? null;
      if (currencyId == null && currencyIso) currencyId = RU_ID_BY_ISO[currencyIso] ?? null;
      const locMatch = response.match(/<DetailedLocationID\b[^>]*>\s*(\d+)\s*</i);
      return jsonResponse({
        success: true,
        auth_mode: authMode,
        currency_id: currencyId,
        currency_iso: currencyIso,
        detailed_location_id: locMatch ? parseInt(locMatch[1], 10) : null,
        raw_xml: response,
      });
    }


    // ── get_availability ──
    if (action === 'get_availability') {
      if (!ru_property_id || !date_from || !date_to) return errorResponse('MISSING_PARAM', 'ru_property_id, date_from, date_to are required');
      const xml = buildGetAvailabilityXml(scopedCreds, ru_property_id, date_from, date_to);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, auth_mode: authMode, raw_xml: response });
    }

    // ── get_prices ──
    if (action === 'get_prices') {
      if (!ru_property_id || !date_from || !date_to) return errorResponse('MISSING_PARAM', 'ru_property_id, date_from, date_to are required');
      const xml = buildGetPricesXml(scopedCreds, ru_property_id, date_from, date_to);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, auth_mode: authMode, raw_xml: response });
    }


    // ── list_reservations ──
    // Statuses default to Confirmed + Cancelled + Request + Approved so pending requests
    // shown in the RU multicalendar are actually returned. Callers may override.
    if (action === 'list_reservations') {
      if (!date_from || !date_to) return errorResponse('MISSING_PARAM', 'date_from and date_to are required');
      const requestedStatuses = Array.isArray(body.statuses)
        ? (body.statuses as unknown[]).map((s) => Number(s)).filter((s) => Number.isFinite(s) && s > 0)
        : RU_DEFAULT_RESERVATION_STATUSES;
      const xml = buildListReservationsXml(scopedCreds, date_from, date_to, requestedStatuses);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, auth_mode: authMode, statuses: requestedStatuses, raw_xml: response });
    }


    // ── get_reservation_by_id (mandatory: reservation detail) ──
    // Pull_GetReservationByID_RQ — one reservation, full detail. Parsed through the same
    // shared parser the ingest path uses so callers get an identical shape.
    if (action === 'get_reservation_by_id') {
      const reservationId = typeof body.reservation_id === 'string' ? body.reservation_id.trim() : '';
      if (!reservationId) return errorResponse('MISSING_PARAM', 'reservation_id is required');
      const xml = buildGetReservationByIdXml(scopedCreds, reservationId);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);

      const blocks = extractAllBlocks(response, 'Reservation');
      const reservation = blocks.length ? parseRuReservation(blocks[0]) : null;
      return jsonResponse({
        success: true,
        auth_mode: authMode,
        reservation_id: reservationId,
        found: !!reservation?.ruReservationId,
        reservation,
        raw_xml: response,
      });
    }





    // ── get_leads (optional) ──
    if (action === 'get_leads') {
      if (!date_from || !date_to) return errorResponse('MISSING_PARAM', 'date_from and date_to are required');
      const xml = buildGetLeadsXml(scopedCreds, date_from, date_to);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, auth_mode: authMode, raw_xml: response });
    }


    // ── push_property (mandatory) ──
    if (action === 'push_property') {
      if (ru_property_id == null || ru_property_id === undefined) return errorResponse('MISSING_PARAM', 'ru_property_id is required (use 0 for new properties)');
      if (!body.property) return errorResponse('MISSING_PARAM', 'property payload is required');
      const p = body.property;
      if (!Number.isFinite(Number(p.owner_id)) || Number(p.owner_id) <= 0) {
        return errorResponse('RU_OWNER_ID_REQUIRED', 'A positive linked sub-user owner_id is required; master-account fallback is prohibited');
      }
      if (!p.name || !p.property_type_id || !p.can_sleep_max || p.floor == null || !p.space) {
        return errorResponse('VALIDATION', 'Property must include name, property_type_id, can_sleep_max, floor, and space');
      }
      if (!p.street || !p.detailed_location_id || !p.zip_code) {
        return errorResponse('VALIDATION', 'Property must include street, detailed_location_id, and zip_code');
      }
      if (p.latitude == null || p.longitude == null) {
        return errorResponse('VALIDATION', 'Property must include latitude and longitude');
      }
      if (!p.amenities || p.amenities.length < 10) {
        return errorResponse('VALIDATION', 'Property must include at least 10 amenities');
      }
      if (!p.rooms || p.rooms.length === 0) {
        return errorResponse('VALIDATION', 'Property must include at least 1 room');
      }
      // Only enforce 10-image minimum for NEW properties (ru_property_id === 0)
      if (ru_property_id === 0 && (!p.images || p.images.length < 10)) {
        return errorResponse('VALIDATION', 'Property must include at least 10 images');
      }
      if (!p.payment_methods || p.payment_methods.length === 0) {
        return errorResponse('VALIDATION', 'Property must include at least 1 payment method');
      }
      if (!p.cancellation_policies || p.cancellation_policies.length === 0) {
        return errorResponse('VALIDATION', 'Property must include at least 1 cancellation policy');
      }
      if (!Number.isFinite(p.currency_id) || (p.currency_id as number) <= 0) {
        return errorResponse('VALIDATION', 'Property must include a valid RU currency_id (e.g. 48=ZAR, 144=USD, 91=NAD)');
      }
      if (!Number.isFinite(p.detailed_location_id) || (p.detailed_location_id as number) <= 1) {
        // RU LocationID 1 = Andorra/test sentinel. Reject so we never accidentally tag SA/NA properties as Andorra.
        return errorResponse('VALIDATION', 'Property must include a resolvable detailed_location_id (>1). Got: ' + p.detailed_location_id);
      }

      /**
       * Duplicate-listing safety. A create (`ru_property_id === 0`) is the only call that can
       * mint a new listing, so it must never run on a guess:
       *   1. Attraction distances are never sent on a create — RU answers status 92 for them on
       *      some accounts, and a failed create may still have registered the listing, which is
       *      how the account collected duplicates. Distances ride along on updates only.
       *   2. Before composing the XML we read the owner's ENTIRE listing list (archived included)
       *      and adopt a name match. An archived match is reactivated and updated instead of
       *      creating a second copy.
       *   3. If that read fails or is throttled we REFUSE the create (`RU_ADOPTION_UNVERIFIED`).
       *      Falling through to a blind create is what minted whole new generations of listings.
       */
      let effectiveRuPropertyId = ru_property_id as number;
      let adoptedExistingListing: { id: number; name: string; was_archived: boolean } | null = null;
      let reactivatedListing = false;
      if (effectiveRuPropertyId === 0) {
        p.distances = [];
        const normaliseName = (v: string) =>
          String(v ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
        let listing: OwnerListingRow | undefined;
        const ownerId = Number(p.owner_id);
        const wanted = normaliseName(p.name as string);
        let snapshot = readOwnerListingSnapshot(ownerId);
        if (!snapshot) {
          /**
           * Cross-instance reuse: onboarding Step A already paid for this exact
           * `Pull_ListOwnerProp_RQ` seconds ago (adoption / resolve_ru_property_ids) and persisted
           * it. The in-memory snapshot is isolate-local, so the publish used to re-read the same
           * owner and get throttled twice before finally succeeding ~77s later. An EMPTY listing
           * array inside the window is a valid hit — treating it as a miss is what re-opened the
           * storm.
           */
          const shared = await readRuOwnerListingCache(getLogClient(), ownerId, {
            maxAgeMs: RU_RATE_WINDOW_SECONDS * 1000,
          });
          if (shared.hit) {
            snapshot = shared.listings.map((l) => ({
              id: String(l.id),
              name: String(l.name ?? ''),
              is_archived: l.is_archived === true,
            }));
            writeOwnerListingSnapshot(ownerId, snapshot);
            console.log(
              `[rentalsunited-api] adoption reused the shared listing snapshot for OwnerID ${ownerId} (${snapshot.length} listing(s), fetched ${shared.fetchedAt}) — no Pull_ListOwnerProp_RQ`,
            );
          }
        }
        if (snapshot) {
          // Already read inside the channel's sliding window by an earlier unit of this push.
          listing = snapshot.find((l) => normaliseName(l.name) === wanted);
        } else {
          try {
            const listXml = await callRentalsUnited(scopedCreds, buildListPropertiesXml(scopedCreds, ownerId));
            const listStatus = handleRUStatus(listXml);
            if (!listStatus.ok) {
              return errorResponse(
                'RU_ADOPTION_UNVERIFIED',
                `Could not read the account's existing listings (${listStatus.status.id}: ${listStatus.status.message}) — refusing to create a listing that may already exist. Retry shortly.`,
              );
            }
            const listings = extractPropertyIds(listXml) as OwnerListingRow[];
            writeOwnerListingSnapshot(ownerId, listings);
            await writeRuOwnerListingCache(getLogClient(), ownerId, listings, 'rentalsunited-api:push_property_adoption');
            listing = listings.find((l) => normaliseName(l.name) === wanted);
          } catch (e) {

            // A gate deferral means the read never happened — nothing was created, so the caller
            // can safely retry. Carry the gate's own wait so it paces instead of guessing.
            if (e instanceof RuRateDeferredError) {
              return jsonResponse({
                success: false,
                error: {
                  code: 'RU_ADOPTION_UNVERIFIED',
                  rate_deferred: true,
                  rate_deferred_code: RU_RATE_DEFERRED_CODE,
                  retry_after_ms: e.waitMs,
                  message: `Could not read the account's existing listings (${e.message}) — refusing to create a listing that may already exist. Retry shortly.`,
                },
                retry_after_ms: e.waitMs,
              }, 429);
            }
            return errorResponse(
              'RU_ADOPTION_UNVERIFIED',
              `Could not read the account's existing listings (${e instanceof Error ? e.message : String(e)}) — refusing to create a listing that may already exist. Retry shortly.`,
            );
          }
        }


        if (listing) {
          effectiveRuPropertyId = parseInt(listing.id, 10);
          adoptedExistingListing = { id: effectiveRuPropertyId, name: listing.name, was_archived: listing.is_archived === true };
          console.log(
            `[rentalsunited-api] Adopting existing listing ${listing.id} for "${p.name}"${listing.is_archived ? ' (archived — reactivating)' : ''} instead of creating a duplicate`,
          );
          if (listing.is_archived === true) {
            try {
              const statusXml = buildSetPropertyStatusXml(scopedCreds, effectiveRuPropertyId, true, false);
              const statusResp = await callRentalsUnited(scopedCreds, statusXml);
              const reactivateStatus = handleRUStatus(statusResp);
              reactivatedListing = reactivateStatus.ok;
              if (!reactivateStatus.ok) {
                console.warn(
                  `[rentalsunited-api] Reactivation of ${effectiveRuPropertyId} refused (${reactivateStatus.status.id}: ${reactivateStatus.status.message}) — continuing with the content update`,
                );
              }
            } catch (e) {
              console.warn('[rentalsunited-api] Reactivation call failed:', e instanceof Error ? e.message : String(e));
            }
          }
        }
      }


      let xml = buildPushPropertyXml(scopedCreds, effectiveRuPropertyId, p);
      let compactRequestXml = compactXml(xml);

      console.log(`[rentalsunited-api] Push XML length: ${compactRequestXml.length}, ru_property_id: ${effectiveRuPropertyId}, dry_run: ${body.dry_run === true}`);


      // ── Dry-run short-circuit: compose XML, validate, do NOT POST to RU ──
      if (body.dry_run === true) {
        return jsonResponse({
          success: true,
          dry_run: true,
          message: 'Dry-run: XML composed and validated; no HTTP POST sent to Rentals United',
          validation: {
            ru_property_id: effectiveRuPropertyId,
            adopted_existing_listing: adoptedExistingListing,

            building_id: p.building_id ?? null,
            name: p.name,
            amenities_count: p.amenities?.length ?? 0,
            images_count: p.images?.length ?? 0,
            rooms_count: p.rooms?.length ?? 0,
            payment_methods_count: p.payment_methods?.length ?? 0,
            cancellation_policies_count: p.cancellation_policies?.length ?? 0,
            xml_length: compactRequestXml.length,
          },
          compact_xml: sanitizeXmlForLogs(compactRequestXml),
        });
      }

      console.log(`[rentalsunited-api] XML first 300 chars: ${previewXml(sanitizeXmlForLogs(compactRequestXml), 300)}`);
      let response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] RU push response: ${response.substring(0, 500)}`);
      let { ok, status } = handleRUStatus(response);

      /**
       * Gate #10 fallback — attraction distances are a nice-to-have and must never cost us the
       * content push. RU answers status 92 "Duplicate value in distances." for some listings even
       * when every entry we send is unique, so the rule lives on their side. When that happens,
       * re-send once without the <Distances> block.
       *
       * Idempotency: distances are never sent on a create, so this retry always targets an
       * existing listing id. If RU nevertheless returned an id on the failed attempt we adopt it
       * before retrying, so the retry can never mint a second listing.
       */
      let distancesSkipped = 0;
      if (!ok && Array.isArray(p.distances) && p.distances.length > 0 && /distance/i.test(String(status.message ?? ''))) {
        distancesSkipped = p.distances.length;
        const idFromFailure = extractReturnedPropertyId(response);
        if (effectiveRuPropertyId === 0 && idFromFailure) {
          console.warn(`[rentalsunited-api] Failed create returned listing ${idFromFailure} — retrying as an update, not a create`);
          effectiveRuPropertyId = idFromFailure;
        }
        console.warn(`[rentalsunited-api] RU rejected distances (${status.id}: ${status.message}) — retrying without the <Distances> block`);
        const retryPayload = { ...p, distances: [] };
        xml = buildPushPropertyXml(scopedCreds, effectiveRuPropertyId, retryPayload);
        compactRequestXml = compactXml(xml);
        response = await callRentalsUnited(scopedCreds, xml);
        const retryStatus = handleRUStatus(response);
        ok = retryStatus.ok;
        status = retryStatus.status;
        if (!ok) distancesSkipped = 0;
      }

      if (!ok) {
        const diag = buildDiagnostics(compactRequestXml, status, 'push_property', response);
        console.error(`[rentalsunited-api] RU error ${status.id}: ${status.message}`);
        console.error(`[rentalsunited-api] XML context around error: ${diag.xml_context}`);
        // A create that failed may still have registered the listing at RU. Hand the id back so
        // the caller stores it and pushes an update next time instead of creating a duplicate.
        const strandedId = effectiveRuPropertyId === 0 ? extractReturnedPropertyId(response) : null;
        return ruErrorResponse(status, { ...diag, stranded_ru_property_id: strandedId });
      }


      // RU answers a create with <ID>…</ID> and (historically) <PropertyID>…</PropertyID>.
      const returnedPropertyId = extractReturnedPropertyId(response) ?? (effectiveRuPropertyId > 0 ? effectiveRuPropertyId : null);


      // ── Persist authoritative snake_case mapping on properties row ──
      let mapping_persisted = false;
      let mapping_error: string | null = null;
      if (returnedPropertyId && body.property_uuid) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { error: upErr } = await supabase
            .from('properties')
            .update({
              rentalsunited_property_id: String(returnedPropertyId),
              rentalsunited_building_id: p.building_id != null ? String(p.building_id) : null,
            })
            .eq('id', body.property_uuid);
          if (upErr) {
            mapping_error = upErr.message;
          } else {
            mapping_persisted = true;
          }
        } catch (e) {
          mapping_error = e instanceof Error ? e.message : String(e);
        }
      }

      // Keep the snapshot truthful: a listing just created (or adopted) must be visible to the
      // next unit of this push AND to the next invocation, which reads the shared cache instead
      // of the channel.
      if (returnedPropertyId != null) {
        const ownerIdNum = Number(p.owner_id);
        const snap = readOwnerListingSnapshot(ownerIdNum);
        if (snap) {
          const idStr = String(returnedPropertyId);
          const next = snap.filter((l) => String(l.id) !== idStr);
          next.push({ id: idStr, name: String(p.name ?? ''), is_archived: false });
          writeOwnerListingSnapshot(ownerIdNum, next);
          await writeRuOwnerListingCache(getLogClient(), ownerIdNum, next, 'rentalsunited-api:push_property_result');
        }
      }


      return jsonResponse({

        success: true,
        message: distancesSkipped > 0
          ? `Property pushed successfully — ${distancesSkipped} attraction distance(s) skipped (channel rejected them)`
          : 'Property pushed successfully',
        auth_mode: authMode,
        ru_property_id: returnedPropertyId,
        adopted_existing_listing: adoptedExistingListing,
        reactivated_listing: reactivatedListing,
        was_create: (ru_property_id as number) === 0 && !adoptedExistingListing,

        building_id: p.building_id ?? null,

        distances_pushed: distancesSkipped > 0 ? 0 : (Array.isArray(p.distances) ? p.distances.length : 0),
        distances_skipped: distancesSkipped,

        mapping: {
          persisted: mapping_persisted,
          property_uuid: body.property_uuid ?? null,
          system_type: 'rentalsunited',
          rentalsunited_property_id: returnedPropertyId,
          rentalsunited_building_id: p.building_id ?? null,
          error: mapping_error,
        },
        raw_xml: response,
        diagnostics: {
          request_preview: previewXml(sanitizeXmlForLogs(compactRequestXml), 600),
          request_xml: sanitizeXmlForLogs(compactRequestXml),
          response_preview: previewXml(response, 600),
        },
      });
    }

    // ── push_availability (mandatory) ──
    if (action === 'push_availability') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.availability || body.availability.length === 0) return errorResponse('MISSING_PARAM', 'availability array is required');
      const xml = buildPushAvailabilityXml(scopedCreds, ru_property_id, body.availability);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Availability pushed successfully', auth_mode: authMode, raw_xml: response });
    }

    // ── push_prices (mandatory) ──
    // RU returns Status 0 (full success) or Status 5 (partial — see <Notifs>) per
    // https://developer.rentalsunited.com/#put-prices. Treat 5 as partial-success.
    if (action === 'push_prices') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.prices || body.prices.length === 0) return errorResponse('MISSING_PARAM', 'prices array is required');
      for (const p of body.prices) {
        const err = validatePriceEntry(p);
        if (err) return errorResponse('INVALID_PARAM', `Invalid price entry: ${err}`);
      }
      const xml = buildPushPricesXml(scopedCreds, ru_property_id, body.prices);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, partial, status, notifs } = parseDiscountResponse(response);
      if (!ok && !partial) {
        // Surface the per-range <Notifs> detail — the bare status message
        // ("Warning! Look at Notifs collection.") is not actionable on its own.
        const notifDetail = notifs.map((n) => `${n.date_from ?? '?'}→${n.date_to ?? '?'}: ${n.message}`).join(' | ');
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_ERROR',
            message: notifDetail ? `${status.message} — ${notifDetail}` : status.message,
            ru_status_id: status.id,
          },
          notifs,
          diagnostics: buildDiagnostics(compactXml(xml), status, 'push_prices', response),
        });
      }
      return jsonResponse({
        success: true,
        partial,
        message: partial ? 'Prices pushed with partial errors' : 'Prices pushed successfully',
        auth_mode: authMode,
        notifs,
        raw_xml: response,
      });
    }

    // ── push_prices_fsp (Full Stay Pricing matrix — alternative to push_prices) ──
    if (action === 'push_prices_fsp') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.fsp_seasons || body.fsp_seasons.length === 0) return errorResponse('MISSING_PARAM', 'fsp_seasons array is required');
      for (const s of body.fsp_seasons) {
        const err = validateFspSeason(s);
        if (err) return errorResponse('INVALID_PARAM', `Invalid FSP season: ${err}`);
      }
      const xml = buildPushFspPricesXml(scopedCreds, ru_property_id, body.fsp_seasons);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, partial, status, notifs } = parseDiscountResponse(response);
      if (!ok && !partial) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        partial,
        message: partial ? 'FSP prices pushed with partial errors' : 'FSP prices pushed successfully',
        auth_mode: authMode,
        notifs,

        raw_xml: response,
      });
    }

    // ── subscribe_notifications (mandatory RNLM) ──
    if (action === 'subscribe_notifications') {
      if (!body.handler_url) return errorResponse('MISSING_PARAM', 'handler_url is required');
      // Per-account registration: each white-label sub-user must register the handler with
      // its OWN credentials, otherwise RU never pushes that sub-user's reservations to us.
      const xml = buildSubscribeNotificationsXml(scopedCreds, body.handler_url);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, auth_mode: authMode, message: 'Notification handler registered successfully', raw_xml: response });
    }

    // ── put_lnm_subscriptions (LNM content/ARI webhooks) ──
    if (action === 'put_lnm_subscriptions') {
      if (!body.url_base) return errorResponse('MISSING_PARAM', 'url_base is required');
      const changeTypes = (body.change_types?.length ? body.change_types : DEFAULT_LNM_CHANGE_TYPES)
        .map((t) => String(t).trim())
        .filter(Boolean);
      const unknown = changeTypes.filter((t) => !KNOWN_LNM_CHANGE_TYPE_IDS.has(t));
      if (unknown.length) {
        return errorResponse('INVALID_PARAM', `Unknown LNM change type(s): ${unknown.join(', ')}`);
      }
      const observedOwners = (body.observed_owners ?? [])
        .map((o) => String(o).trim())
        .filter((o) => /^\d+$/.test(o));
      if (observedOwners.length === 0) {
        return errorResponse(
          'MISSING_PARAM',
          'observed_owners is required — RU needs at least one OwnerID to observe for this account',
        );
      }
      const xml = buildPutLnmSubscriptionsXml(scopedCreds, changeTypes, observedOwners, body.url_base);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        auth_mode: authMode,
        message: `LNM subscriptions registered for ${changeTypes.length} change type(s) across ${observedOwners.length} owner(s)`,
        subscribed: { change_types: changeTypes, observed_owners: observedOwners, url_base: body.url_base },
        raw_xml: response,
      });
    }

    // ── list_lnm_subscriptions (read-back verification) ──
    if (action === 'list_lnm_subscriptions') {
      const xml = buildListLnmSubscriptionsXml(scopedCreds);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      const subscriptions = parseLnmSubscriptions(response);
      return jsonResponse({ success: true, auth_mode: authMode, subscriptions, raw_xml: response });
    }

    // ── list_lnm_change_types (dictionary) ──
    if (action === 'list_lnm_change_types') {
      const xml = buildListLnmChangeTypesXml(scopedCreds);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, auth_mode: authMode, change_types: parseLnmChangeTypes(response), raw_xml: response });

    }

    // ── list_sales_channels (Pull_ListSalesChannels_RQ) ──
    // Sales channels belong to the channel-manager (master) account, so this read always
    // runs on master credentials. Pass channel_name to get a best-match resolution back
    // (e.g. "LekkeSlaap" / "Lekke Slaap" / "lekkeslaap").
    if (action === 'list_sales_channels') {
      const xml = buildListSalesChannelsXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      const channels = parseSalesChannels(response);
      const wanted = String(body.channel_name ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const norm = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const matched = wanted
        ? channels.find((c) => norm(c.company_name) === wanted)
          ?? channels.find((c) => norm(c.company_name).includes(wanted) || wanted.includes(norm(c.company_name)))
          ?? null
        : null;
      return jsonResponse({
        success: true,
        auth_mode: 'master_channel_manager',
        channels,
        channel_count: channels.length,
        matched,
        raw_xml: response,
      });
    }

    // ── list_property_types (Pull_ListPropTypes_RQ) ──
    // The property-type dictionary belongs to the channel manager account, so this read
    // always runs on master credentials. Results are cached in `ru_property_types` so the
    // property editor can offer exactly the types the channel accepts.
    if (action === 'list_property_types') {
      const xml = buildListPropertyTypesXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      const propertyTypes = parsePropertyTypes(response);

      let synced = 0;
      let sync_error: string | null = null;
      if (propertyTypes.length > 0) {
        try {
          const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          );
          const now = new Date().toISOString();
          const { error: upErr } = await supabase.from('ru_property_types').upsert(
            propertyTypes.map((t) => ({
              ru_type_id: t.ru_type_id,
              name: t.name,
              slug: t.slug,
              is_active: true,
              synced_at: now,
            })),
            { onConflict: 'ru_type_id' },
          );
          if (upErr) sync_error = upErr.message;
          else synced = propertyTypes.length;
        } catch (err) {
          sync_error = err instanceof Error ? err.message : 'Unknown cache error';
        }
      }

      return jsonResponse({
        success: true,
        auth_mode: 'master_channel_manager',
        property_types: propertyTypes,
        type_count: propertyTypes.length,
        synced,
        sync_error,
        raw_xml: response,
      });
    }

    // ── list_destinations (attraction/distance dictionary) ──
    // The <Distances> block in Push_PutProperty_RQ references destination ids from a
    // channel-owned dictionary. Verified live: Pull_ListDestinations_RQ answers with ~33 800
    // <Destination DestinationID="…">Name</Destination> entries, most of them city specific.
    // We cache the whole list and flag the generic, location-agnostic entries (Beach, Sea,
    // Airport, Restaurant, …) — only those are ever mapped, so no id is invented locally.
    if (action === 'list_destinations') {
      const xml = `<?xml version="1.0" encoding="utf-8"?>\n<Pull_ListDestinations_RQ>\n  ${buildAuthXml(creds)}\n</Pull_ListDestinations_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);

      const entries: Array<{ ru_destination_id: number; name: string }> = [];
      const re = /<Destination\s+DestinationID="(\d+)"\s*>([\s\S]*?)<\/Destination>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(response)) !== null) {
        const id = parseInt(m[1], 10);
        const name = m[2].replace(/&amp;/g, '&').trim();
        if (Number.isFinite(id) && name) entries.push({ ru_destination_id: id, name });
      }

      /**
       * The list is flat and unscoped: hosts have created their own entries over the years, so
       * a generic name such as "Beach" appears hundreds of times with different ids. The
       * lowest id per generic name is the original platform entry, so only that one is flagged
       * generic and therefore mappable — the rest stay in the cache as reference data.
       */
      const lowestGenericId = new Map<string, number>();
      for (const e of entries) {
        if (!isGenericDestination(e.name)) continue;
        const slug = normalizeDestinationName(e.name);
        const current = lowestGenericId.get(slug);
        if (current === undefined || e.ru_destination_id < current) lowestGenericId.set(slug, e.ru_destination_id);
      }
      const rows = entries.map((e) => ({
        ru_destination_id: e.ru_destination_id,
        name: e.name,
        slug: normalizeDestinationName(e.name),
        is_generic: lowestGenericId.get(normalizeDestinationName(e.name)) === e.ru_destination_id,
        synced_at: new Date().toISOString(),
      }));

      let synced = 0;
      let sync_error: string | null = null;
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        for (let i = 0; i < rows.length; i += 1000) {
          const { error: upErr } = await supabase
            .from('ru_destinations')
            .upsert(rows.slice(i, i + 1000), { onConflict: 'ru_destination_id' });
          if (upErr) { sync_error = upErr.message; break; }
          synced += Math.min(1000, rows.length - i);
        }
      } catch (err) {
        sync_error = err instanceof Error ? err.message : 'Unknown cache error';
      }

      return jsonResponse({
        success: true,
        auth_mode: 'master_channel_manager',
        raw_sample: body?.debug ? response.slice(0, 3000) : undefined,
        destination_count: rows.length,
        generic_count: rows.filter((r) => r.is_generic).length,
        synced,
        sync_error,
      });
    }





    // ── get_property_discounts (verification) ──
    // One documented method returns BOTH ladders. The two legacy action names are kept as
    // aliases so existing callers keep working; they now all send Pull_ListPropertyDiscounts_RQ.
    if (action === 'get_property_discounts' || action === 'get_long_stay_discounts' || action === 'get_last_minute_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const xml = buildGetPropertyDiscountsXml(scopedCreds, ru_property_id);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, ru_method: 'Pull_ListPropertyDiscounts_RQ', raw_xml: response });
    }


    // ── push_long_stay_discounts (optional) ──
    if (action === 'push_long_stay_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.discounts || body.discounts.length === 0) return errorResponse('MISSING_PARAM', 'discounts array is required');
      for (const d of body.discounts) {
        const err = validateDiscountEntry(d);
        if (err) return errorResponse('INVALID_PARAM', `Invalid long stay discount: ${err}`);
      }
      const xml = buildPushLongStayDiscountsXml(scopedCreds, ru_property_id, body.discounts);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status, partial, notifs } = parseDiscountResponse(response);
      if (!ok && !partial) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        partial,
        message: partial ? 'Long stay discounts pushed with partial errors' : 'Long stay discounts pushed successfully',
        auth_mode: authMode,
        notifs,
        raw_xml: response,
      });
    }

    // ── push_last_minute_discounts (optional) ──
    if (action === 'push_last_minute_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.discounts || body.discounts.length === 0) return errorResponse('MISSING_PARAM', 'discounts array is required');
      for (const d of body.discounts) {
        const err = validateDiscountEntry(d);
        if (err) return errorResponse('INVALID_PARAM', `Invalid last minute discount: ${err}`);
      }
      const xml = buildPushLastMinuteDiscountsXml(scopedCreds, ru_property_id, body.discounts);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status, partial, notifs } = parseDiscountResponse(response);
      if (!ok && !partial) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        partial,
        message: partial ? 'Last minute discounts pushed with partial errors' : 'Last minute discounts pushed successfully',
        auth_mode: authMode,
        notifs,
        raw_xml: response,
      });
    }

    // ── set_property_status ──
    if (action === 'set_property_status') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const isActive = body.metadata?.is_active !== false;
      const isArchived = body.metadata?.is_archived === true;
      const xml = buildSetPropertyStatusXml(scopedCreds, ru_property_id, isActive as boolean, isArchived as boolean);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] SetStatus response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        auth_mode: archiveOnMaster ? 'master_scoped_archive' : authMode,
        envelope: archiveOnMaster ? 'master_scoped_archive' : 'child_keys',
        message: 'Property status updated',
        raw_xml: response,
      });

    }

    // ── delete_property ──
    // The channel API has NO hard-delete method (`Push_DeleteProperty_RQ` /
    // `Push_RemoveProperty_RQ` are not published and answered Status -1
    // "The XML contains not implemented method" on every attempt). The documented
    // retirement path is Push_SetPropertiesStatus_RQ with IsArchived=1, so that is
    // what we do — and we report it as an archive, never as a deletion.
    if (action === 'delete_property') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const xml = buildSetPropertyStatusXml(scopedCreds, ru_property_id, false, true);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        supported: false,
        archived: true,
        auth_mode: archiveOnMaster ? 'master_scoped_archive' : authMode,
        verb: 'Push_SetPropertiesStatus_RQ',
        message: 'The channel does not support listing deletion — the listing was archived (deactivated) instead',
        raw_xml: response,
      });
    }




    // ── get_location_by_coordinates ──
    if (action === 'get_location_by_coordinates') {
      const lat = (metadata as any)?.latitude;
      const lng = (metadata as any)?.longitude;
      if (!lat || !lng) return errorResponse('MISSING_PARAM', 'metadata.latitude and metadata.longitude are required');
      
      const xml = `<Pull_GetLocationByCoordinates_RQ>${buildAuthXml(creds)}<Latitude>${lat}</Latitude><Longitude>${lng}</Longitude></Pull_GetLocationByCoordinates_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] Location lookup response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      
      // Extract LocationID from response
      const locMatch = response.match(/LocationID="(\d+)"/);
      const locationId = locMatch ? parseInt(locMatch[1], 10) : null;
      return jsonResponse({ success: true, location_id: locationId, raw_xml: response });
    }

    // ── push_building ──
    // 🔒 ADAPTER LOCK (RU child isolation): Push_PutBuilding_RQ has NO <OwnerID> element in the
    // RU schema — the building is created on whichever account authenticates. Falling back to the
    // parent AccessKey/SecretKey therefore creates the building on the MASTER account, which is
    // forbidden in a White-Label integration. Child credentials are mandatory; never add a
    // parent fallback here.
    if (action === 'push_building') {
      if (!body.building_name) return errorResponse('MISSING_PARAM', 'building_name is required');
      const childAuth = await resolveChildAuth(body);
      const bId = body.building_id || 0;
      // 🔒 Duplicate guard: RU has no idempotent "upsert building" — a Push_PutBuilding_RQ with no
      // <BuildingID> always CREATES. Callers must either update a known building or state creation
      // intent explicitly (`create: true`); anything else is refused so repeat pushes and cron runs
      // can never fan out into duplicate building containers.
      if (bId <= 0 && body.create !== true) {
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_BUILDING_CREATE_NOT_ALLOWED',
            message: 'Refusing to create a Rentals United building: no building_id supplied and create:true was not requested. Units are pushed as standalone properties by default — buildings are opt-in.',
          },
        }, 422);
      }
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_CHILD_AUTH_REQUIRED',
            message: CHILD_AUTH_REQUIRED_MESSAGE,
          },
        }, 422);
      }
      const xml = buildPushBuildingXml(creds, bId, body.building_name, body.unit_types, childAuth);

      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      console.log(`[rentalsunited-api] Push building (auth=${childAuthMode(childAuth)}) ok=${ok} response: ${response.substring(0, 500)}`);
      if (!ok) {
        return ruErrorResponse(
          status,
          buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'push_building', response),
        );
      }
      const buildingId = extractBuildingId(response);
      const unitTypeObjectIds = extractUnitTypeObjectIds(response);
      return jsonResponse({
        success: true,
        building_id: buildingId ? parseInt(buildingId, 10) : null,
        unit_type_object_ids: unitTypeObjectIds,
        auth_mode: childAuthMode(childAuth),
        message: 'Building pushed successfully',
        raw_xml: response,
        diagnostics: {
          request_preview: previewXml(sanitizeXmlForLogs(compactXml(xml)), 600),
          request_xml: sanitizeXmlForLogs(compactXml(xml)),
          response_preview: previewXml(response, 600),
          unit_type_count: unitTypeObjectIds.length,
        },
      });
    }

    // ── list_buildings ──
    // Child-scoped only (see push_building lock note): the parent envelope would list the
    // master account's buildings and cross-contaminate thewhite-label client's inventory.
    if (action === 'list_buildings') {
      const { auth: childAuth, reason } = await resolveChildAuthDetailed(body);
      // 🔒 ADAPTER LOCK — child isolation: Pull_ListBuildings_RQ has no <OwnerID>, so a
      // master envelope would list OUR buildings. Fail loudly instead of falling back.
      if (!childAuth) {
        return jsonResponse({
          success: false,
          auth_mode: 'master',
          error: { code: 'RU_CHILD_AUTH_REQUIRED', message: reason ?? CHILD_AUTH_REQUIRED_MESSAGE },
        }, 422);
      }
      const xml = buildListBuildingsXml(creds, childAuth);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'list_buildings', response));
      const buildings = extractBuildings(response);
      return jsonResponse({ success: true, auth_mode: childAuthMode(childAuth), buildings, count: buildings.length, raw_xml: response });
    }




    // ── list_composition_rooms ──
    // Fetch the global RU dictionary of valid CompositionRoomIDs so we can
    // populate <CompositionRoomsAmenities> with real IDs (avoids Status 6).
    if (action === 'list_composition_rooms') {
      const xml = buildListCompositionRoomsXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'list_composition_rooms', response));
      const rooms = extractCompositionRooms(response);
      return jsonResponse({
        success: true,
        composition_rooms: rooms,
        count: rooms.length,
        raw_xml: response,
      });
    }

    // ── list_amenities / sync_amenities ──
    // Pull RU's global amenity dictionary. `sync_amenities` additionally caches the
    // result in public.ru_amenities so the ROLOS amenity picker works without a live call.
    if (action === 'list_amenities' || action === 'sync_amenities') {
      const xml = buildListAmenitiesXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, action, response));
      const amenities = extractAmenities(response);

      let synced = 0;
      let sync_error: string | null = null;
      if (action === 'sync_amenities' && amenities.length > 0) {
        try {
          const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          );
          const now = new Date().toISOString();
          const { error: upErr } = await supabase.from('ru_amenities').upsert(
            amenities.map((a) => {
              const cls = classifyAmenity(a.name, a.id);
              return {
                id: a.id,
                name: a.name,
                ru_group_id: a.group_id,
                category: cls.category,
                is_recommended: cls.is_recommended,
                is_active: true,
                synced_at: now,
              };
            }),
            { onConflict: 'id' },
          );

          if (upErr) sync_error = upErr.message;
          else synced = amenities.length;
        } catch (e) {
          sync_error = e instanceof Error ? e.message : String(e);
        }
      }

      return jsonResponse({
        success: true,
        amenities,
        count: amenities.length,
        synced,
        sync_error,
      });
    }



    // ── get_building ──
    // Read-only: fetch a building's composition (UnitsComposition) so we can backfill
    // unit_type_object_ids in pms_mappings without re-pushing the building.
    if (action === 'get_building') {
      const bId = body.building_id;
      if (!bId) return errorResponse('MISSING_PARAM', 'building_id is required');
      const { auth: childAuth, reason } = await resolveChildAuthDetailed(body);
      // Child-scoped only: no parent fallback (a building only exists on the account that
      // created it, and the parent envelope would read the master account's buildings).
      if (!childAuth) {
        return jsonResponse({
          success: false,
          auth_mode: 'master',
          error: { code: 'RU_CHILD_AUTH_REQUIRED', message: reason ?? CHILD_AUTH_REQUIRED_MESSAGE },
        }, 422);
      }
      const xml = buildGetBuildingXml(creds, parseInt(String(bId), 10), childAuth);
      const response = await callRentalsUnited(creds, xml);


      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'get_building', response));
      const buildingId = extractBuildingId(response);
      const nameMatch = response.match(/<BuildingName>([\s\S]*?)<\/BuildingName>/i);
      const unitTypeObjectIds = extractUnitTypeObjectIds(response);
      return jsonResponse({
        success: true,
        building_id: buildingId ? parseInt(buildingId, 10) : parseInt(String(bId), 10),
        building_name: nameMatch ? nameMatch[1].trim() : null,
        unit_type_object_ids: unitTypeObjectIds,
        unit_type_count: unitTypeObjectIds.length,
        raw_xml: response,
      });
    }

    // assign_building_properties removed — not a valid RU API method.
    // Units are assigned to buildings via <BuildingID> in each unit's property push XML.

    // ── create_user ──
    if (action === 'create_user') {
      if (!body.user) return errorResponse('MISSING_PARAM', 'user payload is required (first_name, last_name, email, password)');
      const { first_name, last_name, email, password } = body.user;
      if (!first_name || !last_name || !email || !password) return errorResponse('VALIDATION', 'user must include first_name, last_name, email, and password');

      // RU password policy: 12+ chars, lower, upper, digit, special, must not contain the email
      const pwdOk = String(password).length >= 12
        && /[a-z]/.test(password) && /[A-Z]/.test(password)
        && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)
        && !String(password).toLowerCase().includes(String(email).toLowerCase());
      if (!pwdOk) {
        return errorResponse('VALIDATION', "Password must be 12+ characters with an uppercase letter, a lowercase letter, a number and a special character, and must not contain the user's email");
      }

      const rawLocations = Array.isArray(body.location_ids)
        ? body.location_ids
        : (body.location_id != null ? [body.location_id] : []);
      // The LocationId comes from the property setup and is used as given. Only blank,
      // zero and non-numeric values are dropped — 1 is a valid channel LocationId and
      // was previously discarded by a `> 1` filter.
      const locationIds = rawLocations.map((v: unknown) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0);
      if (locationIds.length === 0) {
        return errorResponse('VALIDATION', 'At least one valid Rentals United LocationId is required to create a sub-user (location_id or location_ids)');
      }

      const pmsId = Number(body.pms_id ?? Deno.env.get('RU_PMS_ID') ?? 0);
      const xml = buildCreateUserXml(
        creds,
        { first_name, last_name, email, password },
        locationIds,
        Number.isFinite(pmsId) && pmsId > 0 ? pmsId : null,
      );
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] CreateUser response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      // Push_CreateUser_RS carries ONLY Status and ResponseID — no account id. Any id we
      // used to "parse" here was always empty, so the caller must resolve the new OwnerID
      // from Pull_ListMyUsers_RQ. `user_account_id` is echoed only when the channel ever
      // sends one and must never be treated as authoritative.
      const userAccountId = extractUserAccountId(response);
      return jsonResponse({
        success: true,
        user_account_id: userAccountId,
        identity_authoritative: false,
        message: 'User created successfully — resolve the OwnerID from the master roster',
        raw_xml: response,
      });
    }



    // ── list_users ──
    if (action === 'list_users') {
      const xml = buildListUsersXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      const all = extractUsers(response);
      // Retired test sub-accounts are filtered here, at the single source every
      // consumer reads, so none of them can be counted, read or pushed to again.
      // `include_retired` exists only for the admin screen that reviews retirements.
      const retired = body.include_retired === true ? new Set<string>() : await fetchRetiredRuOwnerIds();
      const users = all.filter((u: { owner_id?: string }) => !retired.has(String(u.owner_id ?? '').trim()));
      const excluded = all.length - users.length;
      if (excluded > 0) {
        console.log(`[rentalsunited-api] list_users: excluded ${excluded} retired sub-account(s): ${[...retired].join(', ')}`);
      }
      return jsonResponse({
        success: true,
        users,
        count: users.length,
        retired_owner_ids: [...retired],
        retired_excluded_count: excluded,
        raw_xml: response,
      });
    }


    // ── fill_company_details ──
    if (action === 'fill_company_details') {
      if (!body.company) return errorResponse('MISSING_PARAM', 'company payload is required');
      const missing = missingCompanyFields(body.company);
      if (missing.length > 0) {
        return jsonResponse({
          success: false,
          error: {
            code: 'COMPANY_DETAILS_INCOMPLETE',
            message: `Rentals United requires these company/contact fields: ${missing.join(', ')}`,
            missing,
          },
        }, 422);
      }
      const ownerId = Number(body.owner_id);
      if (!Number.isFinite(ownerId) || ownerId <= 0) {
        return errorResponse('MISSING_PARAM', 'A valid owner_id is required for company details');
      }
      const maskXml = (x: string) =>
        compactXml(x)
          .replace(/<Password>[\s\S]*?<\/Password>/g, '<Password>***</Password>')
          .replace(/<SecretKey>[\s\S]*?<\/SecretKey>/g, '<SecretKey>***</SecretKey>');
      // 🔒 ADAPTER LOCK (RU child isolation): Push_FillCompanyDetails_RQ has NO <OwnerID> element
      // in the RU schema — RU applies the details to whichever identity authenticates. Using the
      // parent AccessKey/SecretKey therefore overwrites the MASTER company profile, never the
      // child's. Child UserName/Password is the only valid path; never add a parent fallback.
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        await logRuNotAttempted(getLogClient(), {
          ...(ruLogContext.getStore() ?? {}),
          action: 'Push_FillCompanyDetails_RQ',
          ru_owner_id: ownerId,
          error_reason: `no_subuser_login: ${CHILD_AUTH_REQUIRED_MESSAGE}`,
        });
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_CHILD_AUTH_REQUIRED',
            message: CHILD_AUTH_REQUIRED_MESSAGE,
          },
        }, 422);
      }
      const xml = buildFillCompanyDetailsXml(creds, body.company as RUCompanyPayload, ownerId, childAuth);

      // The company profile is a certification gate, and RU answers it with transient faults often
      // enough that a single attempt leaves the account stuck at "pending". Retry the transient
      // classes only (rate limit, upstream 5xx, timeout); a validation or credential rejection is
      // final and must surface immediately.
      const COMPANY_RETRY_BACKOFF_MS = [2_000, 6_000];
      const transientCompanyStatus = (id: string, message: string): boolean => {
        if (id && ['-6', '3', '99'].includes(id)) return true;
        return /rate limit|timeout|timed out|temporar|try again|internal server|service unavailable|502|503|504/i
          .test(message ?? '');
      };

      let response = '';
      let status: { id: string; message: string } = { id: '', message: '' };
      let ok = false;
      let attempts = 0;
      let lastTransportError: string | null = null;

      for (let attempt = 1; attempt <= COMPANY_RETRY_BACKOFF_MS.length + 1; attempt++) {
        attempts = attempt;
        try {
          response = await callRentalsUnited(creds, xml);
          lastTransportError = null;
          ({ ok, status } = handleRUStatus(response));
        } catch (callErr) {
          // A rate deferral is handled by the outer queue/replay path — never swallow it here.
          if (callErr instanceof RuRateDeferredError) throw callErr;
          ok = false;
          lastTransportError = callErr instanceof Error ? callErr.message : String(callErr);
          status = { id: '', message: lastTransportError };
        }
        console.log(
          `[rentalsunited-api] FillCompanyDetails attempt ${attempt} (auth=${childAuthMode(childAuth)}, owner=${ownerId}) ok=${ok} status=${status.id || 'n/a'} ${(response || lastTransportError || '').substring(0, 300)}`,
        );
        if (ok) break;
        const retryable = lastTransportError !== null || transientCompanyStatus(status.id, status.message);
        const wait = COMPANY_RETRY_BACKOFF_MS[attempt - 1];
        if (!retryable || wait === undefined) break;
        console.warn(`[rentalsunited-api] FillCompanyDetails transient failure — retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }

      if (ok) {
        return jsonResponse({
          success: true,
          message: 'Company details filled successfully',
          auth_mode: childAuthMode(childAuth),
          owner_id: String(ownerId),
          attempts,
          raw_xml: response,
        });
      }
      return ruErrorResponse(
        { ...status, message: status.message || 'Company details push failed' },
        {
          ...buildDiagnostics(maskXml(xml), status, 'fill_company_details', response),
          attempts,
          transport_error: lastTransportError,
        },
      );

    }


    // ── order_mcq: CM_LNM_OrderMinimumContentQualityCheck_RQ (Phase 4.3) ──
    // 🔒 Auth rule (verified against RU 2026-08-04):
    //   • Sub-user (child) credentials are the ONLY identity that can order MCQ for a
    //     white-label listing. Master channel-manager keys answer 56 "Property does not
    //     exist" because the sub-user's inventory is not in the master's own portfolio.
    //   • The account ordering the check must first hold an LNM subscription including the
    //     PropertyMCQEligibilityCheck change type, otherwise RU answers 280
    //     "Subscribe to LNM first". We self-heal that once, then retry.
    //   • RU status 17 ("Unexpected error, contact IT") is an RU-side fault: it is retried
    //     once after a short settle, then surfaced with the RU ResponseID for escalation.
    if (action === 'order_mcq') {
      const ruPropertyId = Number(body.ru_property_id);
      if (!ruPropertyId) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const forcedScope = String(body.auth_scope ?? '').trim().toLowerCase();
      const useMaster = forcedScope === 'master';
      const attemptCreds = useMaster ? creds : scopedCreds;
      const attemptAuth = useMaster ? 'master_channel_manager' : authMode;

      // 🔒 ChannelID is MANDATORY in the RU schema for CM_LNM_* methods. Omitting it makes RU
      // answer the generic status 17 ("Unexpected error, contact IT") instead of a field error.
      //
      // ChannelID is per-property: it identifies the sales channel the listing is connected to,
      // so a property is only MCQ-checkable against the channels it has activated. Resolution
      // order (narrowest wins) — this becomes fully property-driven once the channel API
      // integration lands and connections are stored per property:
      //   1. explicit body.channel_id (caller override / cert console)
      //   2. ru_platform_settings key `ru_channel_id:<property_id>` (property-scoped)
      //   3. ru_platform_settings key `ru_channel_id` (account-wide default)
      //   4. RU_CHANNEL_ID env (integration-wide fallback)
      let channelId = Number(body.channel_id ?? 0);
      let channelSource = channelId ? 'request' : 'unresolved';
      const scopedPropertyId = body.property_id ? String(body.property_id) : '';
      if (!channelId) {
        try {
          const settingsClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          );
          const keys = scopedPropertyId
            ? [`ru_channel_id:${scopedPropertyId}`, 'ru_channel_id']
            : ['ru_channel_id'];
          const { data: settingRows } = await settingsClient
            .from('ru_platform_settings')
            .select('key, value')
            .in('key', keys);
          for (const key of keys) {
            const row = (settingRows ?? []).find((r: { key: string }) => r.key === key);
            const raw = row?.value as unknown;
            const candidate = Number(
              typeof raw === 'object' && raw !== null
                ? ((raw as { channel_id?: unknown }).channel_id ?? 0)
                : raw ?? 0,
            );
            if (candidate > 0) {
              channelId = candidate;
              channelSource = key.includes(':') ? 'property_setting' : 'account_setting';
              break;
            }
          }
        } catch (settingsErr) {
          console.warn('[rentalsunited-api] OrderMCQ channel setting lookup failed', settingsErr);
        }
      }
      if (!channelId) {
        channelId = Number(Deno.env.get('RU_CHANNEL_ID') ?? 0);
        if (channelId) channelSource = 'env';
      }
      if (!channelId) {
        return errorResponse(
          'MISSING_RU_CHANNEL_ID',
          'Rentals United requires a ChannelID for the content quality check, scoped to a channel this property has activated. Store it per property (ru_platform_settings key ru_channel_id:<property_id>), account-wide (ru_channel_id) or as RU_CHANNEL_ID, or pass channel_id with the request.',
        );
      }
      console.log(
        `[rentalsunited-api] OrderMCQ resolved ChannelID=${channelId} (source=${channelSource}, property=${scopedPropertyId || 'n/a'})`,
      );


      const attempt = async () => {
        const xml = `<?xml version="1.0" encoding="utf-8"?>\n<CM_LNM_OrderMinimumContentQualityCheck_RQ>${buildAuthXml(attemptCreds)}<ChannelID>${channelId}</ChannelID><PropertyID>${ruPropertyId}</PropertyID></CM_LNM_OrderMinimumContentQualityCheck_RQ>`;
        const response = await callRentalsUnited(attemptCreds, xml);
        const { ok, status } = handleRUStatus(response);
        console.log(
          `[rentalsunited-api] OrderMCQ (auth=${attemptAuth}, channel=${channelId}, ru_property=${ruPropertyId}) ok=${ok} status=${status?.id ?? 'n/a'} response: ${response.substring(0, 500)}`,
        );
        return { ok, status, xml, response };
      };

      let result = await attempt();
      const statusId = () => String(result.status?.id ?? '');

      // 280 → register the missing LNM subscription for this identity, then retry once.
      if (!result.ok && statusId() === '280' && ownerId) {
        const lnmUrlBase = String(
          body.url_base ?? `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/ru-lnm-handler`,
        );
        const subXml = buildPutLnmSubscriptionsXml(
          attemptCreds,
          DEFAULT_LNM_CHANGE_TYPES,
          [String(ownerId)],
          lnmUrlBase,
        );
        const subResponse = await callRentalsUnited(attemptCreds, subXml);
        const subStatus = handleRUStatus(subResponse);
        console.log(`[rentalsunited-api] OrderMCQ auto-subscribed LNM ok=${subStatus.ok} status=${subStatus.status?.id ?? 'n/a'}`);
        if (subStatus.ok) {
          await new Promise((r) => setTimeout(r, 2000));
          result = await attempt();
        }
      }


      // 17 → transient RU fault; one settle-and-retry before escalating.
      if (!result.ok && statusId() === '17') {
        await new Promise((r) => setTimeout(r, 5000));
        result = await attempt();
      }

      if (!result.ok) {
        const responseId = result.response.match(/<ResponseID>([^<]+)<\/ResponseID>/i)?.[1] ?? null;
        if (statusId() === '17') {
          return jsonResponse({
            success: false,
            error: {
              code: 'RU_MCQ_INTERNAL_ERROR',
              message:
                'Rentals United returned status 17 (internal error) for the content quality check. The LNM subscription is confirmed on this account, so this needs RU support with the ResponseID below.',
              ru_status_id: '17',
              ru_response_id: responseId,
              auth_mode: attemptAuth,
              ru_property_id: ruPropertyId,
            },
            diagnostics: buildDiagnostics(compactXml(result.xml), result.status, 'order_mcq', result.response),
          }, 200);
        }
        return ruErrorResponse(
          result.status,
          buildDiagnostics(compactXml(result.xml), result.status, 'order_mcq', result.response),
        );
      }
      return jsonResponse({
        success: true,
        auth_mode: attemptAuth,
        ru_property_id: ruPropertyId,
        ru_status_id: result.status?.id ?? null,
        message: 'Minimum Content Quality check ordered',
        raw_xml: result.response,
      });
    }




    // ── get_location_by_name ──
    // Pull_GetLocationByName_RQ — find a LocationID by free-text name. Better than coords for
    // ambiguous spots (e.g. "Stilbaai" returns the actual locality LocationID).
    if (action === 'get_location_by_name') {
      const name = (body.location_name || (metadata as any)?.location_name || '').toString().trim();
      if (!name) return errorResponse('MISSING_PARAM', 'location_name is required');
      const xml = `<Pull_GetLocationByName_RQ>${buildAuthXml(creds)}<LocationName>${escapeXml(name)}</LocationName></Pull_GetLocationByName_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] get_location_by_name response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'get_location_by_name', response));
      const idMatch = response.match(/<LocationID[^>]*>(\d+)<\/LocationID>/i);
      const locationId = idMatch ? parseInt(idMatch[1], 10) : null;
      return jsonResponse({ success: true, location_id: locationId, raw_xml: response });
    }

    // ── list_cities_and_currencies ──
    // Pull_ListCurrenciesWithCities_RQ — list every RU city with its country + assigned currency.
    // Used to seed the public.ru_locations cache. Optionally filtered by country IDs in body.country_ids.
    if (action === 'list_cities_and_currencies') {
      // Pull_ListCurrenciesWithCities_RQ — returns every RU city with its assigned currency.
      // Shape: <City CurrencyCode="ZAR" LocationID="1611" Name="Cape Town">...</City>
      // (NOTE: Pull_ListCitiesProps_RQ is a different endpoint — it only lists cities where
      // THIS account already has active props. We need the master list to detect currency drift
      // on locations we haven't pushed yet.)
      const xml = `<Pull_ListCurrenciesWithCities_RQ>${buildAuthXml(creds)}</Pull_ListCurrenciesWithCities_RQ>`;
      let response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] list_cities_and_currencies response (first 800): ${response.substring(0, 800)}`);
      let { ok, status } = handleRUStatus(response);

      // Many integrations do not have the master city/currency dictionary enabled
      // ("The XML contains not implemented method"). Fall back to the cities where this
      // account already holds props — that response carries CurrencyCode per city too.
      let usedFallback = false;
      if (!ok && /not implemented/i.test(status.message || '')) {
        const fbXml = `<Pull_ListCitiesProps_RQ>${buildAuthXml(creds)}</Pull_ListCitiesProps_RQ>`;
        const fbResponse = await callRentalsUnited(creds, fbXml);
        console.log(`[rentalsunited-api] list_cities_and_currencies fallback (first 800): ${fbResponse.substring(0, 800)}`);
        const fb = handleRUStatus(fbResponse);
        if (fb.ok) {
          response = fbResponse;
          ok = true;
          status = fb.status;
          usedFallback = true;
        } else {
          // Neither dictionary is available — report as an excluded capability rather than
          // a hard failure so callers can fall back to the per-location currency probe.
          return jsonResponse({
            success: true,
            locations: [],
            count: 0,
            endpoint_disabled: true,
            note: 'Rentals United has not enabled Pull_ListCurrenciesWithCities_RQ or Pull_ListCitiesProps_RQ for this integration — location currency is probed per property via Push_ChangeCurrency_RQ instead.',
          });
        }
      }
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'list_cities_and_currencies', response));


      const locs: Array<{ id: number; name: string; parent_id: number | null; currency_iso: string | null; type: number | null }> = [];

      // Try <City ...> first (the Pull_ListCurrenciesWithCities_RQ / Pull_ListCitiesProps_RQ shape).
      const cityRe = /<City\b([^>]*)(?:\/>|>([\s\S]*?)<\/City>)/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cityRe.exec(response)) !== null) {
        const attrs = cm[1] || '';
        const inner = cm[2] || '';
        const idAttr = /\bLocationID="(\d+)"/i.exec(attrs) || /\bID="(\d+)"/i.exec(attrs);
        const idInner = !idAttr ? /<ID[^>]*>(\d+)<\/ID>/i.exec(inner) : null;
        const id = idAttr ? parseInt(idAttr[1], 10) : (idInner ? parseInt(idInner[1], 10) : NaN);
        if (!Number.isFinite(id)) continue;
        const ccyAttr = /\bCurrencyCode="([A-Z]{3})"/i.exec(attrs);
        const nameAttr = /\bName="([^"]+)"/i.exec(attrs);
        const nameInner = !nameAttr ? /<Name[^>]*>([\s\S]*?)<\/Name>/i.exec(inner) : null;
        const parentAttr = /\bParentLocationID="(\d+)"/i.exec(attrs);
        const typeAttr = /\bType="(\d+)"/i.exec(attrs);
        const rawName = nameAttr ? nameAttr[1] : (nameInner ? nameInner[1].trim() : inner.replace(/<[^>]+>/g, '').trim());
        locs.push({
          id,
          name: rawName || `Location ${id}`,
          parent_id: parentAttr ? parseInt(parentAttr[1], 10) : null,
          currency_iso: ccyAttr ? ccyAttr[1].toUpperCase() : null,
          type: typeAttr ? parseInt(typeAttr[1], 10) : null,
        });
      }

      // Fallback: some deployments wrap in <Location ...> instead.
      if (locs.length === 0) {
        const locRe = /<Location\b([^>]*)(?:\/>|>([\s\S]*?)<\/Location>)/gi;
        let lm: RegExpExecArray | null;
        while ((lm = locRe.exec(response)) !== null) {
          const attrs = lm[1] || '';
          const inner = lm[2] || '';
          const idAttr = /\bLocationID="(\d+)"/i.exec(attrs) || /\bID="(\d+)"/i.exec(attrs);
          const idInner = !idAttr ? /<ID[^>]*>(\d+)<\/ID>/i.exec(inner) : null;
          const id = idAttr ? parseInt(idAttr[1], 10) : (idInner ? parseInt(idInner[1], 10) : NaN);
          if (!Number.isFinite(id)) continue;
          const ccyAttr = /\bCurrencyCode="([A-Z]{3})"/i.exec(attrs);
          const typeAttr = /\bType="(\d+)"/i.exec(attrs);
          const parentAttr = /\bParentLocationID="(\d+)"/i.exec(attrs);
          const nameInner = /<Name[^>]*>([\s\S]*?)<\/Name>/i.exec(inner);
          const name = nameInner ? nameInner[1].trim() : inner.replace(/<[^>]+>/g, '').trim();
          locs.push({
            id,
            name: name || `Location ${id}`,
            parent_id: parentAttr ? parseInt(parentAttr[1], 10) : null,
            currency_iso: ccyAttr ? ccyAttr[1].toUpperCase() : null,
            type: typeAttr ? parseInt(typeAttr[1], 10) : null,
          });
        }
      }

      return jsonResponse({ success: true, locations: locs, count: locs.length, used_fallback: usedFallback, raw_xml: response.length > 8000 ? response.substring(0, 8000) + '…[truncated]' : response });
    }

    // ── list_locations ──
    // Pull_ListLocations_RQ — RU's full location tree (countries → regions → cities →
    // neighbourhoods). This is the authoritative LocationID dictionary: every push that
    // carries a <LocationID> should reference an ID harvested here rather than a name guess.
    // Shape: <Location LocationID="1611" LocationTypeID="4" ParentID="1234">Cape Town</Location>
    if (action === 'list_locations') {
      const xml = `<Pull_ListLocations_RQ>${buildAuthXml(creds)}</Pull_ListLocations_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] list_locations response (first 600): ${response.substring(0, 600)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        if (/not implemented|not enabled/i.test(status.message || '')) {
          return jsonResponse({
            success: true,
            locations: [],
            count: 0,
            endpoint_disabled: true,
            note: 'Rentals United has not enabled Pull_ListLocations_RQ for this integration — LocationIDs are resolved per name via Pull_GetLocationByName_RQ instead.',
          });
        }
        return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'list_locations', response));
      }

      const locations: Array<{
        id: number;
        name: string;
        parent_id: number | null;
        location_type_id: number | null;
      }> = [];
      const locRe = /<Location\b([^>]*)(?:\/>|>([\s\S]*?)<\/Location>)/gi;
      let m: RegExpExecArray | null;
      while ((m = locRe.exec(response)) !== null) {
        const attrs = m[1] || '';
        const inner = m[2] || '';
        const idAttr = /\bLocationID="(\d+)"/i.exec(attrs) || /\bID="(\d+)"/i.exec(attrs);
        const idInner = !idAttr ? /<LocationID[^>]*>(\d+)<\/LocationID>/i.exec(inner) : null;
        const id = idAttr ? parseInt(idAttr[1], 10) : (idInner ? parseInt(idInner[1], 10) : NaN);
        if (!Number.isFinite(id)) continue;
        const typeAttr = /\bLocationTypeID="(\d+)"/i.exec(attrs) || /\bType="(\d+)"/i.exec(attrs);
        const parentAttr = /\bParentLocationID="(\d+)"/i.exec(attrs) || /\bParentID="(\d+)"/i.exec(attrs);
        const nameInner = /<Name[^>]*>([\s\S]*?)<\/Name>/i.exec(inner);
        const rawName = nameInner ? nameInner[1] : inner.replace(/<[^>]+>/g, '');
        const name = rawName.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        locations.push({
          id,
          name: name || `Location ${id}`,
          parent_id: parentAttr ? parseInt(parentAttr[1], 10) : null,
          location_type_id: typeAttr ? parseInt(typeAttr[1], 10) : null,
        });
      }

      return jsonResponse({ success: true, locations, count: locations.length });
    }


    // ── push_change_currency ──
    // Push_ChangeCurrency_RQ — set the currency for an entire RU location. Currency in RU
    // is owned by the LocationID, not by the property; this is the only way to make
    // <CurrencyID> on a property push actually stick on read.
    if (action === 'push_change_currency') {
      const locationId = body.location_id ?? (metadata as any)?.location_id;
      const currencyIso = (body.currency_iso || (metadata as any)?.currency_iso || '').toString().trim().toUpperCase();
      if (!locationId) return errorResponse('MISSING_PARAM', 'location_id is required');
      if (!currencyIso || !/^[A-Z]{3}$/.test(currencyIso)) return errorResponse('VALIDATION', 'currency_iso must be a 3-letter ISO code');
      // RU applies a location's currency to the AUTHENTICATING account only. Flipping as
      // the master account leaves every white-label sub-user on its default (USD), which
      // is invisible unless we refuse the master fallback outright.
      if (!childAuth && body.allow_master !== true) {
        return jsonResponse({
          success: false,
          auth_mode: authMode,
          error: {
            code: 'RU_CHILD_AUTH_REQUIRED',
            message: `${childResolution.reason ?? CHILD_AUTH_REQUIRED_MESSAGE} Push_ChangeCurrency applies to the authenticating account only, so a master-credential flip would leave the sub-user's inventory in its default currency. Pass the sub-user's API keys, or allow_master: true to change the master account's own location.`,
          },
        }, 422);
      }
      // RU allows one call per method with the same parameters per sliding minute, so a repeated
      // flip (diagnostics re-run, delta push, cert suite) hits our own rate gate and surfaces as a
      // 429 with no stored response — indistinguishable from "RU rejected ZAR". The flip is
      // idempotent, so if an identical flip already succeeded recently, answer from that instead
      // of spending a call.
      const locId = parseInt(String(locationId), 10);
      try {
        // A 339 ("already on that currency") answer counts as a confirmation: rows logged before
        // 339 was recognised as an acceptance carry success=false, so match on either signal or the
        // shortcut never fires and every run repeats a write the channel has already answered.
        const { data: recentRows } = await getLogClient()
          .from('ru_api_log')
          .select('created_at, status_id, response_id, success')
          .eq('action', 'Push_ChangeCurrency_RQ')
          .ilike('request_xml', `%<Location>${locId}</Location><Currency>${currencyIso}</Currency>%`)
          .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(5);
        const recent = ((recentRows ?? []) as Array<{ created_at: string; status_id: string | null; success: boolean | null }>)
          .find((row) => row.success === true || String(row.status_id ?? '').trim() === '339');
        if (recent) {
          return jsonResponse({
            success: true,
            auth_mode: authMode,
            already_set: true,
            skipped: 'recent_identical_success',
            location_id: locId,
            currency_iso: currencyIso,
            last_confirmed_at: recent.created_at,
            note: `Location ${locId} was already confirmed on ${currencyIso} at ${recent.created_at} (RU status ${recent.status_id ?? 'ok'}); the identical call was skipped to respect the channel's one-call-per-minute window.`,
          });
        }
      } catch (_e) {
        // Log lookup is an optimisation only — fall through to the live call.
      }



      const xml = `<Push_ChangeCurrency_RQ>${buildAuthXml(scopedCreds)}<Location>${locId}</Location><Currency>${currencyIso}</Currency></Push_ChangeCurrency_RQ>`;

      const compactRequestXml = compactXml(xml);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] push_change_currency (auth=${authMode}) response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      // Status 339 = "Location already has the requested currency set" — treat as success.
      if (!ok && status.id !== '339') {
        return ruErrorResponse(status, buildDiagnostics(compactRequestXml, status, 'push_change_currency', response));
      }
      return jsonResponse({
        success: true,
        auth_mode: authMode,
        already_set: status.id === '339',
        location_id: locId,
        currency_iso: currencyIso,
        raw_xml: response,
      });
    }


    // Every abort below the reservation verbs must leave a labelled "never attempted" row: the
    // certification auditor reads the exchange log, and a silent early return there is exactly
    // what made cancel/reject look unimplemented.
    const abortReservationVerb = async (reason: string, message: string) => {
      await logRuNotAttempted(getLogClient(), {
        ...(ruLogContext.getStore() ?? {}),
        action: RU_VERB_BY_ACTION[action] ?? `rentalsunited-api:${action}`,
        error_reason: reason,
        error_message: message,
      });
      return errorResponse('MISSING_PARAM', message);
    };

    // ── reject_request (preferred way to decline / cancel an unpaid RU request) ──
    if (action === 'reject_request') {
      const reservationId = body.reservation_id != null ? String(body.reservation_id).trim() : '';
      if (!reservationId) {
        return await abortReservationVerb('missing_reservation_id', 'reservation_id is required');
      }
      const xml = buildRejectRequestXml(scopedCreds, reservationId, body.reject_reason ?? '');
      const compactRequestXml = compactXml(xml);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] reject_request (auth=${authMode}) response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactRequestXml, status, 'reject_request', response));
      return jsonResponse({ success: true, auth_mode: authMode, raw_xml: response });
    }

    // ── confirm_request (accept a held request so stay modifications become possible) ──
    if (action === 'confirm_request') {
      const reservationId = body.reservation_id != null ? String(body.reservation_id).trim() : '';
      if (!reservationId) {
        return await abortReservationVerb('missing_reservation_id', 'reservation_id is required');
      }
      const xml = buildConfirmRequestXml(scopedCreds, reservationId, body.comments ?? '');
      const compactRequestXml = compactXml(xml);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] confirm_request (auth=${authMode}) response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_CONFIRM_REQUEST_FAILED',
            message: status.message ||
              'The channel did not accept this request. Accept it in the channel portal, then resend the change.',
            ru_status_id: status.id,
            diagnostics: buildDiagnostics(compactRequestXml, status, 'confirm_request', response),
          },
        });
      }
      return jsonResponse({ success: true, auth_mode: authMode, raw_xml: response });
    }



    // ── cancel_reservation (confirmed reservations; also a reject fallback) ──
    if (action === 'cancel_reservation') {
      const reservationId = body.reservation_id != null ? String(body.reservation_id).trim() : '';
      if (!reservationId) {
        return await abortReservationVerb('missing_reservation_id', 'reservation_id is required');
      }
      const cancelTypeId = Number(body.cancel_type_id) === 2 ? 2 : 1;
      const xml = buildCancelReservationXml(scopedCreds, reservationId, cancelTypeId);
      const compactRequestXml = compactXml(xml);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] cancel_reservation (auth=${authMode}) response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        // Status 178: the reservation originated in an external system (the sales channel)
        // and RU cannot cancel it. Non-retryable — the operator must cancel at the channel.
        if (status.id === '178') {
          return jsonResponse({
            success: false,
            error: {
              code: 'RU_CANCEL_NOT_ALLOWED',
              message: status.message ||
                'This reservation was made in an external system and cannot be cancelled in Rentals United. Please cancel it directly in the sales channel.',
              ru_status_id: status.id,
            },
          });
        }
        return ruErrorResponse(status, buildDiagnostics(compactRequestXml, status, 'cancel_reservation', response));
      }
      return jsonResponse({ success: true, auth_mode: authMode, cancel_type_id: cancelTypeId, raw_xml: response });
    }

    // ── modify_stay (dates / property / guests / price on a CONFIRMED reservation) ──
    if (action === 'modify_stay') {
      const reservationId = body.reservation_id != null ? String(body.reservation_id).trim() : '';
      if (!reservationId) {
        return await abortReservationVerb('missing_reservation_id', 'reservation_id is required');
      }
      const current = body.current_stay;
      if (!current?.ru_property_id || !current?.date_from || !current?.date_to) {
        return await abortReservationVerb(
          'missing_current_stay',
          'current_stay { ru_property_id, date_from, date_to } is required — RU needs the current state of the stay',
        );
      }
      const modify = body.modify_stay ?? {};
      const xml = buildModifyStayXml(scopedCreds, reservationId, current, modify);
      const compactRequestXml = compactXml(xml);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] modify_stay (auth=${authMode}) response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return ruErrorResponse(status, buildDiagnostics(compactRequestXml, status, 'modify_stay', response));
      }
      return jsonResponse({ success: true, auth_mode: authMode, raw_xml: response });
    }

    // ── push_confirmed_reservation (a stay created in ROL'OS handed to the channel) ──
    if (action === 'push_confirmed_reservation') {
      const stay = body.stay;
      if (!stay?.ru_property_id || !stay?.date_from || !stay?.date_to) {
        return await abortReservationVerb(
          'missing_stay',
          'stay { ru_property_id, date_from, date_to } is required',
        );
      }
      /**
       * RU rejects Push_PutConfirmedReservationMulti_RQ with "Guest email is required."
       * when <Email> is empty. Refuse pre-flight instead: the call cannot succeed, a retry
       * cannot fix it, and no guest address may be invented on the guest's behalf.
       */
      const guestEmail = String((body.guest ?? {}).email ?? '').trim();
      if (!guestEmail) {
        return await abortReservationVerb(
          'RU_GUEST_EMAIL_REQUIRED',
          'The channel requires a guest email address on a confirmed reservation. Add the guest email to the booking, then resend the stay.',
        );
      }
      const xml = buildPutConfirmedReservationXml(scopedCreds, stay, body.guest ?? {});

      const compactRequestXml = compactXml(xml);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(
        `[rentalsunited-api] push_confirmed_reservation (auth=${authMode}) response: ${response.substring(0, 500)}`,
      );
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        // Status 56: the listing we hold locally is not (or no longer) at the channel. Retrying
        // cannot fix a stale mapping — say so plainly so the operator republishes the unit.
        if (status.id === '56') {
          return jsonResponse({
            success: false,
            error: {
              code: 'RU_LISTING_MISSING',
              message: `The channel has no listing ${stay.ru_property_id} for this unit — republish the unit to the channel, then resend the stay.`,
              ru_status_id: status.id,
            },
          });
        }
        return ruErrorResponse(
          status,
          buildDiagnostics(compactRequestXml, status, 'push_confirmed_reservation', response),
        );
      }
      const reservationId = response.match(/<ReservationID>([^<]+)<\/ReservationID>/i)?.[1]?.trim() ?? null;
      return jsonResponse({
        success: true,
        auth_mode: authMode,
        reservation_id: reservationId,
        raw_xml: response,
      });
    }




    // Unknown action
    return errorResponse('UNKNOWN_ACTION', `Action "${action}" is not supported`);


  } catch (error) {
    // A rate deferral is not a fault: the channel simply owes this method another slot.
    if (error instanceof RuRateDeferredError) {
      console.warn(`[rentalsunited-api] ${RU_RATE_DEFERRED_CODE}: ${error.message}`);

      // Deferrable work is parked in the shared background queue and replayed by the drainer,
      // so nothing is lost while still honouring the channel's one-per-sliding-minute rule.
      // Reservation writes are queued too — an operator waiting on an acceptance is better served
      // by "queued, landing within a minute" than by a hard 429 — but they go in at priority 1 so
      // the drainer replays them ahead of the hundreds of background price/availability read-backs.
      const deferAction = String(requestBody?.action ?? 'ru_call');
      if (
        isDeferrableRuCall(requestBody as unknown as Record<string, unknown>) ||
        isReservationWriteAction(deferAction)
      ) {
        const action = deferAction;
        const queueId = await enqueueRuCall(getLogClient(), {
          methodKey: error.methodKey,
          action,
          payload: { ...(requestBody ?? {}), deferrable: false, queued_replay: true },
          ownerId: requestBody?.owner_id != null ? String(requestBody.owner_id) : null,
          propertyId: requestBody?.property_id ?? requestBody?.property_uuid ?? null,
          delayMs: error.waitMs,
          priority: ruQueuePriority(action),
        });
        if (queueId) {
          return jsonResponse({
            success: true,
            queued: true,
            queue_id: queueId,
            action,
            message: `Channel rate limit reached — "${action}" is queued and will run within a minute.`,
          }, 202);
        }
      }

      return jsonResponse({
        success: false,
        error: { code: RU_RATE_DEFERRED_CODE, message: error.message, retry_after_ms: error.waitMs },
      }, 429);
    }

    console.error('[rentalsunited-api] Error:', error);
    return jsonResponse({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});
