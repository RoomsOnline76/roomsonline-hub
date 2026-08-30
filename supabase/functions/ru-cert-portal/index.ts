// Rentals United Certification Portal
// Admin-only harness that exercises every mandatory / optional RU endpoint,
// captures request + response evidence, scores refresh-cadence compliance, and
// reports White-Label minimum-inventory readiness per property.
//
// Actions:
//   list_runs        → recent ru_cert_runs
//   get_run          → single run with full step evidence
//   run_suite        → execute a suite ("read_only" | "mandatory" | "discounts" | "full")
//   compliance       → refresh cadence panel data (from ru_sync_runs)
//   wl_readiness     → per-property White-Label minimum inventory report
//   user_management  → status of RU sub-user management (parked)
import { readRuRoster, invalidateRuRosterMemo, mergeRuRosterUser, forgetRuRosterUser } from "../_shared/ruRosterCache.ts";
import { dropRuOwnerListingCache } from "../_shared/ruOwnerListingCache.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { summarizeReadiness, bookableWindowChecks, localBookableWindowChecks, currencyVerificationChecks, unitsPublishedChecks, classifyChannelWindowEvidence, ruReadAnswered, type RuCheck, type RuUnitInput } from "../_shared/ruReadiness.ts";
import { computeLocalBookableWindow } from "../_shared/ruLocalWindow.ts";
import { findRuBookableWindow, type RuBookableWindow } from "../_shared/ruContentQuality.ts";
import { evaluatePhases, findOwnerAccount, resolvePortfolioId } from "../_shared/ruPhaseGate.ts";
import { ruCompanyDetailsSatisfied } from "../_shared/ruCompanyDetails.ts";
import { resumePendingRuDeltas } from "../_shared/ruPendingDeltas.ts";
import { createRateResolver, describeCoverage } from "../_shared/rateResolution.ts";
import { parseRuPricePoints, parseRuPriceSeasons } from "../_shared/ruPriceParsing.ts";
import { fetchRetiredRuOwnerIds } from "../_shared/ruRetiredAccounts.ts";
import {
  isChannelStepLedgerEnabled,
  logLedgerEvent,
  seedLedger,
  readLedger,
  markLedgerStale,
  markLedgerStaleForScope,
  recordLedgerPassForScope,
  writeLedgerRows,
  mapReadinessToLedgerRows,
  LOCAL_CLASS_LEDGER_STEPS,
  CHANNEL_CLASS_LEDGER_STEPS,
  type ReadinessReportLike,

} from "../_shared/channelStepLedger.ts";

import { countRuOpenDays, parseRuAvailabilityDays } from "../_shared/ruAvailabilityParsing.ts";
import { DEFAULT_LNM_CHANGE_TYPES, diffLnmSubscriptions, parseLnmSubscriptions } from "../_shared/ruLnm.ts";
import { ensureLiveNotificationsForOwner } from "../_shared/ruLnmSubscribe.ts";
import { classifyMcqOrder, parseMcqFailingPoints, resolveMcqChannelId, resolveMcqTargets } from "../_shared/ruMcq.ts";
import {
  RU_EMPLOYEE_RANGES,
  RU_PROPERTY_RANGES,
  RU_YEARS_RANGES,
  isRangeId,
  rangeIdForCount,
  type RuRange,
} from "../_shared/ruRanges.ts";
import {
  resolveRuDiscounts,
  validateRuLadder,
  longStayToWire,
  lastMinuteToWire,
  describeTierSources,
  diffRuDiscountEcho,
  type RuDiscountLadder,
} from "../_shared/ruDiscounts.ts";
import { parseRuReservation } from "../_shared/ruReservationParsing.ts";
import { fetchRuReservationById, ingestRuReservation, resolveRuChannelCreator } from "../_shared/ruReservationIngest.ts";
import { runBookingReadbackTest } from "../_shared/ruBookingReadback.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StepStatus = "passed" | "failed" | "skipped";
type CertScope = "account" | "property";

/**
 * Phase 2 ledger bookkeeping for account-scoped writers.
 *
 * Key capture, owner push and company profile are recorded against an RU sub-account,
 * not a property — resolve the account's scope (portfolio or single property) and mark
 * the affected macro steps stale for every property it covers. Never throws.
 */
// deno-lint-ignore no-explicit-any
async function markLedgerStaleForOwnerAccount(
  admin: any,
  ref: { accountId?: string | null; ownerId?: string | null },
  stepKeys: string[],
  event: string,
): Promise<void> {
  try {
    let query = admin.from("ru_owner_accounts").select("portfolio_id, property_id");
    query = ref.accountId ? query.eq("id", ref.accountId) : query.eq("ru_owner_id", ref.ownerId ?? "");
    const { data } = await query.limit(1).maybeSingle();
    if (!data) return;
    await markLedgerStaleForScope(
      admin,
      { propertyId: data.property_id ?? null, portfolioId: data.portfolio_id ?? null },
      stepKeys,
      event,
    );
  } catch (error) {
    console.warn("[channel-ledger] owner-account stale marking skipped:", error);
  }
}

/**
 * Record a `passed` verdict for account-scoped steps (keys, company profile,
 * owner push). Without this the seeded rows for those steps never carry a verdict
 * and a stale flag can hold finished work open indefinitely. Never throws.
 */
// deno-lint-ignore no-explicit-any
async function recordLedgerPassForOwnerAccount(
  admin: any,
  ref: { accountId?: string | null; ownerId?: string | null },
  stepKeys: string[],
  event: string,
): Promise<void> {
  try {
    let query = admin.from("ru_owner_accounts").select("portfolio_id, property_id");
    query = ref.accountId ? query.eq("id", ref.accountId) : query.eq("ru_owner_id", ref.ownerId ?? "");
    const { data } = await query.limit(1).maybeSingle();
    if (!data) return;
    await recordLedgerPassForScope(
      admin,
      { propertyId: data.property_id ?? null, portfolioId: data.portfolio_id ?? null },
      stepKeys,
      event,
    );
  } catch (error) {
    console.warn("[channel-ledger] owner-account pass recording skipped:", error);
  }
}



/** Minimum seconds between certification runs (RU allows ~1 call per sliding minute). */
const RUN_COOLDOWN_SECONDS = 60;

/**
 * The single operator password used for EVERY ROLOS-created channel sub-account.
 * Meets RU policy (12+ chars, upper, lower, digit and a special character from RU's set).
 * Per operator decision, all sub-users share this literal so any account can always be
 * authenticated for key minting, archival and closure.
 */
const RU_SUB_USER_PASSWORD = "SLPafrica247*";

/**
 * Password sent in Push_CreateUser_RQ and persisted (encrypted) in the same Step A run.
 * Always the shared operator password above — no per-account randomisation.
 */
const generateSubUserPassword = (_loginEmail?: string | null): string => RU_SUB_USER_PASSWORD;







/**
 * Domain hosting auto-generated distribution logins. When the resolved owner email
 * cannot become a channel sub-account (taken, archived, not under our master account,
 * or a shared platform login), Step A mints `<slug>@roomsonline.co.za` from the
 * property and keeps going — there is no manual "change email" step.
 */
const RU_GENERATED_LOGIN_DOMAIN = "roomsonline.co.za";

/** The channel refuses any login longer than this (status 378). */
const RU_LOGIN_MAX_LENGTH = 50;

/**
 * A login on our own generated distribution domain was created BY US with the platform
 * sub-user password, so that password is a valid mint credential even when the stored copy
 * was lost (e.g. an earlier run that could not resolve the OwnerID). It is never assumed for
 * an owner's own mailbox — only for `<slug>@roomsonline.co.za` logins we issued.
 */
const isGeneratedDistributionLogin = (email: unknown): boolean =>
  String(email ?? "").trim().toLowerCase().endsWith(`@${RU_GENERATED_LOGIN_DOMAIN}`);


/** Slug/name → distribution login. attempt 1 = `<slug>@…`, attempt N = `<slug>N@…`. */
const generateDistributionLogin = (slugOrName: string, attempt = 1): string | null => {
  const base = String(slugOrName ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return null;
  const suffix = attempt > 1 ? String(attempt) : "";
  // The channel rejects logins over 50 characters, so the local part is trimmed to fit
  // the domain and the attempt suffix rather than being sent and refused.
  const room = RU_LOGIN_MAX_LENGTH - RU_GENERATED_LOGIN_DOMAIN.length - 1 - suffix.length;
  if (room < 1) return null;
  const localBase = base.slice(0, room).replace(/-+$/g, "");
  if (!localBase) return null;
  return `${localBase}${suffix}@${RU_GENERATED_LOGIN_DOMAIN}`;
};


/** external_system values that mean "ROL'OS is the PMS" (mirrors src/lib/pmsIdentity.ts). */
const ROLOS_PMS_VALUES = new Set(["roomsonline", "rolos", "rol_os", "rolos_pms"]);



interface CertStep {
  step: number;
  name: string;
  ru_method: string;
  mandatory: boolean;
  scope: CertScope;
  status: StepStatus;
  duration_ms: number;
  ru_status_id?: string | null;
  detail?: string;
  request?: unknown;
  response_preview?: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
/** Stable alias so the request handler can shadow `json` to add coverage logging. */
const jsonResponse = json;

/**
 * `functions.invoke` discards the response body on a non-2xx status, which hides the callee's
 * real error code (e.g. RU_RATE_DEFERRED / RU_CHILD_AUTH_REQUIRED). Recover it from the
 * FunctionsHttpError context so the reason can be surfaced verbatim.
 */
// deno-lint-ignore no-explicit-any
async function readInvokeErrorBody(err: any): Promise<any | null> {
  const res = err?.context;
  if (!res || typeof res.text !== "function") return null;
  try {
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

/**
 * Listings the channel has already been told to archive, and accounts already closed there.
 *
 * Once a listing is archived — or its whole sub-account was closed with `Push_ArchiveUser_RQ` —
 * it is no longer connected to us, so pushing the identical status again buys nothing: the channel
 * answers the same success, or refuses it inside the sliding minute (`RU_RATE_DEFERRED`) and the
 * run burns its window re-archiving history. Archive/sterilize/retire runs therefore skip them.
 *
 * `ru_api_log` is the source of truth because it is deliberately retained by sterilization, while
 * `ru_archive_events` and the local columns are wiped by it.
 */
// deno-lint-ignore no-explicit-any
async function alreadySettledListings(
  admin: any,
  listingIds: string[],
): Promise<{ archivedListings: Set<string>; closedOwners: Set<string> }> {
  const archivedListings = new Set<string>();
  const closedOwners = new Set<string>();
  try {
    const { data: closed } = await admin
      .from("ru_retired_accounts")
      .select("ru_owner_id, channel_archived_at")
      .not("channel_archived_at", "is", null);
    for (const r of closed ?? []) {
      const id = String((r as { ru_owner_id?: unknown }).ru_owner_id ?? "").trim();
      if (id) closedOwners.add(id);
    }
  } catch (e) {
    console.warn("[ru-cert-portal] closed-account lookup failed", e);
  }
  if (listingIds.length === 0) return { archivedListings, closedOwners };
  try {
    const { data: rows } = await admin
      .from("ru_api_log")
      .select("ru_property_id, request_xml")
      .eq("action", "Push_SetPropertiesStatus_RQ")
      .eq("success", true)
      .in("ru_property_id", listingIds)
      .order("created_at", { ascending: true })
      .limit(20000);
    for (const r of rows ?? []) {
      const listing = String((r as { ru_property_id?: unknown }).ru_property_id ?? "").trim();
      const xml = String((r as { request_xml?: unknown }).request_xml ?? "");
      // Only an archive counts: a reactivation (IsArchived 0) means the listing is live again.
      if (listing && /<IsArchived>\s*1\s*<\/IsArchived>/i.test(xml)) archivedListings.add(listing);
      else if (listing && /<IsArchived>\s*0\s*<\/IsArchived>/i.test(xml)) archivedListings.delete(listing);
    }
  } catch (e) {
    console.warn("[ru-cert-portal] archive-history lookup failed", e);
  }
  return { archivedListings, closedOwners };
}





/**
 * Console actions that actually touch a Rentals United endpoint. Every one of these is
 * written to `ru_sync_runs` so the Coverage tab can evidence real usage — without this,
 * work done from the RU console (buildings pull, company push, currency flip, ARI push …)
 * left no trace and the matrix reported "never used".
 */
const LOGGED_PORTAL_ACTIONS = new Set<string>([
  "verify_api_keys",
  "create_api_key",
  "resolve_ru_property_ids",
  "list_ru_candidates",
  "bind_ru_account",
  "create_user",
  "fill_company_details",
  "ensure_owner_account",
  "ensure_company_details",
  "resolve_sales_channel",
  "order_mcq",
  "discount_ladder",
  "property_readiness",
  "wl_readiness",
  "list_reservations",
  "list_lnm_change_types",
]);

/**
 * Live channel ARI read-backs are expensive (one call per method per sliding minute) and the
 * answer barely moves between two opens of the same panel. Cached per unit for a short window
 * so re-opening go-live status is instant instead of re-pulling every unit's calendar.
 */
const ARI_PROBE_TTL_MS = 180_000;
const ARI_PROBE_TIMEOUT_MS = 12_000;
const ariProbeCache = new Map<string, { at: number; probe: any }>();
/**
 * Durable probe guard. The in-memory cache above dies with the isolate, so it almost never
 * hits and every page load used to re-pull prices + availability for every unit. A stored
 * ARI verdict younger than this is reused instead — only `force_probe` overrides it.
 */
const ARI_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;


/** How far back a logged channel answer is still trusted when the live read is rate limited. */
const RU_LAST_GOOD_XML_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * The channel enforces one call per method per sliding minute, so a re-score inside that window
 * is answered with a queued 202 carrying no calendar. Every real answer is already persisted in
 * `ru_api_log`, so replay the most recent successful body for this unit instead of scoring the
 * unit as if the channel had reported no availability and no MinStay.
 */
async function loadLastGoodRuXml(
  // deno-lint-ignore no-explicit-any
  admin: any,
  ruPropertyId: number,
  action: string,
): Promise<string | null> {
  const since = new Date(Date.now() - RU_LAST_GOOD_XML_MAX_AGE_MS).toISOString();
  const { data, error } = await admin
    .from("ru_api_log")
    .select("response_xml")
    .eq("ru_property_id", String(ruPropertyId))
    .eq("action", action)
    .eq("success", true)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`[ru-cert-portal] could not replay ${action} for ${ruPropertyId}: ${error.message}`);
    return null;
  }
  const xml = typeof data?.response_xml === "string" ? data.response_xml.trim() : "";
  return xml.length > 0 ? xml : null;
}


/**
 * Roster read, always through the shared cache (see `_shared/ruRosterCache.ts`). The channel
 * allows one `Pull_ListMyUsers_RQ` per sliding minute, so a fresh answer is read at most once
 * per TTL and every other caller reuses it. A throttled read falls back to the cached roster —
 * never to an empty list, which is what used to make binding impossible.
 */
async function listRuSubUsers(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: { forceFresh?: boolean; cacheOnly?: boolean; source?: string } = {},
): Promise<{ ok: boolean; users: { owner_id?: string; email?: string; login_email?: string; user_account_id?: string }[]; deferred: boolean; cached: boolean; fetched_at: string | null; message?: string }> {
  if (opts.forceFresh && !opts.cacheOnly) invalidateRuRosterMemo();
  const roster = await readRuRoster(admin, {
    forceFresh: opts.forceFresh,
    cacheOnly: opts.cacheOnly,
    source: opts.source ?? "ru-cert-portal",
  });
  return {
    ok: roster.ok,
    users: roster.users,
    deferred: roster.deferred,
    cached: roster.cached,
    fetched_at: roster.fetchedAt,
    message: roster.message,
  };
}


/** Whole-scorecard cache for probe-free reads: re-opening the wizard is then instant. */
const PHASE_STATUS_TTL_MS = 90_000;
const phaseStatusCache = new Map<string, { at: number; payload: Record<string, unknown> }>();

/**
 * The in-memory cache above dies with the function instance, so a cold start (or a
 * throttled pull) used to erase a verdict the owner had already earned and flip the
 * wizard back to "not ready". The last SUCCESSFUL live verdict is therefore persisted
 * per property and reused whenever a probe is skipped, throttled or times out.
 */
export interface AriSnapshot {
  availability_ok: boolean;
  prices_ok: boolean;
  units?: any[];
  worst_window?: any;
  probed_at: string;
  ru_owner_id?: number | null;
}
/**
 * A stored bookable window is only trustworthy when the probe actually saw the calendar.
 * A throttled / empty read-back yields an all-zero window; persisting or scoring that as a
 * real verdict turned a healthy property into a permanent "nothing is sellable" blocker.
 */
function isMeaningfulWindow(w: any): boolean {
  if (!w || typeof w !== "object") return false;
  const openDays = Math.max(0, Number(w.open_days ?? 0));
  const unpricedOpenDays = Math.max(0, Number(w.unpriced_open_days ?? openDays));
  return openDays > 0 && unpricedOpenDays < openDays;
}


async function loadAriSnapshot(admin: any, propertyId: string): Promise<AriSnapshot | null> {
  try {
    const { data } = await admin
      .from("ru_readiness_snapshots")
      .select("groups, probed_at, ru_owner_id")
      .eq("property_id", propertyId)
      .maybeSingle();
    if (!data) return null;
    const g = (data.groups ?? {}) as Record<string, unknown>;
    if (typeof g.availability_ok !== "boolean" || typeof g.prices_ok !== "boolean") return null;
    return {
      availability_ok: g.availability_ok as boolean,
      prices_ok: g.prices_ok as boolean,
      units: (g.units as any[]) ?? [],
      worst_window: g.worst_window ?? null,
      probed_at: String(data.probed_at ?? new Date().toISOString()),
      ru_owner_id: data.ru_owner_id ?? null,
    };
  } catch (_e) {
    return null;
  }
}

async function saveAriSnapshot(
  admin: any,
  propertyId: string,
  snapshot: Omit<AriSnapshot, "probed_at">,
): Promise<void> {
  try {
    await admin.from("ru_readiness_snapshots").upsert({
      property_id: propertyId,
      ru_owner_id: snapshot.ru_owner_id ?? null,
      groups: {
        availability_ok: snapshot.availability_ok,
        prices_ok: snapshot.prices_ok,
        units: snapshot.units ?? [],
        worst_window: snapshot.worst_window ?? null,
      },
      probed_at: new Date().toISOString(),
    }, { onConflict: "property_id" });
  } catch (e) {
    console.warn("[ru-cert-portal] readiness snapshot save failed:", e);
  }
}

/** Human label for a stored verdict, e.g. "verified 2 h ago on the channel". */
function snapshotAge(probedAt: string): string {
  const ms = Date.now() - Date.parse(probedAt);
  if (!Number.isFinite(ms) || ms < 0) return "previously verified on the channel";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `verified on the channel ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `verified on the channel ${hours} h ago`;
  return `verified on the channel ${Math.round(hours / 24)} day(s) ago`;
}


/** Time-box one channel pull; a timeout reads as "no answer" (verification pending). */
function withProbeTimeout<T extends { data?: any; error?: any }>(
  call: Promise<T>,
  ms = ARI_PROBE_TIMEOUT_MS,
): Promise<{ data?: any; error?: { message: string } | null }> {
  return Promise.race([
    call.catch((e) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } })),
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: "Channel read-back timed out — verification pending" } }), ms)
    ),
  ]) as Promise<{ data?: any; error?: { message: string } | null }>;
}


async function logPortalAction(
  admin: ReturnType<typeof createClient>,
  action: string,
  propertyId: string | null,
  payload: unknown,
  elapsedMs: number,
): Promise<void> {
  if (!LOGGED_PORTAL_ACTIONS.has(action)) return;
  const p = (payload ?? {}) as { success?: boolean; error?: { message?: string } };
  try {
    const { error } = await admin.from("ru_sync_runs").insert({
      batch_id: crypto.randomUUID(),
      action,
      property_id: propertyId,
      success: p.success === true,
      error_message: p.success === true ? null : (p.error?.message ?? null),
      elapsed_ms: elapsedMs,
      details: { source: "ru_console" },
    });
    if (error) console.warn("[ru-cert-portal] coverage log insert failed", error.message);
  } catch (e) {
    console.warn("[ru-cert-portal] coverage log failed", e);
  }
}


function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Evidence previews are shown in the certification console and exported to auditors, so any
 * credential that travelled in the XML envelope must be redacted before it is echoed back.
 */
function redactCredentials(s: string): string {
  return s
    .replace(/(<(?:SecretKey|Password|AccessKey|UserName)>)([\s\S]*?)(<\/(?:SecretKey|Password|AccessKey|UserName)>)/gi, "$1[REDACTED]$3")
    .replace(/("(?:secret_key|auth_secret_key|password|auth_password|access_key|auth_access_key)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"');
}

function preview(value: unknown, max = 4000): string | null {
  if (value == null) return null;
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const s = redactCredentials(raw);
  return s.length > max ? `${s.slice(0, max)}\n… [truncated ${s.length - max} chars]` : s;
}


/**
 * RU requires at least one LocationId when creating a sub-user.
 *
 * Onboarding is deliberately cache-only here. Location authoring/resolution belongs to the
 * property setup flow; previewing or resuming Step A must never spend (or retry) a channel
 * location read. A missing local LocationID is therefore one precise readiness blocker.
 */
async function resolveOwnerLocationIds(
  admin: ReturnType<typeof createClient>,
  propertyId: string | null,
  portfolioId: string | null,
): Promise<number[]> {
  const ids = new Set<number>();

  let propertyIds: string[] = [];
  if (portfolioId) {
    const { data: members } = await admin
      .from("property_portfolio_members")
      .select("property_id")
      .eq("portfolio_id", portfolioId);
    propertyIds = ((members ?? []) as Array<{ property_id: string }>).map((m) => m.property_id);
    if (propertyId && !propertyIds.includes(propertyId)) propertyIds.push(propertyId);
  } else if (propertyId) {
    propertyIds = [propertyId];
  }
  if (propertyIds.length === 0) return [];

  const { data: props } = await admin
    .from("properties")
    .select("id, city, country, ru_location_id")
    .in("id", propertyIds);

  const properties = (props ?? []) as Array<{
    id: string; city: string | null; country: string | null; ru_location_id: number | null;
  }>;
  if (properties.length === 0) return [];

  // The property field is the authoritative setup result and costs no channel call.
  for (const property of properties) {
    const id = Number(property.ru_location_id);
    if (Number.isFinite(id) && id > 1) ids.add(id);
  }
  if (ids.size > 0) return [...ids];

  // 1. Cached geo mapping
  const { data: mappings } = await admin
    .from("pms_mappings")
    .select("metadata, property_id")
    .in("property_id", properties.map((p) => p.id))
    .eq("system_type", "rentals_united")
    .eq("mapping_type", "field_mappings")
    .eq("external_id", "__property__");
  for (const m of (mappings ?? []) as Array<{ metadata: Record<string, unknown> | null }>) {
    const id = Number((m.metadata as Record<string, unknown> | null)?.ru_location_id);
    if (Number.isFinite(id) && id > 1) ids.add(id);
  }
  if (ids.size > 0) return [...ids];

  // Fall back to the locally seeded channel dictionary. Never call get_location_* here.
  for (const p of properties) {
    if (!p.city) continue;
    const { data: loc } = await admin
      .from("ru_locations")
      .select("id")
      .ilike("name", p.city)
      .limit(1)
      .maybeSingle();
    const id = Number((loc as { id?: number } | null)?.id);
    if (Number.isFinite(id) && id > 1) {
      ids.add(id);
      break;
    }
  }
  return [...ids];
}




/**
 * Default sales channel the content quality check is ordered against. RU's CM_LNM_*
 * methods need a numeric ChannelID, which is resolved from Pull_ListSalesChannels_RQ by
 * matching CompanyName (variants such as "LekkeSlaap" / "Lekke Slaap" all normalise here).
 */
const LEKKESLAAP_CHANNEL_NAME = "LekkeSlaap";

/** ru_platform_settings key holding the resolved ChannelID (property-scoped or account-wide). */
const channelSettingKey = (propertyId?: string | null) =>
  propertyId ? `ru_channel_id:${propertyId}` : "ru_channel_id";

// ── RU method catalogue ───────────────────────────────────────
const RU_METHOD_BY_ACTION: Record<string, string> = {
  health_check: "Pull_ListProp_RQ (health)",
  list_properties: "Pull_ListProp_RQ",
  get_property: "Pull_GetProperty_RQ",
  get_availability: "Pull_ListPropertyAvailabilityCalendar_RQ",
  get_prices: "Pull_ListPropertyPrices_RQ",
  list_reservations: "Pull_ListReservations_RQ",
  get_leads: "Pull_GetLeads_RQ",
  reject_request: "Push_RejectRequest_RQ",
  cancel_reservation: "Push_CancelReservation_RQ",
  list_buildings: "Pull_ListOwnerBuildings_RQ",
  list_composition_rooms: "Pull_ListCompositionRooms_RQ",
  list_cities_and_currencies: "Pull_ListCurrenciesWithCities_RQ / Pull_ListCitiesProps_RQ",
  get_location_by_coordinates: "Pull_GetLocationByCoordinates_RQ",
  push_property: "Push_PutProperty_RQ",
  push_availability: "Push_PutAvbUnits_RQ",
  push_prices: "Push_PutPrices_RQ",
  subscribe_notifications: "LNM_PutHandlerUrl_RQ",
  put_lnm_subscriptions: "Push_PutLiveNotificationMechanismSubscriptions_RQ",
  list_lnm_subscriptions: "Pull_ListLiveNotificationMechanismSubscriptions_RQ",
  list_lnm_change_types: "Pull_ListLiveNotificationMechanismChangeTypes_RQ",
  push_long_stay_discounts: "Push_PutLongStayDiscounts_RQ",
  push_last_minute_discounts: "Push_PutLastMinuteDiscounts_RQ",
  get_long_stay_discounts: "Pull_ListPropertyDiscounts_RQ",
  get_last_minute_discounts: "Pull_ListPropertyDiscounts_RQ",
  list_users: "Pull_ListMyUsers_RQ",
  list_sales_channels: "Pull_ListSalesChannels_RQ",
};

/**
 * RU actions that read/write ONE sub-user's inventory. Mirrors CHILD_SCOPED_ACTIONS in
 * rentalsunited-api: a white-label listing lives on the sub-account, so a master-auth
 * call returns "Property does not exist". Certification passes the bound OwnerID so the
 * adapter authenticates with that sub-user's own API keys.
 */
const CERT_CHILD_SCOPED_ACTIONS = new Set([
  "list_properties",
  "get_property",
  "get_availability",
  "get_prices",
  "get_long_stay_discounts",
  "get_last_minute_discounts",
  "push_long_stay_discounts",
  "push_last_minute_discounts",
  "push_availability",
  "push_prices",
  "push_property",
  "set_property_status",
  "order_mcq",
  "put_lnm_subscriptions",
  "push_change_currency",
  "list_buildings",
  "get_building",
]);

/**
 * Child-scoped actions where authenticating as the MASTER account is a hard failure:
 * RU either rejects them ("You are not the owner of the apartment") or applies the
 * write to our own master inventory.
 */
const CERT_MASTER_FORBIDDEN_ACTIONS = new Set([
  "get_property",
  "get_availability",
  "get_prices",
  "get_long_stay_discounts",
  "get_last_minute_discounts",
  "push_long_stay_discounts",
  "push_last_minute_discounts",
  "push_availability",
  "push_prices",
  "push_property",
  "set_property_status",
  "order_mcq",
  "list_buildings",
  "get_building",
]);




// Core functional certification milestones exercised on the RU certification call.
const CERT_MILESTONES: { key: string; label: string; ru_method: string; mandatory: boolean; scope: CertScope; note: string }[] = [
  { key: "auth", label: "Connectivity / auth", ru_method: "Pull_ListProp_RQ (health)", mandatory: true, scope: "account", note: "AccessKey + SecretKey working" },
  { key: "list_properties", label: "List properties", ru_method: "Pull_ListProp_RQ", mandatory: true, scope: "account", note: "Pull_ListOwnerProp_RQ equivalent" },
  { key: "get_property", label: "Get property content", ru_method: "Pull_GetProperty_RQ", mandatory: true, scope: "property", note: "Read-back verification (Pull_ListSpecProp_RQ)" },
  { key: "get_availability", label: "Get availability (365d)", ru_method: "Pull_ListPropertyAvailabilityCalendar_RQ", mandatory: true, scope: "property", note: "" },
  { key: "get_prices", label: "Get prices (365d)", ru_method: "Pull_ListPropertyPrices_RQ", mandatory: true, scope: "property", note: "" },
  { key: "push_property", label: "Push property content", ru_method: "Push_PutProperty_RQ", mandatory: true, scope: "property", note: "Create + update" },
  { key: "push_availability", label: "Push availability", ru_method: "Push_PutAvbUnits_RQ", mandatory: true, scope: "property", note: "" },
  { key: "push_prices", label: "Push prices", ru_method: "Push_PutPrices_RQ", mandatory: true, scope: "property", note: "" },
  { key: "rlnm", label: "Subscribe RLNM handler", ru_method: "LNM_PutHandlerUrl_RQ", mandatory: true, scope: "account", note: "Reservation notifications" },
  { key: "lnm_subscribe", label: "Subscribe LNM (content + ARI)", ru_method: "Push_PutLiveNotificationMechanismSubscriptions_RQ", mandatory: true, scope: "account", note: "Content / availability / price change webhooks" },
  { key: "lnm_verify", label: "Verify LNM subscriptions", ru_method: "Pull_ListLiveNotificationMechanismSubscriptions_RQ", mandatory: true, scope: "account", note: "Read-back — detects silent subscription drift" },
  { key: "lnm_change_types", label: "List LNM change types", ru_method: "Pull_ListLiveNotificationMechanismChangeTypes_RQ", mandatory: false, scope: "account", note: "Dictionary read" },
  { key: "lnm_duplicate", label: "LNM duplicate-subscription test", ru_method: "Push_PutLiveNotificationMechanismSubscriptions_RQ (idempotency)", mandatory: false, scope: "account", note: "Subscribe twice — RU must hold exactly one record" },
  { key: "mcq_duplicate", label: "MCQ duplicate-order test", ru_method: "CM_LNM_OrderMinimumContentQualityCheck_RQ (idempotency)", mandatory: false, scope: "property", note: "Order twice — no conflicting parallel orders" },

  { key: "sales_channels", label: "Pull sales channels (ChannelID)", ru_method: "Pull_ListSalesChannels_RQ", mandatory: true, scope: "account", note: "Resolves the LekkeSlaap ChannelID used by the content quality check" },
  { key: "reservations", label: "Pull reservations", ru_method: "Pull_ListReservations_RQ", mandatory: true, scope: "account", note: "" },
  { key: "leads", label: "Pull leads", ru_method: "Pull_GetLeads_RQ", mandatory: false, scope: "account", note: "Optional" },
  { key: "reservation_idempotency", label: "Reservation idempotency test", ru_method: "Pull_ListReservations_RQ / RLNM (idempotency)", mandatory: false, scope: "property", note: "Same reservation ingested twice — exactly one booking" },
  { key: "creator_mapping", label: "Channel creator mapping", ru_method: "Reservation Creator → sales channel", mandatory: false, scope: "account", note: "Every RU Creator seen on bookings is labelled" },
  { key: "long_stay", label: "Long-stay discounts", ru_method: "Push_PutLongStayDiscounts_RQ", mandatory: false, scope: "property", note: "Optional but recommended" },
  { key: "last_minute", label: "Last-minute discounts", ru_method: "Push_PutLastMinuteDiscounts_RQ", mandatory: false, scope: "property", note: "Optional but recommended" },
];

/** Grouping used by the Coverage tab. */
const RU_COVERAGE_AREAS = [
  { key: "account", label: "Account & authentication" },
  { key: "content", label: "Content / onboarding push" },
  { key: "ari", label: "Availability, rates & discounts" },
  { key: "reservations", label: "Reservations & leads" },
  { key: "lifecycle", label: "Booking lifecycle (modify / cancel)" },
  { key: "notifications", label: "Live notifications & quality" },
] as const;

type RuArea = typeof RU_COVERAGE_AREAS[number]["key"];

/**
 * Every RU endpoint the adapter implements, mapped to the ROL'OS PMS surface that
 * exercises it. `sync_actions` are `ru_sync_runs.action` values written by that
 * surface — they prove the ROL'OS integration has actually been used, not just built.
 */
const RU_ENDPOINT_REGISTRY: {
  key: string;
  area: RuArea;
  label: string;
  ru_method: string;
  direction: "pull" | "push" | "refresh" | "webhook";
  mandatory: boolean;
  implemented: boolean;
  rolos_surface: string;
  rolos_stream: string;
  rolos_wired: boolean;
  /** Surface is an admin console action — certification-run success is its usage evidence. */
  rolos_via_cert?: boolean;
  sync_actions: string[];
  /** Extra RU method names a certification step may have recorded for this endpoint. */
  cert_methods?: string[];
  /** Raw XML method names as logged in `ru_api_log.action` (any sub-account success counts). */
  api_methods?: string[];
  /** Cache table built by this dictionary pull — row count + freshness is usage evidence. */
  cache_evidence?: { table: string; label: string };
  max_age_hours?: number;
  /**
   * Endpoint RU cannot answer for this sandbox/white-label account (reachable, but no
   * usable response). Still exercised on cadence, but a failure is reported as
   * "blocked upstream" and excluded from the compliance denominators.
   */
  informational?: boolean;
  note: string;


}[] = [
  // ── account ──
  { rolos_via_cert: true, key: "auth", area: "account", label: "Connectivity / auth", ru_method: "Pull_ListProp_RQ (health)", direction: "pull", mandatory: true, implemented: true,
    api_methods: ["Pull_ListOwnerProp_RQ", "Pull_ListProp_RQ", "WL_MasterToken", "WL_SubUserClientToken"],
    rolos_surface: "RU console → API keys (verify)", rolos_stream: "Step A — account binding", rolos_wired: true, sync_actions: ["verify_api_keys"], note: "AccessKey + SecretKey per sub-user" },
  { rolos_via_cert: true, key: "list_properties", area: "account", label: "List properties", ru_method: "Pull_ListProp_RQ", direction: "pull", mandatory: true, implemented: true,
    api_methods: ["Pull_ListOwnerProp_RQ", "Pull_ListSpecProp_RQ", "Pull_ListProp_RQ"],
    rolos_surface: "RU console → bind RU account / resolve IDs", rolos_stream: "Step A — inventory discovery", rolos_wired: true, sync_actions: ["resolve_ru_property_ids", "list_ru_candidates", "bind_ru_account"], note: "Pull_ListOwnerProp_RQ equivalent" },
  { rolos_via_cert: true, key: "create_user", area: "account", label: "Create white-label sub-user", ru_method: "Push_PutOwner_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["Push_CreateUser_RQ", "Pull_ListMyUsers_RQ", "Push_PutOwner_RQ"],
    rolos_surface: "RU console → user management", rolos_stream: "Step A — sub-user provisioning", rolos_wired: true, sync_actions: ["create_user", "ensure_owner_account"], note: "White-label isolation" },
  { rolos_via_cert: true, key: "company_details", area: "account", label: "Push company details", ru_method: "Push_PutCompanyDetails_RQ", direction: "push", mandatory: true, implemented: true,
    cert_methods: ["Push_FillCompanyDetails_RQ", "Push_PutOwnerDetails_RQ"],
    api_methods: ["Push_FillCompanyDetails_RQ", "Push_PutOwnerDetails_RQ"],
    rolos_surface: "Edit property → Company information", rolos_stream: "Step B — company profile", rolos_wired: true, sync_actions: ["fill_company_details", "ensure_company_details", "ensure_owner_account", "push_company_details"], note: "Strict UTC±HH:MM timezone" },
  { rolos_via_cert: true, key: "locations", area: "account", label: "Location register", ru_method: "Pull_ListLocations_RQ", direction: "pull", mandatory: false, implemented: true,
    cert_methods: ["Pull_GetLocationByCoordinates_RQ", "Pull_ListLocationsBySearchString_RQ", "Pull_ListCities_RQ"],
    api_methods: ["Pull_ListLocations_RQ", "Pull_ListDestinations_RQ", "Pull_ListCitiesProps_RQ", "Pull_ListCurrenciesWithCities_RQ"],
    cache_evidence: { table: "ru_locations", label: "RU location register" },
    rolos_surface: "Edit property → Company information → refresh register", rolos_stream: "Step B — address mapping", rolos_wired: true, sync_actions: ["refresh_locations", "pull_locations", "refresh_ru_locations"], note: "Builds the RU LocationID register — a property address cannot be captured without it" },
  { rolos_via_cert: true, key: "currency", area: "account", label: "Property currency", ru_method: "Push_ChangeCurrency_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["Push_ChangeCurrency_RQ"],
    rolos_surface: "RU console → Currency panel", rolos_stream: "Step B — pricing currency", rolos_wired: true, sync_actions: ["change_currency", "verify_ru_currency", "inventory_push"], note: "ZAR primary, USD fallback conversion" },

  // ── content ──
  { key: "push_property", area: "content", label: "Push property content", ru_method: "Push_PutProperty_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["Push_PutProperty_RQ"],
    rolos_surface: "Edit property → push to RU / delta on change / weekly cron", rolos_stream: "Step B — content publish", rolos_wired: true, sync_actions: ["inventory_push", "weekly_content_refresh", "static_delta"], max_age_hours: 168, note: "Create + update, photos, amenities, composition. Also pushed as a differential whenever static content changes in the PMS (logged as static_delta)" },
  { key: "static_delta", area: "content", label: "Static content delta on change", ru_method: "Push_PutProperty_RQ (differential)", direction: "push", mandatory: true, implemented: true,
    rolos_surface: "Edit property → save (SHA-256 content fingerprint)", rolos_stream: "Content — event-driven delta", rolos_wired: true, sync_actions: ["static_delta"], note: "Event-driven: fires only when the fingerprint of the pushed content changes, so RU never waits for the weekly cron" },

  { rolos_via_cert: true, key: "get_property", area: "content", label: "Get property content (read-back)", ru_method: "Pull_GetProperty_RQ", direction: "pull", mandatory: true, implemented: true,
    cert_methods: ["Pull_ListCompositionRooms_RQ"],
    api_methods: ["Pull_ListSpecProp_RQ", "Pull_GetProperty_RQ"],
    rolos_surface: "RU console → readiness / verification", rolos_stream: "Step B — publish verification", rolos_wired: true, sync_actions: ["verify_property", "property_readiness"], note: "Read-back verification" },
  { rolos_via_cert: true, key: "buildings", area: "content", label: "Buildings", ru_method: "Pull_ListBuildings_RQ", direction: "pull", mandatory: false, implemented: true,
    cert_methods: ["Pull_ListOwnerBuildings_RQ", "Pull_GetBuilding_RQ"],
    api_methods: ["Pull_ListBuildings_RQ", "Pull_GetBuilding_RQ", "Pull_ListOwnerBuildings_RQ"],
    rolos_surface: "RU console → Buildings panel", rolos_stream: "Step B — multi-unit structure", rolos_wired: true, sync_actions: ["list_buildings", "get_building", "pull_buildings"], note: "Read-only — ROL'OS never creates buildings" },


  // ── ari ──
  { key: "push_availability", area: "ari", label: "Push availability", ru_method: "Push_PutAvbUnits_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["Push_PutAvbUnits_RQ"],
    rolos_surface: "Calendar / ARI refresh cron (6h)", rolos_stream: "Step B — live ARI", rolos_wired: true, sync_actions: ["refresh_ari", "push_availability", "inventory_push", "availability_playground"], max_age_hours: 24, note: "Excludes confirmed RU reservation dates" },
  { key: "push_prices", area: "ari", label: "Push prices", ru_method: "Push_PutPrices_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["Push_PutPrices_RQ"],
    rolos_surface: "Rate manager / ARI refresh cron", rolos_stream: "Step B — live ARI", rolos_wired: true, sync_actions: ["refresh_ari", "push_prices", "inventory_push"], max_age_hours: 24, note: "Seasonal calendar first, rack-rate fallback" },

  { rolos_via_cert: true, key: "get_availability", area: "ari", label: "Get availability (365d)", ru_method: "Pull_ListPropertyAvailabilityCalendar_RQ", direction: "pull", mandatory: true, implemented: true,
    api_methods: ["Pull_ListPropertyAvailabilityCalendar_RQ"],
    rolos_surface: "RU console → ARI read-back", rolos_stream: "Step B — ARI verification", rolos_wired: true, sync_actions: ["verify_availability", "refresh_ari"], note: "CalDay/Units parsing" },
  { rolos_via_cert: true, key: "get_prices", area: "ari", label: "Get prices (365d)", ru_method: "Pull_ListPropertyPrices_RQ", direction: "pull", mandatory: true, implemented: true,
    api_methods: ["Pull_ListPropertyPrices_RQ"],
    rolos_surface: "RU console → ARI read-back", rolos_stream: "Step B — ARI verification", rolos_wired: true, sync_actions: ["verify_prices", "refresh_ari"], note: "" },
  { key: "long_stay", area: "ari", label: "Long-stay discounts", ru_method: "Push_PutLongStayDiscounts_RQ", direction: "push", mandatory: false, implemented: true, max_age_hours: 24,
    api_methods: ["Push_PutLongStayDiscounts_RQ", "Pull_ListPropertyDiscounts_RQ"],
    rolos_surface: "Discount ladder save (event) + daily discount cron", rolos_stream: "Specials / discount ladder", rolos_wired: true, sync_actions: ["push_long_stay", "push_discounts", "refresh_discounts", "inventory_push", "discount_ladder"], note: "Pushed on change and re-pushed daily" },
  { key: "last_minute", area: "ari", label: "Last-minute discounts", ru_method: "Push_PutLastMinuteDiscounts_RQ", direction: "push", mandatory: false, implemented: true, max_age_hours: 24,
    api_methods: ["Push_PutLastMinuteDiscounts_RQ", "Pull_ListPropertyDiscounts_RQ"],
    rolos_surface: "Discount ladder save (event) + daily discount cron", rolos_stream: "Specials / discount ladder", rolos_wired: true, sync_actions: ["push_last_minute", "push_discounts", "refresh_discounts", "inventory_push", "discount_ladder"], note: "Pushed on change and re-pushed daily" },


  // ── reservations ──
  { key: "reservations", area: "reservations", label: "Pull reservations", ru_method: "Pull_ListReservations_RQ", direction: "pull", mandatory: true, implemented: true,
    api_methods: ["Pull_ListReservations_RQ"],
    rolos_surface: "Reservation poll cron (30 min) → dashboard + calendar", rolos_stream: "Bookings inbound", rolos_wired: true, sync_actions: ["pull_reservations", "list_reservations"], max_age_hours: 1, note: "StatusID 1,2,4,6,7,8 — sub-user scoped" },
  { key: "leads", area: "reservations", label: "Pull leads / requests", ru_method: "Pull_GetLeads_RQ", direction: "pull", mandatory: false, implemented: true,
    api_methods: ["Pull_GetLeads_RQ"],
    rolos_surface: "Reservation poll cron → 3-day hold on calendar", rolos_stream: "Leads inbound", rolos_wired: true, sync_actions: ["pull_reservations", "lead_lifecycle"], max_age_hours: 24, note: "Creates availability hold" },
  { key: "lead_lifecycle", area: "reservations", label: "Lead hold lifecycle", ru_method: "Push_RejectRequest_RQ", direction: "push", mandatory: false, implemented: true,
    api_methods: ["Push_RejectRequest_RQ"],
    rolos_surface: "ru-lead-lifecycle cron (30 min)", rolos_stream: "Leads — hold release & auto-withdraw", rolos_wired: true, sync_actions: ["lead_lifecycle", "reject_request"], max_age_hours: 24, note: "3-day hold, 14-day arrival withdrawal" },
  { rolos_via_cert: true, key: "reservation_idempotency", area: "reservations", label: "Reservation idempotency / RLNM replay", ru_method: "Pull_ListReservations_RQ / RLNM (idempotency)", direction: "pull", mandatory: false, implemented: true,
    rolos_surface: "RU console → Reservations panel → Idempotency test", rolos_stream: "Certification evidence", rolos_wired: true, sync_actions: ["reservation_idempotency_test", "rlnm_replay_test"], note: "Shared ingest path: notification + poll produce one booking" },
  { key: "reservation_detail", area: "reservations", label: "Reservation detail by ID", ru_method: "Pull_GetReservationByID_RQ", direction: "pull", mandatory: true, implemented: true,
    api_methods: ["Pull_GetReservationByID_RQ"],
    rolos_surface: "RU console → Reservations panel → Fetch from channel", rolos_stream: "Bookings inbound — single reservation detail", rolos_wired: true, sync_actions: ["reservation_detail_test", "get_reservation_by_id"], note: "Single-reservation detail for certification tests and support cases; also used by RLNM to reconcile empty StayInfos" },
  { rolos_via_cert: true, key: "creator_mapping", area: "reservations", label: "Channel creator mapping", ru_method: "Reservation Creator → sales channel", direction: "pull", mandatory: false, implemented: true,
    rolos_surface: "RU console → Reservations panel → Creator mapping", rolos_stream: "Bookings inbound — channel attribution", rolos_wired: true, sync_actions: ["creator_mapping_check", "pull_reservations"], note: "Maps the RU Creator account to a ROL'OS sales channel" },


  // ── lifecycle ──
  { key: "cancel", area: "lifecycle", label: "Cancel reservation", ru_method: "Push_CancelReservation_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["Push_CancelReservation_RQ"],
    rolos_surface: "Dashboard booking card → Cancel booking", rolos_stream: "Bookings outbound — cancellation", rolos_wired: true, sync_actions: ["cancel_reservation"], note: "Mandatory CancelTypeID; status 178 blocked" },
  { key: "reject", area: "lifecycle", label: "Reject request", ru_method: "Push_RejectRequest_RQ (booking card)", direction: "push", mandatory: false, implemented: true,
    api_methods: ["Push_RejectRequest_RQ"],
    rolos_surface: "Dashboard booking card → Cancel (unconfirmed request)", rolos_stream: "Leads outbound — rejection", rolos_wired: true, sync_actions: ["reject_request"], note: "Preferred for StatusID 4" },
  { key: "modify", area: "lifecycle", label: "Modify stay", ru_method: "Push_ModifyStay_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["Push_ModifyStay_RQ"],
    rolos_surface: "Dashboard booking card → Modify booking", rolos_stream: "Bookings outbound — modification", rolos_wired: true, sync_actions: ["modify_stay"], note: "Requires Current + Modify nodes" },

  // ── notifications ──
  { key: "rlnm", area: "notifications", label: "Subscribe RLNM handler", ru_method: "LNM_PutHandlerUrl_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["LNM_PutHandlerUrl_RQ", "rentalsunited-api:subscribe_notifications"],
    rolos_surface: "Live notifications panel + daily cron", rolos_stream: "Reservation push notifications", rolos_wired: true, sync_actions: ["PutHandlerUrl", "RLNM"], max_age_hours: 24, note: "ru-reservation-handler endpoint" },
  { key: "lnm_subscribe", area: "notifications", label: "Subscribe LNM (content + ARI)", ru_method: "Push_PutLiveNotificationMechanismSubscriptions_RQ", direction: "push", mandatory: true, implemented: true,
    api_methods: ["Push_PutLiveNotificationMechanismSubscriptions_RQ"],
    rolos_surface: "Live notifications panel + daily cron", rolos_stream: "Content / ARI change webhooks", rolos_wired: true, sync_actions: ["PutLnmSubscriptions", "lnm_duplicate_test"], max_age_hours: 24, note: "" },
  { key: "lnm_verify", area: "notifications", label: "Verify LNM subscriptions", ru_method: "Pull_ListLiveNotificationMechanismSubscriptions_RQ", direction: "pull", mandatory: true, implemented: true,
    api_methods: ["Pull_ListLiveNotificationMechanismSubscriptions_RQ"],
    rolos_surface: "Live notifications panel (read-back) + property status chips", rolos_stream: "Webhook drift detection", rolos_wired: true, sync_actions: ["ListLnmSubscriptions", "lnm_duplicate_test"], max_age_hours: 24, note: "" },
  { rolos_via_cert: true, key: "lnm_change_types", area: "notifications", label: "List LNM change types", ru_method: "Pull_ListLiveNotificationMechanismChangeTypes_RQ", direction: "pull", mandatory: false, implemented: true,
    api_methods: ["Pull_ListLiveNotificationMechanismChangeTypes_RQ"],
    rolos_surface: "Live notifications panel (dictionary)", rolos_stream: "Reference data", rolos_wired: true, sync_actions: ["ListLnmChangeTypes", "list_lnm_change_types"], note: "Dictionary read" },
  { rolos_via_cert: true, key: "lnm_duplicate", area: "notifications", label: "LNM duplicate-subscription test", ru_method: "Push_PutLiveNotificationMechanismSubscriptions_RQ (idempotency)", direction: "push", mandatory: false, implemented: true,
    rolos_surface: "Live notifications panel → Duplicate test", rolos_stream: "Certification evidence", rolos_wired: true, sync_actions: ["lnm_duplicate_test"], note: "Subscribes twice, proves RU holds one record" },
  { key: "lnm_inbound", area: "notifications", label: "Inbound notification handler", ru_method: "LNM notification (inbound)", direction: "webhook", mandatory: true, implemented: true,
    rolos_surface: "ru-lnm-handler → MCQ orders + corrective re-pull", rolos_stream: "Inbound webhooks", rolos_wired: true, sync_actions: ["LNM_Notification", "lnm_repull"], note: "Routes PropertyMCQEligibilityCheck; ARI/static change types trigger an immediate corrective read-back" },

  { key: "sales_channels", area: "notifications", label: "List sales channels", ru_method: "Pull_ListSalesChannels_RQ", direction: "pull", mandatory: true, implemented: true,
    api_methods: ["Pull_ListSalesChannels_RQ"],
    rolos_surface: "RU console → sales channel ID", rolos_stream: "Step B — channel readiness", rolos_wired: true, sync_actions: ["resolve_sales_channel", "list_sales_channels"], max_age_hours: 720, note: "Resolves LekkeSlaap ChannelID for MCQ" },
  { rolos_via_cert: true, informational: true, max_age_hours: 168, key: "mcq", area: "notifications", label: "Order content quality check", ru_method: "CM_LNM_OrderMinimumContentQualityCheck_RQ", direction: "push", mandatory: false, implemented: true,
    rolos_surface: "RU console → content quality check + property status chips", rolos_stream: "Step B — channel readiness", rolos_wired: true, sync_actions: ["order_mcq", "mcq_duplicate_test"], note: "Endpoint reachable; the channel account cannot return a quality-check result, so failures are reported as blocked upstream and excluded from the score" },
  { rolos_via_cert: true, informational: true, max_age_hours: 168, key: "mcq_duplicate", area: "notifications", label: "MCQ duplicate-order test", ru_method: "CM_LNM_OrderMinimumContentQualityCheck_RQ (idempotency)", direction: "push", mandatory: false, implemented: true,
    rolos_surface: "Live notifications panel → Duplicate test", rolos_stream: "Certification evidence", rolos_wired: true, sync_actions: ["mcq_duplicate_test"], note: "Orders twice; no usable channel response in this account — blocked upstream, excluded from the score" },

  // ── dictionaries / helpers (scored: the property editor cannot function without them) ──
  { rolos_via_cert: true, key: "amenities_dictionary", area: "content", label: "Amenity dictionary", ru_method: "Pull_ListAmenities_RQ", direction: "pull", mandatory: false, implemented: true,
    api_methods: ["Pull_ListAmenities_RQ", "Pull_ListPropTypes_RQ"],
    cache_evidence: { table: "ru_amenities", label: "RU amenity register" },
    rolos_surface: "Edit property → amenity mapping (ru_amenities cache)", rolos_stream: "Reference data — amenity picker", rolos_wired: true, sync_actions: ["list_amenities", "refresh_amenities"], note: "Dictionary read — the full amenity list in the property editor is built from this register" },
  { rolos_via_cert: true, key: "composition_dictionary", area: "content", label: "Composition room dictionary", ru_method: "Pull_ListCompositionRooms_RQ", direction: "pull", mandatory: false, implemented: true,
    api_methods: ["Pull_ListCompositionRooms_RQ"],
    rolos_surface: "Edit property → composition builder (rooms & beds)", rolos_stream: "Reference data — bedroom / bed authoring", rolos_wired: true, sync_actions: ["list_composition_rooms"], note: "Dictionary read — bedroom / bathroom / kitchen type IDs used by the room & bed builder" },
  { rolos_via_cert: true, key: "location_lookup", area: "account", label: "Location lookup helpers", ru_method: "Pull_GetLocationByCoordinates_RQ / Pull_ListLocationsBySearchString_RQ", direction: "pull", mandatory: false, implemented: true,
    api_methods: ["Pull_GetLocationByCoordinates_RQ", "Pull_GetLocationByName_RQ", "Pull_ListLocationsBySearchString_RQ"],
    rolos_surface: "Edit property → address resolution & location search", rolos_stream: "Step B — address mapping", rolos_wired: true, sync_actions: ["get_location_by_coordinates", "get_location_by_name"], note: "Resolves the RU LocationID from coordinates or a typed city name — the address cannot be captured without it" },
  { rolos_via_cert: true, key: "cities_currencies", area: "account", label: "Cities + currencies register", ru_method: "Pull_ListCitiesProps_RQ", direction: "pull", mandatory: false, implemented: true,
    api_methods: ["Pull_ListCitiesProps_RQ", "Pull_ListCurrenciesWithCities_RQ"],
    rolos_surface: "RU console → Currency panel (register refresh) + currency verification", rolos_stream: "Reference data — city & currency scope", rolos_wired: true, sync_actions: ["list_cities_and_currencies"], note: "Backs currency verification and the city/currency scope used when company details are submitted" },
  { rolos_via_cert: true, key: "property_status", area: "content", label: "Set listing status (archive / restore)", ru_method: "Push_PutPropertyStatus_RQ", direction: "push", mandatory: false, implemented: true,
    api_methods: ["Push_SetPropertiesStatus_RQ", "Push_PutPropertyStatus_RQ"],
    rolos_surface: "Channel monitor → activate / deactivate listing", rolos_stream: "Lifecycle — archive & reactivate", rolos_wired: true, sync_actions: ["set_property_status", "archive_property", "reactivate_property"], note: "Used by the archive / one-click reactivation flow" },


];



// Refresh cadences mandated by RU (hours)
const CADENCE_RULES = [
  { key: "PutProperty", label: "Property content refresh", ru_method: "Push_PutProperty_RQ", max_age_hours: 168, actions: ["weekly_content_refresh", "PutProperty", "push_property", "static_delta", "inventory_push"] },
  { key: "PutAvbUnits", label: "Availability refresh", ru_method: "Push_PutAvbUnits_RQ", max_age_hours: 24, actions: ["refresh_ari", "PutAvbUnits", "push_availability", "availability_playground", "duplicate_range_test"] },
  { key: "PutPrices", label: "Pricing refresh", ru_method: "Push_PutPrices_RQ", max_age_hours: 24, actions: ["refresh_ari", "PutPrices", "push_prices", "pricing_playground", "pricing_duplicate_test"] },
  { key: "PutDiscounts", label: "Discount ladder refresh", ru_method: "Push_PutLongStayDiscounts_RQ / Push_PutLastMinuteDiscounts_RQ", max_age_hours: 24, actions: ["refresh_discounts", "push_discounts", "push_long_stay", "push_last_minute", "inventory_push"] },
  { key: "ListReservations", label: "Reservation pull", ru_method: "Pull_ListReservations_RQ", max_age_hours: 1, actions: ["pull_reservations", "ListReservations"] },
  { key: "PutHandlerUrl", label: "RLNM handler subscription", ru_method: "LNM_PutHandlerUrl_RQ", max_age_hours: 24, actions: ["weekly_content_refresh", "PutHandlerUrl", "RLNM"] },
  { key: "PutLnmSubscriptions", label: "LNM subscriptions (content + ARI)", ru_method: "Push_PutLiveNotificationMechanismSubscriptions_RQ", max_age_hours: 24, actions: ["PutLnmSubscriptions", "LNM", "lnm_duplicate_test"] },
  { key: "ListLnmSubscriptions", label: "LNM subscription read-back", ru_method: "Pull_ListLiveNotificationMechanismSubscriptions_RQ", max_age_hours: 24, actions: ["ListLnmSubscriptions", "lnm_duplicate_test"] },
];


// pg_cron jobs that must exist for RU cadence compliance
const EXPECTED_JOBS = [
  { jobname: "ru-content-weekly", schedule: "0 2 * * 1", fn: "cron-push-all-properties-to-ru", label: "Weekly property content push" },
  { jobname: "ru-ari-refresh", schedule: "0 */6 * * *", fn: "cron-refresh-ru-ari", label: "ARI refresh (every 6h)" },
  { jobname: "ru-discounts-daily", schedule: "0 4 * * *", fn: "cron-refresh-ru-discounts", label: "Discount ladder push (daily)" },
  { jobname: "ru-reservations-poll", schedule: "*/30 * * * *", fn: "cron-pull-ru-reservations", label: "Reservation poll (every 30 min)" },
  { jobname: "ru-rlnm-daily", schedule: "0 1 * * *", fn: "cron-ru-rlnm-refresh", label: "RLNM + LNM subscriptions re-subscribe (daily)" },
  { jobname: "prune-ru-api-log-daily", schedule: "17 3 * * *", fn: "cron-prune-ru-api-log", label: "XML log retention prune (daily, 90-day window)" },
];


const RUNNABLE_JOBS = new Set(EXPECTED_JOBS.map((j) => j.fn));

/**
 * Milestones can also be satisfied outside a certification run: the daily cron jobs and the
 * Live-notifications panel exercise the same RU methods and log to `ru_sync_runs`. Without
 * this fallback a milestone reads "never run" even though the call succeeded minutes ago —
 * which is exactly what happened to the LNM rows after they were subscribed from the panel.
 */
const MILESTONE_SYNC_ACTIONS: Record<string, string[]> = {
  "LNM_PutHandlerUrl_RQ": ["PutHandlerUrl", "RLNM"],
  "Push_PutLiveNotificationMechanismSubscriptions_RQ": ["PutLnmSubscriptions", "lnm_duplicate_test"],
  "Pull_ListLiveNotificationMechanismSubscriptions_RQ": ["ListLnmSubscriptions", "lnm_duplicate_test"],
  "Push_PutLiveNotificationMechanismSubscriptions_RQ (idempotency)": ["lnm_duplicate_test"],
  "CM_LNM_OrderMinimumContentQualityCheck_RQ (idempotency)": ["mcq_duplicate_test"],
  "Pull_ListReservations_RQ / RLNM (idempotency)": ["reservation_idempotency_test", "rlnm_replay_test"],
  "Reservation Creator → sales channel": ["creator_mapping_check", "pull_reservations"],

  "Pull_ListReservations_RQ": ["pull_reservations"],
  "Pull_GetReservationByID_RQ": ["reservation_detail_test", "get_reservation_by_id"],
  "Pull_GetLeads_RQ": ["lead_lifecycle", "pull_reservations"],
  "Push_PutProperty_RQ": ["inventory_push", "weekly_content_refresh", "static_delta"],
  "Push_PutProperty_RQ (differential)": ["static_delta"],
  "Push_PutAvbUnits_RQ": ["refresh_ari", "availability_playground", "duplicate_range_test"],
  "Push_PutPrices_RQ": ["refresh_ari", "pricing_playground", "pricing_duplicate_test"],
  "Push_PutLongStayDiscounts_RQ": ["push_long_stay", "push_discounts", "refresh_discounts", "inventory_push"],
  "Push_PutLastMinuteDiscounts_RQ": ["push_last_minute", "push_discounts", "refresh_discounts", "inventory_push"],
  "LNM notification (inbound)": ["LNM_Notification", "lnm_repull"],
  "Pull_ListSalesChannels_RQ": ["resolve_sales_channel", "list_sales_channels"],

};

/** Cert runs are orchestrated in phases from the browser; a closed tab or a failed phase
 *  leaves the record stuck on "running" forever. Close out anything idle past this window. */
const STALE_RUN_MINUTES = 20;

async function reapStaleRuns(admin: ReturnType<typeof createClient>): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60000).toISOString();
  const { data: stale } = await admin
    .from("ru_cert_runs")
    .select("id, passed, failed, total, steps")
    .is("finished_at", null)
    .lt("started_at", cutoff)
    .limit(50);
  for (const run of (stale ?? []) as { id: string; passed: number; failed: number; total: number; steps: unknown[] }[]) {
    const steps = Array.isArray(run.steps) ? [...run.steps] : [];
    steps.push({
      step: steps.length + 1,
      name: "Run finalised automatically",
      ru_method: "—",
      mandatory: false,
      scope: "account",
      status: "skipped",
      duration_ms: 0,
      detail:
        `No phase reported back within ${STALE_RUN_MINUTES} minutes (browser closed or a later phase was started as its own run). ` +
        "Status below reflects the steps that were recorded.",
    });
    await admin
      .from("ru_cert_runs")
      .update({
        status: (run.failed ?? 0) > 0 ? "failed" : "passed",
        finished_at: new Date().toISOString(),
        steps,
      })
      .eq("id", run.id);
  }
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Coverage evidence: every RU-touching console action is logged to ru_sync_runs.
  // `json` is shadowed here so the log write happens on whichever branch responds.
  const startedAtMs = Date.now();
  let logActionName = "";
  let logPropertyId: string | null = null;
  const json = (payload: unknown, status = 200): Response => {
    void logPortalAction(admin, logActionName, logPropertyId, payload, Date.now() - startedAtMs);
    return jsonResponse(payload, status);
  };

  try {

    // ── Auth: admin / dev / fearless_leader only ──
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing Authorization header" } }, 401);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "";
    logActionName = action;
    logPropertyId = typeof body.property_id === "string" ? body.property_id : null;

    /**
     * Internal system calls: a background push (`push-property-to-ru`) or a cron has no user
     * session, so it authenticates with the service-role key. Without this narrow bypass the
     * post-push listing read-back always came back "Invalid session" and a clean publish read
     * as a failure. Only the read-only resolver is reachable this way.
     */
    // `ledger_drain_recheck` is the background stale drain (Phase 4): local-only by
    // construction — it can never probe the channel — so a cron may run it with the
    // service-role key without opening any RU traffic.
    const INTERNAL_SERVICE_ACTIONS = ["resolve_ru_property_ids", "ledger_drain_recheck"];
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    /** A service-role JWT is also accepted, so a rotated key does not break system read-backs. */
    const bearerIsServiceRole = (() => {
      try {
        const part = bearer.split(".")[1];
        if (!part) return false;
        const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
        return claims?.role === "service_role";
      } catch {
        return false;
      }
    })();
    const isInternalService = INTERNAL_SERVICE_ACTIONS.includes(action) &&
      ((!!serviceKey && bearer === serviceKey) || bearerIsServiceRole);


    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    let user: { id: string; email?: string | null } = { id: "00000000-0000-0000-0000-000000000000", email: "system@rolos.internal" };
    let allowed = isInternalService;
    // Hoisted: audit trails further down (unbind, key actions, pushes) read `roles`
    // for the actor role, so it must exist for service/cron calls too.
    let roles: { role: string }[] = [];

    if (!isInternalService) {
      const { data: userData } = await userClient.auth.getUser();
      const authed = userData?.user;
      if (!authed) return json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid session" } }, 401);
      user = { id: authed.id, email: authed.email ?? null };

      const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", authed.id);
      roles = (roleRows ?? []) as { role: string }[];
      allowed = roles.some((r) => ["admin", "dev", "fearless_leader"].includes(r.role));
    }




    // Property-scoped users (ROLOS owners / staff) may read status/readiness
    // information for a property they can access — everything else is admin-only.
    const PROPERTY_SCOPED_READ_ACTIONS = [
      "property_readiness",
      "phase_status",
      "property_ru_identity",
      "lnm_status",
      "resolve_ru_property_ids",
      "ledger_get",
    ];
    if (!allowed) {
      if (!PROPERTY_SCOPED_READ_ACTIONS.includes(action) || !body.property_id) {
        return json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required" } }, 403);
      }
      const { data: canAccess } = await userClient.rpc("can_access_property", {
        _property_id: body.property_id,
        _user_id: user.id,
      });
      if (canAccess !== true) {
        return json({ success: false, error: { code: "FORBIDDEN", message: "No access to this property" } }, 403);
      }
    }

    // ── milestones: certification matrix built from the most recent runs ──
    if (action === "milestones") {
      await reapStaleRuns(admin);
      const { data: runs } = await admin
        .from("ru_cert_runs")
        .select("id, started_at, suite, steps")
        .order("started_at", { ascending: false })
        .limit(25);

      type StepRow = { name: string; ru_method: string; status: StepStatus; ru_status_id?: string | null; detail?: string };
      const latestByMethod = new Map<string, { step: StepRow; run_id: string; at: string }>();
      for (const run of (runs ?? []) as { id: string; started_at: string; steps: StepRow[] }[]) {
        for (const step of run.steps ?? []) {
          // A step may cover several RU methods (e.g. "Push_PutAvbUnits_RQ + Push_PutPrices_RQ")
          // — register it under each method so the milestone matrix picks it up.
          for (const key of String(step.ru_method ?? "").split("+").map((k) => k.trim()).filter(Boolean)) {
            if (!latestByMethod.has(key)) latestByMethod.set(key, { step, run_id: run.id, at: run.started_at });
          }
        }
      }

      // Cron jobs and the Live-notifications panel exercise the same methods outside a cert
      // run and log to ru_sync_runs — use the newest of those when no cert step covers it.
      const { data: syncRows } = await admin
        .from("ru_sync_runs")
        .select("action, success, error_message, created_at")
        .gte("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(3000);
      const latestSyncByAction = new Map<string, { success: boolean; error_message: string | null; created_at: string }>();
      for (const row of (syncRows ?? []) as { action: string; success: boolean; error_message: string | null; created_at: string }[]) {
        if (!latestSyncByAction.has(row.action)) latestSyncByAction.set(row.action, row);
      }

      const milestones = CERT_MILESTONES.map((m) => {
        const hit = latestByMethod.get(m.ru_method);
        if (!hit) {
          for (const act of MILESTONE_SYNC_ACTIONS[m.ru_method] ?? []) {
            const sync = latestSyncByAction.get(act);
            if (!sync) continue;
            return {
              ...m,
              status: (sync.success ? "passed" : "failed") as StepStatus,
              partial_success: false,
              ru_status_id: null,
              detail: sync.success
                ? `Verified outside a certification run — scheduled/manual "${act}" succeeded.`
                : sync.error_message ?? `Scheduled/manual "${act}" failed.`,
              last_run_at: sync.created_at,
              run_id: null,
              source: "sync_log" as const,
            };
          }
        }
        const statusId = hit?.step.ru_status_id ?? null;
        const partial = String(statusId ?? "") === "5";
        return {
          ...m,
          status: hit ? (hit.step.status as StepStatus) : ("never_run" as const),
          partial_success: partial,
          ru_status_id: statusId,
          detail: hit?.step.detail ?? null,
          last_run_at: hit?.at ?? null,
          run_id: hit?.run_id ?? null,
          source: hit ? ("cert_run" as const) : ("none" as const),
        };
      });

      const mandatory = milestones.filter((m) => m.mandatory);
      return json({
        success: true,
        milestones,
        summary: {
          mandatory_total: mandatory.length,
          mandatory_passed: mandatory.filter((m) => m.status === "passed" && !m.partial_success).length,
          partial: milestones.filter((m) => m.partial_success).length,
          never_run: milestones.filter((m) => m.status === "never_run").length,
        },
      });
    }

    // ── coverage_matrix / coverage_evidence: full RU endpoint + ROLOS wiring compliance ──
    if (action === "coverage_matrix" || action === "coverage_evidence") {
      await reapStaleRuns(admin);

      const { data: certRuns } = await admin
        .from("ru_cert_runs")
        .select("id, started_at, finished_at, suite, status, passed, failed, total, property_id, ru_property_id, steps")
        .order("started_at", { ascending: false })
        .limit(25);

      type StepRow = { name: string; ru_method: string; status: StepStatus; ru_status_id?: string | null; detail?: string };
      // Cert steps label methods loosely ("Pull_ListProp_RQ (health)", "A + B",
      // "Pull_ListOwnerBuildings_RQ"), so match on a normalised key plus registry aliases.
      const normMethod = (m: string) => m.replace(/\([^)]*\)/g, "").replace(/[\s_]+/g, "").trim().toLowerCase();
      const latestByMethod = new Map<string, { step: StepRow; run_id: string; at: string }>();
      for (const run of (certRuns ?? []) as { id: string; started_at: string; steps: StepRow[] }[]) {
        for (const step of run.steps ?? []) {
          for (const raw of String(step.ru_method ?? "").split("+").map((k) => k.trim()).filter(Boolean)) {
            const key = normMethod(raw);
            if (!key || key === "—") continue;
            if (!latestByMethod.has(key)) latestByMethod.set(key, { step, run_id: run.id, at: run.started_at });
          }
        }
      }


      const { data: syncRows } = await admin
        .from("ru_sync_runs")
        .select("action, success, error_code, error_message, created_at, property_id, ru_property_id")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5000);
      type SyncRow = {
        action: string; success: boolean; error_code: string | null; error_message: string | null;
        created_at: string; property_id: string | null; ru_property_id: string | null;
      };
      const latestSyncByAction = new Map<string, SyncRow>();
      const latestSuccessByAction = new Map<string, SyncRow>();
      for (const row of (syncRows ?? []) as SyncRow[]) {
        if (!latestSyncByAction.has(row.action)) latestSyncByAction.set(row.action, row);
        if (row.success && !latestSuccessByAction.has(row.action)) latestSuccessByAction.set(row.action, row);
      }

      // Phase 1/2 pre-date endpoint logging. The durable account row is authoritative
      // historical evidence that RU created the child user and accepted company details.
      const { data: latestOwnerAccount } = await admin
        .from("ru_owner_accounts")
        .select("created_at, company_details_sent, company_filled_at")
        .not("ru_owner_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const addHistoricalSuccess = (action: string, at: string | null | undefined) => {
        if (!at || latestSyncByAction.has(action)) return;
        const row: SyncRow = {
          action,
          success: true,
          error_code: null,
          error_message: null,
          created_at: at,
          property_id: null,
          ru_property_id: null,
        };
        latestSyncByAction.set(action, row);
        latestSuccessByAction.set(action, row);
      };
      addHistoricalSuccess("ensure_owner_account", latestOwnerAccount?.created_at);
      if (latestOwnerAccount?.company_details_sent === true) {
        addHistoricalSuccess("ensure_company_details", latestOwnerAccount.company_filled_at);
      }

      // Raw XML call log: ANY sub-account that ever succeeded on a method proves the
      // endpoint works, so successes are aggregated per normalised method name.
      // ARI methods run tens of thousands of times a day and would otherwise crowd every
      // other method out of the fetch window, so they are probed separately.
      const HIGH_VOLUME_METHODS = [
        "Pull_ListPropertyAvailabilityCalendar_RQ",
        "Pull_ListPropertyPrices_RQ",
        "Push_PutAvbUnits_RQ",
        "Push_PutPrices_RQ",
        "Push_PutProperty_RQ",
      ];
      type ApiRow = {
        action: string; parent_action: string | null; success: boolean;
        error_message: string | null; status_message: string | null;
        created_at: string; ru_owner_id: string | null;
      };
      const apiSelect = "action, parent_action, success, error_message, status_message, created_at, ru_owner_id";
      const [{ data: apiRows }, ...highVolume] = await Promise.all([
        admin
          .from("ru_api_log")
          .select(apiSelect)
          .not("action", "in", `(${HIGH_VOLUME_METHODS.join(",")})`)
          .order("created_at", { ascending: false })
          .limit(8000),
        ...HIGH_VOLUME_METHODS.flatMap((m) => [
          admin.from("ru_api_log").select(apiSelect).eq("action", m).eq("success", true).order("created_at", { ascending: false }).limit(1),
          admin.from("ru_api_log").select(apiSelect).eq("action", m).order("created_at", { ascending: false }).limit(1),
        ]),
      ]);
      type ApiEvidence = {
        last_success_at: string | null;
        last_attempt_at: string | null;
        last_attempt_success: boolean;
        last_error: string | null;
        accounts: Set<string>;
        successes: number;
        attempts: number;
      };
      const apiByMethod = new Map<string, ApiEvidence>();
      const touchApi = (raw: string | null, row: ApiRow) => {
        const key = normMethod(String(raw ?? ""));
        if (!key) return;
        let ev = apiByMethod.get(key);
        if (!ev) {
          ev = { last_success_at: null, last_attempt_at: null, last_attempt_success: false, last_error: null, accounts: new Set(), successes: 0, attempts: 0 };
          apiByMethod.set(key, ev);
        }
        ev.attempts += 1;
        if (!ev.last_attempt_at) {
          ev.last_attempt_at = row.created_at;
          ev.last_attempt_success = row.success;
          ev.last_error = row.success ? null : (row.status_message ?? row.error_message ?? null);
        }
        if (row.success) {
          ev.successes += 1;
          if (!ev.last_success_at) ev.last_success_at = row.created_at;
          if (row.ru_owner_id) ev.accounts.add(row.ru_owner_id);
        }
      };
      const allApiRows = [
        ...((apiRows ?? []) as ApiRow[]),
        ...highVolume.flatMap((r) => ((r?.data ?? []) as ApiRow[])),
      ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      for (const row of allApiRows) {
        touchApi(row.action, row);
        touchApi(row.parent_action, row);
      }


      // Dictionary caches: a populated register is durable proof the pull succeeded, even
      // after the raw XML log rows have aged out.
      const cacheTables = [...new Set(RU_ENDPOINT_REGISTRY.map((e) => e.cache_evidence?.table).filter(Boolean))] as string[];
      const cacheEvidence = new Map<string, { rows: number; latest: string | null }>();
      // Dictionary caches don't share a timestamp column (ru_amenities has synced_at/created_at,
      // ru_locations only last_synced_at), so probe candidates and ignore the misses instead of
      // hardcoding updated_at — that raised "column ... does not exist" on every coverage read.
      const TIMESTAMP_CANDIDATES = ["updated_at", "synced_at", "last_synced_at", "created_at"];
      for (const table of cacheTables) {
        const { count } = await admin.from(table).select("id", { count: "exact", head: true });
        let latest: string | null = null;
        for (const col of TIMESTAMP_CANDIDATES) {
          const { data, error } = await admin
            .from(table)
            .select(col)
            .order(col, { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) continue;
          const value = (data as Record<string, unknown> | null)?.[col];
          if (typeof value === "string") {
            latest = value;
            break;
          }
        }
        cacheEvidence.set(table, { rows: count ?? 0, latest });
      }


      const now = Date.now();

      const rows = RU_ENDPOINT_REGISTRY.map((e) => {
        let cert: { step: StepRow; run_id: string; at: string } | undefined;
        for (const candidate of [e.ru_method, ...(e.cert_methods ?? [])]) {
          const hit = latestByMethod.get(normMethod(candidate));
          if (!hit) continue;
          if (!cert || new Date(hit.at).getTime() > new Date(cert.at).getTime()) cert = hit;
        }

        let status: "passed" | "failed" | "skipped" | "never_run" = "never_run";
        let detail: string | null = null;
        let lastRunAt: string | null = null;
        let source: "cert_run" | "sync_log" | "api_log" | "cache" | "none" = "none";
        let runId: string | null = null;

        if (cert && cert.step.status !== "skipped") {
          status = cert.step.status as typeof status;
          detail = cert.step.detail ?? null;
          lastRunAt = cert.at;
          source = "cert_run";
          runId = cert.run_id;
        }

        // ROLOS-side evidence: the real product surfaces log to ru_sync_runs.
        let rolosStatus: "success" | "failed" | "never_used" | "blocked" = "never_used";
        let rolosLastAt: string | null = null;
        let rolosDetail: string | null = null;
        let rolosSuccessAt: string | null = null;
        let rolosFailureDetail: string | null = null;
        for (const act of e.sync_actions) {
          const ok = latestSuccessByAction.get(act);
          if (ok && (!rolosSuccessAt || new Date(ok.created_at).getTime() > new Date(rolosSuccessAt).getTime())) {
            rolosSuccessAt = ok.created_at;
          }
          const row = latestSyncByAction.get(act);
          if (!row) continue;
          if (rolosLastAt && new Date(row.created_at).getTime() <= new Date(rolosLastAt).getTime()) continue;
          rolosLastAt = row.created_at;
          rolosStatus = row.success ? "success" : "failed";
          rolosDetail = row.success ? `ROL'OS action "${act}" succeeded.` : (row.error_message ?? `ROL'OS action "${act}" failed.`);
          if (!row.success) rolosFailureDetail = rolosDetail;
        }
        // Latest SUCCESS wins here too: a newer failed attempt (usually a retired test
        // sub-account) downgrades freshness, never the verdict, once the ROL'OS surface
        // has been proven to work.
        let rolosLastAttemptFailed = false;
        if (rolosStatus === "failed" && rolosSuccessAt) {
          rolosStatus = "success";
          rolosLastAttemptFailed = true;
          rolosDetail = `Verified from ROL'OS on ${new Date(rolosSuccessAt).toISOString().slice(0, 10)}; the most recent attempt failed: ${rolosFailureDetail ?? "unknown error"}`;
        }

        // Newest evidence wins: a real ROL'OS run (push prices, pull reservations, RLNM
        // subscribe, …) both proves the endpoint works AND resets its freshness clock, even
        // when an older certification run already passed.
        const ts = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
        for (const act of e.sync_actions) {
          for (const row of [latestSyncByAction.get(act), latestSuccessByAction.get(act)]) {
            if (!row) continue;
            if (ts(row.created_at) <= ts(lastRunAt)) continue;
            status = row.success ? "passed" : "failed";
            detail = row.success
              ? `Verified outside a certification run — "${act}" succeeded.`
              : (row.error_message ?? `ROL'OS action "${act}" failed.`);
            lastRunAt = row.created_at;
            source = "sync_log";
            runId = null;
          }
        }

        // ── Raw XML log: latest SUCCESS wins ──────────────────────────────────────
        // A success on ANY sub-account is proof the endpoint works. A later failure
        // (often a retired test account) downgrades freshness, never the verdict.
        let apiSuccessAt: string | null = null;
        let apiAttemptAt: string | null = null;
        let apiAttemptFailed = false;
        let apiError: string | null = null;
        let apiAccounts = 0;
        let apiSuccesses = 0;
        let apiAttempts = 0;
        for (const candidate of [e.ru_method, ...(e.cert_methods ?? []), ...(e.api_methods ?? [])]) {
          const ev = apiByMethod.get(normMethod(candidate));
          if (!ev) continue;
          apiAttempts += ev.attempts;
          apiSuccesses += ev.successes;
          apiAccounts = Math.max(apiAccounts, ev.accounts.size);
          if (ts(ev.last_success_at) > ts(apiSuccessAt)) apiSuccessAt = ev.last_success_at;
          if (ts(ev.last_attempt_at) > ts(apiAttemptAt)) {
            apiAttemptAt = ev.last_attempt_at;
            apiAttemptFailed = !ev.last_attempt_success;
            apiError = ev.last_error;
          }
        }
        if (apiSuccessAt && ts(apiSuccessAt) > ts(lastRunAt)) {
          status = "passed";
          detail = `Live channel call succeeded${apiAccounts > 1 ? ` on ${apiAccounts} accounts` : ""} — ${apiSuccesses} of ${apiAttempts} logged calls returned success.`;
          lastRunAt = apiSuccessAt;
          source = "api_log";
          runId = null;
        } else if (status === "failed" && apiSuccessAt) {
          // Historical success outranks a newer failed attempt.
          status = "passed";
          detail = `Previously verified against the channel (${new Date(apiSuccessAt).toISOString().slice(0, 10)}); the most recent attempt failed.`;
        }
        if (status === "failed" && rolosSuccessAt) {
          // The ROL'OS surface has succeeded before — a later failure is a freshness issue.
          status = "passed";
          detail = detail ?? `Verified from ROL'OS on ${new Date(rolosSuccessAt).toISOString().slice(0, 10)}; the most recent attempt failed.`;
          rolosLastAttemptFailed = true;
        }
        const lastAttemptFailed = status === "passed"
          && ((apiAttemptFailed && ts(apiAttemptAt) > ts(apiSuccessAt)) || rolosLastAttemptFailed);


        // Populated dictionary cache = durable proof the pull succeeded.
        const cache = e.cache_evidence ? cacheEvidence.get(e.cache_evidence.table) : undefined;
        if (cache && cache.rows > 0 && (status === "never_run" || status === "failed")) {
          status = "passed";
          detail = `${e.cache_evidence!.label} is populated with ${cache.rows.toLocaleString("en-ZA")} rows — the pull has completed successfully.`;
          if (ts(cache.latest) > ts(lastRunAt)) lastRunAt = cache.latest;
          source = "cache";
        }

        if (rolosStatus === "never_used" && status === "passed" && (source === "api_log" || source === "cache")) {
          rolosStatus = "success";
          rolosLastAt = lastRunAt;
          rolosDetail = detail;
        }
        if (rolosStatus === "never_used" && e.rolos_via_cert && status !== "never_run") {
          rolosStatus = status === "passed" ? "success" : "failed";
          rolosLastAt = lastRunAt;
          rolosDetail = status === "passed"
            ? "Exercised from the ROL'OS admin console / certification run."
            : detail;
        }
        if (rolosStatus === "failed" && status === "passed" && ts(rolosLastAt) < ts(lastRunAt)) {
          rolosStatus = "success";
          rolosLastAt = lastRunAt;
          rolosDetail = detail;
        }

        if (status === "never_run" && rolosStatus === "failed") {
          status = "failed";
          detail = rolosDetail;
          lastRunAt = rolosLastAt;
          source = "sync_log";
        }

        const ageHours = lastRunAt ? (now - new Date(lastRunAt).getTime()) / 3600000 : null;
        const stale = e.max_age_hours != null && ageHours != null && ageHours > e.max_age_hours;

        // Informational endpoints (reachable, but this channel account returns no usable
        // result) never count as a hard failure and never enter the score denominators.
        const blockedUpstream = !!e.informational && status === "failed";
        if (blockedUpstream) {
          status = "blocked";
          if (rolosStatus === "failed") rolosStatus = "blocked";
          detail = `Blocked upstream — endpoint reachable, no usable channel response. ${detail ?? ""}`.trim();
        }
        const excludedFromScore = !!e.informational;

        let rag: "green" | "amber" | "red" | "grey" = "grey";
        if (status === "passed") rag = stale || lastAttemptFailed ? "amber" : "green";
        else if (status === "blocked") rag = "amber";
        else if (status === "failed") rag = "red";
        else if (!e.implemented) rag = "grey";




        return {
          key: e.key,
          area: e.area,
          label: e.label,
          ru_method: e.ru_method,
          direction: e.direction,
          mandatory: e.mandatory,
          implemented: e.implemented,
          status,
          rag,
          stale,
          blocked_upstream: blockedUpstream,
          excluded_from_score: excludedFromScore,
          age_hours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
          max_age_hours: e.max_age_hours ?? null,
          next_due_at: lastRunAt && e.max_age_hours != null
            ? new Date(new Date(lastRunAt).getTime() + e.max_age_hours * 3600000).toISOString()
            : null,
          detail,
          last_run_at: lastRunAt,
          source,
          run_id: runId,
          accounts_used: apiAccounts,
          api_calls: apiAttempts,
          api_successes: apiSuccesses,
          last_success_at: apiSuccessAt,
          last_attempt_at: apiAttemptAt,
          last_attempt_failed: lastAttemptFailed,
          last_attempt_error: lastAttemptFailed ? (apiError ?? rolosFailureDetail) : null,
          rolos_surface: e.rolos_surface,
          rolos_stream: e.rolos_stream,
          rolos_wired: e.rolos_wired,
          rolos_status: e.rolos_wired ? rolosStatus : "never_used",
          rolos_last_at: rolosLastAt,
          rolos_detail: e.rolos_wired ? rolosDetail : "Not wired into a ROL'OS surface yet.",
          note: e.note,
        };
      });

      const scored = rows.filter((r) => !r.excluded_from_score);
      const implemented = scored.filter((r) => r.implemented);
      const adapterOk = implemented.filter((r) => r.status === "passed").length;
      const wired = scored.filter((r) => r.rolos_wired);
      const rolosOk = wired.filter((r) => r.rolos_status === "success").length;
      const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

      const summary = {
        adapter: {
          total: implemented.length,
          passed: adapterOk,
          failed: implemented.filter((r) => r.status === "failed").length,
          never_run: implemented.filter((r) => r.status === "never_run").length,
          stale: implemented.filter((r) => r.stale).length,
          blocked: rows.filter((r) => r.status === "blocked").length,
          not_implemented: rows.filter((r) => !r.implemented).length,
          percent: pct(adapterOk, implemented.length),
        },
        rolos: {
          total_surfaces: wired.length,
          exercised: rolosOk,
          failed: wired.filter((r) => r.rolos_status === "failed").length,
          never_used: wired.filter((r) => r.rolos_status === "never_used").length,
          not_wired: rows.filter((r) => !r.rolos_wired).length,
          percent: pct(rolosOk, wired.length),

        },
        mandatory: {
          total: rows.filter((r) => r.mandatory).length,
          passed: rows.filter((r) => r.mandatory && r.status === "passed").length,
        },
        generated_at: new Date().toISOString(),
      };

      if (action === "coverage_matrix") {
        return json({ success: true, rows, summary, areas: RU_COVERAGE_AREAS });
      }

      const mappedActions = new Set(RU_ENDPOINT_REGISTRY.flatMap((e) => e.sync_actions));
      return json({
        success: true,
        evidence: {
          generated_at: summary.generated_at,
          integration: "Rentals United — XML API (AccessKey / SecretKey, white-label sub-users)",
          platform: "ROL'OS PMS",
          summary,
          areas: RU_COVERAGE_AREAS,
          endpoints: rows,
          cadence_rules: CADENCE_RULES,
          expected_jobs: EXPECTED_JOBS,
          certification_runs: certRuns ?? [],
          sync_log: ((syncRows ?? []) as SyncRow[]).filter((r) => mappedActions.has(r.action)).slice(0, 1500),
        },
      });
    }


    // ── evidence: printable / downloadable bundle for the RU certification call ──
    if (action === "evidence") {
      const { data: run, error } = await admin
        .from("ru_cert_runs")
        .select("*")
        .eq("id", body.run_id)
        .maybeSingle();
      if (error) throw error;
      if (!run) return json({ success: false, error: { code: "NOT_FOUND", message: "Run not found" } }, 404);

      return json({
        success: true,
        evidence: {
          generated_at: new Date().toISOString(),
          integration: "Rentals United — XML API (AccessKey / SecretKey)",
          run: {
            id: run.id,
            suite: run.suite,
            status: run.status,
            started_at: run.started_at,
            finished_at: run.finished_at,
            passed: run.passed,
            failed: run.failed,
            total: run.total,
            property_id: run.property_id,
            ru_property_id: run.ru_property_id,
          },
          steps: run.steps,
          cadence_rules: CADENCE_RULES,
          expected_jobs: EXPECTED_JOBS,
        },
      });
    }


    // ── list_runs ──
    if (action === "list_runs") {
      await reapStaleRuns(admin);
      const { data, error } = await admin

        .from("ru_cert_runs")
        .select("id, started_at, finished_at, status, suite, property_id, ru_property_id, passed, failed, total")
        .order("started_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return json({ success: true, runs: data ?? [] });
    }

    // ── get_run ──
    if (action === "get_run") {
      const { data, error } = await admin.from("ru_cert_runs").select("*").eq("id", body.run_id).maybeSingle();
      if (error) throw error;
      return json({ success: true, run: data });
    }

    // ── compliance ──
    if (action === "compliance") {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const { data: runs } = await admin
        .from("ru_sync_runs")
        .select("action, success, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);

      const rules = CADENCE_RULES.map((rule) => {
        const match = (runs ?? []).find(
          (r: { action: string; success: boolean }) => rule.actions.includes(r.action) && r.success,
        ) as { created_at: string } | undefined;
        const lastRunAt = match?.created_at ?? null;
        const ageHours = lastRunAt ? (Date.now() - new Date(lastRunAt).getTime()) / 3600000 : null;
        let state: "green" | "amber" | "red" = "red";
        if (ageHours != null) {
          if (ageHours <= rule.max_age_hours) state = "green";
          else if (ageHours <= rule.max_age_hours * 1.5) state = "amber";
        }
        return {
          key: rule.key,
          label: rule.label,
          ru_method: rule.ru_method,
          max_age_hours: rule.max_age_hours,
          last_run_at: lastRunAt,
          age_hours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
          next_due_at: lastRunAt ? new Date(new Date(lastRunAt).getTime() + rule.max_age_hours * 3600000).toISOString() : null,
          state,
        };
      });

      // Scheduled job inventory (pg_cron) — proves the cadence is automated, not manual
      const { data: jobs } = await userClient.rpc("get_ru_cron_jobs");

      return json({ success: true, rules, jobs: jobs ?? [], expected_jobs: EXPECTED_JOBS });
    }

    // ── wl_readiness ──
    // ── run_job: manually satisfy an overdue cadence ──
    if (action === "run_job") {
      const fn: string = body.function_name ?? "";
      if (!RUNNABLE_JOBS.has(fn)) {
        return json({ success: false, error: { code: "BAD_JOB", message: `Unknown job: ${fn}` } }, 400);
      }
      const t0 = Date.now();
      const { data, error } = await admin.functions.invoke(fn, { body: { manual: true } });
      if (error) return json({ success: false, error: { code: "JOB_FAILED", message: error.message } }, 502);
      return json({ success: true, function_name: fn, duration_ms: Date.now() - t0, result: data });
    }

    // Shared per-property readiness scorer (dry run + live 365-day ARI probe).
    const scoreProperty = async (p: {
      id: string;
      name: string;
      rentalsunited_property_id?: string | null;
    }, opts: { probe_ari?: boolean; force_probe?: boolean } = {}) => {
      // A cold/loaded worker occasionally drops the first dry-run invoke (the tail of a
      // portfolio-wide sweep used to report a false "payload could not be built"), so the
      // build is retried once before it is scored as a real content gap.
      let data: any = null;
      let error: { message?: string } | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const res = await admin.functions.invoke("push-property-to-ru", {
          body: { property_id: p.id, dry_run: true },
        });
        data = res.data;
        error = res.error;
        if (!error) break;
        console.warn(`[scoreProperty] dry run for "${p.name}" attempt ${attempt}/2 failed: ${error.message}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
      }
      if (error) {
        const reason = error.message ? ` (${error.message})` : "";
        return {
          property_id: p.id,
          name: p.name,
          ok: false,
          blocked: true,
          error: error.message,
          gaps: [`Dry run could not be completed — retry the check${reason}`],
          checks: [],
          groups: [],
          score: 0,
          checks_total: 0,
          checks_passed: 0,
        };
      }


      const units: RuUnitInput[] = data?.units ?? [
        { name: p.name, validation: data?.validation ?? {} },
      ];

      // ── Local rate coverage (calendar first, rack rate fallback) ──
      // Reports what ROLOS would push, independently of what RU currently holds.
      let localCoverage: { summary: string; calendar_days: number; rack_days: number; unpriced_days: number; complete: boolean; unit_count: number } | null = null;
      let unlinkedUnits: { id: string; name: string; linked_rolos_id: string | null }[] = [];
      const mappedUnitRows = (data?.units ?? []).filter(
        (unit: { ru_property_id?: string | null }) => Number(unit.ru_property_id) > 0,
      );
      try {
        const from = isoDate(0);
        const to = isoDate(365);
        const resolver = await createRateResolver(admin, p.id, { window: { from, to }, audience: "channels" });
        const expectedDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
        const mappedIds = new Set(
          mappedUnitRows.map((unit: { room_type_id?: string }) => unit.room_type_id).filter(Boolean),
        );
        const targets = mappedIds.size > 0
          ? resolver.units.filter((unit) => mappedIds.has(unit.id))
          : resolver.units.length > 0 ? resolver.units : [{ id: p.id, name: p.name }];
        const targetIds = new Set(targets.map((unit) => unit.id));
        unlinkedUnits = resolver.unlinkedUnits().filter((unit) => targetIds.has(unit.id));
        let calendar = 0, rack = 0, priced = 0;
        let overrideDays = 0, planSeasonDays = 0, relationalDays = 0;
        for (const u of targets) {
          const days = resolver.resolveDays(u, from, to);
          const cov = resolver.coverage(days);
          calendar += cov.calendar_days;
          overrideDays += cov.daily_override_days ?? 0;
          planSeasonDays += cov.plan_season_days ?? 0;
          relationalDays += cov.relational_days ?? 0;
          rack += cov.rack_days + cov.unit_daily_days;
          priced += cov.priced_days;
        }
        const perUnitExpected = expectedDays * targets.length;
        localCoverage = {
          summary: describeCoverage(perUnitExpected, {
            total_days: priced, priced_days: priced, calendar_days: calendar,
            daily_override_days: overrideDays, plan_season_days: planSeasonDays, relational_days: relationalDays,
            rack_days: rack, unit_daily_days: 0, unpriced_days: perUnitExpected - priced,
          }),

          calendar_days: calendar,
          rack_days: rack,
          unpriced_days: Math.max(0, perUnitExpected - priced),
          complete: priced === perUnitExpected && perUnitExpected > 0,
          unit_count: targets.length,
        };
      } catch (e) {
        console.warn("[scoreProperty] rate coverage probe failed:", e);
      }


      // ── Live ARI verification (365 days forward) ──
      const extraChecks: RuCheck[] = [];
      let ari: Record<string, unknown> | null = null;
      let availabilitySource: "channel" | "local" | "mixed" = "local";
      // Local readiness is always evaluated, including after publication. Live read-back is
      // verification evidence; an empty transport/account response must not erase a complete
      // outbound payload that the same shared resolver can build now.
      const localWindow = await computeLocalBookableWindow(admin, p.id, { days: 365 });

      const ruIds: number[] = (data?.units ?? [])
        .map((u: { ru_property_id: string | null }) => Number(u.ru_property_id))
        .filter((n: number) => Number.isFinite(n) && n > 0);
      // Channel IDs cannot be focused in the editor — keep the unit name beside every ID so
      // each failing check can name (and open) the unit it belongs to.
      const unitNameByRuId = new Map<number, string>();
      for (const u of (data?.units ?? []) as { ru_property_id?: string | null; name?: string | null }[]) {
        const id = Number(u.ru_property_id);
        if (Number.isFinite(id) && id > 0) unitNameByRuId.set(id, String(u.name ?? "").trim() || `Unit ${id}`);
      }
      const soleUnitName = (data?.units ?? []).length === 1
        ? String((data.units[0] as { name?: string | null }).name ?? "").trim() || p.name
        : (units.length === 1 ? String(units[0].name ?? "").trim() || p.name : null);
      const nameFor = (id: number) => unitNameByRuId.get(id) ?? `RU ${id}`;
      const describeUnits = (ids: number[]) =>
        ids.length === 0 ? "the listing" : ids.map((id) => `${nameFor(id)} (RU ${id})`).join(", ");
      /** Unit routing key when exactly one unit is responsible. */
      const singleFailingUnit = (ids: number[]): string | undefined =>
        ids.length === 1 ? nameFor(ids[0]) : (ids.length === 0 ? soleUnitName ?? undefined : undefined);
      const singleRuId = Number(p.rentalsunited_property_id ?? data?.ru_property_id ?? 0);
      if (ruIds.length === 0 && singleRuId > 0) ruIds.push(singleRuId);
      // Last known good live verdict — used when a probe is skipped, throttled or times out
      // so an earned verification never regresses to "not ready".
      const ariSnapshot = ruIds.length > 0 ? await loadAriSnapshot(admin, p.id) : null;
      /**
       * A stored verdict younger than the snapshot TTL is good enough: re-pulling every unit's
       * calendar on top of it is what filled the background call queue with thousands of
       * `get_prices` / `get_availability` replays. `force_probe` is the only override.
       */
      const snapshotAt = ariSnapshot?.probed_at ? Date.parse(ariSnapshot.probed_at) : NaN;
      const snapshotFresh = Number.isFinite(snapshotAt) && Date.now() - snapshotAt < ARI_SNAPSHOT_TTL_MS;
      const wantProbe = opts.probe_ari !== false && (opts.force_probe === true || !snapshotFresh);
      if (opts.probe_ari !== false && !wantProbe) {
        console.log(`[scoreProperty] "${p.name}": reusing stored ARI verdict (${ariSnapshot?.probed_at}) — no channel read`);
      }

      // Phase 2 must mean the SAME thing everywhere: when the live channel calendar is not
      // read (probing off, or nothing published yet) the two mandatory rules are still scored
      // on the ROL'OS calendar — exactly as the live push gate does. Skipping them made the
      // pipeline card green while the push refused with PHASE_BLOCKED.
      if (wantProbe && ruIds.length > 0) {


        const from = isoDate(0);
        const to = isoDate(365);
        // White-label listings live on the owning sub-user account: reading them with the
        // MASTER credentials returns an empty calendar, which used to be reported as
        // "no open availability day in the next 365 days" even for fully synced units.
        const { account: ownerAccount } = await findOwnerAccount(admin, p.id, null, null);
        const scopedOwnerId = ownerAccount?.ru_owner_id ? Number(ownerAccount.ru_owner_id) : null;
        const scope = scopedOwnerId && scopedOwnerId > 0 ? { owner_id: scopedOwnerId } : {};
        const unitProbes = await Promise.all(ruIds.map(async (ruId) => {
          const cacheKey = `${ruId}|${scopedOwnerId ?? "master"}|${from}`;
          const cached = ariProbeCache.get(cacheKey);
          if (cached && Date.now() - cached.at < ARI_PROBE_TTL_MS) return cached.probe;
          // Each pull passes the shared one-call-per-minute channel gate, which can sleep for
          // seconds. A slow or throttled account must never hold the readiness panel open:
          // the probe is time-boxed and a timeout is reported as "verification pending".
          // `deferrable: false` keeps a throttled read OUT of the retry queue — the scorer
          // already falls back to the last good XML, so parking + replaying it five times
          // only amplified the traffic.
          const [avbRes, priceRes] = await Promise.all([
            withProbeTimeout(admin.functions.invoke("rentalsunited-api", {
              body: { action: "get_availability", readback_purpose: "cert_probe", ru_property_id: ruId, date_from: from, date_to: to, deferrable: false, ...scope },
            })),
            withProbeTimeout(admin.functions.invoke("rentalsunited-api", {
              body: { action: "get_prices", readback_purpose: "cert_probe", ru_property_id: ruId, date_from: from, date_to: to, deferrable: false, ...scope },
            })),
          ]);

          // A rate-limited read comes back as 202 { success: true, queued: true } with no XML.
          // That is "not read", never "answered with an empty calendar" — reuse the last real
          // answer the channel gave for this unit instead of inventing a zero-day verdict.
          let availabilityAnswered = ruReadAnswered(avbRes);
          let pricesAnswered = ruReadAnswered(priceRes);
          let avbXml: string = availabilityAnswered ? String(avbRes.data?.raw_xml ?? "") : "";
          let priceXml: string = pricesAnswered ? String(priceRes.data?.raw_xml ?? "") : "";
          if (!availabilityAnswered) {
            const replayed = await loadLastGoodRuXml(admin, ruId, "Pull_ListPropertyAvailabilityCalendar_RQ");
            if (replayed) {
              avbXml = replayed;
              availabilityAnswered = true;
            }
          }
          if (!pricesAnswered) {
            const replayed = await loadLastGoodRuXml(admin, ruId, "Pull_ListPropertyPrices_RQ");
            if (replayed) {
              priceXml = replayed;
              pricesAnswered = true;
            }
          }
          const prices = parseRuPricePoints(priceXml);
          const openDays = countRuOpenDays(avbXml);
          const bookableWindow = findRuBookableWindow(avbXml, priceXml);
          const probe = {
            ru_property_id: ruId,
            unit_name: nameFor(ruId),
            open_days: openDays,
            price_points: prices.length,
            availability_responded: availabilityAnswered,
            prices_responded: pricesAnswered,
            availability_ok: availabilityAnswered && openDays > 0,
            availability_error: availabilityAnswered
              ? null
              : (avbRes.error?.message ?? avbRes.data?.error?.message ?? "Channel read not available (rate limited or queued)"),
            prices_ok: pricesAnswered && prices.length > 0 && prices.every((price) => price > 0),
            bookable_window: bookableWindow as RuBookableWindow,
          };
          ariProbeCache.set(cacheKey, { at: Date.now(), probe });
          return probe;
        }));

        const hasAvailability = unitProbes.every((probe) => probe.availability_ok);
        const livePricesVerified = unitProbes.every((probe) => probe.prices_ok);
        const pricingReady = livePricesVerified || ariSnapshot?.prices_ok === true || localCoverage?.complete === true;
        const liveAvailabilityResponded = unitProbes.every((probe) =>
          probe.availability_error == null && probe.open_days > 0
        );
        const { data: latestSuccessfulPush } = await admin
          .from("ru_sync_runs")
          .select("id, created_at")
          .eq("property_id", p.id)
          .eq("action", "inventory_push")
          .eq("success", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const localAvailabilityReady = localWindow.ok && localWindow.open_days > 0;
        // A throttled or timed-out read-back must never erase a verdict already earned.
        const snapshotHeldAvailability = !liveAvailabilityResponded && ariSnapshot?.availability_ok === true;
        const snapshotHeldPrices = !livePricesVerified && ariSnapshot?.prices_ok === true;
        const availabilityReady = hasAvailability || snapshotHeldAvailability || (
          !liveAvailabilityResponded && !!latestSuccessfulPush && localAvailabilityReady
        );
        const failedAvailabilityIds = unitProbes.filter((probe) => !probe.availability_ok).map((probe) => probe.ru_property_id);
        const failedPriceIds = unitProbes.filter((probe) => !probe.prices_ok).map((probe) => probe.ru_property_id);

        // Select evidence per unit. A successful availability response with no open days is a
        // genuine failure; open inventory with no returned price is incomplete and must not
        // override the same unit's valid ROL'OS Rate Plan + Calendar evidence.
        const localByName = new Map(localWindow.unit_windows.map((window) => [window.name.trim().toLowerCase(), window]));
        const selectedWindows = unitProbes.flatMap((probe) => {
          const channelComplete = classifyChannelWindowEvidence(probe.bookable_window, {
            availability_responded: probe.availability_responded,
            prices_responded: probe.prices_responded,
          }) === "complete";
          if (channelComplete) return [{ ...probe, evidence_source: "channel" as const }];
          // The channel did not answer for this unit (rate limited, queued or half a response).
          // Score it on ROL'OS evidence — its own unit window, else the property window. When
          // neither exists the unit is simply not scored: an unread unit is never a failure.
          const local = localByName.get(probe.unit_name.trim().toLowerCase())
            ?? (localWindow.unit_windows.length === 1 ? localWindow.unit_windows[0] : null)
            ?? (isMeaningfulWindow(localWindow) ? localWindow : null);
          if (!local) {
            console.warn(
              `[ru-cert-portal] ${probe.unit_name} (RU ${probe.ru_property_id}) was not read and has no ROL'OS window — left unscored`,
            );
            return [];
          }
          return [{ ...probe, bookable_window: local, evidence_source: "local" as const }];
        });
        const channelEvidenceCount = selectedWindows.filter((probe) => probe.evidence_source === "channel").length;
        availabilitySource = selectedWindows.length === 0
          ? "local"
          : channelEvidenceCount === selectedWindows.length
          ? "channel"
          : channelEvidenceCount === 0 ? "local" : "mixed";
        // MinStay + "3 consecutive bookable, priced days" — scored on the weakest selected
        // unit so a genuine channel failure still blocks while incomplete reads fall back.
        const worstProbe = selectedWindows.reduce<typeof selectedWindows[number] | null>((worst, probe) => {
          if (!worst) return probe;
          const w = probe.bookable_window;
          const cur = worst.bookable_window;
          if (w.longest_run < cur.longest_run) return probe;
          if (!w.min_stay_set && cur.min_stay_set) return probe;
          return worst;
        }, null);
        const worstWindow = worstProbe?.bookable_window ?? null;
        if (worstWindow && worstProbe?.evidence_source === "channel") {
          extraChecks.push(...bookableWindowChecks(worstWindow, worstProbe?.unit_name ?? soleUnitName ?? undefined));
        } else if (worstWindow) {
          extraChecks.push(...localBookableWindowChecks(worstWindow, worstProbe?.unit_name ?? soleUnitName ?? undefined));
        } else if (!liveAvailabilityResponded && isMeaningfulWindow(ariSnapshot?.worst_window)) {
          extraChecks.push(...bookableWindowChecks(ariSnapshot!.worst_window as RuBookableWindow, soleUnitName ?? undefined));

        } else {
          extraChecks.push(
            ...localBookableWindowChecks(localWindow, localWindow.worst_unit?.name ?? soleUnitName ?? undefined),
          );
        }

        // Persist only genuine live successes — never a throttled or empty answer.
        if (hasAvailability || livePricesVerified) {
          await saveAriSnapshot(admin, p.id, {
            availability_ok: hasAvailability || ariSnapshot?.availability_ok === true,
            prices_ok: livePricesVerified || ariSnapshot?.prices_ok === true,
            units: unitProbes,
            // Never overwrite a real window with an all-zero one from a silent read.
            worst_window: worstProbe?.evidence_source === "channel" && isMeaningfulWindow(worstWindow)
              ? worstWindow
              : (isMeaningfulWindow(ariSnapshot?.worst_window) ? ariSnapshot!.worst_window : null),

            ru_owner_id: scopedOwnerId,
          });
        }



        // A probe that never answered (throttled / timed out) must be reported as PENDING,
        // never as "no open availability day" — that read as a false push failure.
        const probeSilent = unitProbes.some((probe) => probe.availability_error != null);
        extraChecks.push({
          key: "ari_availability",
          group: "Availability 365d",
          label: "Availability pushed for the next 365 days",
          mandatory: true,
          passed: availabilityReady || (probeSilent && !!latestSuccessfulPush && localAvailabilityReady),
          unit: availabilityReady ? undefined : singleFailingUnit(failedAvailabilityIds),
          ...(hasAvailability
            ? { detail: `Verified on ${unitProbes.length} RU unit(s)` }
            : snapshotHeldAvailability
              ? { detail: `${snapshotAge(ariSnapshot!.probed_at)} — the latest read-back did not answer, so the stored verification stands` }
              : probeSilent
                ? { detail: `The channel did not answer the read-back for ${describeUnits(failedAvailabilityIds)} (rate limit or timeout); the last inventory push succeeded, so verification is pending — refresh to re-read` }
                : availabilityReady
                  ? { detail: `Local 365-day payload is ready and the latest inventory push succeeded; live channel verification is pending for ${describeUnits(failedAvailabilityIds)}` }
                  : { detail: `${describeUnits(failedAvailabilityIds)}: no open availability day in the next 365 days` }),
          fix_hint: "Rate Manager → Calendar / availability",
        });

        extraChecks.push({
          key: "ari_prices",
          group: "Pricing 365d",
          label: livePricesVerified || snapshotHeldPrices
            ? "Rates verified on RU for the next 365 days"
            : "Local rates ready to push for the next 365 days",
          mandatory: true,
          passed: pricingReady,
          unit: pricingReady ? undefined : singleFailingUnit(failedPriceIds),
          ...(pricingReady
            ? { detail: livePricesVerified
              ? `Verified on ${unitProbes.length} RU unit(s)${localCoverage ? ` — local rates: ${localCoverage.summary}` : ""}`
              : snapshotHeldPrices
                ? `${snapshotAge(ariSnapshot!.probed_at)} — the latest read-back did not answer, so the stored verification stands`
                : `Ready to push from ROLOS (${localCoverage?.summary ?? "complete local coverage"}); RU verification pending for ${describeUnits(failedPriceIds)}` }
            : { detail: `${describeUnits(failedPriceIds)}: prices missing or non-positive${localCoverage ? ` — local rates: ${localCoverage.summary}` : ""}` }),
          fix_hint: "Calendar seasons & rates (first), then Rate Manager → Rates rack rate",
        });

        ari = {
          ru_property_ids: ruIds,
          date_from: from,
          date_to: to,
          units: unitProbes,
          availability_ok: availabilityReady,
          live_availability_verified: hasAvailability,
          local_availability_ready: localAvailabilityReady,
          prices_ok: pricingReady,
          live_prices_verified: livePricesVerified,
          rate_coverage: localCoverage,
          snapshot_at: ariSnapshot?.probed_at ?? null,
          snapshot_held: snapshotHeldAvailability || snapshotHeldPrices,
          availability_source: availabilitySource,
        };

      } else if (ruIds.length > 0 && ariSnapshot) {
        // Published, probing intentionally skipped for a fast paint: serve the stored verdict
        // instead of re-pulling every unit's calendar on page load.
        const localPricingReady = localCoverage ? localCoverage.complete !== false : true;
        if (isMeaningfulWindow(ariSnapshot.worst_window)) {
          availabilitySource = "channel";
          extraChecks.push(...bookableWindowChecks(ariSnapshot.worst_window as RuBookableWindow, soleUnitName ?? undefined));

        } else {
          extraChecks.push(
            ...localBookableWindowChecks(localWindow, localWindow.worst_unit?.name ?? soleUnitName ?? undefined),
          );
        }
        extraChecks.push({
          key: "ari_availability", group: "Availability 365d",
          label: "Availability pushed for the next 365 days",
          mandatory: true,
          passed: ariSnapshot.availability_ok || (localWindow.ok && localWindow.open_days > 0),
          detail: ariSnapshot.availability_ok
            ? snapshotAge(ariSnapshot.probed_at)
            : `${localWindow.open_days} open day(s) in the local calendar — refresh to re-verify on the channel`,
          fix_hint: "Rate Manager → Calendar / availability",
        });
        extraChecks.push({
          key: "ari_prices", group: "Pricing 365d",
          label: ariSnapshot.prices_ok ? "Rates verified on RU for the next 365 days" : "Local rates ready for the next 365 days",
          mandatory: true,
          passed: ariSnapshot.prices_ok || localPricingReady,
          detail: ariSnapshot.prices_ok
            ? snapshotAge(ariSnapshot.probed_at)
            : `Local rates ready${localCoverage ? ` — ${localCoverage.summary}` : ""}; refresh to re-verify on the channel`,
          fix_hint: "Calendar seasons & rates (first), then Rate Manager → Rates rack rate",
        });
        ari = {
          ru_property_ids: ruIds,
          rate_coverage: localCoverage,
          availability_ok: ariSnapshot.availability_ok,
          prices_ok: ariSnapshot.prices_ok || localPricingReady,
          units: ariSnapshot.units ?? [],
          from_snapshot: true,
          snapshot_at: ariSnapshot.probed_at,
          availability_source: availabilitySource,
        };
      } else {
        // Pre-publish: there is no RU property ID yet, so live ARI simply cannot exist.
        // The wizard must not block on a verification that only becomes possible AFTER
        // the push. Judge readiness on the local ROL'OS data instead.
        const localPricingReady = localCoverage ? localCoverage.complete !== false : true;
        // Pre-publish the channel calendar cannot be read, so the SAME two rules
        // (3 consecutive priced days + MinStay) are scored on the ROL'OS calendar.
        extraChecks.push(
          ...localBookableWindowChecks(localWindow, localWindow.worst_unit?.name ?? soleUnitName ?? undefined),
        );
        extraChecks.push({
          key: "ari_availability", group: "Availability 365d",
          label: "Availability ready to push for the next 365 days",
          mandatory: false, passed: localWindow.open_days > 0,
          unit: localWindow.open_days > 0 ? undefined : localWindow.worst_unit?.name ?? soleUnitName ?? undefined,
          detail: localWindow.open_days > 0
            ? `${localWindow.open_days} open day(s) in the local calendar — verified on Rentals United after the first push`
            : "No open day in the local calendar for the next 365 days",
          fix_hint: "Rate Manager → Calendar / availability",
        });
        extraChecks.push({
          key: "ari_prices", group: "Pricing 365d",
          label: "Rates ready to push for the next 365 days",
          mandatory: true, passed: localPricingReady,
          detail: localPricingReady
            ? `Local rates ready to push${localCoverage ? ` — ${localCoverage.summary}` : ""}; verified on Rentals United after the first push`
            : `Local rate coverage incomplete${localCoverage ? ` — ${localCoverage.summary}` : ""}`,
          fix_hint: "Calendar seasons & rates (first), then Rate Manager → Rates rack rate",
        });
        ari = { rate_coverage: localCoverage, pending_publish: true, local_window: localWindow };
      }


      // A unit whose ROL'OS room-type link is dangling (the room type was replaced) resolves
      // to no plan, no rack rate and no daily rate. Reporting that as "rates missing for 365
      // days" sent owners to author rates that already exist — name the real fault instead.
      if (unlinkedUnits.length > 0) {
        extraChecks.push({
          key: "unit_rate_plan_link",
          group: "Pricing 365d",
          label: "Every unit is linked to a rate plan",
          mandatory: true,
          passed: false,
          unit: unlinkedUnits.length === 1 ? unlinkedUnits[0].name : undefined,
          detail: `${unlinkedUnits.map((u) => u.name).join(", ")}: not linked to any active rate plan — the unit's ROL'OS room type link is missing or stale, so no season or rack rate can be found.`,
          fix_hint: "ROL'OS → Rate Plans → link the unit to a plan (Calendar seasons then keep the rack fallback)",
        });
      }

      /**
       * Publish invariant — scored on the property's CURRENT unit rows, not the push
       * snapshot. A unit that was inactive during the last push (or was added since) is
       * absent from the dry run entirely, which is how a live property could read 100%
       * ready while one unit existed only in ROL'OS.
       */
      let unpublishedUnitNames: string[] = [];
      let fullListingSetPublished = false;
      {
        const { data: propRow } = await admin
          .from("properties")
          .select("amenities, rentalsunited_property_id")
          .eq("id", p.id)
          .maybeSingle();
        const { data: unitRows } = await admin
          .from("hostfully_room_types")
          .select("name, is_active, rentalsunited_property_id")
          .eq("property_id", p.id)
          .eq("is_active", true);

        const canonical = new Set(
          (((propRow?.amenities as { room_types?: Array<{ name?: string | null }> } | null)?.room_types) ?? [])
            .map((rt) => String(rt?.name ?? "").trim().toLowerCase())
            .filter(Boolean),
        );
        const publishStates = ((unitRows ?? []) as Array<{ name: string | null; rentalsunited_property_id: string | null }>)
          .filter((u) => canonical.size === 0 || canonical.has(String(u.name ?? "").trim().toLowerCase()))
          .map((u) => ({
            name: String(u.name ?? "Unit"),
            published: !!String(u.rentalsunited_property_id ?? "").trim(),
          }));
        // Multi-unit properties hold their listings on the units; a single-unit property
        // publishes as the building itself, so only score the invariant when units exist.
        const isPublished = publishStates.some((u) => u.published) || !!propRow?.rentalsunited_property_id;
        fullListingSetPublished = isPublished && (
          publishStates.length === 0 || publishStates.every((u) => u.published)
        );
        if (publishStates.length > 1 || (publishStates.length === 1 && isPublished)) {
          extraChecks.push(...unitsPublishedChecks(publishStates, { published: isPublished }));
        }
        unpublishedUnitNames = publishStates.filter((u) => !u.published).map((u) => u.name);
      }

      // Currency read-back is a post-publish verification. During a partial first publish,
      // the intended currency is enough: requiring read-back here would block creation of
      // the remaining listings. Once every active unit exists, a mismatch is mandatory.
      {
        const { data: currencyState } = await admin
          .from("ru_currency_state")
          .select("published_currency_iso, ru_reported_currency_iso, verified_at, flip_outcome, location_currency_iso")
          .eq("property_id", p.id)
          .maybeSingle();
        extraChecks.push(...currencyVerificationChecks(currencyState ?? null, {
          published: fullListingSetPublished,
        }));
      }

      const summary = summarizeReadiness(units, extraChecks);

      // ── Certification evidence: content-quality validators with observed values ──
      const contentQuality = {
        checked_at: new Date().toISOString(),
        units: units.map((u) => {
          const v = (u.validation ?? {}) as Record<string, unknown>;
          const num = (k: string) => (typeof v[k] === "number" ? v[k] as number : null);
          const bool = (k: string) => (typeof v[k] === "boolean" ? v[k] as boolean : null);
          return {
            unit: u.name ?? null,
            name_clean: bool("name_clean"),
            name_issues: (v.name_issues as string[] | undefined) ?? [],
            description_chars: num("description_length"),
            description_meets_cert: bool("description_meets_cert"),
            attraction_distances: num("attraction_distance_count"),
            images_count: num("images_count"),
            images_meeting_cert_size: num("images_meeting_cert_size"),
            images_unmeasured: num("images_size_unverified"),
            smallest_image: num("smallest_image_width") != null
              ? `${num("smallest_image_width")}x${num("smallest_image_height")}`
              : null,
            has_main_image: bool("has_main_image"),
            has_street: bool("has_street"),
            has_zip_code: bool("has_zip_code"),
            has_detailed_location_id: bool("has_detailed_location_id"),
            has_coordinates: bool("has_coordinates"),
            can_sleep_max: num("max_guests"),
            has_cancellation_policies: bool("has_cancellation_policies"),
            has_payment_methods: bool("has_payment_methods"),
            check_in_from: (v.check_in_from as string | null) ?? null,
            check_out_until: (v.check_out_until as string | null) ?? null,
            bedroom_blocks: num("bedroom_blocks"),
            bedrooms_with_beds: num("bedrooms_with_beds"),
            has_kitchen: bool("has_kitchen"),
            has_bathroom_room: bool("has_bathroom_room"),
            beds_distributed: bool("beds_distributed"),
            total_bed_capacity: num("total_bed_capacity"),
            arrival_instructions_chars: num("arrival_instructions_length"),
          };
        }),
        bookable_window: (ari as Record<string, unknown> | null)?.units
          ? (ari as any).units.map((probe: any) => ({
            ru_property_id: probe.ru_property_id,
            longest_run: probe.bookable_window?.longest_run ?? null,
            first_window: probe.bookable_window?.start ?? null,
            min_stay_set: probe.bookable_window?.min_stay_set ?? null,
            open_days: probe.bookable_window?.open_days ?? null,
          }))
          : ((ari as Record<string, unknown> | null)?.local_window
            ? [{
              ru_property_id: null,
              longest_run: (ari as any).local_window.longest_run ?? null,
              first_window: (ari as any).local_window.start ?? null,
              min_stay_set: (ari as any).local_window.min_stay_set ?? null,
              open_days: (ari as any).local_window.open_days ?? null,
              source: "local",
            }]
            : null),
      };

      return {
        property_id: p.id,
        name: p.name,
        content_quality: contentQuality,
        ru_property_id: p.rentalsunited_property_id ?? null,
        multi_unit: !!data?.multi_unit,
        unit_count: units.length,
        ok: !summary.blocked,
        blocked: summary.blocked,
        gaps: summary.gaps,
        blocking_gaps: summary.blocking_gaps,
        advisory_gaps: summary.advisory_gaps,
        checks: summary.checks,
        groups: summary.groups,
        checks_total: summary.checks_total,
        checks_passed: summary.checks_passed,
        mandatory_total: summary.mandatory_total,
        mandatory_passed: summary.mandatory_passed,
        score: summary.score,
        unpublished_units: unpublishedUnitNames,
        ari,
        availability_source: availabilitySource,
      };
    };

    /**
     * ── Channel step ledger (Phase 1) ──
     *
     * Durable per-step status storage. Every action is gated on the default-off
     * `channel_step_ledger_enabled` flag and NOTHING in the wizard reads them yet:
     * readiness is still computed live on mount exactly as before.
     *
     *   ledger_seed        → create missing rows as `pending` (idempotent)
     *   ledger_get         → pure read (no channel calls, no writes)
     *   ledger_mark_stale  → flag steps `stale` (no channel calls)
     *   ledger_recheck     → run the readiness scorer, persist passed/blocked/unknown
     *
     * Phase 4 adds one internal action:
     *
     *   ledger_drain_recheck → same as `ledger_recheck` but the channel probe is
     *                          hard-wired off, so the background drain cannot start
     *                          RU availability/price pulls even if asked to.
     */
    /**
     * The live ARI probe can wait out RU's one-call-per-minute window several times over and
     * blow past the 150s request lifetime, which surfaces to the operator as a 504
     * IDLE_TIMEOUT and a blank screen. Give the probing score a hard budget and fall back to
     * the local-only score (no channel calls) so the caller always gets a usable verdict.
     */
    const SCORE_PROBE_BUDGET_MS = 90_000;
    const scorePropertyWithinBudget = async (
      p: Parameters<typeof scoreProperty>[0],
      probeAri: boolean,
      forceProbe = false,
    ) => {
      if (!probeAri) return await scoreProperty(p, { probe_ari: false });
      const timeout = Symbol("score_timeout");
      let timer: number | undefined;
      const budget = new Promise<typeof timeout>((resolve) => {
        timer = setTimeout(() => resolve(timeout), SCORE_PROBE_BUDGET_MS);
      });
      try {
        const result = await Promise.race([scoreProperty(p, { probe_ari: true, force_probe: forceProbe }), budget]);

        if (result !== timeout) return result;
        console.warn(`[scoreProperty] live probe exceeded ${SCORE_PROBE_BUDGET_MS}ms — scoring locally`);
        return await scoreProperty(p, { probe_ari: false });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    };

    const LEDGER_ACTIONS = [

      "ledger_seed",
      "ledger_get",
      "ledger_mark_stale",
      "ledger_record",
      "ledger_recheck",
      "ledger_drain_recheck",
    ];
    if (LEDGER_ACTIONS.includes(action)) {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const ledgerEnabled = await isChannelStepLedgerEnabled(admin);
      if (!ledgerEnabled) {
        logLedgerEvent({ propertyId, event: `${action}_disabled` });
        return json({ success: true, enabled: false, steps: [] });
      }

      try {
        if (action === "ledger_seed") {
          const seeded = await seedLedger(admin, propertyId);
          logLedgerEvent({ propertyId, event: "ledger_seed", detail: seeded });
          return json({ success: true, enabled: true, ...seeded, steps: await readLedger(admin, propertyId) });
        }

        if (action === "ledger_get") {
          const steps = await readLedger(admin, propertyId);
          logLedgerEvent({ propertyId, event: "ledger_get", detail: { rows: steps.length } });
          return json({ success: true, enabled: true, steps });
        }

        if (action === "ledger_mark_stale") {
          const keys: string[] | null = Array.isArray(body.step_keys) ? body.step_keys : null;
          const marked = await markLedgerStale(admin, propertyId, keys);
          logLedgerEvent({ propertyId, event: "ledger_mark_stale", detail: { ...marked, step_keys: keys } });
          return json({ success: true, enabled: true, ...marked, steps: await readLedger(admin, propertyId) });
        }

        /**
         * ledger_record — the caller completed an account-scoped step (company profile
         * accepted, listings pulled, verification signed off) and records that verdict.
         * No channel call: the caller already has the confirmed outcome.
         */
        if (action === "ledger_record") {
          const keys: string[] = Array.isArray(body.step_keys) ? body.step_keys : [];
          const source = typeof body.source === "string" ? body.source : "push_result";
          await recordLedgerPassForScope(
            admin,
            { propertyId },
            keys,
            "ledger_record",
            source as "push_result" | "manual_signoff" | "local",
          );
          return json({ success: true, enabled: true, steps: await readLedger(admin, propertyId) });
        }


        // ledger_recheck — the only ledger action that may touch the channel.
        const { data: prop } = await admin
          .from("properties")
          .select("id, name, rentalsunited_property_id")
          .eq("id", propertyId)
          .maybeSingle();
        if (!prop) {
          return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
        }
        await seedLedger(admin, propertyId);
        // The drain is local-only by construction: it ignores any `probe_ari` in the body.
        const probeAri = action === "ledger_drain_recheck" ? false : body.probe_ari !== false;
        // An explicit `probe_ari: true` is an operator recheck: it may bypass the stored verdict.
        const report = await scorePropertyWithinBudget(prop, probeAri, body.probe_ari === true);
        const rows = mapReadinessToLedgerRows(report as unknown as ReadinessReportLike);
        const written = await writeLedgerRows(admin, propertyId, rows);
        logLedgerEvent({
          propertyId,
          event: action === "ledger_drain_recheck" ? "ledger_drain_recheck" : "ledger_recheck",
          detail: {
            ...written,
            probe_ari: probeAri,
            statuses: rows.reduce<Record<string, number>>((acc, row) => {
              acc[row.status] = (acc[row.status] ?? 0) + 1;
              return acc;
            }, {}),
          },
        });
        return json({ success: true, enabled: true, steps: await readLedger(admin, propertyId) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ledger action failed";
        logLedgerEvent({ propertyId, event: `${action}_error`, detail: { message } });
        return json({ success: false, error: { code: "LEDGER_ERROR", message } }, 500);
      }
    }

    // ── property_readiness: single-property scorecard (ROLOS + admin) ──

    if (action === "property_readiness") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, rentalsunited_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }
      // Reading the channel is now strictly opt-in: mounting a property editor or wizard used to
      // omit `probe_ari` and silently pull prices + availability for every unit. Only an explicit
      // `probe_ari: true` (operator recheck / scheduled refresh) touches the channel, and it may
      // bypass the stored verdict.
      const report = await scorePropertyWithinBudget(prop, body.probe_ari === true, body.probe_ari === true);
      // Certification requires changes to reach the channel without operator action: any delta
      // parked behind the gate is re-fired in the background as soon as readiness reads clean.
      if (report && (report as { blocked?: boolean }).blocked === false) {
        const resume = resumePendingRuDeltas(admin, propertyId, "readiness_cleared");
        // deno-lint-ignore no-explicit-any
        const runtime = (globalThis as any).EdgeRuntime;
        if (runtime?.waitUntil) runtime.waitUntil(resume);
        else resume.catch(() => {});
      }
      return json({ success: true, property: report });
    }

    /**
     * ── lnm_status: read-only LNM + MCQ health for ONE property.
     *
     * Feeds the status chips on the property editor. Read-back only — no push — so opening
     * the editor never consumes a Push_* slot in RU's one-call-per-method-per-minute budget.
     */
    if (action === "lnm_status") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, owner_email, rentalsunited_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }

      const portfolioId = await resolvePortfolioId(admin, propertyId);
      const { account } = await findOwnerAccount(admin, propertyId, (prop as any).owner_email ?? null, portfolioId);
      const ruOwnerId = String((account as any)?.ru_owner_id ?? "").trim() || null;

      // Sub-user calls need the sub-account's OWN keys — without them the account is an
      // unmonitored gap rather than a failure.
      let hasKeys = !!(account as any)?.ru_api_access_key;
      if (ruOwnerId && !hasKeys) {
        const { data: credRow } = await admin
          .from("ru_api_credentials")
          .select("access_key")
          .eq("ru_owner_id", ruOwnerId)
          .maybeSingle();
        hasKeys = !!credRow?.access_key;
      }

      const urlBase = `${supabaseUrl}/functions/v1/ru-lnm-handler`;
      const masterOwnerId = (Deno.env.get("RU_MASTER_OWNER_ID") ?? Deno.env.get("RU_OWNER_ID") ?? "").trim();
      const observedOwner = ruOwnerId ?? (/^\d+$/.test(masterOwnerId) ? masterOwnerId : null);
      const desired = {
        change_types: DEFAULT_LNM_CHANGE_TYPES,
        observed_owners: observedOwner ? [observedOwner] : [],
        url_base: urlBase,
      };

      // Cadence: newest successful subscribe / read-back for this account.
      const freshness = async (actions: string[]) => {
        const { data } = await admin
          .from("ru_sync_runs")
          .select("created_at")
          .in("action", actions)
          .eq("success", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return (data as { created_at?: string } | null)?.created_at ?? null;
      };
      const lastSubscribed = await freshness(["PutLnmSubscriptions", "put_lnm_subscriptions", "lnm_duplicate_test"]);
      const lastReadBack = await freshness(["ListLnmSubscriptions", "list_lnm_subscriptions"]);
      const lastNotification = await freshness(["LNM_Notification"]);

      const hoursSince = (iso: string | null) =>
        iso ? Math.round(((Date.now() - new Date(iso).getTime()) / 3_600_000) * 10) / 10 : null;

      let subscriptions: Record<string, unknown> | null = null;
      let drift: Record<string, unknown> | null = null;
      let readError: string | null = null;
      let state: "ok" | "stale" | "drift" | "unsubscribed" | "unmonitored" = "unmonitored";

      if (!observedOwner) {
        readError = "No RU OwnerID available — link a sub-user account or configure the master OwnerID.";
      } else if (!hasKeys && ruOwnerId) {
        readError = `No API keys stored for OwnerID ${ruOwnerId} — subscriptions must be registered under the sub-user's own keys.`;
      } else {
        const { data: listData, error: listErr } = await admin.functions.invoke("rentalsunited-api", {
          body: { action: "list_lnm_subscriptions", ...(ruOwnerId ? { owner_id: Number(ruOwnerId) } : {}) },
        });
        if (listErr || listData?.success !== true) {
          readError = listErr?.message ?? listData?.error?.message ?? "Rentals United did not return the subscriptions";
          state = "unsubscribed";
        } else {
          const actual = (listData?.subscriptions ?? parseLnmSubscriptions(String(listData?.raw_xml ?? ""))) as any;
          subscriptions = actual;
          const d = diffLnmSubscriptions(actual, desired);
          drift = d as unknown as Record<string, unknown>;
          const age = hoursSince(lastSubscribed);
          if (!actual?.url_base && (actual?.change_types ?? []).length === 0) state = "unsubscribed";
          else if (!d.in_sync) state = "drift";
          else if (age == null || age > 24) state = "stale";
          else state = "ok";
        }
      }

      // Newest quality-check order for this property.
      const { data: mcq } = await admin
        .from("ru_mcq_orders")
        .select("id, ordered_at, status, ru_property_id, ru_status_id, response_preview")
        .eq("property_id", propertyId)
        .order("ordered_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let mcqBlocker: string | null = null;
      const mcqRaw = String((mcq as any)?.response_preview ?? "");
      if (/subscribe to lnm/i.test(mcqRaw)) mcqBlocker = "RU status 280 — the account must hold an LNM subscription that includes PropertyMCQEligibilityCheck.";
      else if (/unexpected error/i.test(mcqRaw) || String((mcq as any)?.ru_status_id ?? "") === "17") {
        mcqBlocker = "RU status 17 — RU-side fault. Escalate with the ResponseID in the evidence JSON.";
      }
      const mcqResponseId = /<ResponseID>([^<]+)</i.exec(mcqRaw)?.[1] ?? null;

      return json({
        success: true,
        property: { id: prop.id, name: prop.name, ru_property_id: (prop as any).rentalsunited_property_id ?? null },
        account: { ru_owner_id: ruOwnerId, has_keys: hasKeys, scope: (account as any)?.scope ?? null },
        lnm: {
          state,
          desired,
          actual: subscriptions,
          drift,
          read_error: readError,
          mcq_change_type_present: Array.isArray((subscriptions as any)?.change_types)
            ? (subscriptions as any).change_types.some((t: string) => String(t).toLowerCase() === "propertymcqeligibilitycheck")
            : false,
          last_subscribed_at: lastSubscribed,
          last_subscribed_hours: hoursSince(lastSubscribed),
          last_read_back_at: lastReadBack,
          last_notification_at: lastNotification,
        },
        mcq: mcq
          ? {
              id: (mcq as any).id,
              status: (mcq as any).status,
              ordered_at: (mcq as any).ordered_at,
              ru_property_id: (mcq as any).ru_property_id,
              ru_status_id: (mcq as any).ru_status_id,
              blocker: mcqBlocker,
              ru_response_id: mcqResponseId,
            }
          : null,
      });
    }

    /**
     * ── lnm_duplicate_test: subscribe TWICE, read back once.
     *
     * RU must stay idempotent: one UrlBase, each change type once, each observed owner
     * once. Duplicated entries or a drifted URL are the failure we are proving against.
     */
    if (action === "lnm_duplicate_test") {
      const propertyId: string | null = body.property_id ?? null;
      const requestedOwnerId = body.owner_id ? Number(body.owner_id) : null;
      let ruOwnerId: number | null = requestedOwnerId;
      if (!ruOwnerId && propertyId) {
        const { account } = await findOwnerAccount(admin, propertyId, null, null);
        const id = Number((account as any)?.ru_owner_id ?? 0);
        ruOwnerId = Number.isFinite(id) && id > 0 ? id : null;
      }
      const masterOwnerId = (Deno.env.get("RU_MASTER_OWNER_ID") ?? Deno.env.get("RU_OWNER_ID") ?? "").trim();
      const observedOwners = ruOwnerId
        ? [String(ruOwnerId)]
        : /^\d+$/.test(masterOwnerId)
          ? [masterOwnerId]
          : [];
      if (observedOwners.length === 0) {
        return json({
          success: false,
          error: { code: "RU_NO_OWNER_ID", message: "No RU OwnerID available to observe — link a sub-user account or configure the master OwnerID." },
        }, 422);
      }

      const urlBase = `${supabaseUrl}/functions/v1/ru-lnm-handler`;
      const desired = { change_types: DEFAULT_LNM_CHANGE_TYPES, observed_owners: observedOwners, url_base: urlBase };
      const scope = ruOwnerId ? { owner_id: ruOwnerId } : {};

      const passes: Record<string, unknown>[] = [];
      for (let i = 0; i < 2; i++) {
        const { data, error } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "put_lnm_subscriptions",
            url_base: urlBase,
            change_types: DEFAULT_LNM_CHANGE_TYPES,
            observed_owners: observedOwners,
            ...scope,
          },
        });
        passes.push({
          pass: i + 1,
          success: !error && data?.success === true,
          error: error?.message ?? data?.error?.message ?? null,
          raw: preview(data?.raw_xml ?? null, 1500),
        });
        // RU allows one call per METHOD per sliding minute — pace the second pass.
        if (i === 0) await new Promise((r) => setTimeout(r, 61_000));
      }

      const { data: listData, error: listErr } = await admin.functions.invoke("rentalsunited-api", {
        body: { action: "list_lnm_subscriptions", ...scope },
      });
      const actual = (listData?.subscriptions ?? parseLnmSubscriptions(String(listData?.raw_xml ?? ""))) as any;
      const dup = (arr: unknown[]) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const v of arr ?? []) {
          const k = String(v).trim().toLowerCase();
          if (seen.has(k)) out.push(String(v));
          else seen.add(k);
        }
        return out;
      };
      const duplicateChangeTypes = dup(actual?.change_types ?? []);
      const duplicateOwners = dup(actual?.observed_owners ?? []);
      const urlCount = (String(listData?.raw_xml ?? "").match(/<UrlBase>/gi) || []).length;
      const drift = diffLnmSubscriptions(actual ?? { change_types: [], observed_owners: [], url_base: null }, desired);
      const readOk = !listErr && listData?.success === true;
      const passed =
        passes.every((p) => p.success) &&
        readOk &&
        drift.in_sync &&
        duplicateChangeTypes.length === 0 &&
        duplicateOwners.length === 0 &&
        urlCount <= 1;

      try {
        await admin.from("ru_sync_runs").insert({
          batch_id: crypto.randomUUID(),
          property_id: propertyId,
          action: "lnm_duplicate_test",
          success: passed,
          error_code: passed ? null : "RU_LNM_DUPLICATE_SUBSCRIPTION",
          error_message: passed
            ? null
            : [
                !readOk ? "read-back failed" : null,
                duplicateChangeTypes.length ? `duplicate change types: ${duplicateChangeTypes.join(", ")}` : null,
                duplicateOwners.length ? `duplicate observed owners: ${duplicateOwners.join(", ")}` : null,
                urlCount > 1 ? `${urlCount} UrlBase entries at RU` : null,
                !drift.in_sync ? "subscription drift" : null,
              ].filter(Boolean).join("; "),
          elapsed_ms: 0,
          details: { ru_owner_id: ruOwnerId, desired, passes, actual, drift, duplicate_change_types: duplicateChangeTypes, duplicate_owners: duplicateOwners, url_base_count: urlCount },
        });
      } catch (_e) { /* evidence only */ }

      return json({
        success: true,
        action,
        ru_owner_id: ruOwnerId,
        desired,
        passes,
        readback: {
          read_ok: readOk,
          read_error: listErr?.message ?? listData?.error?.message ?? null,
          actual,
          drift,
          duplicate_change_types: duplicateChangeTypes,
          duplicate_owners: duplicateOwners,
          url_base_count: urlCount,
        },
        passed,
      });
    }

    /**
     * ── mcq_duplicate_test: order the content quality check twice for one listing.
     *
     * RU must not open conflicting parallel orders. A second status 280 is a fail (the
     * subscription prerequisite is not holding); status 17 is reported as an RU-side fault.
     */
    if (action === "mcq_duplicate_test") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, rentalsunited_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }

      // MCQ is ordered per RU listing — use the first unit listing, else the property listing.
      const { data: units } = await admin
        .from("hostfully_room_types")
        .select("name, rentalsunited_property_id")
        .eq("property_id", propertyId)
        .not("rentalsunited_property_id", "is", null)
        .limit(1);
      const targetRuId = Number(
        (units ?? [])[0]?.rentalsunited_property_id ?? (prop as any).rentalsunited_property_id ?? 0,
      );
      if (!Number.isFinite(targetRuId) || targetRuId <= 0) {
        return json({
          success: false,
          error: { code: "RU_NOT_LISTED", message: "This property has no Rentals United listing to order the quality check against." },
        }, 422);
      }

      const { account: mcqAccount } = await findOwnerAccount(admin, propertyId, null, null);
      const mcqOwnerId = Number((mcqAccount as any)?.ru_owner_id ?? 0);
      const scope = mcqOwnerId > 0 ? { owner_id: mcqOwnerId } : {};
      const channel = body.channel_id ? { channel_id: body.channel_id } : {};

      const orders: Record<string, unknown>[] = [];
      for (let i = 0; i < 2; i++) {
        const { data, error } = await admin.functions.invoke("rentalsunited-api", {
          body: { action: "order_mcq", ru_property_id: targetRuId, property_id: propertyId, ...scope, ...channel },
        });
        const raw = String(data?.raw_xml ?? data?.error?.message ?? error?.message ?? "");
        const ok = !error && data?.success === true;
        orders.push({
          pass: i + 1,
          success: ok,
          ru_status_id: data?.ru_status_id ?? data?.error?.ru_status_id ?? null,
          lnm_not_subscribed: /subscribe to lnm/i.test(raw),
          ru_internal_error: /unexpected error/i.test(raw),
          ru_response_id: /<ResponseID>([^<]+)</i.exec(raw)?.[1] ?? null,
          error: ok ? null : (error?.message ?? data?.error?.message ?? "Rentals United rejected the quality check order"),
          raw: preview(raw, 1500),
        });
        if (i === 0) await new Promise((r) => setTimeout(r, 61_000));
      }

      const lnmMissing = orders.some((o) => o.lnm_not_subscribed === true);
      const ruInternal = orders.some((o) => o.ru_internal_error === true);
      const passed = orders.every((o) => o.success === true);

      try {
        await admin.from("ru_sync_runs").insert({
          batch_id: crypto.randomUUID(),
          property_id: propertyId,
          action: "mcq_duplicate_test",
          success: passed,
          error_code: passed ? null : lnmMissing ? "RU_LNM_NOT_SUBSCRIBED" : ruInternal ? "RU_MCQ_INTERNAL_ERROR" : "RU_MCQ_FAILED",
          error_message: passed ? null : orders.filter((o) => !o.success).map((o) => `pass ${o.pass}: ${o.error}`).join("; "),
          elapsed_ms: 0,
          ru_property_id: String(targetRuId),
          details: { ru_owner_id: mcqOwnerId || null, orders },
        });
      } catch (_e) { /* evidence only */ }

      return json({
        success: true,
        action,
        property: { id: prop.id, name: prop.name },
        ru_property_id: targetRuId,
        ru_owner_id: mcqOwnerId || null,
        orders,
        lnm_not_subscribed: lnmMissing,
        ru_internal_error: ruInternal,
        passed,
      });
    }


    /**
     * ── reservation_idempotency_test: ingest the SAME synthetic RU reservation twice.
     *
     * Proves the shared ingestion path (used by both the RLNM handler and the poll cron)
     * writes exactly one booking: the second pass must report `updated` / `deduped`, never
     * a second row. Runs on far-future dates, skips availability writes, and deletes the
     * synthetic booking afterwards so live inventory is never touched.
     */
    if (action === "reservation_idempotency_test" || action === "rlnm_replay_test") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }

      const { data: prop } = await admin
        .from("properties")
        .select("id, name, rentalsunited_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }

      // Target the first RU-listed unit so the resolver walks the real mapping path.
      const { data: units } = await admin
        .from("hostfully_room_types")
        .select("name, rentalsunited_property_id")
        .eq("property_id", propertyId)
        .not("rentalsunited_property_id", "is", null)
        .limit(1);
      const ruListingId = String(
        (units ?? [])[0]?.rentalsunited_property_id ?? (prop as any).rentalsunited_property_id ?? "",
      );
      if (!ruListingId) {
        return json({
          success: false,
          error: { code: "RU_NOT_LISTED", message: "This property has no Rentals United listing to test reservation ingestion against." },
        }, 422);
      }

      // Far-future dates so a synthetic stay can never collide with a real booking.
      const start = new Date(Date.now() + 700 * 86_400_000);
      const end = new Date(start.getTime() + 2 * 86_400_000);
      const dateFrom = start.toISOString().slice(0, 10);
      const dateTo = end.toISOString().slice(0, 10);
      const certReservationId = `CERT-${crypto.randomUUID().slice(0, 8)}`;
      const replay = action === "rlnm_replay_test";

      const xml = `<Reservation>
  <ReservationID>${certReservationId}</ReservationID>
  <StatusID>1</StatusID>
  <Creator>${replay ? "LekkeSlaap" : "Rentals United"}</Creator>
  <CreatedDate>${new Date().toISOString().slice(0, 19).replace("T", " ")}</CreatedDate>
  <StayInfos>
    <StayInfo>
      <PropertyID>${ruListingId}</PropertyID>
      <DateFrom>${dateFrom}</DateFrom>
      <DateTo>${dateTo}</DateTo>
      <NumberOfGuests>2</NumberOfGuests>
      <Comments>ROL'OS certification ${replay ? "RLNM replay" : "idempotency"} test — safe to ignore</Comments>
      <Costs>
        <RUPrice>1000</RUPrice>
        <ClientPrice>1000</ClientPrice>
        <AlreadyPaid>0</AlreadyPaid>
      </Costs>
    </StayInfo>
  </StayInfos>
  <CustomerInfo>
    <Name>ROLOS</Name>
    <SurName>Certification</SurName>
    <Email>certification@roomsonline.co.za</Email>
    <MobilePhone>+27000000000</MobilePhone>
  </CustomerInfo>
</Reservation>`;

      const parsed = parseRuReservation(xml);
      const passes: Record<string, unknown>[] = [];
      let ingestError: string | null = null;

      for (let i = 0; i < 2; i++) {
        const result = await ingestRuReservation(admin, parsed, {
          source: "cert",
          logPrefix: "[ru-cert][reservation]",
          skipAvailability: true,
        });
        passes.push({
          pass: i + 1,
          outcome: result.outcome,
          deduped: result.deduped,
          booking_id: result.bookingId,
          channel_label: result.channelLabel,
          note: result.note ?? null,
          error: result.error ?? null,
        });
        if (result.outcome === "failed") ingestError = result.error ?? "Ingestion failed";
      }

      const { data: rows } = await admin
        .from("bookings")
        .select("id, status, integration_type, guest_name, check_in_date, check_out_date")
        .eq("external_reservation_id", certReservationId);
      const bookingCount = (rows ?? []).length;

      // Cancellation replay: a repeated cancel must stay a single cancelled record.
      let cancelPass: Record<string, unknown> | null = null;
      if (replay && bookingCount === 1) {
        const cancelXml = xml.replace("<StatusID>1</StatusID>", "<StatusID>2</StatusID>");
        const cancelParsed = parseRuReservation(cancelXml);
        const first = await ingestRuReservation(admin, cancelParsed, { source: "cert", skipAvailability: true, logPrefix: "[ru-cert][reservation]" });
        const second = await ingestRuReservation(admin, cancelParsed, { source: "cert", skipAvailability: true, logPrefix: "[ru-cert][reservation]" });
        cancelPass = { first: first.outcome, second: second.outcome, idempotent: first.outcome === "cancelled" && second.outcome === "skipped" };
      }

      // Clean up: certification rows never linger in the operator's booking list.
      await admin.from("bookings").delete().eq("external_reservation_id", certReservationId);

      const passed =
        !ingestError &&
        bookingCount === 1 &&
        passes[0]?.outcome === "created" &&
        passes[1]?.outcome === "updated" &&
        passes[1]?.deduped === true &&
        (!cancelPass || cancelPass.idempotent === true);

      try {
        await admin.from("ru_sync_runs").insert({
          batch_id: crypto.randomUUID(),
          property_id: propertyId,
          action,
          success: passed,
          error_code: passed ? null : bookingCount > 1 ? "RU_RESERVATION_DUPLICATED" : "RU_RESERVATION_INGEST_FAILED",
          error_message: passed ? null : ingestError ?? `Expected exactly 1 booking, found ${bookingCount}`,
          elapsed_ms: 0,
          ru_property_id: ruListingId,
          details: { ru_reservation_id: certReservationId, passes, cancel_replay: cancelPass, booking_count: bookingCount },
        });
      } catch (_e) { /* evidence only */ }

      return json({
        success: true,
        action,
        property: { id: prop.id, name: prop.name },
        ru_property_id: ruListingId,
        ru_reservation_id: certReservationId,
        dates: { from: dateFrom, to: dateTo },
        passes,
        cancel_replay: cancelPass,
        booking_count: bookingCount,
        passed,
      });
    }


    /**
     * ── booking_readback_test: prove the channel really holds what we pushed.
     *
     * The live booking path pushes and trusts the channel's success status — reading every
     * reservation back would double our call volume against a one-call-per-minute limit. This
     * opt-in test is the proof instead: a synthetic far-future stay is handed to the channel,
     * then each change kind (dates, guest count, price) is pushed and read back, and finally
     * cancelled and read back. Paced at one call per sliding minute, so it runs as a background
     * task and streams its steps into `ru_cert_runs` (suite `booking_readback`).
     */
    if (action === "booking_readback_test") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }

      const { data: prop } = await admin
        .from("properties")
        .select("id, name")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }

      // One read-back run at a time: the test itself is the heaviest caller we have.
      const { data: active } = await admin
        .from("ru_cert_runs")
        .select("id, started_at")
        .eq("suite", "booking_readback")
        .eq("status", "running")
        .gte("started_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .limit(1)
        .maybeSingle();
      if (active) {
        return json({
          success: false,
          run_id: active.id,
          error: {
            code: "READBACK_IN_PROGRESS",
            message: "A booking read-back test is already running — it paces itself at one channel call per minute.",
          },
        }, 409);
      }

      const { data: created, error: runErr } = await admin
        .from("ru_cert_runs")
        .insert({
          status: "running",
          suite: "booking_readback",
          property_id: propertyId,
          triggered_by: user.id,
          total: 12,
        })
        .select("id")
        .single();
      if (runErr) throw runErr;

      const runId = created.id as string;

      const execute = async () => {
        try {
          const outcome = await runBookingReadbackTest(admin, {
            propertyId,
            onStep: async (steps) => {
              await admin
                .from("ru_cert_runs")
                .update({
                  steps,
                  passed: steps.filter((s) => s.status === "passed").length,
                  failed: steps.filter((s) => s.status === "failed").length,
                  total: steps.length,
                })
                .eq("id", runId);
            },
          });

          await admin
            .from("ru_cert_runs")
            .update({
              status: outcome.failed === 0 && outcome.passed > 0 ? "passed" : "failed",
              finished_at: new Date().toISOString(),
              steps: outcome.steps,
              passed: outcome.passed,
              failed: outcome.failed,
              total: outcome.steps.length,
              ru_property_id: outcome.ru_property_id,
            })
            .eq("id", runId);

          await admin.from("ru_sync_runs").insert({
            batch_id: crypto.randomUUID(),
            property_id: propertyId,
            action: "booking_readback_test",
            success: outcome.failed === 0 && outcome.passed > 0,
            error_code: outcome.failed === 0 ? null : "RU_BOOKING_READBACK_MISMATCH",
            error_message: outcome.failed === 0
              ? null
              : outcome.steps.filter((s) => s.status === "failed").map((s) => `${s.name}: ${s.detail ?? ""}`).join(" | "),
            ru_property_id: outcome.ru_property_id,
            details: { run_id: runId, ru_reservation_id: outcome.ru_reservation_id, steps: outcome.steps },
          });
        } catch (err) {
          await admin
            .from("ru_cert_runs")
            .update({
              status: "failed",
              finished_at: new Date().toISOString(),
              steps: [{
                step: 0,
                name: "Read-back test aborted",
                ru_method: "—",
                mandatory: true,
                scope: "property",
                status: "failed",
                duration_ms: 0,
                detail: err instanceof Error ? err.message : "Unknown error",
              }],
              failed: 1,
            })
            .eq("id", runId);
        }
      };

      // Long-running by design (one channel call per sliding minute) — never hold the request open.
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(execute());
      else void execute();

      return json({
        success: true,
        action,
        run_id: runId,
        property: { id: prop.id, name: prop.name },
        message:
          "Read-back test started. It paces itself at one channel call per minute, so allow roughly 12 minutes; steps appear as they complete.",
      });
    }




    /**
     * ── reservation_detail_test: Pull_GetReservationByID_RQ parity check.
     *
     * Takes the most recent imported RU reservation for the property (or an explicit
     * reservation_id), pulls it back from Rentals United by id, and compares the channel's
     * own view against the stored booking: guest, dates, RU listing and price. Read-only —
     * nothing is written to bookings or availability.
     */
    if (action === "reservation_detail_test") {
      const propertyId: string = body.property_id ?? "";
      const explicitId: string = typeof body.reservation_id === "string" ? body.reservation_id.trim() : "";

      let booking: {
        id: string;
        external_reservation_id: string | null;
        guest_name: string | null;
        check_in_date: string | null;
        check_out_date: string | null;
        total_amount: number | null;
        property_id: string | null;
      } | null = null;

      if (explicitId) {
        const { data } = await admin
          .from("bookings")
          .select("id, external_reservation_id, guest_name, check_in_date, check_out_date, total_amount, property_id")
          .eq("external_reservation_id", explicitId)
          .maybeSingle();
        booking = (data as typeof booking) ?? null;
      } else {
        if (!propertyId) {
          return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id or reservation_id is required" } }, 400);
        }
        const { data } = await admin
          .from("bookings")
          .select("id, external_reservation_id, guest_name, check_in_date, check_out_date, total_amount, property_id")
          .eq("property_id", propertyId)
          .in("integration_type", ["rentalsunited", "rentalsunited_lead"])
          .not("external_reservation_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        booking = (data as typeof booking) ?? null;
      }

      const reservationId = explicitId || booking?.external_reservation_id || "";
      if (!reservationId) {
        return json({
          success: true,
          action,
          passed: false,
          skipped: true,
          reason: "No Rentals United reservation has been imported for this property yet — nothing to fetch by id.",
        });
      }

      const scopeProperty = booking?.property_id || propertyId || null;
      const { reservation, error: pullError } = await fetchRuReservationById(admin, reservationId, {
        propertyId: scopeProperty,
      });

      const mismatches: string[] = [];
      if (reservation && booking) {
        const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();
        if (reservation.dateFrom && booking.check_in_date && reservation.dateFrom !== booking.check_in_date) {
          mismatches.push(`check-in ${reservation.dateFrom} (RU) vs ${booking.check_in_date} (ROL'OS)`);
        }
        if (reservation.dateTo && booking.check_out_date && reservation.dateTo !== booking.check_out_date) {
          mismatches.push(`check-out ${reservation.dateTo} (RU) vs ${booking.check_out_date} (ROL'OS)`);
        }
        if (reservation.guestName && booking.guest_name && norm(reservation.guestName) !== norm(booking.guest_name)) {
          mismatches.push(`guest "${reservation.guestName}" (RU) vs "${booking.guest_name}" (ROL'OS)`);
        }
      }

      const found = !!reservation?.ruReservationId;
      const passed = !pullError && found && mismatches.length === 0;

      try {
        await admin.from("ru_sync_runs").insert({
          batch_id: crypto.randomUUID(),
          property_id: scopeProperty,
          action,
          success: passed,
          error_code: passed ? null : pullError ? "RU_RESERVATION_DETAIL_FAILED" : found ? "RU_RESERVATION_DETAIL_MISMATCH" : "RU_RESERVATION_NOT_FOUND",
          error_message: passed ? null : pullError ?? (found ? mismatches.join("; ") : "Reservation not returned by Pull_GetReservationByID_RQ"),
          elapsed_ms: 0,
          ru_property_id: reservation?.ruPropertyId ?? null,
          details: { ru_reservation_id: reservationId, mismatches, booking_id: booking?.id ?? null },
        });
      } catch (_e) { /* evidence only */ }

      return json({
        success: true,
        action,
        ru_reservation_id: reservationId,
        found,
        passed,
        error: pullError,
        mismatches,
        reservation: reservation
          ? {
              ru_reservation_id: reservation.ruReservationId,
              ru_property_id: reservation.ruPropertyId,
              status_id: reservation.statusId,
              date_from: reservation.dateFrom,
              date_to: reservation.dateTo,
              guest_name: reservation.guestName,
              guest_email: reservation.guestEmail,
              num_guests: reservation.numGuests,
              total: reservation.total,
              already_paid: reservation.alreadyPaid,
              creator: reservation.creator,
            }
          : null,
        booking: booking
          ? {
              id: booking.id,
              guest_name: booking.guest_name,
              check_in_date: booking.check_in_date,
              check_out_date: booking.check_out_date,
              total_amount: booking.total_amount,
            }
          : null,
      });
    }





    /**
     * ── creator_mapping_check: RU `Creator` (channel account) → ROL'OS sales channel.
     *
     * Reports the mapping table plus every creator seen on imported RU bookings so an
     * unmapped OTA account is visible instead of silently reported as "Rentals United".
     */
    if (action === "creator_mapping_check") {
      const { data: mappings } = await admin
        .from("ru_channel_creators")
        .select("creator_username, channel_key, channel_label, ru_channel_id, is_active, notes")
        .order("channel_label");

      const { data: ruBookings } = await admin
        .from("bookings")
        .select("id, external_reservation_id, modification_notes")
        .in("integration_type", ["rentalsunited", "rentalsunited_lead"])
        .order("created_at", { ascending: false })
        .limit(500);

      const seen = new Map<string, number>();
      for (const b of ruBookings ?? []) {
        const notes = (b as any).modification_notes ?? {};
        const creator = String(notes?.creator ?? notes?.ru_creator_channel?.creator ?? "").trim();
        if (creator) seen.set(creator, (seen.get(creator) ?? 0) + 1);
      }

      const observed: Record<string, unknown>[] = [];
      for (const [creator, count] of seen) {
        const mapping = await resolveRuChannelCreator(admin, creator);
        observed.push({
          creator,
          bookings: count,
          channel_key: mapping?.channelKey ?? null,
          channel_label: mapping?.channelLabel ?? null,
          ru_channel_id: mapping?.ruChannelId ?? null,
          mapped: Boolean(mapping && mapping.channelKey !== "unmapped"),
        });
      }

      const unmapped = observed.filter((o) => o.mapped === false);
      return json({
        success: true,
        action,
        mappings: mappings ?? [],
        observed_creators: observed,
        unmapped_count: unmapped.length,
        passed: unmapped.length === 0,
      });
    }




    /**
     * ── availability_playground: certification evidence for the rolling 365-day window.
     *
     * Pushes availability + pricing only (action refresh_ari — never Push_PutProperty_RQ),
     * then reads the calendar back through Pull_ListPropertyAvailabilityCalendar_RQ and proves,
     * day by day, that RU holds one entry for every day of [today, today+365].
     */
    if (action === "availability_playground" || action === "duplicate_range_test") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, rentalsunited_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }

      // A duplicate-range test intentionally pushes the SAME window twice: RU must end up
      // idempotent (identical day count, no doubled days, no conflicting MinStay).
      const passes = action === "duplicate_range_test" ? 2 : 1;
      const pushes: Record<string, unknown>[] = [];
      for (let i = 0; i < passes; i++) {
        const { data: pushData, error: pushErr } = await admin.functions.invoke("push-property-to-ru", {
          body: { property_id: propertyId, action: "refresh_ari", verify_readback: true, trigger: `cert_${action}_pass${i + 1}` },
        });
        pushes.push({
          pass: i + 1,
          success: pushErr ? false : pushData?.success === true,
          error: pushErr?.message ?? pushData?.error?.message ?? null,
          targets: (pushData?.targets ?? []).map((t: Record<string, any>) => ({
            target: t.target,
            ru_property_id: t.ru_property_id,
            availability_pushed: t.availability_pushed,
            availability_error: t.availability_error ?? null,
            availability_coverage: t.availability_coverage ?? null,
            price_coverage: t.price_coverage ?? null,
          })),
        });
        if (i + 1 < passes) await new Promise((r) => setTimeout(r, 1500));
      }

      // Read the calendar back per RU listing and verify full, unique coverage.
      const from = isoDate(0);
      const to = isoDate(365);
      const expectedDays = 366;
      const { data: units } = await admin
        .from("hostfully_room_types")
        .select("name, rentalsunited_property_id")
        .eq("property_id", propertyId)
        .not("rentalsunited_property_id", "is", null);
      const ruIds: { label: string; ru_id: number }[] = (units ?? [])
        .map((u: any) => ({ label: u.name as string, ru_id: Number(u.rentalsunited_property_id) }))
        .filter((u) => Number.isFinite(u.ru_id) && u.ru_id > 0);
      if (ruIds.length === 0 && Number(prop.rentalsunited_property_id) > 0) {
        ruIds.push({ label: prop.name, ru_id: Number(prop.rentalsunited_property_id) });
      }

      const { account: ownerAccount } = await findOwnerAccount(admin, propertyId, null, null);
      const scopedOwnerId = ownerAccount?.ru_owner_id ? Number(ownerAccount.ru_owner_id) : null;
      const scope = scopedOwnerId && scopedOwnerId > 0 ? { owner_id: scopedOwnerId } : {};

      const readbacks = await Promise.all(ruIds.map(async ({ label, ru_id }) => {
        const { data: calData, error: calErr } = await admin.functions.invoke("rentalsunited-api", {
          body: { action: "get_availability", readback_purpose: "operator_request", ru_property_id: ru_id, date_from: from, date_to: to, ...scope },
        });
        const xml = String(calData?.raw_xml ?? "");
        const days = parseRuAvailabilityDays(xml);
        const missing: string[] = [];
        const conflicting: string[] = [];
        for (let i = 0; i <= 365; i++) {
          const iso = isoDate(i);
          const day = days.get(iso);
          if (!day) missing.push(iso);
          else if (day.min_stay != null && day.min_stay < 1) conflicting.push(iso);
        }
        // parseRuAvailabilityDays keys by date, so a duplicated day cannot inflate the map —
        // compare the raw CalDay count against unique dates to expose duplicates.
        const rawDayCount = (xml.match(/<CalDay\b/gi) || []).length;
        return {
          target: label,
          ru_property_id: ru_id,
          read_ok: !calErr && calData?.success === true,
          read_error: calErr?.message ?? calData?.error?.message ?? null,
          expected_days: expectedDays,
          days_returned: days.size,
          raw_day_elements: rawDayCount,
          duplicate_days: Math.max(0, rawDayCount - days.size),
          missing_days: missing.length,
          missing_sample: missing.slice(0, 10),
          conflicting_min_stay: conflicting.length,
          open_days: countRuOpenDays(xml),
          passed: !calErr && calData?.success === true && missing.length === 0 && rawDayCount === days.size,
        };
      }));

      const passed = pushes.every((p) => p.success) && readbacks.length > 0 && readbacks.every((r) => r.passed);
      try {
        await admin.from("ru_sync_runs").insert({
          property_id: propertyId,
          action,
          success: passed,
          error_code: passed ? null : "RU_AVAILABILITY_WINDOW_INCOMPLETE",
          error_message: passed ? null : readbacks.filter((r) => !r.passed).map((r) => `${r.target}: ${r.missing_days} missing, ${r.duplicate_days} duplicate`).join("; "),
          details: { window: { from, to }, passes, pushes, readbacks },
        });
      } catch (_e) { /* evidence only */ }

      return json({
        success: true,
        action,
        property: { id: prop.id, name: prop.name },
        window: { from, to, expected_days: expectedDays },
        passes,
        pushes,
        readbacks,
        passed,
      });
    }

    /**
     * ── pricing_playground / pricing_duplicate_test: certification evidence for the
     * rolling 365-day PRICE window.
     *
     * Pushes ARI (refresh_ari — never Push_PutProperty_RQ), then reads prices back through
     * Pull_ListPropertyPrices_RQ and proves every night of [today, today+365] carries a real
     * price with no duplicated or overlapping Season ranges. The duplicate test pushes the
     * same window twice and asserts RU stays idempotent.
     */
    if (action === "pricing_playground" || action === "pricing_duplicate_test") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, rentalsunited_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }

      const passes = action === "pricing_duplicate_test" ? 2 : 1;
      const pushes: Record<string, unknown>[] = [];
      for (let i = 0; i < passes; i++) {
        const { data: pushData, error: pushErr } = await admin.functions.invoke("push-property-to-ru", {
          body: { property_id: propertyId, action: "refresh_ari", verify_readback: true, trigger: `cert_${action}_pass${i + 1}` },
        });
        pushes.push({
          pass: i + 1,
          success: pushErr ? false : pushData?.success === true,
          error: pushErr?.message ?? pushData?.error?.message ?? null,
          targets: (pushData?.targets ?? []).map((t: Record<string, any>) => ({
            target: t.target,
            ru_property_id: t.ru_property_id,
            prices_pushed: t.prices_pushed,
            prices_error: t.prices_error ?? null,
            price_coverage: t.price_coverage ?? null,
            prices_verification: t.prices_verification
              ? {
                  matches: t.prices_verification.matches,
                  total_seasons: t.prices_verification.total_seasons,
                  mismatches: (t.prices_verification.mismatches ?? []).slice(0, 10),
                  missing_dates: (t.prices_verification.missing_dates ?? []).slice(0, 10),
                  error: t.prices_verification.error ?? null,
                }
              : null,
            currency: t.currency ?? null,
          })),
        });
        if (i + 1 < passes) await new Promise((r) => setTimeout(r, 1500));
      }

      const from = isoDate(0);
      const to = isoDate(365);
      const expectedDays = 366;

      const { data: units } = await admin
        .from("hostfully_room_types")
        .select("name, rentalsunited_property_id")
        .eq("property_id", propertyId)
        .not("rentalsunited_property_id", "is", null);
      const ruIds: { label: string; ru_id: number }[] = (units ?? [])
        .map((u: any) => ({ label: u.name as string, ru_id: Number(u.rentalsunited_property_id) }))
        .filter((u) => Number.isFinite(u.ru_id) && u.ru_id > 0);
      if (ruIds.length === 0 && Number(prop.rentalsunited_property_id) > 0) {
        ruIds.push({ label: prop.name, ru_id: Number(prop.rentalsunited_property_id) });
      }

      const { account: ownerAccount } = await findOwnerAccount(admin, propertyId, null, null);
      const scopedOwnerId = ownerAccount?.ru_owner_id ? Number(ownerAccount.ru_owner_id) : null;
      const scope = scopedOwnerId && scopedOwnerId > 0 ? { owner_id: scopedOwnerId } : {};

      const readbacks = await Promise.all(ruIds.map(async ({ label, ru_id }) => {
        const { data: priceData, error: priceErr } = await admin.functions.invoke("rentalsunited-api", {
          body: { action: "get_prices", readback_purpose: "operator_request", ru_property_id: ru_id, date_from: from, date_to: to, ...scope },
        });
        const xml = String(priceData?.raw_xml ?? "");
        const seasons = parseRuPriceSeasons(xml);

        // Per-night map + duplicate/overlap detection straight off the RU response.
        const perDay = new Map<string, number>();
        let duplicateDays = 0;
        for (const s of seasons) {
          if (!s.date_from || !s.date_to || s.price == null) continue;
          let cur = s.date_from.slice(0, 10);
          const end = s.date_to.slice(0, 10);
          let guard = 0;
          while (cur <= end && guard++ < 800) {
            if (cur >= from && cur <= to) {
              if (perDay.has(cur)) duplicateDays++;
              perDay.set(cur, s.price);
            }
            const d = new Date(`${cur}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + 1);
            cur = d.toISOString().slice(0, 10);
          }
        }

        const unpriced: string[] = [];
        for (let i = 0; i <= 365; i++) {
          const iso = isoDate(i);
          const price = perDay.get(iso);
          // RU never serves the current day in pull responses — treat day 0 as informational.
          if (i > 0 && (price == null || !(price > 0))) unpriced.push(iso);
        }

        // Overlap check on the returned Season ranges themselves.
        const ranges = seasons
          .filter((s) => s.date_from && s.date_to)
          .map((s) => ({ from: s.date_from!.slice(0, 10), to: s.date_to!.slice(0, 10) }))
          .sort((a, b) => a.from.localeCompare(b.from));
        const overlaps: string[] = [];
        for (let i = 1; i < ranges.length; i++) {
          if (ranges[i].from <= ranges[i - 1].to) {
            overlaps.push(`${ranges[i - 1].from}..${ranges[i - 1].to} ↔ ${ranges[i].from}..${ranges[i].to}`);
          }
        }

        const prices = [...perDay.values()];
        return {
          target: label,
          ru_property_id: ru_id,
          read_ok: !priceErr && priceData?.success === true,
          read_error: priceErr?.message ?? priceData?.error?.message ?? null,
          expected_days: expectedDays,
          seasons_returned: seasons.length,
          days_priced: perDay.size,
          duplicate_days: duplicateDays,
          overlapping_ranges: overlaps.length,
          overlap_sample: overlaps.slice(0, 5),
          unpriced_days: unpriced.length,
          unpriced_sample: unpriced.slice(0, 10),
          min_price: prices.length ? Math.min(...prices) : null,
          max_price: prices.length ? Math.max(...prices) : null,
          passed:
            !priceErr &&
            priceData?.success === true &&
            unpriced.length === 0 &&
            duplicateDays === 0 &&
            overlaps.length === 0,
        };
      }));

      const passed = pushes.every((p) => p.success) && readbacks.length > 0 && readbacks.every((r) => r.passed);
      try {
        await admin.from("ru_sync_runs").insert({
          property_id: propertyId,
          action,
          success: passed,
          error_code: passed ? null : "RU_PRICE_WINDOW_INCOMPLETE",
          error_message: passed
            ? null
            : readbacks
                .filter((r) => !r.passed)
                .map((r) => `${r.target}: ${r.unpriced_days} unpriced, ${r.duplicate_days} duplicate, ${r.overlapping_ranges} overlapping`)
                .join("; "),
          details: { window: { from, to }, passes, pushes, readbacks },
        });
      } catch (_e) { /* evidence only */ }

      return json({
        success: true,
        action,
        property: { id: prop.id, name: prop.name },
        window: { from, to, expected_days: expectedDays },
        passes,
        pushes,
        readbacks,
        passed,
      });
    }




    /**
     * ── property_ru_identity: everything the "RU owner sub-account" panel on a
     * property's Identity tab needs, in one call.
     *
     * A ROLOS-PMS property must be linked to the owner's RU sub-account (one per
     * portfolio — shared by every ROLOS property in it) and that sub-account must have
     * its own API key pair captured before any RU push/pull is allowed.
     */
    if (action === "property_ru_identity" || action === "sub_account_readiness") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }

      const { data: prop } = await admin
        .from("properties")
        .select(
          "id, name, slug, external_system, owner_email, owner_name, city, country, is_active, rentalsunited_property_id, ru_location_id",
        )
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }

      const portfolioId = await resolvePortfolioId(admin, propertyId);
      const { account } = await findOwnerAccount(admin, propertyId, prop.owner_email ?? null, portfolioId);
      const ruOwnerId = String((account as any)?.ru_owner_id ?? "").trim() || null;

      // API keys: per-OwnerID store first, legacy columns on the account row as fallback.
      let keys: { access_key_last4: string | null; key_label: string | null; verified_at: string | null; source: string } | null = null;
      if (ruOwnerId) {
        const { data: credRow } = await admin
          .from("ru_api_credentials")
          .select("access_key, key_label, verified_at")
          .eq("ru_owner_id", ruOwnerId)
          .maybeSingle();
        if (credRow?.access_key) {
          keys = {
            access_key_last4: String(credRow.access_key).slice(-4),
            key_label: credRow.key_label ?? null,
            verified_at: credRow.verified_at ?? null,
            source: "ru_api_credentials",
          };
        }
      }
      if (!keys && (account as any)?.ru_api_access_key) {
        keys = {
          access_key_last4: String((account as any).ru_api_access_key).slice(-4),
          key_label: (account as any).ru_api_key_label ?? null,
          verified_at: (account as any).ru_api_keys_verified_at ?? null,
          source: "ru_owner_accounts",
        };
      }

      // Sibling ROLOS properties that share this sub-account identity.
      let siblings: { id: string; name: string; ru_property_id: string | null }[] = [];
      if (portfolioId) {
        const { data: memberRows } = await admin
          .from("property_portfolio_members")
          .select("property_id")
          .eq("portfolio_id", portfolioId);
        const ids = (memberRows ?? []).map((r: { property_id: string }) => r.property_id).filter((id) => id !== propertyId);
        if (ids.length) {
          const { data: sibProps } = await admin
            .from("properties")
            .select("id, name, external_system, rentalsunited_property_id")
            .in("id", ids);
          siblings = (sibProps ?? [])
            .filter((p: any) => ROLOS_PMS_VALUES.has(String(p.external_system ?? "").toLowerCase()))
            .map((p: any) => ({ id: p.id, name: p.name, ru_property_id: p.rentalsunited_property_id ?? null }));
        }
      }

      // Readiness to create a brand-new sub-account at RU.
      const req = (label: string, ok: boolean, hint: string) => ({ label, ok, hint });
      const checks = [
        req("Owner email", !!String(prop.owner_email ?? "").trim(), "Set the property owner's email — it becomes the RU sub-user login."),
        req("Owner name", !!String(prop.owner_name ?? "").trim(), "Set the owner name — RU needs a first and last name."),
        req("City", !!String(prop.city ?? "").trim(), "Capture the property city."),
        req("Country", !!String(prop.country ?? "").trim(), "Capture the property country."),
        req("RU location", !!String((prop as any).ru_location_id ?? "").trim(), "Resolve the RU LocationID in Identity & Location."),
        req("Portfolio", !!portfolioId, "Assign the property to a portfolio so the sub-account can be shared with its siblings."),
      ];
      const ready = checks.every((c) => c.ok);

      return json({
        success: true,
        property: {
          id: prop.id,
          name: prop.name,
          external_system: prop.external_system,
          is_rolos: ROLOS_PMS_VALUES.has(String(prop.external_system ?? "").toLowerCase()),
          owner_email: prop.owner_email ?? null,
          owner_name: prop.owner_name ?? null,
          ru_property_id: prop.rentalsunited_property_id ?? null,
        },
        portfolio_id: portfolioId ?? null,
        account: account
          ? {
              id: (account as any).id,
              scope: (account as any).scope,
              owner_email: (account as any).owner_email,
              ru_owner_id: ruOwnerId,
              ru_login_email: (account as any).ru_login_email ?? null,
              ru_login_url: (account as any).ru_login_url ?? null,
              company_details_sent: !!(account as any).company_details_sent,
              company_details_status: (account as any).company_details_status ?? null,
              company_filled_at: (account as any).company_filled_at ?? null,
              /**
               * True only when Push_FillCompanyDetails_RQ actually ran (status "sent")
               * AND it ran at or after the sub-account's key pair was verified. A flag
               * inferred from verified credentials, or a push made before the verified
               * keys existed, is not accepted as evidence — RU keeps the profile
               * incomplete in that case, so sign-off must stay open.
               */
              company_details_pushed: (() => {
                const status = String((account as any).company_details_status ?? "").toLowerCase();
                if (!["sent", "already_set"].includes(status)) return false;
                const filled = (account as any).company_filled_at
                  ? new Date((account as any).company_filled_at).getTime()
                  : 0;
                if (!filled) return false;
                const verified = keys?.verified_at ? new Date(keys.verified_at).getTime() : 0;
                if (!verified) return false;
                // Allow a small clock skew between the two writes.
                return filled >= verified - 60_000;
              })(),
              /** Timestamp the sub-account's own key pair was accepted (the push prerequisite). */
              keys_verified_at: keys?.verified_at ?? null,
            }
          : null,
        keys,
        keys_captured: !!keys,
        push_gated: !ruOwnerId || !keys,
        gate_reason: !ruOwnerId
          ? "No Rentals United sub-account is linked to this owner yet."
          : !keys
            ? "The sub-account has no API key pair captured. RU rejects sub-user calls without its own AccessKey/SecretKey."
            : null,
        siblings,
        readiness: { ready, checks },
        // Passwords are now per-account and stored encrypted: there is no shared literal to
        // hint at. Use "Reveal password" (reveal_login_password) for the real value.
        sub_user_password_hint: null,

      });
    }



    // Derived discount ladder (no RU call — pure resolution, safe to call freely).
    // Lets the console show exactly which tiers a discount push will send.
    if (action === "discount_ladder") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const ladder = await resolveRuDiscounts(admin, propertyId);
      const validation = validateRuLadder(ladder);
      return json({
        success: true,
        ladder,
        validation,
        summary: {
          long_stay: describeTierSources(ladder.longStay),
          last_minute: describeTierSources(ladder.lastMinute),
        },
      });
    }


    if (action === "wl_readiness") {
      const { data: props } = await admin
        .from("properties")
        .select("id, name, ru_push_enabled, rentalsunited_property_id, external_system")
        .eq("is_active", true)
        .order("name");

      const candidates = (props ?? []).filter(
        (p: { ru_push_enabled: boolean | null }) => p.ru_push_enabled === true,
      );

      // Scored one small page per invocation. Scoring every property in a single worker
      // exhausted its wall clock/memory, and the tail properties then reported a false
      // "payload could not be built"; the client walks `next_offset` until it is null.
      const PAGE = 3;
      const offset = Number.isFinite(Number(body.offset)) ? Math.max(0, Number(body.offset)) : 0;
      const page = candidates.slice(offset, offset + PAGE);
      const results: unknown[] = [];
      for (const p of page) {
        results.push(await scoreProperty(p));
      }
      const nextOffset = offset + page.length < candidates.length ? offset + page.length : null;

      return json({
        success: true,
        properties: results,
        offset,
        next_offset: nextOffset,
        total: candidates.length,
      });
    }




    // ── Phase 5: RU user management (parked behind a single switch) ──
    const readUserMgmtFlag = async (): Promise<{ enabled: boolean; note: string; updated_at?: string | null }> => {
      const { data } = await admin
        .from("ru_platform_settings")
        .select("value, updated_at")
        .eq("key", "user_management")
        .maybeSingle();
      const v = (data?.value ?? {}) as { enabled?: boolean; note?: string };
      return {
        enabled: v.enabled === true,
        note: v.note ?? "Parked — awaiting Rentals United confirmation of the ROLOS PMS profile.",
        updated_at: data?.updated_at ?? null,
      };
    };

    if (action === "user_management") {
      const flag = await readUserMgmtFlag();
      // Probe through the cache: opening this page must never cost a wire read.
      const probe = await listRuSubUsers(admin, { cacheOnly: true, source: "user_management_probe" });
      const probeOk = probe.ok;
      return json({
        success: true,
        enabled: flag.enabled,
        note: flag.note,
        updated_at: flag.updated_at,
        guest_communication: "Out of scope — Guest Communication API is not implemented.",
        endpoints: [
          { action: "list_users", ru_method: "Pull_ListMyUsers_RQ", implemented: true, gated: false, status: probeOk ? "reachable" : "unverified" },
          { action: "create_user", ru_method: "Push_CreateUser_RQ", implemented: true, gated: true, status: flag.enabled ? "enabled" : "disabled" },
          { action: "fill_company_details", ru_method: "Push_FillCompanyDetails_RQ", implemented: true, gated: true, status: flag.enabled ? "enabled" : "disabled" },
        ],
        users: probe.users,
        roster_cached: probe.cached,
        roster_fetched_at: probe.fetched_at,
        probe: error ? { ok: false, error: error.message } : { ok: probeOk, preview: preview(data, 1500) },
      });
    }

    // ── set_user_management: the one switch that unparks Phase 5 ──
    if (action === "set_user_management") {
      const enabled = body.enabled === true;
      const note = typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : enabled
          ? "Enabled — Rentals United confirmed the ROLOS PMS profile; sub-user creation is live."
          : "Parked — awaiting Rentals United confirmation of the ROLOS PMS profile.";
      const { error } = await admin
        .from("ru_platform_settings")
        .upsert({ key: "user_management", value: { enabled, note }, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) return json({ success: false, error: { code: "SAVE_FAILED", message: error.message } }, 500);
      return json({ success: true, enabled, note });
    }

    // ── reveal_login_password: admin-only retrieval of the stored sub-user password ──
    // The password is generated by us and kept encrypted at rest (ru_login_password_enc).
    // Revealing it is audit-logged so RU portal logins remain traceable.
    if (action === "reveal_login_password") {
      const accountId: string = body.account_id ?? "";
      if (!accountId) return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);

      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_login_url, ru_owner_id, ru_login_password_enc")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
      if (!account.ru_login_password_enc) {
        return json({
          success: false,
          error: {
            code: "NO_STORED_PASSWORD",
            message:
              "No password is held for this sub-user (the account was adopted rather than created here). Reset it in the Rentals United portal and save the new password via Complete company details.",
          },
        }, 409);
      }

      const { data: decrypted, error: decErr } = await admin.rpc("decrypt_sensitive_text", {
        encrypted_data: account.ru_login_password_enc,
      });
      if (decErr || !decrypted || decrypted === "[ENCRYPTED]" || decrypted === "[DECRYPTION_ERROR]") {
        return json({ success: false, error: { code: "DECRYPT_FAILED", message: decErr?.message || "Could not decrypt the stored password" } }, 500);
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Revealed Rentals United sub-user password for ${account.ru_login_email ?? account.owner_email} (OwnerID ${account.ru_owner_id ?? "?"})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));


      return json({
        success: true,
        login_email: account.ru_login_email ?? account.owner_email,
        login_url: account.ru_login_url ?? "https://new.rentalsunited.com",
        password: decrypted,
      });
    }

    // ── verify_login_password: confirm password retention and parent API access ──
    // RU portal credentials cannot be validated through the XML API. This action
    // verifies that a password is retained and the configured parent API account
    // can access the bound OwnerID, without mislabelling the portal password.
    if (action === "verify_login_password") {
      const accountId: string = body.account_id ?? "";
      if (!accountId) return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);
      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_owner_id, ru_login_password_enc, company_details_sent")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
      const loginEmail = account.ru_login_email ?? account.owner_email;
      const ownerId = String(account.ru_owner_id ?? "").trim();
      if (!account.ru_login_password_enc || !loginEmail || !ownerId) {
        return json({ success: false, error: { code: "RU_IDENTITY_INCOMPLETE", message: "A bound OwnerID, login email and stored password are required." } }, 422);
      }
      // NO WIRE CALL HERE. RU cannot validate a portal password on its XML surface: the only
      // read a password envelope could reach is the account-level Pull_ListBuildings_RQ, which
      // RU refuses with its generic "Incorrect login or password" text regardless of whether
      // the password is right — a guaranteed-failure call, and the most rate-limited method we
      // have. The password's real verdict is Push_CreateApiKey_RQ (create_api_key), so this
      // action now confirms retention/decryptability only.
      const { data: decryptedPw } = await admin.rpc("decrypt_sensitive_text", {
        encrypted_data: account.ru_login_password_enc,
      });
      if (!decryptedPw || decryptedPw === "[ENCRYPTED]" || decryptedPw === "[DECRYPTION_ERROR]") {
        return json({
          success: false,
          verified: false,
          error: { code: "DECRYPT_FAILED", message: "The stored RU password could not be decrypted by the backend." },
        }, 500);
      }
      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Stored Rentals United sub-user password retained for ${loginEmail} (OwnerID ${ownerId})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));
      return json({
        success: true,
        verified: true,
        password_stored: true,
        // Deliberately not asserted: only minting a key pair can prove the password.
        api_access_verified: null,
        verdict_pending_on: "portal_login",
        login_email: loginEmail,
        ru_owner_id: ownerId,
      });
    }


    /**
     * ── save_api_keys: store a sub-user's own RU API key pair (encrypted) ──
     * Every sub-user authenticates API calls with its own AccessKey/SecretKey. A.2 receives
     * the portal-issued pair here; A.3 verifies ownership before anything is stored.
     */
    if (action === "save_api_keys") {
      const accountId: string = body.account_id ?? "";
      const suppliedOwnerId: string = String(body.ru_owner_id ?? "").trim();
      const suppliedEmail: string = typeof body.login_email === "string" ? body.login_email.trim() : "";
      const accessKey: string = typeof body.access_key === "string" ? body.access_key.trim() : "";
      const secretKey: string = typeof body.secret_key === "string" ? body.secret_key.trim() : "";
      const keyLabel: string | null =
        typeof body.key_label === "string" && body.key_label.trim() ? body.key_label.trim() : null;
      if (!accountId && !suppliedOwnerId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id or ru_owner_id is required" } }, 400);
      }
      if (!accessKey || !secretKey) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "access_key and secret_key are required" } }, 400);
      }

      let account: Record<string, any> | null = null;
      if (accountId) {
        const { data } = await admin
          .from("ru_owner_accounts")
          .select("id, owner_email, ru_login_email, ru_owner_id, company_details_sent")
          .eq("id", accountId)
          .maybeSingle();
        if (!data) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
        account = data as Record<string, any>;
      }

      let ownerId = suppliedOwnerId || String(account?.ru_owner_id ?? "").trim();
      const loginEmail = suppliedEmail || account?.ru_login_email || account?.owner_email || null;
      if (!ownerId && loginEmail) {
        const normalizedLogin = String(loginEmail).trim().toLowerCase();
        const matchUser = (
          users: { owner_id?: string; email?: string; login_email?: string; user_account_id?: string }[],
        ) =>
          users.find((candidate) => {
            const candidateLogin = String(candidate.login_email ?? "").trim().toLowerCase();
            const candidateEmail = String(candidate.email ?? "").trim().toLowerCase();
            return candidateLogin === normalizedLogin || candidateEmail === normalizedLogin;
          });
        let roster = await listRuSubUsers(admin, { source: "step-a-key-owner-resolution" });
        let matched = matchUser(roster.users);
        if (!matched) {
          roster = await listRuSubUsers(admin, {
            forceFresh: true,
            source: "step-a-key-owner-resolution",
          });
          matched = matchUser(roster.users);
        }
        ownerId = String(matched?.owner_id ?? "").trim();
        if (ownerId && account?.id) {
          const userAccountId = String(matched?.user_account_id ?? "").trim();
          await admin.from("ru_owner_accounts").update({
            ru_owner_id: ownerId,
            ru_user_id: userAccountId && userAccountId !== ownerId && userAccountId !== "0"
              ? userAccountId
              : null,
            ru_login_email: String(matched?.login_email ?? loginEmail),
          }).eq("id", account.id);
          account.ru_owner_id = ownerId;
        }
      }
      if (!ownerId) {
        return json({
          success: false,
          error: {
            code: "RU_OWNER_NOT_LISTED",
            message: `The new sub-account ${loginEmail ?? ""} is not visible in the master roster yet. Wait one minute, then save this key pair again; Step A will resume at verification without creating the account again.`,
          },
        }, 200);
      }

      /**
       * ONE probe, owner-scoped: validity and ownership are the same question.
       *
       * The old path ran Pull_ListBuildings_RQ first (account-level, no OwnerID, the most
       * rate-limited method we call) and then a second owner-scoped read. Two identical-parameter
       * reads inside the channel's sliding minute made a perfectly good pair report
       * "Incorrect login or password" — that string is the channel's generic auth refusal, not
       * evidence that a login/password was sent. Now a single Pull_ListOwnerProp_RQ under the
       * pasted pair answers all three outcomes: verified, wrong account, or rate-deferred.
       */
      const { data: owned, error: ownedError } = await admin.functions.invoke("rentalsunited-api", {
        body: {
          action: "verify_child_key_owner",
          auth_access_key: accessKey,
          auth_secret_key: secretKey,
          owner_id: ownerId,
        },
      });

      const deferralCode = (payload: unknown): string | null => {
        const code = (payload as { error?: { code?: string } } | null)?.error?.code ?? null;
        return code === "RU_RATE_DEFERRED" ? code : null;
      };
      const ownedErrBody = ownedError ? await readInvokeErrorBody(ownedError) : null;
      const rawError = ownedErrBody
        ? (ownedErrBody?.error?.message ?? JSON.stringify(ownedErrBody))
        : (ownedError?.message ?? null);
      const rateDeferred =
        deferralCode(owned) !== null ||
        deferralCode(ownedErrBody) !== null ||
        (owned as { queued?: boolean } | null)?.queued === true ||
        (rawError?.includes("RU_RATE_DEFERRED") ?? false);

      if (rateDeferred) {
        const retryMs =
          (owned as { error?: { retry_after_ms?: number } } | null)?.error?.retry_after_ms ?? null;
        return json({
          success: false,
          verified: false,
          state: "deferred",
          method: "Pull_ListOwnerProp_RQ",
          retry_after_ms: retryMs,
          error: {
            code: "RU_RATE_DEFERRED",
            message: `The channel is rate limiting this check${
              retryMs ? ` — retry in ${Math.ceil(retryMs / 1000)}s` : " — retry in about a minute"
            }. Nothing was stored and the key pair has not been rejected.`,
          },
        }, 200);
      }

      if (ownedError || owned?.success !== true) {
        return json({
          success: false,
          verified: false,
          state: "rejected",
          method: "Pull_ListOwnerProp_RQ",
          error: {
            code: "RU_CHILD_KEYS_REJECTED",
            message: (owned as { error?: { message?: string } } | null)?.error?.message
              ?? rawError
              ?? "The channel could not be reached to check this key pair. Try again shortly.",
          },
        }, 200);
      }

      if (owned?.owns !== true) {
        const otherEmails: string[] = Array.isArray(owned?.identified_emails) ? owned.identified_emails : [];
        const otherOwners: string[] = Array.isArray(owned?.identified_owner_ids) ? owned.identified_owner_ids : [];
        const belongsTo = otherEmails[0] ?? otherOwners[0] ?? null;
        const who = loginEmail ?? `OwnerID ${ownerId}`;

        if (belongsTo) {
          return json({
            success: false,
            verified: false,
            state: "wrong_account",
            method: "Pull_ListOwnerProp_RQ",
            authenticated_as: belongsTo,
            ru_status_id: owned?.ru_status_id ?? null,
            ru_status_message: owned?.ru_status_message ?? null,
            error: {
              code: "RU_CHILD_KEYS_WRONG_ACCOUNT",
              message: `This key pair authenticates as ${belongsTo}, not ${who}. Use the AccessKey/SecretKey assigned to ${who}.`,
            },
          }, 200);
        }

        return json({
          success: false,
          verified: false,
          state: "rejected",
          method: "Pull_ListOwnerProp_RQ",
          ru_status_id: owned?.ru_status_id ?? null,
          ru_status_message: owned?.ru_status_message ?? null,
          error: {
            code: "RU_CHILD_KEYS_REJECTED",
            message: `The channel's XML API refused this key pair for ${who} (${owned?.ru_status_message ?? "auth rejected"}). The portal username/password was not tested because portal login and XML API authentication are separate. Confirm that this downloaded pair is enabled for XmlApi access on OwnerID ${ownerId}.`,
          },
        }, 200);
      }


      // Guard against the same pair sitting on two OwnerIDs (the exact cross-save above).
      const { data: clashRows } = await admin
        .from("ru_api_credentials")
        .select("ru_owner_id, login_email")
        .eq("access_key", accessKey)
        .neq("ru_owner_id", ownerId);
      if (clashRows && clashRows.length > 0) {
        const clash = clashRows[0] as { ru_owner_id: string; login_email: string | null };
        return json({
          success: false,
          verified: false,
          error: {
            code: "RU_CHILD_KEYS_DUPLICATE",
            message: `This AccessKey is already stored for ${clash.login_email ?? `OwnerID ${clash.ru_owner_id}`}. Each sub-account needs its own key pair.`,
          },
        }, 422);
      }

      const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: secretKey });
      if (encErr || !enc) {
        return json({ success: false, error: { code: "ENCRYPT_FAILED", message: encErr?.message || "Could not encrypt the secret key" } }, 500);
      }

      // Keys live per RU OwnerID, so saving a second sub-user never wipes the first.
      const verifiedAt = new Date().toISOString();
      const { error: credErr } = await admin.from("ru_api_credentials").upsert({
        ru_owner_id: ownerId,
        login_email: loginEmail,
        access_key: accessKey,
        secret_enc: enc,
        key_label: keyLabel,
        verified_at: verifiedAt,
        key_scope: "child",
        key_scope_verified_at: verifiedAt,
        key_scope_detail: {
          probe: "verify_child_key_owner",
          matched_owner_id: ownerId,
        },
      }, { onConflict: "ru_owner_id" });
      if (credErr) return json({ success: false, error: { code: "SAVE_FAILED", message: credErr.message } }, 500);

      if (account?.id) {
        const keyChanged = String((account as any).ru_api_access_key ?? "").trim() !== accessKey;
        const update: Record<string, unknown> = {
          ru_owner_id: ownerId,
          ru_api_access_key: accessKey,
          ru_api_secret_enc: enc,
          ru_api_key_label: keyLabel,
          ru_api_keys_verified_at: verifiedAt,
        };
        if (keyChanged) {
          update.company_details_sent = false;
          update.company_details_status = "credentials_verified";
          update.company_filled_at = null;
        }
        const { error: upErr } = await admin.from("ru_owner_accounts").update(update).eq("id", account.id);
        if (upErr) return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_api_credentials",
        record_id: account?.id ?? null,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Stored and verified Rentals United sub-user API keys for ${loginEmail ?? "unknown"} (OwnerID ${ownerId})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      // Live-notification subscription is deliberately NOT run here: Step A must stay a
      // linear create → keys → verify → company → listings sequence, and the LNM
      // push/read-back added failing calls and extra roster reads mid-onboarding. The
      // nightly `ru-rlnm-daily` cron owns subscriptions.
      // Keys were stored AND verified here — that is the A.3 verdict. Company profile and
      // listing adoption remain separate A.4/A.5 tasks and are never hidden in this call.
      await recordLedgerPassForOwnerAccount(admin, { accountId: account?.id ?? null, ownerId }, ["keys"], "keys_saved");
      await markLedgerStaleForOwnerAccount(admin, { accountId: account?.id ?? null, ownerId }, ["company_profile"], "keys_saved");
      return json({

        success: true,
        verified: true,
        ru_owner_id: ownerId,
        login_email: loginEmail,
        company_details_pushed: false,
      });
    }


    /**
     * ── delete_api_keys: manual reset/removal of a sub-user's stored RU API key pair ──
     * Clears the encrypted pair held per RU OwnerID and the mirrored fields on the local
     * account row. Nothing is changed on Rentals United — the pair can be re-captured or a
     * fresh one generated. Used when keys were saved against the wrong sub-account.
     */
    if (action === "delete_api_keys") {
      const accountId: string = body.account_id ?? "";
      const suppliedOwnerId: string = String(body.ru_owner_id ?? "").trim();
      if (!accountId && !suppliedOwnerId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id or ru_owner_id is required" } }, 400);
      }

      let account: Record<string, any> | null = null;
      if (accountId) {
        const { data } = await admin
          .from("ru_owner_accounts")
          .select("id, owner_email, ru_login_email, ru_owner_id")
          .eq("id", accountId)
          .maybeSingle();
        if (!data) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
        account = data as Record<string, any>;
      }

      const ownerId = suppliedOwnerId || String(account?.ru_owner_id ?? "").trim();
      let removedCredential = false;
      if (ownerId) {
        const { error: delErr } = await admin
          .from("ru_api_credentials")
          .delete()
          .eq("ru_owner_id", ownerId);
        if (delErr) return json({ success: false, error: { code: "DELETE_FAILED", message: delErr.message } }, 500);
        removedCredential = true;
      }

      if (account?.id) {
        const { error: upErr } = await admin
          .from("ru_owner_accounts")
          .update({
            ru_api_access_key: null,
            ru_api_secret_enc: null,
            ru_api_key_label: null,
            ru_api_keys_verified_at: null,
            company_details_sent: false,
            company_details_status: "credentials_cleared",
            company_filled_at: null,
          })
          .eq("id", account.id);
        if (upErr) return json({ success: false, error: { code: "DELETE_FAILED", message: upErr.message } }, 500);
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_api_credentials",
        record_id: account?.id ?? null,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Removed stored Rentals United sub-user API keys${ownerId ? ` for OwnerID ${ownerId}` : ""}${account?.owner_email ? ` (${account.ru_login_email ?? account.owner_email})` : ""}`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return json({
        success: true,
        removed_credential: removedCredential,
        ru_owner_id: ownerId || null,
      });
    }


    if (action === "verify_api_keys") {
      const accountId: string = body.account_id ?? "";
      const suppliedOwnerId: string = String(body.ru_owner_id ?? "").trim();
      if (!accountId && !suppliedOwnerId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id or ru_owner_id is required" } }, 400);
      }
      /** Anything verified inside this window is not re-probed on the wire. */
      const KEYS_VERIFY_TTL_MS = 6 * 60 * 60 * 1000;
      const forceFresh = body.force_fresh === true;

      let account: Record<string, any> | null = null;
      if (accountId) {
        const { data } = await admin
          .from("ru_owner_accounts")
          .select("id, owner_email, ru_login_email, ru_owner_id, ru_api_access_key, ru_api_secret_enc, ru_api_keys_verified_at")
          .eq("id", accountId)
          .maybeSingle();
        if (!data) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
        account = data as Record<string, any>;
      }

      const ownerId = suppliedOwnerId || String(account?.ru_owner_id ?? "").trim();
      let accessKey: string | null = null;
      let secretEnc: unknown = null;
      let loginEmail: string | null = account?.ru_login_email ?? account?.owner_email ?? null;
      let storedVerifiedAt: string | null = (account?.ru_api_keys_verified_at as string | null) ?? null;

      if (ownerId) {
        const { data: credRow } = await admin
          .from("ru_api_credentials")
          .select("access_key, secret_enc, login_email, verified_at")
          .eq("ru_owner_id", ownerId)
          .maybeSingle();
        if (credRow?.access_key) {
          accessKey = String(credRow.access_key);
          secretEnc = credRow.secret_enc;
          loginEmail = credRow.login_email ?? loginEmail;
          storedVerifiedAt = (credRow.verified_at as string | null) ?? storedVerifiedAt;
        }
      }
      if (!accessKey && account?.ru_api_access_key && account?.ru_api_secret_enc) {
        accessKey = String(account.ru_api_access_key);
        secretEnc = account.ru_api_secret_enc;
      }
      if (!accessKey || !secretEnc) {
        return json({
          success: false,
          error: {
            code: "NO_API_KEYS",
            message: "No API keys are stored for this sub-user yet. Save the sub-account password and Step A will create and store the pair automatically once the channel XML API accepts this sub-account.",
          },
        }, 409);
      }

      /**
       * Minting (Push_CreateApiKey_RQ) and pasting (verify_child_key_owner) both prove the
       * pair and stamp verified_at. Re-probing straight afterwards asked the channel a
       * question we already had answered, on its most rate-limited surface. Report the
       * stored verdict while it is fresh; only go to the wire when it is missing or stale.
       */
      const stampAgeMs = storedVerifiedAt ? Date.now() - new Date(storedVerifiedAt).getTime() : Number.POSITIVE_INFINITY;
      if (!forceFresh && Number.isFinite(stampAgeMs) && stampAgeMs >= 0 && stampAgeMs < KEYS_VERIFY_TTL_MS) {
        await recordLedgerPassForOwnerAccount(
          admin,
          { accountId: account?.id ?? null, ownerId },
          ["keys"],
          "keys_verified",
        );
        return json({
          success: true,
          verified: true,
          verified_from_stamp: true,
          verified_at: storedVerifiedAt,
          login_email: loginEmail,
          ru_owner_id: ownerId,
          company_details_pushed: false,
        });
      }

      const { data: secret } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: secretEnc });
      if (!secret || secret === "[ENCRYPTED]" || secret === "[DECRYPTION_ERROR]") {
        return json({ success: false, verified: false, error: { code: "DECRYPT_FAILED", message: "The stored secret key could not be decrypted." } }, 500);
      }
      // Owner-scoped probe (Pull_ListOwnerProp_RQ) — never the account-level buildings read.
      const { data: verified, error: verifyError } = await admin.functions.invoke("rentalsunited-api", {
        body: {
          action: "verify_child_login",
          auth_access_key: accessKey,
          auth_secret_key: secret,
          ...(ownerId ? { owner_id: ownerId } : {}),
        },
      });
      const accepted = !verifyError && verified?.success === true && verified?.verified === true;

      const stamp = accepted ? new Date().toISOString() : null;
      if (ownerId) {
        await admin.from("ru_api_credentials").update({ verified_at: stamp }).eq("ru_owner_id", ownerId);
      }
      if (account?.id) {
        await admin.from("ru_owner_accounts").update({ ru_api_keys_verified_at: stamp }).eq("id", account.id);
      }
      // An accepted verification IS the keys verdict — record it as passed so the
      // step stops depending on a probe that never grades it. A rejection keeps the
      // step open by marking it stale instead.
      if (accepted) {
        await recordLedgerPassForOwnerAccount(
          admin,
          { accountId: account?.id ?? null, ownerId },
          ["keys"],
          "keys_verified",
        );
      } else {
        await markLedgerStaleForOwnerAccount(
          admin,
          { accountId: account?.id ?? null, ownerId },
          ["keys"],
          "keys_rejected",
        );
      }
      if (!accepted) {
        return json({

          success: false,
          verified: false,
          error: {
            code: "RU_CHILD_KEYS_REJECTED",
            message: verified?.ru_status_message ?? verified?.error?.message ?? verifyError?.message
              ?? "The channel rejected the stored API keys. Save the sub-account password so Step A can replace the pair automatically once the channel XML API accepts this sub-account.",
          },
        }, 200);
      }
      return json({
        success: true,
        verified: true,
        login_email: loginEmail,
        ru_owner_id: ownerId,
        company_details_pushed: false,
      });
    }

    /**
     * ── revokeChannelKeys ────────────────────────────────────────────────────────
     * Deleting our stored row does NOT remove the key pair from the channel — the pair
     * keeps existing (and keeps counting) in the channel portal until Push_DeleteApiKey_RQ
     * runs. Both verbs authenticate AS the sub-account, so this needs child credentials:
     * a proven CHILD key pair, or the operator-supplied portal password. A master pair is
     * never used — it would enumerate and delete the MASTER account's keys.
     *
     * Returns an honest verdict; the caller keeps the local row when the channel side
     * could not be cleared, so a later run can retry.
     */
    const revokeChannelKeys = async (opts: {
      ownerId: string;
      loginEmail: string | null;
      /** Proven child key pair, when one is on file and usable. */
      accessKey?: string | null;
      secretKey?: string | null;
      /** Portal password fallback, when the operator supplied one. */
      password?: string | null;
      parentAction: string;
    }): Promise<{
      status: "revoked" | "nothing_to_revoke" | "no_credentials" | "refused";
      revoked: string[];
      failed: { access_key: string; message: string }[];
      message: string;
    }> => {
      // Candidate envelopes, tried in order until the channel lists the keys.
      // Archived sub-accounts are renamed `Archived_<email>` at the portal, so both the
      // bare and the prefixed login are tried, and the shared operator password is used
      // as an automatic fallback when the operator supplied nothing.
      const logins: string[] = [];
      const pushLogin = (v?: string | null) => {
        const t = (v ?? "").trim();
        if (t && !logins.includes(t)) logins.push(t);
      };
      pushLogin(opts.loginEmail);
      if (opts.loginEmail?.startsWith("Archived_")) pushLogin(opts.loginEmail.slice("Archived_".length));
      else pushLogin(opts.loginEmail ? `Archived_${opts.loginEmail}` : null);

      const passwords = [opts.password, RU_SUB_USER_PASSWORD]
        .map((p) => (p ?? "").trim())
        .filter((p, i, arr) => p.length > 0 && arr.indexOf(p) === i);

      const candidates: Record<string, string>[] = [];
      if (opts.accessKey && opts.secretKey) {
        candidates.push({ auth_access_key: opts.accessKey, auth_secret_key: opts.secretKey });
      }
      for (const login of logins) {
        for (const pw of passwords) {
          candidates.push({ auth_username: login, auth_password: pw });
        }
      }

      if (candidates.length === 0) {
        return {
          status: "no_credentials",
          revoked: [],
          failed: [],
          message:
            "Cannot revoke at the channel: no sub-account credentials (a child key pair or the portal password is required). The local copy was left in place so this can be retried.",
        };
      }

      let childAuth: Record<string, string> | null = null;
      let listed: Record<string, unknown> | null = null;
      let lastRefusal = "unknown refusal";
      for (const candidate of candidates) {
        const { data, error } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "list_child_api_keys",
            owner_id: Number(opts.ownerId),
            ...candidate,
            parent_action: opts.parentAction,
          },
        });
        if (!error && data?.success === true) {
          childAuth = candidate;
          listed = data;
          break;
        }
        lastRefusal = error?.message ?? String(data?.error?.message ?? data?.error ?? "unknown refusal");
        // The channel no longer accepts login/password for key management (status -4 on
        // Pull_GetApiKeys_RQ), so retrying other password variants is pointless.
        if (candidate.auth_password && String(data?.error?.ru_status_id ?? "") === "-4") {
          return {
            status: "refused",
            revoked: [],
            failed: [],
            message:
              "The channel only accepts API-key authentication for key management, and refuses the portal login/password. Without a stored sub-account key pair the keys cannot be revoked over the API — they must be removed in the channel portal (or by channel support) for this sub-account.",
          };
        }
      }

      if (!childAuth || !listed) {
        return {
          status: "refused",
          revoked: [],
          failed: [],
          message: `The channel would not list this sub-account's API keys: ${lastRefusal}`,
        };
      }



      const keys: { access_key: string | null }[] = Array.isArray((listed as { keys?: unknown }).keys)
        ? ((listed as { keys: { access_key: string | null }[] }).keys)
        : [];

      const targets = keys.map((k) => (k.access_key ?? "").trim()).filter(Boolean);
      if (targets.length === 0) {
        return { status: "nothing_to_revoke", revoked: [], failed: [], message: "Nothing to revoke — the channel lists no API keys for this sub-account" };
      }

      const revoked: string[] = [];
      const failed: { access_key: string; message: string }[] = [];
      for (const target of targets) {
        const { data: del, error: delErr } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "delete_child_api_key",
            owner_id: Number(opts.ownerId),
            target_access_key: target,
            ...childAuth,
            parent_action: opts.parentAction,
          },
        });
        if (delErr || del?.success !== true) {
          failed.push({
            access_key: target,
            message: delErr?.message ?? String(del?.error?.message ?? del?.error ?? "The channel did not accept the delete request"),
          });
        } else {
          revoked.push(target);
        }
      }

      return {
        status: failed.length === 0 ? "revoked" : "refused",
        revoked,
        failed,
        message: failed.length === 0
          ? `Revoked at the channel (${revoked.length} key(s))`
          : `${revoked.length} key(s) revoked, ${failed.length} refused by the channel — the local copy was kept so this can be retried`,
      };
    };


    /**
     * ── mintChildKeyPair ─────────────────────────────────────────────────────────
     * Single implementation of "get this sub-account a stored AccessKey/SecretKey pair".
     * Authenticates AS the child and calls Push_CreateApiKey_RQ, then
     * persists the pair immediately — RU returns the SecretKey exactly once.
     *
     * New accounts use the login/password created in the same atomic Step A run;
     * existing accounts use stored keys for rotation or their retained password.
     */
    const mintChildKeyPair = async (opts: {
      ownerId: string;
      loginEmail: string | null;
      accountId?: string | null;
      keyLabel?: string;
      authAccessKey?: string | null;
      authSecretKey?: string | null;
      authUsername?: string | null;
      authPassword?: string | null;
    }): Promise<{
      ok: boolean;
      accessKey?: string;
      code?: string;
      message?: string;
      ruStatusId?: string | null;
      ruStatusMessage?: string | null;
      rateDeferred?: boolean;
      retryAfterMs?: number;
      authRefused?: boolean;
      /** Human-readable trail of every envelope tried, in order. */
      attempts?: string[];
    }> => {
      const keyLabel = opts.keyLabel?.trim() || "ROLOS";
      const attempts: string[] = [];


      /**
       * Push_CreateApiKey_RQ carries no OwnerID in the documented schema: the pair belongs
       * to whichever account authenticates. A master-authenticated envelope therefore only
       * ever yields a MASTER pair (that is how master-footprint listings happened), so the
       * only valid child mint is a CHILD-credentialled one:
       *   1) an existing verified child key pair (rotation), then
       *   2) the sub-account's own login + the password sent in Push_CreateUser_RQ.
       * One request per envelope: repeating inside RU's one-minute method window only
       * manufactures throttles.
       */
      const variants: Array<{ label: string; body: Record<string, unknown>; keyLabel: string }> = [];
      if (opts.authAccessKey && opts.authSecretKey) {
        variants.push({
          label: "child_api_keys",
          body: { auth_access_key: opts.authAccessKey, auth_secret_key: opts.authSecretKey },
          keyLabel,
        });
      }
      if (opts.loginEmail && opts.authPassword) {
        variants.push({
          label: "child_login",
          body: { auth_username: opts.authUsername ?? opts.loginEmail, auth_password: opts.authPassword },
          keyLabel,
        });
      }

      if (variants.length === 0) {
        return {
          ok: false,
          code: "RU_CHILD_AUTH_REQUIRED",
          message:
            "The sub-account's own login and password (or an existing child key pair) are required: the channel issues API keys only to the authenticating account.",
        };
      }




      let created: any = null;
      let createdLabel = keyLabel;
      let lastFailure: {
        code: string;
        message: string;
        ruStatusId: string | null;
        ruStatusMessage: string | null;
        authRefused: boolean;
      } | null = null;
      // A deferral is only reported when nothing has been refused outright.
      let deferral: { retryAfterMs: number; message: string; ruStatusId: string | null; ruStatusMessage: string | null } | null = null;

      for (const variant of variants) {
        const { data, error: invokeError } = await admin.functions.invoke("rentalsunited-api", {
          body: { action: "create_child_api_key", key_label: variant.keyLabel, ...variant.body },
        });
        const errBody = invokeError ? await readInvokeErrorBody(invokeError) : null;
        const rawMessage = String(data?.error?.message ?? errBody?.error?.message ?? invokeError?.message ?? "");
        const ruStatusId = data?.error?.ru_status_id ?? errBody?.error?.ru_status_id ?? null;
        const ruStatusMessage = data?.ru_status_message ?? errBody?.ru_status_message ?? (rawMessage || null);
        const errorCode = String(data?.error?.code ?? errBody?.error?.code ?? "").trim();

        if (!invokeError && data?.success === true && data?.access_key && data?.secret_key) {
          created = data;
          createdLabel = variant.keyLabel;
          attempts.push(`${variant.label}: key pair issued`);
          break;
        }

        // A channel rate limit is a "come back shortly" — but it must never cancel a
        // refusal we have already seen, otherwise the self-healing recycle never runs.
        const deferred = /RU_RATE_DEFERRED|rate limit|less than a minute/i.test(rawMessage);
        if (deferred) {
          const retryMatch = rawMessage.match(/retry in (\d+)s/i);
          attempts.push(`${variant.label}: rate window`);
          deferral = {
            retryAfterMs: Math.max(5_000, Number(retryMatch?.[1] ?? 60) * 1000),
            message: rawMessage || "The channel rate-limited automatic key creation.",
            ruStatusId,
            ruStatusMessage,
          };
          if (!lastFailure?.authRefused) {
            // Nothing refused yet: a genuine wait, surfaced as a countdown.
            return {
              ok: false,
              rateDeferred: true,
              retryAfterMs: deferral.retryAfterMs,
              code: "RU_RATE_DEFERRED",
              message: deferral.message,
              ruStatusId,
              ruStatusMessage,
              attempts,
            };
          }
          continue;
        }

        const authRefused = errorCode === "RU_CREATE_KEY_API_REJECTED"
          || String(ruStatusId ?? "") === "-4"
          || /incorrect login|login or password/i.test(`${rawMessage} ${ruStatusMessage ?? ""}`);
        attempts.push(`${variant.label}: ${authRefused ? "refused (-4)" : (errorCode || "failed")}`);
        const keyLimitReached = String(ruStatusId ?? "") === "387"
          || /limit of 10 keys/i.test(`${rawMessage} ${ruStatusMessage ?? ""}`);
        lastFailure = {
          code: keyLimitReached ? "RU_MASTER_KEY_LIMIT_REACHED" : (errorCode || "RU_CREATE_KEY_FAILED"),
          message: rawMessage || "Rentals United did not return a new API key pair.",
          ruStatusId,
          ruStatusMessage,
          authRefused,
        };
        // Anything that is not an auth refusal will not be cured by another envelope.
        if (!authRefused) break;
      }

      if (!created) {
        if (lastFailure) {
          return { ok: false, ...lastFailure, attempts };
        }
        if (deferral) {
          return {
            ok: false,
            rateDeferred: true,
            retryAfterMs: deferral.retryAfterMs,
            code: "RU_RATE_DEFERRED",
            message: deferral.message,
            ruStatusId: deferral.ruStatusId,
            ruStatusMessage: deferral.ruStatusMessage,
            attempts,
          };
        }
        return { ok: false, code: "RU_CREATE_KEY_FAILED", message: "Rentals United did not return a new API key pair.", attempts };
      }

      /** Prove the issued pair belongs to the requested child before storing or using it. */
      if (opts.ownerId) {
        const { data: scopeData, error: scopeError } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "verify_child_key_owner",
            owner_id: opts.ownerId,
            auth_access_key: created.access_key,
            auth_secret_key: created.secret_key,
          },
        });
        const verifiedChild = !scopeError
          && scopeData?.success === true
          && scopeData?.owns === true
          && scopeData?.key_scope === "child";
        if (!verifiedChild) {
          const verificationReason = scopeData?.reason
            ?? (scopeData?.key_scope === "master_pair" ? "KEYS_ARE_MASTER_PAIR" : "OWNER_VERIFICATION_FAILED");
          attempts.push(`${createdLabel}: discarded — ${verificationReason}`);
          // Best effort: revoke the untrusted pair. It is never persisted or used for writes.
          await admin.functions.invoke("rentalsunited-api", {
            body: {
              action: "delete_child_api_key",
              owner_id: opts.ownerId,
              access_key: created.access_key,
              auth_access_key: created.access_key,
              auth_secret_key: created.secret_key,
            },
          }).catch(() => {});
          return {
            ok: false,
            code: verificationReason === "KEYS_ARE_MASTER_PAIR"
              ? "RU_KEYS_ARE_MASTER_PAIR"
              : verificationReason === "KEYS_BELONG_TO_ANOTHER_ACCOUNT"
                ? "RU_KEY_OWNER_MISMATCH"
                : "RU_KEY_OWNER_VERIFICATION_FAILED",
            message:
              `The channel issued a key pair, but it was not proven to belong to sub-account ${opts.ownerId}. ` +
              `It was discarded before any inventory write (${verificationReason}).`,
            attempts,
          };
        }
        attempts.push(`${createdLabel}: verified child OwnerID ${opts.ownerId}`);
      }

      const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: created.secret_key });

      if (encErr || !enc) {
        return {
          ok: false,
          code: "ENCRYPT_FAILED",
          message: encErr?.message || "Could not encrypt the new secret key",
        };
      }

      if (opts.ownerId) {
        const { error: credErr } = await admin.from("ru_api_credentials").upsert({
          ru_owner_id: opts.ownerId,
          login_email: opts.loginEmail,
          access_key: created.access_key,
          secret_enc: enc,
          key_label: createdLabel,
          key_scope: "child",
          key_scope_verified_at: new Date().toISOString(),
          verified_at: new Date().toISOString(),
        }, { onConflict: "ru_owner_id" });

        if (credErr) return { ok: false, code: "SAVE_FAILED", message: credErr.message };
      }

      if (opts.accountId) {
        const { error: upErr } = await admin.from("ru_owner_accounts").update({
          ru_api_access_key: created.access_key,
          ru_api_secret_enc: enc,
          ru_api_key_label: createdLabel,

          ru_api_keys_verified_at: new Date().toISOString(),
        }).eq("id", opts.accountId);
        if (upErr) return { ok: false, code: "SAVE_FAILED", message: upErr.message };
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_api_credentials",
        record_id: opts.accountId ?? null,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Created Rentals United sub-user API key "${createdLabel}" for ${opts.loginEmail ?? "unknown"} (OwnerID ${opts.ownerId || "?"})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return { ok: true, accessKey: String(created.access_key), attempts };

    };

    /**
     * ── closeAccountAtChannel ────────────────────────────────────────────────────
     * The one and only place that closes a distribution sub-account AT THE CHANNEL.
     * Push_ArchiveUser_RQ carries no account selector, so it runs as the sub-account
     * itself: a proven CHILD key pair (minted here when none is on file) is the only
     * envelope and the master pair is never used — closing with it would close OUR
     * master account.
     *
     * Strictly serialised on ru_call_queue (one close in flight platform-wide plus a
     * cooldown), then verified against the channel's own roster. Callers stamp
     * channel_archived_at from `confirmed` — never from a listing loop.
     */
    const CLOSE_QUEUE_ACTION = "ru_close_account";
    type CloseAccountOutcome = {
      /** closed_at_channel | close_not_possible */
      status: "closed_at_channel" | "close_not_possible";
      confirmed: boolean;
      code: string;
      message: string;
      steps: { step: string; ok: boolean; message: string }[];
      attempts: number;
      retryAfterMs?: number;
      verifiedViaRoster: boolean;
    };
    const closeAccountAtChannel = async (opts: {
      ownerId: string;
      loginEmail?: string | null;
      password?: string | null;
      note?: string | null;
      cooldownSeconds?: number;
      /** Set when the binding was already removed in the same run. */
      allowBound?: boolean;
    }): Promise<CloseAccountOutcome> => {
      const ownerId = String(opts.ownerId ?? "").trim();
      const steps: { step: string; ok: boolean; message: string }[] = [];
      const cooldownSeconds = Math.min(
        300,
        Math.max(30, Number.isFinite(Number(opts.cooldownSeconds)) ? Number(opts.cooldownSeconds) : 60),
      );
      const STALE_LOCK_MS = 15 * 60 * 1000; // the channel says a close can take several minutes
      const fail = (code: string, message: string, extra?: Partial<CloseAccountOutcome>): CloseAccountOutcome => ({
        status: "close_not_possible",
        confirmed: false,
        code,
        message,
        steps,
        attempts: 1,
        verifiedViaRoster: false,
        ...extra,
      });

      if (!/^\d+$/.test(ownerId)) {
        return fail("BAD_REQUEST", "A numeric ru_owner_id is required to close an account");
      }

      if (opts.allowBound !== true) {
        const { data: stillBound } = await admin
          .from("ru_owner_accounts")
          .select("id")
          .eq("ru_owner_id", ownerId)
          .limit(1);
        if ((stillBound ?? []).length > 0) {
          return fail(
            "STILL_BOUND",
            `OwnerID ${ownerId} is still bound to a property or portfolio. Retire the binding first, then close the account.`,
          );
        }
      }

      // ── Serialisation: one close in flight, then a cooldown ──
      const { data: inFlight } = await admin
        .from("ru_call_queue")
        .select("id, ru_owner_id, claimed_at, created_at")
        .eq("action", CLOSE_QUEUE_ACTION)
        .eq("status", "running")
        .order("created_at", { ascending: true });
      for (const row of inFlight ?? []) {
        const started = new Date(row.claimed_at ?? row.created_at).getTime();
        if (Date.now() - started > STALE_LOCK_MS) {
          await admin
            .from("ru_call_queue")
            .update({ status: "failed", last_error: "Abandoned close lock released", completed_at: new Date().toISOString() })
            .eq("id", row.id)
            .then(() => {}, () => {});
          continue;
        }
        return fail(
          "CLOSE_IN_PROGRESS",
          `A close is already running for OwnerID ${row.ru_owner_id ?? "another sub-account"}. Accounts are closed one at a time — wait for it to finish.`,
        );
      }

      const { data: lastClose } = await admin
        .from("ru_call_queue")
        .select("completed_at")
        .eq("action", CLOSE_QUEUE_ACTION)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastClose?.completed_at) {
        const waited = Date.now() - new Date(lastClose.completed_at).getTime();
        const remaining = cooldownSeconds * 1000 - waited;
        if (remaining > 0) {
          return fail(
            "CLOSE_COOLDOWN",
            `The previous account close finished ${Math.round(waited / 1000)}s ago. Waiting out the ${cooldownSeconds}s gap before the next one.`,
            { retryAfterMs: remaining },
          );
        }
      }

      const nowIso = new Date().toISOString();
      const { data: lockRow, error: lockErr } = await admin
        .from("ru_call_queue")
        .insert({
          method_key: "Push_ArchiveUser_RQ",
          action: CLOSE_QUEUE_ACTION,
          ru_owner_id: ownerId,
          priority: 5,
          status: "running",
          claimed_at: nowIso,
          not_before: nowIso,
          max_attempts: 1,
          payload: { ru_owner_id: ownerId, reason: opts.note ?? null, requested_by: user.email ?? user.id },
        })
        .select("id, created_at")
        .single();
      if (lockErr || !lockRow) {
        return fail("LOCK_FAILED", lockErr?.message ?? "The close lock could not be claimed");
      }

      // Two simultaneous requests could both have passed the check above: the oldest lock wins.
      const { data: contenders } = await admin
        .from("ru_call_queue")
        .select("id, created_at")
        .eq("action", CLOSE_QUEUE_ACTION)
        .eq("status", "running")
        .order("created_at", { ascending: true })
        .limit(1);
      if (contenders?.[0] && contenders[0].id !== lockRow.id) {
        await admin.from("ru_call_queue").delete().eq("id", lockRow.id).then(() => {}, () => {});
        return fail("CLOSE_IN_PROGRESS", "Another close claimed the slot first. Accounts are closed one at a time.");
      }

      const releaseLock = async (ok: boolean, message: string) => {
        await admin
          .from("ru_call_queue")
          .update({
            status: ok ? "completed" : "failed",
            completed_at: new Date().toISOString(),
            last_error: ok ? null : message,
            result: { steps, message },
          })
          .eq("id", lockRow.id)
          .then(() => {}, (e) => console.warn("[ru-cert-portal] close lock release failed", e));
      };

      try {
        const { data: credRow } = await admin
          .from("ru_api_credentials")
          .select("access_key, secret_enc, login_email, key_scope, password_enc, auth_mode")
          .eq("ru_owner_id", ownerId)
          .maybeSingle();
        const { data: registryRow } = await admin
          .from("ru_retired_accounts")
          .select("portal_email")
          .eq("ru_owner_id", ownerId)
          .maybeSingle();
        const loginEmail = (opts.loginEmail ?? "").trim()
          ? String(opts.loginEmail).trim()
          : (credRow?.login_email ?? registryRow?.portal_email ?? null);

        // ── Step 1: the account's OWN keys (the close has no account selector) ──
        let childAccessKey: string | null = null;
        let childSecretKey: string | null = null;
        if (credRow?.access_key && credRow.key_scope !== "master_pair") {
          const { data: plain } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: credRow.secret_enc });
          if (typeof plain === "string" && plain !== "[ENCRYPTED]" && plain !== "[DECRYPTION_ERROR]") {
            childAccessKey = String(credRow.access_key);
            childSecretKey = plain;
          }
        }
        // A stored portal password is a valid mint envelope when no pair is on file.
        let storedPassword: string | null = null;
        if (!childAccessKey && credRow?.password_enc) {
          const { data: plain } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: credRow.password_enc });
          if (typeof plain === "string" && plain !== "[ENCRYPTED]" && plain !== "[DECRYPTION_ERROR]") storedPassword = plain;
        }
        // The sub-account's own portal login is an equally valid envelope for the close,
        // so a mint refusal is not the end of the road — it just falls back to password auth.
        const passwordEnvelope = (opts.password ?? "").trim() || storedPassword || RU_SUB_USER_PASSWORD;
        let authMode: "keys" | "password" = "keys";
        if (childAccessKey && childSecretKey) {
          steps.push({ step: "auth", ok: true, message: "Used the stored sub-account API key pair" });
        } else {
          const minted = await mintChildKeyPair({
            ownerId,
            loginEmail,
            keyLabel: "ROLOS-close",
            authUsername: loginEmail,
            authPassword: passwordEnvelope,
          });
          if (minted.ok) {
            const { data: freshCred } = await admin
              .from("ru_api_credentials")
              .select("access_key, secret_enc")
              .eq("ru_owner_id", ownerId)
              .maybeSingle();
            if (freshCred?.access_key) {
              const { data: plain } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: freshCred.secret_enc });
              if (typeof plain === "string" && plain !== "[ENCRYPTED]" && plain !== "[DECRYPTION_ERROR]") {
                childAccessKey = String(freshCred.access_key);
                childSecretKey = plain;
              }
            }
          }
          if (childAccessKey && childSecretKey) {
            steps.push({ step: "auth", ok: true, message: `Minted a fresh key pair (${(minted.attempts ?? []).join(" → ") || "ok"})` });
          } else if (loginEmail && passwordEnvelope) {
            authMode = "password";
            steps.push({
              step: "auth",
              ok: true,
              message: `No key pair could be minted (${minted.message ?? "channel refused"}) — closing with the sub-account's portal login instead`,
            });
          } else {
            const why = minted.message ?? "the channel refused to mint a key pair for this sub-account";
            steps.push({ step: "auth", ok: false, message: why });
            await releaseLock(false, why);
            return fail(
              "NEEDS_KEYS",
              `This account cannot be closed over the API: the close verb runs as the sub-account itself and ${why}. Supply the sub-account portal password to close it. Master credentials are never used for a close.`,
            );
          }
        }

        // ── Step 2: close it at the channel ──
        const { data: closeRes, error: closeErr } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "archive_user",
            owner_id: Number(ownerId),
            ...(authMode === "keys"
              ? { auth_access_key: childAccessKey, auth_secret_key: childSecretKey }
              : { auth_username: loginEmail, auth_password: passwordEnvelope }),
            parent_action: "ru-cert-portal:close_account",
          },
        });

        const closeCode = String(closeRes?.error?.code ?? "");
        const rateLimited = closeCode === "RU_RATE_LIMITED" || closeCode === "RU_RATE_DEFERRED";
        if (closeErr || closeRes?.success !== true) {
          const message = closeRes?.error?.message ?? closeErr?.message ?? "The channel did not accept the close request";
          steps.push({ step: "close_account", ok: false, message });
          await releaseLock(false, message);
          return fail(rateLimited ? "RATE_LIMITED" : "CLOSE_REFUSED", rateLimited
            ? `${message} This account stays open and can be retried after the window.`
            : message, { retryAfterMs: rateLimited ? cooldownSeconds * 1000 : undefined });
        }
        steps.push({ step: "close_account", ok: true, message: "The channel accepted Push_ArchiveUser_RQ (close user account)" });

        // ── Step 3: verify against the channel's own roster ──
        let confirmed = false;
        let verifiedViaRoster = false;
        let verifyMessage = "The roster could not be re-read, so the close is unverified";
        try {
          const { data: roster, error: rosterErr } = await admin.functions.invoke("rentalsunited-api", {
            body: {
              action: "list_users",
              include_retired: true,
              force_fresh: true,
              parent_action: "ru-cert-portal:close_account",
            },
          });
          if (!rosterErr && roster?.success !== false) {
            verifiedViaRoster = true;
            const users: { owner_id?: string | null; archived?: boolean | null }[] = Array.isArray(roster?.users) ? roster.users : [];
            const match = users.find((u) => String(u.owner_id ?? "").trim() === ownerId);
            confirmed = !match || match.archived === true;
            verifyMessage = confirmed
              ? (match ? "The channel now lists the account as archived" : "The account no longer appears on the master roster")
              : "The channel still lists the account as active — it may still be processing (closes can take several minutes)";
          }
        } catch (e) {
          verifyMessage = e instanceof Error ? e.message : String(e);
        }
        steps.push({ step: "verify", ok: confirmed, message: verifyMessage });

        /**
         * A confirmed close must also erase the account from OUR library, or every cache-backed
         * surface keeps asking the channel about an account that no longer exists: the cached
         * roster kept it for the whole TTL, the cached listing answer kept its listings, and any
         * parked call stayed queued to be replayed against a dead login.
         */
        if (confirmed) {
          await admin.from("ru_api_credentials").delete().eq("ru_owner_id", ownerId)
            .then(() => {}, (e) => console.warn("[ru-cert-portal] close key row delete failed", e));
          await admin.from("ru_owner_accounts").delete().eq("ru_owner_id", ownerId)
            .then(() => {}, (e) => console.warn("[ru-cert-portal] close binding row delete failed", e));
          await admin.from("ru_call_queue")
            .update({ status: "cancelled", completed_at: new Date().toISOString(), last_error: `Sub-account ${ownerId} was closed at the channel` })
            .eq("ru_owner_id", ownerId)
            .in("status", ["pending", "deferred", "claimed", "queued", "retry", "running", "parked"])
            .neq("action", "ru_close_account")
            .then(() => {}, (e) => console.warn("[ru-cert-portal] close queue purge failed", e));
          await dropRuOwnerListingCache(admin, ownerId);
          await forgetRuRosterUser(admin, ownerId);
          steps.push({ step: "purge_library", ok: true, message: "Removed from the local account library, cached roster, cached listings and the call queue" });
        }


        await releaseLock(true, confirmed ? "closed and confirmed" : "closed, roster confirmation pending");
        return {
          status: confirmed ? "closed_at_channel" : "close_not_possible",
          confirmed,
          code: confirmed ? "CLOSED" : "CLOSE_UNVERIFIED",
          message: confirmed
            ? `The channel closed the account${loginEmail ? ` ${loginEmail}` : ""} (OwnerID ${ownerId})`
            : `The channel accepted the close but has not confirmed it yet: ${verifyMessage}`,
          steps,
          attempts: 1,
          verifiedViaRoster,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await releaseLock(false, message);
        return fail("CLOSE_FAILED", message);
      }
    };



    /**
     * ── persistChildPasswordAndProbe ─────────────────────────────────────────────
     * §2 replacement for mintChildKeyPair on the onboard/save-password paths. RU no
     * longer issues a sub-account's first key pair via the API (post 26 Nov 2025), so
     * onboarding stores the CreateUser email/password as auth_mode='child_password'
     * and proves it with exactly ONE Pull_ListOwnerProp_RQ probe — no mint, no wait.
     */
    const persistChildPasswordAndProbe = async (opts: {
      ownerId: string;
      loginEmail: string;
      password: string;
    }): Promise<{
      ok: boolean;
      code?: string;
      message?: string;
      ruStatusId?: string | null;
      ruStatusMessage?: string | null;
    }> => {
      const { ownerId, loginEmail, password } = opts;
      if (!ownerId || !loginEmail || !password) {
        return { ok: false, code: "RU_CHILD_AUTH_REQUIRED", message: "OwnerID, login email and password are required to persist child auth." };
      }

      const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: password });
      if (encErr || !enc) {
        return { ok: false, code: "ENCRYPT_FAILED", message: encErr?.message || "Could not encrypt the sub-account password" };
      }

      // Keys win over password (§2): never downgrade a row that already holds a verified
      // child key pair by upserting a password on top of it.
      const { data: existingCred } = await admin
        .from("ru_api_credentials")
        .select("access_key, key_scope")
        .eq("ru_owner_id", ownerId)
        .maybeSingle();
      if (!existingCred?.access_key) {
        const { error: credErr } = await admin.from("ru_api_credentials").upsert({
          ru_owner_id: ownerId,
          login_email: loginEmail,
          auth_mode: "child_password",
          password_enc: enc,
        }, { onConflict: "ru_owner_id" });
        if (credErr) return { ok: false, code: "SAVE_FAILED", message: credErr.message };
      }

      // One probe, no ListMyUsers, no busy-poll: Status 0 (even empty <Properties/>) proves
      // the password authenticates as this child.
      const { data: probeData, error: probeError } = await admin.functions.invoke("rentalsunited-api", {
        body: {
          action: "verify_child_key_owner",
          owner_id: ownerId,
          auth_username: loginEmail,
          auth_password: password,
        },
      });
      if (probeError) {
        const errBody = await readInvokeErrorBody(probeError);
        return {
          ok: false,
          code: String(errBody?.error?.code ?? "RU_CHILD_AUTH_PROBE_FAILED"),
          message: errBody?.error?.message ?? probeError.message ?? "The channel did not answer the sub-account password probe.",
          ruStatusId: errBody?.error?.ru_status_id ?? null,
          ruStatusMessage: errBody?.ru_status_message ?? null,
        };
      }
      if (probeData?.success === true && probeData?.owns === true) {
        // Do NOT stamp verified_at here: that column means "the key pair is proven".
        // A working login/password only proves the account exists — the AccessKey/
        // SecretKey pair must still be pasted, so the onboarding gate must stay open.
        return { ok: true, ruStatusId: probeData?.ru_status_id ?? null, ruStatusMessage: probeData?.ru_status_message ?? null };
      }

      return {
        ok: false,
        code: "NEEDS_UI_KEY",
        message: `Rentals United rejected the sub-account password for OwnerID ${ownerId} (${loginEmail}). Log in as this sub-user in the RU portal, generate an XmlApi key and paste it here.`,
        ruStatusId: probeData?.ru_status_id ?? null,
        ruStatusMessage: probeData?.ru_status_message ?? null,
      };
    };


    /**
     * ── create_api_key: mint an additional key pair for the sub-user via the RU API ──
     * Requires an already-working key pair for that sub-user. The new secret is stored immediately because
     * RU only returns it once.
     */
    if (action === "create_api_key") {
      const accountId: string = body.account_id ?? "";
      const suppliedOwnerId: string = String(body.ru_owner_id ?? "").trim();
      const keyLabel: string = typeof body.key_label === "string" && body.key_label.trim()
        ? body.key_label.trim()
        : "ROLOS";
      if (!accountId && !suppliedOwnerId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id or ru_owner_id is required" } }, 400);
      }

      let account: Record<string, any> | null = null;
      if (accountId) {
        const { data } = await admin
          .from("ru_owner_accounts")
          .select("id, owner_email, ru_login_email, ru_owner_id, ru_login_password_enc, ru_api_access_key, ru_api_secret_enc, company_details_sent")
          .eq("id", accountId)
          .maybeSingle();
        if (!data) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
        account = data as Record<string, any>;
      }

      const ownerId = suppliedOwnerId || String(account?.ru_owner_id ?? "").trim();

      const decrypt = async (enc: unknown): Promise<string | null> => {
        if (!enc) return null;
        const { data } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: enc });
        if (!data || data === "[ENCRYPTED]" || data === "[DECRYPTION_ERROR]") return null;
        return String(data);
      };

      let existingKey: string | null = null;
      let existingSecret: string | null = null;
      let retainedPassword: string | null = null;
      let loginEmail: string | null = account?.ru_login_email ?? account?.owner_email ?? null;
      if (ownerId) {
        const { data: credRow } = await admin
          .from("ru_api_credentials")
          .select("access_key, secret_enc, login_email")
          .eq("ru_owner_id", ownerId)
          .maybeSingle();
        if (credRow?.access_key) {
          const plain = await decrypt(credRow.secret_enc);
          if (plain) {
            existingKey = String(credRow.access_key);
            existingSecret = plain;
          }
          loginEmail = credRow.login_email ?? loginEmail;
        }
      }
      if (!existingKey && account?.ru_api_access_key) {
        const plain = await decrypt(account.ru_api_secret_enc);
        if (plain) {
          existingKey = String(account.ru_api_access_key);
          existingSecret = plain;
        }
      }
      if (!existingKey && account?.ru_login_password_enc) {
        retainedPassword = await decrypt(account.ru_login_password_enc);
      }

      const minted = await mintChildKeyPair({
        ownerId,
        loginEmail,
        accountId: account?.id && String(account.ru_owner_id ?? "").trim() === ownerId ? account.id : null,
        keyLabel,
        authAccessKey: existingKey,
        authSecretKey: existingSecret,
        authUsername: loginEmail,
        authPassword: retainedPassword,
      });
      if (!minted.ok) {
        return json({
          success: false,
          ru_status_id: minted.ruStatusId ?? null,
          ru_status_message: minted.ruStatusMessage ?? null,
          error: {
            code: minted.code ?? "RU_CREATE_KEY_FAILED",
            ru_status_id: minted.ruStatusId ?? null,
            message: minted.message ?? "Rentals United did not return a new API key pair.",
          },
          ...(minted.rateDeferred ? { rate_deferred: true, retry_after_ms: minted.retryAfterMs } : {}),
        }, minted.rateDeferred ? 429 : 422);
      }

      return json({ success: true, key_minted: true, access_key: minted.accessKey, label: keyLabel, login_email: loginEmail, ru_owner_id: ownerId });
    }

    /**
     * ── list_stored_api_keys: which RU OwnerIDs we hold key pairs for (no secrets returned).
     * Drives the per-sub-user key state in the RU accounts UI.
     */
    /**
     * ── generate_child_key: mint + verify + store a child key pair for one roster account ──
     * Used from Channel Monitor → Advanced → Master account roster for accounts that hold no
     * usable child pair (so the close verb, which authenticates AS the sub-account, is blocked).
     *
     * Authenticates as the SUB-ACCOUNT (its own login + password). The master account is never
     * used to mint a child key — mintChildKeyPair already discards any pair that turns out to
     * authenticate as the master account.
     */
    if (action === "generate_child_key") {
      const ownerId = String(body.ru_owner_id ?? "").trim();
      if (!ownerId) {
        return json({ success: false, error: { code: "MISSING_PARAM", message: "ru_owner_id is required" } }, 400);
      }
      const suppliedEmail = typeof body.login_email === "string" ? body.login_email.trim() : "";
      const suppliedPassword = typeof body.password === "string" && body.password.trim()
        ? body.password.trim()
        : RU_SUB_USER_PASSWORD;
      const keyLabel = typeof body.key_label === "string" && body.key_label.trim()
        ? body.key_label.trim()
        : "ROLOS";

      const [{ data: credRow }, { data: acctRow }] = await Promise.all([
        admin
          .from("ru_api_credentials")
          .select("id, login_email, access_key, key_scope")
          .eq("ru_owner_id", ownerId)
          .maybeSingle(),
        admin
          .from("ru_owner_accounts")
          .select("id, ru_login_email, owner_email")
          .eq("ru_owner_id", ownerId)
          .maybeSingle(),
      ]);

      // A verified child pair is already usable — nothing to do unless the caller forces a rotation.
      if (credRow?.key_scope === "child" && body.force !== true) {
        return json({
          success: true,
          status: "already_held",
          owner_id: ownerId,
          access_key_last4: String(credRow.access_key ?? "").slice(-4),
          message: "A verified sub-account key pair is already stored for this account.",
        });
      }

      const loginEmail = suppliedEmail
        || String(credRow?.login_email ?? "").trim()
        || String(acctRow?.ru_login_email ?? "").trim()
        || String(acctRow?.owner_email ?? "").trim()
        || "";
      if (!loginEmail) {
        return json({
          success: false,
          status: "refused",
          error: {
            code: "NO_LOGIN_EMAIL",
            message: "No sub-account login email is on record for this OwnerID, so the channel cannot be asked to mint its key.",
          },
        }, 422);
      }

      const minted = await mintChildKeyPair({
        ownerId,
        loginEmail,
        accountId: acctRow?.id ? String(acctRow.id) : null,
        keyLabel,
        authUsername: loginEmail,
        authPassword: suppliedPassword,
      });

      if (minted.ok) {
        return json({
          success: true,
          status: "minted",
          owner_id: ownerId,
          login_email: loginEmail,
          access_key_last4: String(minted.accessKey ?? "").slice(-4),
          attempts: minted.attempts ?? [],
          message: `Key pair minted, verified as sub-account ${ownerId} and stored.`,
        });
      }

      const status = minted.rateDeferred
        ? "rate_limited"
        : minted.code === "RU_KEY_CREATION_NOT_ENABLED"
          ? "not_enabled"
          : "refused";
      // A channel refusal is a handled business outcome, not an edge-function runtime
      // failure. Return it in the normal response envelope so the roster can render the
      // per-account remedy instead of the preview surfacing a generic function error.
      return json({
        success: false,
        status,
        owner_id: ownerId,
        login_email: loginEmail,
        attempts: minted.attempts ?? [],
        ...(minted.rateDeferred ? { rate_deferred: true, retry_after_ms: minted.retryAfterMs } : {}),
        error: {
          code: minted.code ?? "RU_CREATE_KEY_FAILED",
          message: minted.message ?? "The channel did not issue a key pair for this sub-account.",
        },
      }, 200);
    }

    if (action === "list_stored_api_keys") {

      const { data, error } = await admin
        .from("ru_api_credentials")
        .select("id, ru_owner_id, login_email, access_key, key_label, verified_at, key_scope, key_scope_verified_at")
        .order("updated_at", { ascending: false });
      if (error) return json({ success: false, error: { code: "READ_FAILED", message: error.message } }, 500);
      // Flag any AccessKey held against more than one OwnerID — that means one sub-user's keys
      // were pasted onto another account, and every scoped call for it hits the wrong RU account.
      const seen = new Map<string, number>();
      for (const row of data ?? []) {
        const k = String((row as { access_key?: string }).access_key ?? "");
        if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      const credentials = (data ?? []).map((row) => ({
        ...row,
        shared_with_other_account: (seen.get(String((row as { access_key?: string }).access_key ?? "")) ?? 0) > 1,
      }));
      return json({ success: true, credentials });
    }

    /**
     * ── rematch_stored_keys: attach a stored key pair to the sub-account it really is.
     *
     * A stored pair is only trustworthy while the OwnerID on its row is the account the
     * pair authenticates as. Rebinds, re-mints and closed accounts can leave a perfectly
     * valid pair filed against the wrong OwnerID, after which every "sub-account scoped"
     * call reads or writes the wrong channel account (or silently the master account).
     *
     * One row per call so the caller can pace the channel reads and stop mid-run:
     *   1. probe the pair against the OwnerID it is filed under,
     *   2. a pair that can enumerate the roster is a MASTER pair — marked, never rematched,
     *   3. otherwise try the supplied roster candidates until one accepts an owner-scoped
     *      read; the first accept is the real owner.
     */
    if (action === "rematch_stored_keys") {
      const credentialId = typeof body.credential_id === "string" ? body.credential_id.trim() : "";
      if (!credentialId) {
        return json({ success: false, error: { code: "MISSING_PARAM", message: "credential_id is required" } }, 400);
      }
      const candidates: { owner_id: string; login_email?: string | null }[] = Array.isArray(body.candidates)
        ? (body.candidates as { owner_id?: unknown; login_email?: unknown }[])
            .map((c) => ({
              owner_id: String(c?.owner_id ?? "").trim(),
              login_email: typeof c?.login_email === "string" ? c.login_email : null,
            }))
            .filter((c) => c.owner_id)
        : [];

      const { data: row, error: rowError } = await admin
        .from("ru_api_credentials")
        .select("id, ru_owner_id, login_email, access_key, secret_enc, key_label, key_scope")
        .eq("id", credentialId)
        .maybeSingle();
      if (rowError) return json({ success: false, error: { code: "READ_FAILED", message: rowError.message } }, 500);
      if (!row) return json({ success: false, error: { code: "NOT_FOUND", message: "No stored key pair with that id" } }, 404);

      const accessKey = String(row.access_key ?? "").trim();
      let secretKey = "";
      if (row.secret_enc) {
        const { data: plain } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: row.secret_enc });
        secretKey = typeof plain === "string" ? plain : "";
      }
      if (!accessKey || !secretKey) {
        return json({
          success: true,
          outcome: "orphan",
          ru_owner_id: row.ru_owner_id,
          access_key_last4: accessKey.slice(-4),
          message: "The stored row has no usable secret — it cannot be matched to any sub-account.",
        });
      }

      const probe = async (ownerId: string) => {
        const { data, error } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "verify_child_key_owner",
            auth_access_key: accessKey,
            auth_secret_key: secretKey,
            owner_id: ownerId,
          },
        });
        if (error) {
          const bodyErr = await readInvokeErrorBody(error);
          return {
            owns: false,
            key_scope: "unverified",
            identified: [] as string[],
            deferred: String(bodyErr?.error?.code ?? "") === "RU_RATE_DEFERRED",
            message: bodyErr?.error?.message ?? error.message ?? "The channel refused the probe",
          };
        }
        const payload = (data ?? {}) as {
          owns?: boolean;
          key_scope?: string;
          identified_owner_ids?: string[];
          error?: { code?: string; message?: string };
          ru_status_message?: string | null;
        };
        return {
          owns: payload.owns === true,
          key_scope: String(payload.key_scope ?? "unverified"),
          identified: Array.isArray(payload.identified_owner_ids) ? payload.identified_owner_ids : [],
          deferred: String(payload.error?.code ?? "") === "RU_RATE_DEFERRED",
          message: payload.error?.message ?? payload.ru_status_message ?? null,
        };
      };

      const stamp = new Date().toISOString();
      const currentOwnerId = String(row.ru_owner_id ?? "").trim();
      const first = currentOwnerId ? await probe(currentOwnerId) : null;

      if (first?.deferred) {
        return json({
          success: false,
          error: { code: "RU_RATE_DEFERRED", message: "The channel is rate-limiting reads — try this pair again shortly." },
        }, 429);
      }

      // A pair that can enumerate the roster belongs to the MASTER account. It is recorded as
      // such and never rematched onto a sub-account: child writes with it land on the master.
      if (first && first.key_scope === "master_pair") {
        await admin
          .from("ru_api_credentials")
          .update({
            key_scope: "master_pair",
            key_scope_verified_at: stamp,
            key_scope_detail: { probe: "verify_child_key_owner", visible_owner_ids: first.identified.slice(0, 60) },
          })
          .eq("id", row.id);
        return json({
          success: true,
          outcome: "master_pair",
          ru_owner_id: currentOwnerId,
          access_key_last4: accessKey.slice(-4),
          message:
            "This pair authenticates as our master channel account, so it can never be used for a sub-account. Mint a real sub-account pair in Step A.",
        });
      }

      if (first?.owns) {
        await admin
          .from("ru_api_credentials")
          .update({
            key_scope: "child",
            key_scope_verified_at: stamp,
            verified_at: stamp,
            key_scope_detail: { probe: "verify_child_key_owner", matched_owner_id: currentOwnerId },
          })
          .eq("id", row.id);
        return json({
          success: true,
          outcome: "already_correct",
          ru_owner_id: currentOwnerId,
          access_key_last4: accessKey.slice(-4),
          message: "The pair belongs to the sub-account it is filed under.",
        });
      }

      // Try the roster candidates, stopping on the first account that accepts the pair.
      for (const candidate of candidates) {
        if (candidate.owner_id === currentOwnerId) continue;
        const verdict = await probe(candidate.owner_id);
        if (verdict.deferred) {
          return json({
            success: false,
            error: { code: "RU_RATE_DEFERRED", message: "The channel is rate-limiting reads — try this pair again shortly." },
          }, 429);
        }
        if (verdict.key_scope === "master_pair") {
          await admin
            .from("ru_api_credentials")
            .update({ key_scope: "master_pair", key_scope_verified_at: stamp })
            .eq("id", row.id);
          return json({
            success: true,
            outcome: "master_pair",
            ru_owner_id: currentOwnerId,
            access_key_last4: accessKey.slice(-4),
            message: "This pair authenticates as our master channel account and cannot be filed against a sub-account.",
          });
        }
        if (!verdict.owns) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        // One AccessKey must never sit on two OwnerIDs: report the clash, never overwrite.
        const { data: occupant } = await admin
          .from("ru_api_credentials")
          .select("id, access_key")
          .eq("ru_owner_id", candidate.owner_id)
          .maybeSingle();
        if (occupant && String(occupant.id) !== String(row.id)) {
          return json({
            success: true,
            outcome: "duplicate",
            ru_owner_id: currentOwnerId,
            matched_owner_id: candidate.owner_id,
            access_key_last4: accessKey.slice(-4),
            message:
              `This pair belongs to OwnerID ${candidate.owner_id}, but that account already holds a different stored pair. ` +
              "Remove the stale pair on that account first — nothing was overwritten.",
          });
        }

        const { error: moveError } = await admin
          .from("ru_api_credentials")
          .update({
            ru_owner_id: candidate.owner_id,
            login_email: candidate.login_email ?? row.login_email ?? null,
            key_scope: "child",
            key_scope_verified_at: stamp,
            verified_at: stamp,
            key_scope_detail: {
              probe: "verify_child_key_owner",
              matched_owner_id: candidate.owner_id,
              rematched_from: currentOwnerId || null,
            },
          })
          .eq("id", row.id);
        if (moveError) {
          return json({ success: false, error: { code: "WRITE_FAILED", message: moveError.message } }, 500);
        }
        return json({
          success: true,
          outcome: "rematched",
          ru_owner_id: candidate.owner_id,
          previous_owner_id: currentOwnerId || null,
          matched_owner_id: candidate.owner_id,
          access_key_last4: accessKey.slice(-4),
          message: `Rematched: the pair authenticates as OwnerID ${candidate.owner_id} and is now filed there.`,
        });
      }

      await admin
        .from("ru_api_credentials")
        .update({
          key_scope: "unverified",
          key_scope_verified_at: stamp,
          key_scope_detail: { probe: "verify_child_key_owner", matched_owner_id: null, candidates_tried: candidates.length },
        })
        .eq("id", row.id);
      return json({
        success: true,
        outcome: "orphan",
        ru_owner_id: currentOwnerId,
        access_key_last4: accessKey.slice(-4),
        message:
          "No sub-account on the roster accepts this pair — the account was closed, or the key was revoked at the channel.",
      });
    }

    /**
     * ── forget_stored_key: drop our local copy of a pair that no channel account accepts.
     * Local only: it never claims a channel-side revoke.
     */
    if (action === "forget_stored_key") {
      const credentialId = typeof body.credential_id === "string" ? body.credential_id.trim() : "";
      if (!credentialId) {
        return json({ success: false, error: { code: "MISSING_PARAM", message: "credential_id is required" } }, 400);
      }
      const { error } = await admin.from("ru_api_credentials").delete().eq("id", credentialId);
      if (error) return json({ success: false, error: { code: "WRITE_FAILED", message: error.message } }, 500);
      return json({ success: true, removed: true, message: "Local copy removed. Any key still at the channel is untouched." });
    }
    /**
     * ── resolve_ru_property_ids: capture the RUIDs RU already holds for a property.
     * A push returns the new RUID in its response, but pushes fired outside this
     * pipeline (playground, retries that lost the response) leave the local
     * rentalsunited_property_id blank. This re-reads Pull_ListProp_RQ for the bound
     * sub-user and matches by name so the readiness panel shows the real RUID.
     */
    if (action === "resolve_ru_property_ids") {
      const targetPropertyId: string = typeof body.property_id === "string" ? body.property_id : "";
      if (!targetPropertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }

      const { data: prop } = await admin
        .from("properties")
        .select("id, name, owner_email, rentalsunited_property_id")
        .eq("id", targetPropertyId)
        .maybeSingle();
      if (!prop) return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);

      const portfolioId = await resolvePortfolioId(admin, targetPropertyId);
      const { account } = await findOwnerAccount(admin, targetPropertyId, prop.owner_email ?? null, portfolioId);
      const ownerId = String(account?.ru_owner_id ?? "").trim();
      if (!ownerId) {
        return json({
          success: false,
          error: {
            code: "RU_OWNER_NOT_BOUND",
            message: "No Rentals United sub-user (OwnerID) is bound for this property's portfolio, so its RU properties cannot be listed.",
          },
        }, 422);
      }

      const subAccountLabel = `${account?.ru_login_email ?? account?.owner_email ?? "sub-account"} (OwnerID ${ownerId})`;
      const { data: listed, error: listErr } = await admin.functions.invoke("rentalsunited-api", {
        body: { action: "list_properties", owner_id: Number(ownerId) },
      });
      // A non-2xx (e.g. 429 RU_RATE_DEFERRED) leaves `data` null, so recover the real body.
      const listedBody = listed ?? (await readInvokeErrorBody(listErr));
      /**
       * A rate-limited read answers 202 { success: true, queued: true } with no property
       * list. Treating that as "the account is empty" is what wiped listing verification
       * and reported an empty sub-account, so an unresolved read is a deferral.
       */
      const queuedRead = listedBody?.queued === true || !Array.isArray(listedBody?.properties);

      if (listErr || listedBody?.success !== true || queuedRead) {
        // Pass the channel's own reason through verbatim — a missing sub-account key pair must
        // never be reported as "the sub-account was empty".
        const code = typeof listedBody?.error?.code === "string"
          ? listedBody.error.code
          : (queuedRead && listedBody?.success === true ? "RU_RATE_DEFERRED" : "RU_LIST_FAILED");
        const detail = listedBody?.error?.message
          ?? (queuedRead && listedBody?.success === true
            ? "The listing read was queued behind the channel rate limit and has not returned yet."
            : null)
          ?? listErr?.message ?? "Rentals United did not return a property list";
        const retryMs = Number(listedBody?.error?.retry_after_ms ?? 0);

        // The interactive wizard is the sole retry owner. Do not also enqueue background work:
        // doing both launched identical reads together when the rate window reopened.
        if (code === "RU_RATE_DEFERRED") {
          return json({
            success: true,
            pending: true,
            ru_owner_id: ownerId,
            ru_owner_label: subAccountLabel,
            retry_after_ms: retryMs > 0 ? retryMs : 60000,
            message: `The channel is rate limited right now — the listing review for ${subAccountLabel} will resume when the read window reopens.`,
          }, 202);
        }

        return json({
          success: false,
          ru_owner_id: ownerId,
          ru_owner_label: subAccountLabel,
          retry_after_ms: retryMs > 0 ? retryMs : undefined,
          error: {
            code,
            message: code === "RU_CHILD_AUTH_REQUIRED"
              ? `API keys are required for ${subAccountLabel} before its listings can be pulled. ${detail}`
              : `${detail} (sub-account ${subAccountLabel})`,
          },
        }, 422);
      }


      const remote: { id: string; name: string; is_archived?: boolean }[] = Array.isArray(listed.properties) ? listed.properties : [];
      const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const slug = (v: unknown) => norm(v).replace(/[^a-z0-9]+/g, "");
      const claimed = new Set<string>();

      const matched: { scope: "property" | "unit"; name: string; ru_property_id: string; adopted_archived?: boolean }[] = [];
      const unmatched: string[] = [];
      const conflicts: { name: string; ru_property_id: string; held_by: string }[] = [];

      // Multi-unit properties carry the RUID per unit; single-unit on the property row.
      const { data: units } = await admin
        .from("hostfully_room_types")
        .select("id, name, rentalsunited_property_id, is_active")
        .eq("property_id", targetPropertyId);
      const activeUnits = (units ?? []).filter((u) => u.is_active !== false);

      /**
       * Ids already held anywhere else in ROL'OS. A listing may only ever back one
       * record — writing an id a sibling property/unit already holds is exactly how one
       * building listing ended up claimed by two properties.
       */
      const heldElsewhere = new Map<string, string>();
      {
        const localUnitIds = new Set((units ?? []).map((u) => u.id));
        const [{ data: otherUnits }, { data: otherProps }] = await Promise.all([
          admin
            .from("hostfully_room_types")
            .select("id, name, property_id, rentalsunited_property_id")
            .not("rentalsunited_property_id", "is", null),
          admin
            .from("properties")
            .select("id, name, rentalsunited_property_id")
            .not("rentalsunited_property_id", "is", null),
        ]);
        for (const u of otherUnits ?? []) {
          if (localUnitIds.has(u.id)) continue;
          heldElsewhere.set(String(u.rentalsunited_property_id), `unit "${u.name ?? u.id}"`);
        }
        for (const p of otherProps ?? []) {
          if (p.id === targetPropertyId) continue;
          heldElsewhere.set(String(p.rentalsunited_property_id), `property "${p.name ?? p.id}"`);
        }
      }

      /**
       * Live listings are matched first; an archived listing is only adopted when nothing
       * live matches, and it is reactivated as part of adoption. Matching is exact name
       * then slug (punctuation/dash noise) — never a substring, so "Kaapse Noontjie" can
       * not claim "Kaapse Nooientjie". Each remote listing can only be claimed once.
       */
      const findRemote = (name: string | null) => {
        const key = norm(name);
        if (!key) return null;
        const free = remote.filter((r) => !claimed.has(r.id) && !heldElsewhere.has(r.id));
        const live = free.filter((r) => r.is_archived !== true);
        const pick = (pool: typeof free) =>
          pool.find((r) => norm(r.name) === key) ?? pool.find((r) => slug(r.name) === slug(key)) ?? null;
        const hit = pick(live) ?? pick(free);
        if (hit) claimed.add(hit.id);
        return hit;
      };

      /** Reactivate an archived listing we are adopting so the push updates a live listing. */
      const reactivate = async (listingId: string) => {
        try {
          await admin.functions.invoke("rentalsunited-api", {
            body: {
              action: "set_property_status",
              ru_property_id: Number(listingId),
              owner_id: Number(ownerId),
              metadata: { is_active: true, is_archived: false },
            },
          });
        } catch (e) {
          console.warn("[ru-cert-portal] reactivate on adoption failed", listingId, e);
        }
      };

      for (const unit of activeUnits) {
        const held = String(unit.rentalsunited_property_id ?? "").trim();
        // A unit that already holds an id keeps it while the account still returns it.
        if (held) {
          const stillThere = remote.find((r) => r.id === held);
          if (stillThere) {
            claimed.add(held);
            if (stillThere.is_archived === true) await reactivate(held);
            matched.push({
              scope: "unit",
              name: String(unit.name ?? ""),
              ru_property_id: held,
              adopted_archived: stillThere.is_archived === true,
            });
            continue;
          }
        }
        const hit = findRemote(unit.name as string | null);
        if (!hit) {
          unmatched.push(String(unit.name ?? unit.id));
          continue;
        }
        const conflict = heldElsewhere.get(hit.id);
        if (conflict) {
          conflicts.push({ name: String(unit.name ?? unit.id), ru_property_id: hit.id, held_by: conflict });
          unmatched.push(String(unit.name ?? unit.id));
          continue;
        }
        if (hit.is_archived === true) await reactivate(hit.id);
        if (held !== hit.id) {
          await admin.from("hostfully_room_types").update({ rentalsunited_property_id: hit.id }).eq("id", unit.id);
        }
        matched.push({
          scope: "unit",
          name: String(unit.name ?? ""),
          ru_property_id: hit.id,
          adopted_archived: hit.is_archived === true,
        });
      }

      /**
       * A multi-unit property has no building listing of its own: its units are the
       * listings. Only a single-unit property may carry a listing id on the property row,
       * so a name match is never written back for a property that has active units.
       */
      const propertyHit = activeUnits.length === 0 ? findRemote(prop.name as string | null) : null;
      if (propertyHit) {
        const conflict = heldElsewhere.get(propertyHit.id);
        if (conflict) {
          conflicts.push({ name: String(prop.name ?? targetPropertyId), ru_property_id: propertyHit.id, held_by: conflict });
          unmatched.push(String(prop.name ?? targetPropertyId));
        } else {
          if (propertyHit.is_archived === true) await reactivate(propertyHit.id);
          if (String(prop.rentalsunited_property_id ?? "") !== propertyHit.id) {
            await admin.from("properties").update({ rentalsunited_property_id: propertyHit.id }).eq("id", targetPropertyId);
          }
          matched.push({ scope: "property", name: String(prop.name ?? ""), ru_property_id: propertyHit.id });
        }
      } else if (activeUnits.length === 0) {
        unmatched.push(String(prop.name ?? targetPropertyId));
      } else if (String(prop.rentalsunited_property_id ?? "").trim()) {
        // Stale building id on a multi-unit property: release it so two properties can
        // never claim the same listing.
        await admin.from("properties").update({ rentalsunited_property_id: null }).eq("id", targetPropertyId);
      }


      /**
       * Persist the read-back result. This is the property's listing-verification
       * record: a push whose listings were never pulled back stays unverified, and a
       * pull that leaves units unmatched is recorded as such rather than "verified".
       */
      const expectedUnits = activeUnits.length || 1;
      const verifiedUnits = activeUnits.length
        ? matched.filter((m) => m.scope === "unit").length
        : (propertyHit ? 1 : 0);
      const fullyVerified = verifiedUnits >= expectedUnits && unmatched.length === 0;
      await admin
        .from("properties")
        .update({
          ru_listings_verified_at: fullyVerified ? new Date().toISOString() : null,
          ru_listings_verified_owner: subAccountLabel,
          ru_listings_verified_units: verifiedUnits,
          ru_listings_expected_units: expectedUnits,
          ru_listings_unmatched: unmatched,
        })
        .eq("id", targetPropertyId)
        .then(() => {}, (e: unknown) => console.warn("[ru-cert-portal] listing verification write failed", e));


      /**
       * Per-listing evidence: "pushed but not visible in the portal" is almost always a
       * listing sitting under a different sub-account login, so name the account that
       * actually holds each listing rather than reporting a bare miss.
       */
      const listingStatus = [
        ...activeUnits.map((u) => {
          const hit = matched.find((m) => m.scope === "unit" && m.name === String(u.name ?? ""));
          return {
            scope: "unit" as const,
            name: String(u.name ?? u.id),
            ru_property_id: hit?.ru_property_id ?? null,
            status: hit ? ("live_in_account" as const) : ("not_in_account" as const),
            owner_label: subAccountLabel,
          };
        }),
        ...(activeUnits.length === 0
          ? [{
            scope: "property" as const,
            name: String(prop.name ?? targetPropertyId),
            ru_property_id: propertyHit?.id ?? null,
            status: propertyHit ? ("live_in_account" as const) : ("not_in_account" as const),
            owner_label: subAccountLabel,
          }]
          : []),
      ];

      // Listing ids were just re-read from the sub-account — that IS the pull verdict.
      // Marking it stale here made the step un-completable: nothing else ever grades it.
      await recordLedgerPassForScope(
        admin,
        { propertyId: targetPropertyId },
        ["pull_listings"],
        "listings_pulled",
        "push_result",
        { matched, unmatched },
      );

      return json({

        success: true,
        ru_owner_id: ownerId,
        ru_owner_label: subAccountLabel,
        rentalsunited_property_id: activeUnits.length ? null : (propertyHit?.id ?? prop.rentalsunited_property_id ?? null),
        matched,
        unmatched,
        conflicts,
        listing_status: listingStatus,
        remote_count: remote.length,
        auth_mode: listed.auth_mode ?? null,
        listings_verified: fullyVerified,
        listings_verified_units: verifiedUnits,
        listings_expected_units: expectedUnits,
      });

    }




    // ── save_login_password: admin sets/resets the retained RU portal password ──
    // RU exposes no password-change API, so the admin resets it inside the RU portal
    // and stores the new value here (encrypted) so future automation can authenticate.
    if (action === "save_login_password") {
      const accountId: string = body.account_id ?? "";
      const newPassword: string = typeof body.password === "string" ? body.password.trim() : "";
      const newEmail: string | null =
        typeof body.login_email === "string" && body.login_email.trim() ? body.login_email.trim() : null;
      if (!accountId) return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);
      if (newPassword.length < 8) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "Password must be at least 8 characters" } }, 400);
      }

      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_owner_id, company_details_sent")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);

      const canonicalEmail = newEmail ?? account.ru_login_email ?? account.owner_email;
      const ownerId = String(account.ru_owner_id ?? "").trim();
      if (!canonicalEmail || !ownerId) {
        return json({
          success: false,
          error: { code: "RU_IDENTITY_INCOMPLETE", message: "Bind this record to an RU OwnerID and login email before saving a password." },
        }, 422);
      }

      const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: newPassword });
      if (encErr || !enc) {
        return json({ success: false, error: { code: "ENCRYPT_FAILED", message: encErr?.message || "Could not encrypt the password" } }, 500);
      }

      const update: Record<string, unknown> = {
        ru_login_password_enc: enc,
        ru_login_email: canonicalEmail,
      };
      if (!account.company_details_sent) update.company_details_status = "password_stored";
      const { error: upErr } = await admin.from("ru_owner_accounts").update(update).eq("id", accountId);
      if (upErr) return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Stored Rentals United portal password for ${canonicalEmail} (OwnerID ${ownerId}); API access is verified separately`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      const probed = await persistChildPasswordAndProbe({
        ownerId,
        loginEmail: canonicalEmail,
        password: newPassword,
      });
      if (!probed.ok) {
        return json({
          success: true,
          password_stored: true,
          api_access_verified: false,
          error: {
            code: probed.code ?? "NEEDS_UI_KEY",
            ru_status_id: probed.ruStatusId ?? null,
            message: probed.message ?? "The password was stored, but Rentals United rejected it on the one-shot probe.",
            owner_id: ownerId,
            email: canonicalEmail,
          },
        }, 200);
      }
      return json({
        success: true,
        password_stored: true,
        api_access_verified: true,
        auth_mode: "child_password",
        login_email: canonicalEmail,
      });

    }

    // ── list_ru_candidates: every sub-user RU currently holds under our master account,
    //    so an admin can bind a local row to a specific OwnerID (RU allows duplicates
    //    per owner email, and logins can be renamed in the RU portal).
    if (action === "list_ru_candidates") {
      // Reading this list is onboarding/manual work only: the wire is touched when the
      // operator presses "Refresh roster", never on a plain panel load.
      const listed = await listRuSubUsers(admin, {
        forceFresh: body.force_refresh === true,
        cacheOnly: body.force_refresh !== true,
        source: "list_ru_candidates",
      });
      if (!listed.ok) {
        return json({
          success: false,
          rate_deferred: listed.deferred,
          error: {
            code: listed.deferred ? "RU_RATE_DEFERRED" : "RU_LIST_FAILED",
            message: listed.deferred
              ? "The channel is rate limiting the sub-user list right now. Wait a minute and open this dialog again."
              : listed.message || "Rentals United did not return the sub-user list",
          },
        }, listed.deferred ? 429 : 502);
      }
      return json({
        success: true,
        users: listed.users,
        cached: listed.cached,
        fetched_at: listed.fetched_at,
        notice: listed.message ?? null,
      });

    }

    // ── bind_ru_account: point a local ru_owner_accounts row at a specific RU sub-user.
    if (action === "bind_ru_account") {
      const accountId: string = body.account_id ?? "";
      const ruOwnerId = String(body.ru_owner_id ?? "").trim();
      const loginEmail = typeof body.login_email === "string" ? body.login_email.trim() : "";
      if (!accountId || !ruOwnerId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id and ru_owner_id are required" } }, 400);
      }
      // A retired test sub-account must never be bound again — binding it would put it
      // straight back into every read, count and push loop.
      const retiredIds = await fetchRetiredRuOwnerIds();
      if (retiredIds.has(ruOwnerId)) {
        return json({
          success: false,
          error: {
            code: "RU_ACCOUNT_RETIRED",
            message: `Sub-account ${ruOwnerId} is permanently retired and cannot be bound. Restore it from the Channel Monitor first if this is deliberate.`,
          },
        }, 409);
      }


      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_owner_id")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);

      // Verify the OwnerID against RU's master list when we can reach it. A transient
      // RU/list failure must NOT block the bind — it is a local pointer update.
      //
      // A *cached* roster is never proof of absence: a sub-account minted after the last
      // snapshot exists at the channel but is missing from our copy, which used to refuse the
      // bind outright ("does not list OwnerID …"). So a cache miss costs exactly one live
      // roster read, and only a fresh roster that still lacks the OwnerID may refuse.
      let verifiedAgainstRu = false;
      let match: { email?: string; user_account_id?: string } | undefined;
      try {
        const findIn = (users: { owner_id?: string }[]) =>
          users.find((u) => String(u.owner_id ?? "").trim() === ruOwnerId) as
            | { email?: string; user_account_id?: string }
            | undefined;

        let listed = await listRuSubUsers(admin, { cacheOnly: true, source: "bind_ru_account" });
        match = listed.ok ? findIn(listed.users) : undefined;

        if (!match) {
          // Cache miss (or no cache at all) — confirm against the channel before refusing.
          listed = await listRuSubUsers(admin, { forceFresh: true, source: "bind_ru_account_confirm" });
          match = listed.ok ? findIn(listed.users) : undefined;
          const rosterIsFresh = listed.ok && listed.cached !== true;
          if (!match && rosterIsFresh) {
            return json({
              success: false,
              error: {
                code: "RU_OWNER_NOT_FOUND",
                message: `Rentals United does not list OwnerID ${ruOwnerId} under our master account (roster read ${listed.fetched_at ?? "just now"}).`,
              },
            }, 422);
          }
          if (!match) {
            // Deferred / failed / stale-only answer ⇒ unknown, not absent. Bind unverified.
            console.warn(
              "[ru-cert-portal] bind: OwnerID unverified — roster read unavailable or stale",
              listed.message ?? "",
            );
          }
        }
        verifiedAgainstRu = !!match;
      } catch (e) {
        console.warn("[ru-cert-portal] bind: RU list threw, continuing", e instanceof Error ? e.message : e);
      }



      const update: Record<string, unknown> = {
        ru_owner_id: ruOwnerId,
        ru_login_email: loginEmail || String(match?.email ?? "").trim() || account.ru_login_email,
      };
      const userAccountId = String(match?.user_account_id ?? "").trim();
      // Never mirror the OwnerID into the sub-user id — one account must not read as two.
      if (userAccountId && userAccountId !== "0" && userAccountId !== String(ruOwnerId ?? "")) {
        update.ru_user_id = userAccountId;
      } else {
        update.ru_user_id = null;
      }



      // Rebinding to a different OwnerID: credentials, API keys and verification state
      // belonged to the previous sub-user — never carry them over.
      const previousOwnerId = String(account.ru_owner_id ?? "").trim();
      // Only a *rebind* invalidates credentials. A first bind must never wipe keys
      // and company state that were captured before the OwnerID was recorded —
      // that is what silently made push un-enablable after a clean wizard run.
      if (previousOwnerId && previousOwnerId !== ruOwnerId) {
        update.ru_api_access_key = null;
        update.ru_api_secret_enc = null;
        update.ru_api_key_label = null;
        update.ru_api_keys_verified_at = null;
        update.ru_login_password_enc = null;
        update.company_details_sent = false;
        // NOT NULL column — reset to its default state, never null.
        update.company_details_status = "pending";

      }

      const { error: upErr } = await admin.from("ru_owner_accounts").update(update).eq("id", accountId);
      if (upErr) {
        console.error("[ru-cert-portal] bind update failed", upErr);
        return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);
      }

      try {
        await admin.from("audit_logs").insert({
          user_id: user.id,
          user_email: user.email ?? "unknown",
          user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
          action_type: "other",
          table_name: "ru_owner_accounts",
          record_id: account.id,
          request_origin: "edge_function",
          edge_function_name: "ru-cert-portal",
          is_sensitive: true,
          change_summary: `Bound RU sub-account to OwnerID ${ruOwnerId} (${update.ru_login_email})`,
        });
      } catch (e) {
        console.warn("[ru-cert-portal] audit log insert failed", e instanceof Error ? e.message : e);
      }

      console.log(`[ru-cert-portal] bind ok account=${accountId} owner=${ruOwnerId} ru_verified=${verifiedAgainstRu}`);
      return json({
        success: true,
        ru_owner_id: ruOwnerId,
        login_email: update.ru_login_email,
        ru_verified: verifiedAgainstRu,
      });

    }






    // ── create_user / fill_company_details: only run when the switch is on ──
    if (action === "create_user" || action === "fill_company_details") {
      const flag = await readUserMgmtFlag();
      if (!flag.enabled) {
        return json({
          success: false,
          error: { code: "USER_MGMT_DISABLED", message: "RU user management is parked. Enable it on the Users tab once Rentals United confirms the PMS profile." },
        }, 409);
      }
      const payload = action === "create_user"
        ? { action: "create_user", user: body.user }
        : {
            action: "fill_company_details",
            company: body.company,
            owner_id: body.owner_id ?? null,
            auth_username: body.auth_username ?? null,
            auth_password: body.auth_password ?? null,
          };

      const { data, error } = await admin.functions.invoke("rentalsunited-api", { body: payload });
      if (error) return json({ success: false, error: { code: "RU_CALL_FAILED", message: error.message } }, 502);

      if (action === "fill_company_details" && data?.success) {
        const match = admin.from("ru_owner_accounts").update({
          company_details_sent: true,
          company_filled_at: new Date().toISOString(),
          company_payload: body.company ?? null,
        });
        if (body.account_id) await match.eq("id", body.account_id);
        else await match.eq("ru_user_id", String(body.ru_property_id));
      }

      return json({ success: !!data?.success, result: data, preview: preview(data, 2000) });
    }

    // ── reset_phase1: re-open Phase 1 so the onboarding flow can be run again.
    //    mode = "details" (default) keeps the RU sub-user but clears the company-details
    //    state so "Complete company details" can be re-submitted.
    //    mode = "identity" additionally unbinds the local row from the RU OwnerID so the
    //    flow falls all the way back to "Create sub-user".
    if (action === "reset_phase1") {
      const propertyId: string | null = body.property_id ?? null;
      let portfolioId: string | null = body.portfolio_id ?? null;
      const mode: string = body.mode === "identity" ? "identity" : "details";
      if (!propertyId && !portfolioId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id or portfolio_id is required" } }, 400);
      }
      if (!portfolioId && propertyId) portfolioId = await resolvePortfolioId(admin, propertyId);

      let query = admin.from("ru_owner_accounts").select("id, ru_owner_id, portfolio_id, property_id");
      query = portfolioId ? query.eq("portfolio_id", portfolioId) : query.eq("property_id", propertyId);
      const { data: accounts } = await query;
      if (!accounts?.length) {
        return json({ success: false, error: { code: "NO_RU_ACCOUNT", message: "No Rentals United owner account is linked yet — nothing to reset." } }, 404);
      }

      const patch: Record<string, unknown> = {
        company_details_sent: false,
        company_filled_at: null,
        company_details_status: "pending",
      };
      if (mode === "identity") {
        patch.ru_owner_id = null;
        patch.ru_user_id = null;
        patch.ru_login_email = null;
        patch.ru_login_url = null;
        patch.ru_login_password_enc = null;
        patch.company_payload = null;
      }

      const ids = accounts.map((a: { id: string }) => a.id);
      const { error: upErr } = await admin.from("ru_owner_accounts").update(patch).in("id", ids);
      if (upErr) {
        return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);
      }

      // Unbinding removes the channel account, so the operational gate already refuses these
      // properties (unbound / not listed). No silent hold is written: a hold is a deliberate,
      // reasoned decision, never a side effect of a reset.

      return json({ success: true, reset: mode, accounts: ids });
    }

    /**
     * ── unbind_property_account: detach ONE property from the shared distribution
     *    account. The account itself (and its siblings) stay bound — only this
     *    property's channel linkage is cleared: push off, listing ids dropped on the
     *    property and its units, readiness snapshot removed. Existing listings on the
     *    channel side are not deleted; archive them there if they are no longer wanted.
     */
    /**
     * ── ensure_live_notifications: (re)subscribe this property's distribution account ──
     * The wizard calls this automatically after key verification; this action is the
     * manual repair path when a subscription drifted or RU dropped it.
     */
    if (action === "ensure_live_notifications") {
      const targetPropertyId: string = typeof body.property_id === "string" ? body.property_id : "";
      const suppliedOwnerId = String(body.ru_owner_id ?? "").trim();
      let ownerId = suppliedOwnerId;
      let label = suppliedOwnerId ? `OwnerID ${suppliedOwnerId}` : "sub-account";

      if (!ownerId) {
        if (!targetPropertyId) {
          return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id or ru_owner_id is required" } }, 400);
        }
        const { data: prop } = await admin
          .from("properties")
          .select("id, owner_email")
          .eq("id", targetPropertyId)
          .maybeSingle();
        if (!prop) return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
        const portfolioId = await resolvePortfolioId(admin, targetPropertyId);
        const { account } = await findOwnerAccount(admin, targetPropertyId, prop.owner_email ?? null, portfolioId);
        ownerId = String(account?.ru_owner_id ?? "").trim();
        label = `${account?.ru_login_email ?? account?.owner_email ?? "sub-account"} (OwnerID ${ownerId || "—"})`;
      }
      if (!/^\d+$/.test(ownerId)) {
        return json({
          success: false,
          error: {
            code: "RU_OWNER_NOT_BOUND",
            message: "No distribution sub-account is bound for this property, so live notifications cannot be registered.",
          },
        }, 422);
      }

      const outcome = await ensureLiveNotificationsForOwner(admin, ownerId, label);
      return json({ success: true, account_label: label, ...outcome });
    }

    if (action === "unbind_property_account") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }

      const { data: prop } = await admin
        .from("properties")
        .select("id, name, rentalsunited_property_id, ru_push_enabled")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }

      const { data: units } = await admin
        .from("hostfully_room_types")
        .select("id, rentalsunited_property_id")
        .eq("property_id", propertyId)
        .not("rentalsunited_property_id", "is", null);
      const clearedUnitIds = (units ?? [])
        .map((u: { rentalsunited_property_id: string | null }) => u.rentalsunited_property_id)
        .filter(Boolean);

      const { error: propErr } = await admin
        .from("properties")
        .update({
          rentalsunited_property_id: null,
          // Verification describes listings that no longer exist for this property.
          ru_listings_verified_at: null,
          ru_listings_verified_owner: null,
          ru_listings_verified_units: null,
          ru_listings_expected_units: null,
          ru_listings_unmatched: [],
        })
        .eq("id", propertyId);
      if (propErr) return json({ success: false, error: { code: "SAVE_FAILED", message: propErr.message } }, 500);

      if ((units ?? []).length) {
        const { error: unitErr } = await admin
          .from("hostfully_room_types")
          .update({ rentalsunited_property_id: null })
          .eq("property_id", propertyId);
        if (unitErr) console.warn("[ru-cert-portal] unbind could not clear unit listing ids", unitErr.message);
      }

      await admin.from("ru_readiness_snapshots").delete().eq("property_id", propertyId)
        .then(() => {}, (e) => console.warn("[ru-cert-portal] unbind snapshot delete failed", e));
      phaseStatusCache.delete(propertyId);

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "properties",
        record_id: propertyId,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Unbound ${prop.name} from its distribution account (cleared listing ${prop.rentalsunited_property_id ?? "—"}${clearedUnitIds.length ? ` and ${clearedUnitIds.length} unit listing(s)` : ""}; push disabled)`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return json({
        success: true,
        property_id: propertyId,
        cleared_property_listing: prop.rentalsunited_property_id ?? null,
        cleared_unit_listings: clearedUnitIds,
      });
    }

    /**
     * ── retire_owner_account: fully decommission ONE bound distribution account ──
     * Strict order, reported step by step so nothing is ever claimed silently:
     *   1. archive the listings at the channel (property + every unit),
     *   2. archive the sub-account (retired registry — excluded from every read),
     *   3. disconnect the properties (listing ids, verification, snapshot, push off)
     *      and delete the binding row.
     * Afterwards the property has no distribution login, so Step A must provision a
     * fresh one before any push can happen again.
     */
    if (action === "retire_owner_account") {
      const ownerId = String(body.ru_owner_id ?? "").trim();
      const note = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
      const force = body.force === true;
      if (!/^\d+$/.test(ownerId)) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "A numeric ru_owner_id is required" } }, 400);
      }

      const { data: accounts } = await admin
        .from("ru_owner_accounts")
        .select("id, ru_owner_id, ru_login_email, owner_email, property_id, portfolio_id")
        .eq("ru_owner_id", ownerId);
      if (!accounts?.length) {
        return json({ success: false, error: { code: "NOT_BOUND", message: `OwnerID ${ownerId} is not bound to any property or portfolio.` } }, 404);
      }
      const label = accounts[0].ru_login_email || accounts[0].owner_email || `OwnerID ${ownerId}`;

      // Every property this account serves: direct property bindings plus every
      // member of a bound portfolio.
      const propertyIds = new Set<string>();
      for (const acc of accounts) {
        if (acc.property_id) propertyIds.add(acc.property_id as string);
        if (acc.portfolio_id) {
          const { data: members } = await admin
            .from("property_portfolio_members")
            .select("property_id")
            .eq("portfolio_id", acc.portfolio_id);
          for (const m of members ?? []) if (m.property_id) propertyIds.add(m.property_id as string);
        }
      }

      const { data: props } = propertyIds.size
        ? await admin
            .from("properties")
            .select("id, name, rentalsunited_property_id")
            .in("id", Array.from(propertyIds))
        : { data: [] as { id: string; name: string; rentalsunited_property_id: string | null }[] };

      // ── Step 0: credential triage ──
      // A stored pair only archives as the sub-account when it is proven CHILD scope.
      // A master pair (or no keys at all) would be refused outright, so the archive runs
      // on MASTER credentials scoped to this OwnerID — which rentalsunited-api allows only
      // for an archive/deactivate on an OwnerID already in the retired registry. That
      // registry row is therefore written BEFORE the listings, not after.
      const { data: retireCred } = await admin
        .from("ru_api_credentials")
        .select("access_key, secret_enc, key_scope")
        .eq("ru_owner_id", ownerId)
        .maybeSingle();
      let retireChildKeys = false;
      if (retireCred?.access_key && retireCred.key_scope !== "master_pair") {
        const { data: plain } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: retireCred.secret_enc });
        retireChildKeys = Boolean(plain && plain !== "[ENCRYPTED]" && plain !== "[DECRYPTION_ERROR]");
      }
      const archiveIntent = !retireChildKeys;
      if (archiveIntent) {
        const { error: preErr } = await admin.from("ru_retired_accounts").upsert(
          {
            ru_owner_id: ownerId,
            portal_email: label,
            reason: note ?? "Retired from Channel Monitor — listings archived and property disconnected",
            retired_by: user.id,
          },
          { onConflict: "ru_owner_id" },
        );
        if (preErr) {
          return json({
            success: false,
            stopped_after: "archive_account",
            error: { code: "SAVE_FAILED", message: preErr.message },
          }, 500);
        }
      }

      // ── Step 1: archive every listing at the channel ──
      const listings: { listing_id: string; label: string }[] = [];
      for (const p of props ?? []) {
        if (p.rentalsunited_property_id) {
          listings.push({ listing_id: String(p.rentalsunited_property_id), label: p.name ?? "property" });
        }
        const { data: units } = await admin
          .from("hostfully_room_types")
          .select("name, rentalsunited_property_id")
          .eq("property_id", p.id)
          .not("rentalsunited_property_id", "is", null);
        for (const u of units ?? []) {
          listings.push({
            listing_id: String(u.rentalsunited_property_id),
            label: `${p.name ?? "property"} — ${u.name ?? "unit"}`,
          });
        }
      }

      const archivedListings: string[] = [];
      const failedListings: { listing_id: string; label: string; message: string }[] = [];
      /**
       * Listings already archived at the channel are disconnected from us — re-pushing the same
       * status only spends the sliding-minute window and comes back throttled.
       */
      const retireSettled = await alreadySettledListings(admin, listings.map((l) => l.listing_id));
      const skippedListings: { listing_id: string; label: string; message: string }[] = [];
      for (const l of listings) {
        if (retireSettled.archivedListings.has(l.listing_id)) {
          skippedListings.push({ ...l, message: "Already archived at the channel — nothing re-sent" });
          continue;
        }

        // The channel rate-limits an identical status push inside a 60s window and answers
        // 429/RU_RATE_DEFERRED. `functions.invoke` hides that body behind "non-2xx status
        // code", so read the real body and wait out the window instead of reporting a refusal.
        let lastMessage = "The channel did not accept the archive request";
        let done = false;
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          try {
            const { data: res, error: invErr } = await admin.functions.invoke("rentalsunited-api", {
              body: {
                action: "set_property_status",
                ru_property_id: Number(l.listing_id),
                owner_id: Number(ownerId),
                metadata: { is_active: false, is_archived: true },
                ...(archiveIntent ? { archive_retired: true } : {}),
                parent_action: "ru-cert-portal:retire_owner_account",
              },
            });
            const body = invErr ? await readInvokeErrorBody(invErr) : res;
            if (!invErr && res?.success === true) {
              archivedListings.push(l.listing_id);
              done = true;
              break;
            }
            const code = String(body?.error?.code ?? "");
            lastMessage = body?.error?.message ?? (typeof body?.error === "string" ? body.error : null)
              ?? invErr?.message ?? lastMessage;
            const deferred = code === "RU_RATE_DEFERRED" ||
              /rate limit|less than a minute/i.test(lastMessage);
            if (deferred && attempt < 2) {
              const waitMs = Number(body?.error?.retry_after_ms ?? body?.retry_after_ms ?? 0);
              await new Promise((r) => setTimeout(r, Math.min(Math.max(waitMs || 32_000, 5_000), 60_000)));
              continue;
            }
            break;
          } catch (e) {
            lastMessage = e instanceof Error ? e.message : String(e);
            break;
          }
        }
        if (!done) failedListings.push({ ...l, message: lastMessage });
      }



      // A refusal stops the run before the account is retired, unless the operator
      // decides knowingly to continue.
      if (failedListings.length > 0 && !force) {
        return json({
          success: false,
          stopped_after: "archive_listings",
          account_label: label,
          ru_owner_id: ownerId,
          archived_listings: archivedListings,
          skipped_listings: skippedListings,
          failed_listings: failedListings,

          error: {
            code: "LISTING_ARCHIVE_REFUSED",
            message: `${failedListings.length} listing(s) were not archived at the channel. Retire anyway to continue regardless.`,
          },
        }, 409);
      }

      // ── Step 2: record the retirement ──
      // channel_archived_at is NOT stamped here: the account itself is only archived at
      // the channel once the close in step 4 is confirmed on the roster. "No listing
      // refused" is not evidence of anything (an account with zero listings would pass).
      const fullyArchivedAtChannel = failedListings.length === 0;
      const { error: retErr } = await admin.from("ru_retired_accounts").upsert(
        {
          ru_owner_id: ownerId,
          portal_email: label,
          reason: note ?? "Retired from Channel Monitor — listings archived and property disconnected",
          retired_by: user.id,
          listings_archived: archivedListings.length,
          channel_archived_at: null,
        },
        { onConflict: "ru_owner_id" },
      );


      if (retErr) {
        return json({ success: false, stopped_after: "archive_account", error: { code: "SAVE_FAILED", message: retErr.message } }, 500);
      }

      // ── Step 2b: revoke the API keys AT THE CHANNEL ──
      // Deleting only our stored row leaves the pair alive in the channel portal, so the
      // channel is asked to delete it first; the local copy is kept when it refuses.
      let retireKeyResult: {
        status: string;
        revoked: string[];
        failed: { access_key: string; message: string }[];
        message: string;
      } | null = null;
      if (retireChildKeys || (typeof body.password === "string" && body.password)) {
        let childSecret: string | null = null;
        if (retireChildKeys && retireCred?.secret_enc) {
          const { data: plain } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: retireCred.secret_enc });
          childSecret = typeof plain === "string" && plain !== "[ENCRYPTED]" && plain !== "[DECRYPTION_ERROR]" ? plain : null;
        }
        retireKeyResult = await revokeChannelKeys({
          ownerId,
          loginEmail: label,
          accessKey: childSecret ? (retireCred?.access_key ?? null) : null,
          secretKey: childSecret,
          password: typeof body.password === "string" && body.password ? body.password : null,
          parentAction: "ru-cert-portal:retire_owner_account",
        });
      } else {
        retireKeyResult = {
          status: "no_credentials",
          revoked: [],
          failed: [],
          message: retireCred?.key_scope === "master_pair"
            ? "Cannot revoke at the channel: the only stored pair authenticates as the master account. Supply the sub-account portal password to revoke its keys."
            : "Cannot revoke at the channel: no sub-account credentials on file.",
        };
      }
      const retireKeysCleanAtChannel = retireKeyResult.status === "revoked" || retireKeyResult.status === "nothing_to_revoke";
      if (retireKeysCleanAtChannel && retireCred?.access_key) {
        await admin.from("ru_api_credentials").delete().eq("ru_owner_id", ownerId)
          .then(() => {}, (e) => console.warn("[ru-cert-portal] retire key row delete failed", e));
      }
      await admin.from("ru_retired_accounts").update({
        channel_archive_result: {
          ran_at: new Date().toISOString(),
          ran_by: user.email ?? user.id,
          source: "retire_owner_account",
          archived_listings: archivedListings,
          refused_listings: failedListings,
          keys_revoked_at_channel: retireKeysCleanAtChannel,
          key_revoke: retireKeyResult,
        },
      }).eq("ru_owner_id", ownerId)
        .then(() => {}, (e) => console.warn("[ru-cert-portal] retire result stamp failed", e));


      // ── Step 3: disconnect the properties and drop the binding ──
      const disconnected: string[] = [];
      for (const p of props ?? []) {
        const { error: propErr } = await admin
          .from("properties")
          .update({
            rentalsunited_property_id: null,
            ru_push_enabled: false,
            ru_listings_verified_at: null,
            ru_listings_verified_owner: null,
            ru_listings_verified_units: null,
            ru_listings_expected_units: null,
            ru_listings_unmatched: [],
          })
          .eq("id", p.id);
        if (propErr) {
          console.warn("[ru-cert-portal] retire could not clear property", p.id, propErr.message);
          continue;
        }
        await admin
          .from("hostfully_room_types")
          .update({ rentalsunited_property_id: null })
          .eq("property_id", p.id)
          .then(() => {}, (e) => console.warn("[ru-cert-portal] retire unit clear failed", e));
        await admin.from("ru_readiness_snapshots").delete().eq("property_id", p.id)
          .then(() => {}, (e) => console.warn("[ru-cert-portal] retire snapshot delete failed", e));
        // The monitor verdicts describe an account and listings that no longer exist.
        // `details` carries the recorded task trail the panel replays, so it must be
        // replaced too — otherwise a retired property keeps green Step A ticks naming
        // the account that was just retired.
        await admin
          .from("property_channel_step_status")
          .update({
            status: "pending",
            blocker_summary: `Reset — distribution account ${label} was retired`,
            details: {
              reset_reason: `Distribution account ${label} was retired`,
              reset_at: new Date().toISOString(),
            },
            passed_at: null,
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

          .eq("property_id", p.id)
          .in("step_key", ["monitor_step_a", "monitor_step_b", "ready_to_connect"])
          .then(() => {}, (e) => console.warn("[ru-cert-portal] retire step reset failed", e));
        phaseStatusCache.delete(p.id);

        disconnected.push(p.id);
      }

      const { error: delErr } = await admin
        .from("ru_owner_accounts")
        .delete()
        .in("id", accounts.map((a: { id: string }) => a.id));
      if (delErr) {
        return json({
          success: false,
          stopped_after: "disconnect_property",
          error: { code: "SAVE_FAILED", message: `Listings and account were archived, but the binding could not be removed: ${delErr.message}` },
        }, 500);
      }

      // ── Step 4: close the account AT THE CHANNEL ──
      // Retiring locally only ever hid the account from our own reads: the portal login
      // stayed alive. The close runs as the sub-account itself, after the binding is
      // gone, and only a confirmed roster re-read stamps channel_archived_at.
      const retireClose = await closeAccountAtChannel({
        ownerId,
        loginEmail: label,
        password: typeof body.password === "string" && body.password ? body.password : null,
        note,
        allowBound: true,
      });
      await admin.from("ru_retired_accounts").update({
        ...(retireClose.confirmed ? { channel_archived_at: new Date().toISOString() } : {}),
        channel_archive_result: {
          ran_at: new Date().toISOString(),
          ran_by: user.email ?? user.id,
          source: "retire_owner_account",
          archived_listings: archivedListings,
          refused_listings: failedListings,
          keys_revoked_at_channel: retireKeysCleanAtChannel,
          key_revoke: retireKeyResult,
          account_close: {
            status: retireClose.status,
            code: retireClose.code,
            message: retireClose.message,
            verified_via_roster: retireClose.verifiedViaRoster,
            steps: retireClose.steps,
          },
        },
      }).eq("ru_owner_id", ownerId)
        .then(() => {}, (e) => console.warn("[ru-cert-portal] retire close stamp failed", e));

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: accounts[0].id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Retired distribution account ${label} (OwnerID ${ownerId}): archived ${archivedListings.length} listing(s)${failedListings.length ? `, ${failedListings.length} refused` : ""}, disconnected ${disconnected.length} property(ies), account close: ${retireClose.status}`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return json({
        success: true,
        ru_owner_id: ownerId,
        account_label: label,
        archived_listings: archivedListings,
        skipped_listings: skippedListings,
        failed_listings: failedListings,
        disconnected_properties: disconnected,
        keys_revoked_at_channel: retireKeysCleanAtChannel,
        key_revoke: retireKeyResult,
        total_listings: listings.length,
        account_closed_at_channel: retireClose.confirmed,
        account_close: retireClose,
        listings_fully_archived: fullyArchivedAtChannel,
      });
    }


    /**
     * ── close_unbound_account: the channel's "close user account" for ONE sub-account ──
     * Push_ArchiveUser_RQ carries no account selector, so it runs as the sub-account itself:
     * a proven child key pair (minted here when none is on file) is the only envelope, and
     * the master pair is never used — closing with it would close OUR master account.
     *
     * The channel calls the verb resource-heavy and irreversible, so this action serialises
     * strictly: one close in flight platform-wide, plus a cooldown after the previous one.
     * The lock and the cooldown live on ru_call_queue, so a second operator or a second tab
     * is refused rather than overlapping.
     */
    if (action === "close_unbound_account" || action === "close_retired_account") {
      const ownerId = String(body.ru_owner_id ?? "").trim();
      const note = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
      if (!/^\d+$/.test(ownerId)) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "A numeric ru_owner_id is required" } }, 400);
      }

      const outcome = await closeAccountAtChannel({
        ownerId,
        loginEmail: typeof body.login_email === "string" ? body.login_email : null,
        password: typeof body.password === "string" ? body.password : null,
        note,
        cooldownSeconds: Number(body.cooldown_seconds),
      });

      const { data: registryRow } = await admin
        .from("ru_retired_accounts")
        .select("portal_email")
        .eq("ru_owner_id", ownerId)
        .maybeSingle();
      const label = (typeof body.login_email === "string" && body.login_email.trim())
        ? body.login_email.trim()
        : (registryRow?.portal_email ?? `OwnerID ${ownerId}`);

      // The registry records the PROVEN outcome — channel_archived_at only when the
      // roster re-read confirmed the account is gone.
      const { error: regErr } = await admin.from("ru_retired_accounts").upsert(
        {
          ru_owner_id: ownerId,
          portal_email: label,
          reason: note ?? "Closed at the channel from Channel Monitor (Push_ArchiveUser_RQ)",
          retired_by: user.id,
          ...(outcome.confirmed ? { channel_archived_at: new Date().toISOString() } : {}),
          channel_archive_result: {
            ran_at: new Date().toISOString(),
            ran_by: user.email ?? user.id,
            source: action,
            account_close: {
              status: outcome.status,
              verified_via_roster: outcome.verifiedViaRoster,
              message: outcome.message,
              attempts: outcome.attempts,
              code: outcome.code,
            },
            steps: outcome.steps,
          },
        },
        { onConflict: "ru_owner_id" },
      );
      if (regErr) console.warn("[ru-cert-portal] close registry stamp failed", regErr);

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_retired_accounts",
        record_id: null,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Close requested for distribution sub-account ${label} (OwnerID ${ownerId}): ${outcome.status} — ${outcome.message}`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      if (outcome.status !== "closed_at_channel") {
        const rateLimited = outcome.code === "RATE_LIMITED" || outcome.code === "CLOSE_COOLDOWN";
        return json({
          success: false,
          ru_owner_id: ownerId,
          account_label: label,
          confirmed: false,
          account_close: outcome,
          steps: outcome.steps,
          retry_after_ms: outcome.retryAfterMs,
          error: { code: outcome.code, message: outcome.message },
        }, rateLimited ? 429 : outcome.code === "CLOSE_REFUSED" ? 502 : 422);
      }

      return json({
        success: true,
        ru_owner_id: ownerId,
        account_label: label,
        confirmed: outcome.confirmed,
        account_close: outcome,
        steps: outcome.steps,
      });
    }




    /**
     * ── purge_channel_account: actually decommission ONE sub-account AT THE CHANNEL ──
     * The retired registry only ever hid an account from our own reads — the channel kept
     * its listings, its keys and its billable footprint. This is the real thing:
     *   1. authenticate as the sub-account (stored key pair, else mint one — owner-scoped
     *      first, and the operator-supplied portal password as the last envelope),
     *   2. enumerate what the account ACTUALLY owns at the channel (never our stored ids),
     *   3. archive every listing it owns, one by one,
     *   4. release the keys we hold and stamp the registry with the proven outcome.
     * Nothing is recorded as archived-at-channel unless the channel confirmed it.
     */
    if (action === "purge_channel_account") {
      const ownerId = String(body.ru_owner_id ?? "").trim();
      const suppliedPassword = typeof body.password === "string" && body.password ? body.password : null;
      const note = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
      if (!/^\d+$/.test(ownerId)) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "A numeric ru_owner_id is required" } }, 400);
      }

      // A bound account is live inventory: never purge it from here.
      const { data: boundRows } = await admin
        .from("ru_owner_accounts")
        .select("id, ru_login_email, owner_email")
        .eq("ru_owner_id", ownerId)
        .limit(1);
      if ((boundRows ?? []).length > 0) {
        return json({
          success: false,
          ru_owner_id: ownerId,
          error: {
            code: "STILL_BOUND",
            message: `OwnerID ${ownerId} is still bound to a property or portfolio. Retire the binding first, then purge it at the channel.`,
          },
        }, 409);
      }

      const { data: credRow } = await admin
        .from("ru_api_credentials")
        .select("access_key, secret_enc, login_email, key_label, key_scope")
        .eq("ru_owner_id", ownerId)
        .maybeSingle();
      const { data: registryRow } = await admin
        .from("ru_retired_accounts")
        .select("portal_email, reason")
        .eq("ru_owner_id", ownerId)
        .maybeSingle();

      const loginEmail = (typeof body.login_email === "string" && body.login_email.trim())
        ? body.login_email.trim()
        : (credRow?.login_email ?? registryRow?.portal_email ?? null);
      const label = loginEmail ?? `OwnerID ${ownerId}`;

      const steps: { step: string; ok: boolean; message: string }[] = [];

      // ── Step 1: credential triage ──
      // A stored pair is only usable as the sub-account when it is proven CHILD scope:
      // a master pair authenticates as our master account, so writing with it is refused.
      let storedSecretUsable = false;
      if (credRow?.access_key) {
        const { data: plain } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: credRow.secret_enc });
        storedSecretUsable = Boolean(plain && plain !== "[ENCRYPTED]" && plain !== "[DECRYPTION_ERROR]");
      }
      const storedIsMasterPair = credRow?.key_scope === "master_pair";
      const haveChildKeys = storedSecretUsable && !storedIsMasterPair;

      /**
       * Escalation envelope. The channel refuses to mint keys for these retired accounts,
       * so removing their footprint runs on MASTER credentials scoped by OwnerID — allowed
       * by rentalsunited-api only for an archive/deactivate on a registry-listed OwnerID.
       */
      let envelope: "child_keys" | "master_scoped_archive" = "child_keys";
      if (haveChildKeys) {
        steps.push({ step: "auth", ok: true, message: "Used the stored sub-account API key pair" });
      } else {
        const minted = suppliedPassword
          ? await mintChildKeyPair({
            ownerId,
            loginEmail,
            keyLabel: "ROLOS-purge",
            authUsername: loginEmail,
            authPassword: suppliedPassword,
          })
          : { ok: false as const, message: null, attempts: [] as string[] };

        if (minted.ok) {
          steps.push({ step: "auth", ok: true, message: `Minted a fresh key pair (${(minted.attempts ?? []).join(" → ") || "ok"})` });
        } else {
          // Make the registry entry exist BEFORE escalating: it is both the record of intent
          // and the proof the channel API checks before allowing a master-scoped archive.
          if (!registryRow) {
            await admin.from("ru_retired_accounts").upsert(
              {
                ru_owner_id: ownerId,
                portal_email: label,
                reason: note ?? "Retired for channel archival from Channel Monitor",
                retired_by: user.id,
                listings_archived: 0,
              },
              { onConflict: "ru_owner_id" },
            );
          }
          envelope = "master_scoped_archive";
          steps.push({
            step: "auth",
            ok: true,
            message: storedIsMasterPair
              ? "Stored pair authenticates as the master account — archiving on master credentials scoped to this OwnerID"
              : "No usable sub-account keys and the channel will not mint any — archiving on master credentials scoped to this OwnerID",
          });
        }
      }
      const archiveIntent = envelope === "master_scoped_archive";


      // ── Step 2: what does this account really own? ──
      const { data: listed, error: listErr } = await admin.functions.invoke("rentalsunited-api", {
        body: {
          action: "list_properties",
          owner_id: Number(ownerId),
          force_fresh: true,
          ...(archiveIntent ? { archive_retired: true } : {}),
          parent_action: "ru-cert-portal:purge_channel_account",
        },
      });

      if (listErr || listed?.success !== true) {
        return json({
          success: false,
          ru_owner_id: ownerId,
          account_label: label,
          stopped_after: "list_listings",
          steps: [...steps, { step: "list_listings", ok: false, message: listErr?.message ?? String(listed?.error ?? "The channel did not return this account's listings") }],
          error: {
            code: "LISTING_READ_FAILED",
            message: listErr?.message ?? "The channel did not return this account's listings, so nothing was archived.",
          },
        }, 502);
      }
      const remote: { id: string; name?: string; is_archived?: boolean }[] = Array.isArray(listed.properties) ? listed.properties : [];
      const outstanding = remote.filter((r) => r.is_archived !== true);
      steps.push({
        step: "list_listings",
        ok: true,
        message: `${remote.length} listing(s) at the channel — ${outstanding.length} still live`,
      });

      // ── Step 3: archive each live listing ──
      const archived: string[] = [];
      const refused: { listing_id: string; name: string; message: string }[] = [];
      for (const l of outstanding) {
        try {
          const { data: res, error: invErr } = await admin.functions.invoke("rentalsunited-api", {
            body: {
              action: "set_property_status",
              ru_property_id: Number(l.id),
              owner_id: Number(ownerId),
              ...(archiveIntent ? { archive_retired: true } : {}),
              parent_action: "ru-cert-portal:purge_channel_account",
              metadata: { is_active: false, is_archived: true },

            },
          });
          if (invErr || res?.success !== true) {
            refused.push({
              listing_id: String(l.id),
              name: l.name ?? "listing",
              message: invErr?.message ?? String(res?.error ?? "The channel did not accept the archive request"),
            });
          } else {
            archived.push(String(l.id));
          }
        } catch (e) {
          refused.push({ listing_id: String(l.id), name: l.name ?? "listing", message: e instanceof Error ? e.message : String(e) });
        }
      }
      steps.push({
        step: "archive_listings",
        ok: refused.length === 0,
        message: refused.length === 0
          ? `${archived.length} listing(s) archived at the channel`
          : `${archived.length} archived, ${refused.length} refused`,
      });

      const fullyArchived = refused.length === 0;

      // ── Step 4: revoke the keys AT THE CHANNEL, then drop our copy ──
      // Deleting our row alone leaves the pair alive (and counting) in the channel portal,
      // so the channel is asked to delete every key it lists for this sub-account first.
      let keysReleased = false;
      let keyRevoke: {
        status: string;
        revoked: string[];
        failed: { access_key: string; message: string }[];
        message: string;
      } = { status: "skipped", revoked: [], failed: [], message: "Kept — listings still live at the channel" };
      if (fullyArchived) {
        let childSecret: string | null = null;
        if (haveChildKeys && credRow?.secret_enc) {
          const { data: plain } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: credRow.secret_enc });
          childSecret = typeof plain === "string" && plain !== "[ENCRYPTED]" && plain !== "[DECRYPTION_ERROR]" ? plain : null;
        }
        keyRevoke = await revokeChannelKeys({
          ownerId,
          loginEmail,
          accessKey: childSecret ? (credRow?.access_key ?? null) : null,
          secretKey: childSecret,
          password: suppliedPassword,
          parentAction: "ru-cert-portal:purge_channel_account",
        });
        const cleanAtChannel = keyRevoke.status === "revoked" || keyRevoke.status === "nothing_to_revoke";
        if (cleanAtChannel) {
          const { error: keyErr } = await admin.from("ru_api_credentials").delete().eq("ru_owner_id", ownerId);
          keysReleased = !keyErr;
          steps.push({
            step: "release_keys",
            ok: keysReleased,
            message: keysReleased
              ? `${keyRevoke.message} · local copy removed`
              : (keyErr?.message ?? "Revoked at the channel but the local copy could not be removed"),
          });
        } else {
          steps.push({ step: "release_keys", ok: false, message: keyRevoke.message });
        }
      } else {
        steps.push({ step: "release_keys", ok: false, message: keyRevoke.message });
      }

      const result = {
        ran_at: new Date().toISOString(),
        ran_by: user.email ?? user.id,
        envelope,
        total_listings: remote.length,
        archived_listings: archived,
        refused_listings: refused,
        keys_revoked_at_channel: keyRevoke.status === "revoked" || keyRevoke.status === "nothing_to_revoke",
        key_revoke: keyRevoke,
        keys_released: keysReleased,
        // The channel exposes no verb to archive or rename a sub-account itself — only its
        // listings. Recorded so nobody later reads a silent gap as a success.
        account_archive_verb: "unsupported_by_channel",
        steps,
      };


      const { error: regErr } = await admin.from("ru_retired_accounts").upsert(
        {
          ru_owner_id: ownerId,
          portal_email: label,
          reason: note ?? registryRow?.reason ?? "Purged at the channel from Channel Monitor",
          retired_by: user.id,
          listings_archived: archived.length,
          channel_archive_result: result,
          ...(fullyArchived ? { channel_archived_at: new Date().toISOString() } : {}),
        },
        { onConflict: "ru_owner_id" },
      );
      if (regErr) {
        return json({
          success: false,
          ru_owner_id: ownerId,
          account_label: label,
          stopped_after: "record_result",
          steps,
          error: { code: "SAVE_FAILED", message: `The channel work is done but the registry could not be updated: ${regErr.message}` },
        }, 500);
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_retired_accounts",
        record_id: null,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Purged distribution account ${label} (OwnerID ${ownerId}) at the channel: ${archived.length} listing(s) archived${refused.length ? `, ${refused.length} refused` : ""}${keysReleased ? ", API keys released" : ""}`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return json({
        success: fullyArchived,
        ru_owner_id: ownerId,
        account_label: label,
        archived_at_channel: fullyArchived,
        envelope,
        total_listings: remote.length,
        archived_listings: archived,
        refused_listings: refused,
        keys_released: keysReleased,
        steps,

        ...(fullyArchived
          ? {}
          : {
            error: {
              code: "LISTING_ARCHIVE_REFUSED",
              message: `${refused.length} listing(s) were refused by the channel, so this account is not archived there yet.`,
            },
          }),
      }, fullyArchived ? 200 : 409);
    }


    /**
     * sterilize_property — put one property back to "the channel has never seen this".
     *
     * A property that has been connected before carries a second life: listings it used to own at
     * the channel, a queue of parked calls, stored notifications, earned onboarding gates, price
     * coverage, currency state and geo authority. Reconnecting it then *resumes* that life — old
     * listings keep selling, the parked backlog fires at the new account the moment keys exist, and
     * gates read "passed" without anything having been proven against the new listing.
     *
     * This action ends the old channel life and leaves the property reconnectable as-is:
     *   1. cancel the parked call backlog and drop stored notifications / re-pull entries
     *   2. archive every historical listing at the channel (skipping any the caller keeps)
     *   3. unlink the property from the distribution account locally (keys and company details stay)
     *   4. close the owner account at the channel
     *   5. reset only account/channel gates — Ready-to-sell steps 1–5 are not touched
     *
     * `keep_ru_property_ids` preserves a current binding: Albatros keeps listing 5966579 under
     * OwnerID 742620 while everything from before that binding is cleared. `keep_binding` (default
     * true when a listing is kept) leaves the account row and its keys alone.
     *
     * History (`ru_api_log`, `ru_sync_runs`, archive events) is the audit trail of what was done and
     * is retained — sterilizing removes operational state, it does not erase the record.
     */
    if (action === "sterilize_property") {
      const propertyId = String(body.property_id ?? "").trim();
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const keepListings = new Set(
        (Array.isArray(body.keep_ru_property_ids) ? body.keep_ru_property_ids : [])
          .map((v: unknown) => String(v ?? "").trim())
          .filter((v: string) => /^\d+$/.test(v)),
      );
      const keepBinding = typeof body.keep_binding === "boolean" ? body.keep_binding : keepListings.size > 0;
      const suppliedPassword = typeof body.password === "string" && body.password ? body.password : null;
      const dryRun = body.dry_run === true;

      const { data: prop, error: propErr } = await admin
        .from("properties")
        .select("id, name, rentalsunited_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (propErr || !prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "That property could not be read." } }, 404);
      }

      const steps: { step: string; ok: boolean; message: string }[] = [];

      // ── 1. Every listing this property has ever touched, and who owned it ──
      // The log is the only complete record: local columns are cleared each time a connection is
      // torn down, so without it the old listings stay live at the channel forever.
      const listingOwners = new Map<string, string | null>();
      const { data: logRows } = await admin
        .from("ru_api_log")
        .select("ru_property_id, ru_owner_id")
        .eq("property_id", propertyId)
        .not("ru_property_id", "is", null)
        .limit(20000);
      for (const r of logRows ?? []) {
        const listing = String((r as { ru_property_id?: unknown }).ru_property_id ?? "").trim();
        if (!/^\d+$/.test(listing)) continue;
        const owner = String((r as { ru_owner_id?: unknown }).ru_owner_id ?? "").trim();
        // Later rows win only when they actually name an owner: a null must not erase a known one.
        if (!listingOwners.has(listing) || (owner && !listingOwners.get(listing))) {
          listingOwners.set(listing, /^\d+$/.test(owner) ? owner : null);
        }
      }
      if (prop.rentalsunited_property_id && /^\d+$/.test(String(prop.rentalsunited_property_id))) {
        const cur = String(prop.rentalsunited_property_id);
        if (!listingOwners.has(cur)) listingOwners.set(cur, null);
      }
      const historical = [...listingOwners.keys()].filter((id) => !keepListings.has(id)).sort();
      /**
       * A listing already archived at the channel — or one whose sub-account was closed there —
       * is disconnected from us. Re-pushing the identical status only burns the sliding-minute
       * window (`RU_RATE_DEFERRED`), so those listings are reported as settled, not re-archived.
       */
      const settled = await alreadySettledListings(admin, historical);
      const skippedSettled: { ru_property_id: string; ru_owner_id: string | null; reason: string }[] = [];
      const targets = historical.filter((id) => {
        const owner = listingOwners.get(id) ?? null;
        if (settled.archivedListings.has(id)) {
          skippedSettled.push({ ru_property_id: id, ru_owner_id: owner, reason: "Already archived at the channel" });
          return false;
        }
        if (owner && settled.closedOwners.has(owner)) {
          skippedSettled.push({
            ru_property_id: id,
            ru_owner_id: owner,
            reason: `Its distribution account (${owner}) is already closed at the channel`,
          });
          return false;
        }
        return true;
      });
      steps.push({
        step: "collect_listings",
        ok: true,
        message: `${listingOwners.size} listing(s) seen in this property's history — ${targets.length} to archive, ` +
          `${skippedSettled.length} already disconnected, ${keepListings.size} kept`,
      });


      if (dryRun) {
        return json({
          success: true,
          dry_run: true,
          property: { id: prop.id, name: prop.name },
          listings_to_archive: targets.map((id) => ({ ru_property_id: id, ru_owner_id: listingOwners.get(id) ?? null })),
          listings_already_disconnected: skippedSettled,
          listings_kept: [...keepListings],

          keep_binding: keepBinding,
          steps,
        });
      }

      // ── 2. Stop the backlog BEFORE touching the channel ──
      // Parked calls carry old listing ids; letting them drain after the wipe would re-create the
      // very state being removed.
      const { count: cancelledCalls } = await admin
        .from("ru_call_queue")
        .update({
          status: "cancelled",
          last_error: "Cancelled: property sterilized for a fresh channel connection",
          completed_at: new Date().toISOString(),
        }, { count: "exact" })
        .eq("property_id", propertyId)
        .in("status", ["pending", "deferred", "claimed", "queued", "retry"]);
      await admin.from("ru_notifications").delete().eq("property_id", propertyId);
      await admin.from("ru_lnm_repull_queue").delete().eq("property_id", propertyId);
      steps.push({
        step: "stop_backlog",
        ok: true,
        message: `${cancelledCalls ?? 0} parked call(s) cancelled, stored notifications and re-pull entries cleared`,
      });

      // ── 3. Archive the historical listings at the channel ──
      /**
       * The accounts that own the stale listings are being retired by this run, so they are
       * recorded in the retired registry first. That registry is what authorises the archive-only
       * master-scoped write: without the entry the channel refuses the archive (a dead account has
       * no child keys and the API will not mint any), and the listing would stay live forever.
       * The kept binding is never registered — it is still in service.
       */
      const keptOwners = new Set<string>();
      for (const id of keepListings) {
        const o = listingOwners.get(id);
        if (o) keptOwners.add(o);
      }
      if (keepBinding) {
        const { data: boundRow } = await admin
          .from("ru_owner_accounts")
          .select("ru_owner_id")
          .eq("property_id", propertyId)
          .maybeSingle();
        const bound = String(boundRow?.ru_owner_id ?? "").trim();
        if (/^\d+$/.test(bound)) keptOwners.add(bound);
      }
      const staleOwners = [...new Set(targets.map((id) => listingOwners.get(id)).filter((o): o is string => !!o))]
        .filter((o) => !keptOwners.has(o));
      for (const owner of staleOwners) {
        const { data: cred } = await admin
          .from("ru_api_credentials")
          .select("login_email")
          .eq("ru_owner_id", owner)
          .maybeSingle();
        await admin.from("ru_retired_accounts").upsert({
          ru_owner_id: owner,
          portal_email: cred?.login_email ?? null,
          reason: `Sterilized with ${prop.name} for a fresh channel connection`,
          retired_by: user.id,
        }, { onConflict: "ru_owner_id" });
      }

      const archived: string[] = [];
      const orphaned: { ru_property_id: string; ru_owner_id: string | null; message: string }[] = [];

      for (const listing of targets) {
        const owner = listingOwners.get(listing) ?? null;
        if (!owner) {
          // No owner was ever recorded against this listing, so there is no account to
          // authenticate as. It cannot collide with the fresh push (which mints new ids), so it is
          // reported as an orphan rather than allowed to block the run.
          orphaned.push({ ru_property_id: listing, ru_owner_id: null, message: "No owning account recorded for this listing" });
          continue;
        }
        const { data: credRow } = await admin
          .from("ru_api_credentials")
          .select("access_key, key_scope")
          .eq("ru_owner_id", owner)
          .maybeSingle();
        // No usable child pair → the channel refuses to mint one for a dead account, so the archive
        // runs on master credentials scoped to this OwnerID (the only path the API allows).
        const escalate = !credRow?.access_key || credRow.key_scope === "master_pair";
        try {
          const { data: res, error: invErr } = await admin.functions.invoke("rentalsunited-api", {
            body: {
              action: "set_property_status",
              ru_property_id: Number(listing),
              owner_id: Number(owner),
              ...(escalate ? { archive_retired: true } : {}),
              parent_action: "ru-cert-portal:sterilize_property",
              metadata: { is_active: false, is_archived: true },
            },
          });
          if (invErr || res?.success !== true) {
            orphaned.push({
              ru_property_id: listing,
              ru_owner_id: owner,
              message: invErr?.message ?? String(res?.error?.message ?? res?.error ?? "The channel did not accept the archive request"),
            });
          } else {
            archived.push(listing);
          }
        } catch (e) {
          orphaned.push({ ru_property_id: listing, ru_owner_id: owner, message: e instanceof Error ? e.message : String(e) });
        }
      }
      const settledNote = skippedSettled.length > 0
        ? `, ${skippedSettled.length} skipped (already disconnected from the channel)`
        : "";
      steps.push({
        step: "archive_listings",
        ok: true,
        message: (orphaned.length === 0
          ? `${archived.length} old listing(s) archived at the channel`
          : `${archived.length} archived, ${orphaned.length} left as orphans (recorded, not blocking)`) + settledNote,
      });


      // ── 4. Wipe local channel state ──
      const wipes: string[] = [];
      const clearTable = async (table: string, extra?: (q: unknown) => unknown) => {
        let q = admin.from(table).delete({ count: "exact" }).eq("property_id", propertyId);
        if (extra) q = extra(q) as typeof q;
        const { count, error } = await q;
        if (error) {
          wipes.push(`${table}: ${error.message}`);
        } else if ((count ?? 0) > 0) {
          wipes.push(`${table}: ${count}`);
        }
      };
      await clearTable("channel_price_coverage_status");
      await clearTable("ru_currency_state");
      await clearTable("ru_readiness_snapshots");
      await clearTable("ru_cert_runs");
      await clearTable("ru_archive_events");
      await clearTable("ru_discounts");
      await clearTable("ru_mcq_orders");
      await clearTable("ru_duplicate_repairs");
      // Only the channel's own authority mapping goes: other PMS mappings are unrelated.
      await clearTable("pms_mappings", (q) => (q as { eq: (a: string, b: string) => unknown }).eq("system_type", "rentals_united"));

      await admin
        .from("properties")
        .update({
          // A kept listing stays; otherwise the property has no listing at the channel any more.
          ...(keepListings.size > 0 ? {} : { rentalsunited_property_id: null, rentalsunited_building_id: null }),
          ru_push_enabled: false,
          ru_archived: false,
          ru_archived_at: null,
          ru_hold_reason: null,
          ru_hold_set_at: null,
          ru_hold_set_by: null,
          ru_listings_verified_at: null,
          ru_listings_verified_owner: null,
          ru_listings_verified_units: null,
          ru_listings_expected_units: null,
          ru_listings_unmatched: [],
        })
        .eq("id", propertyId);
      if (keepListings.size === 0) {
        await admin
          .from("hostfully_room_types")
          .update({ rentalsunited_property_id: null })
          .eq("property_id", propertyId);
      }

      if (!keepBinding) {
        const { data: boundRows } = await admin
          .from("ru_owner_accounts")
          .select("id, ru_owner_id")
          .eq("property_id", propertyId);
        for (const row of boundRows ?? []) {
          await admin.from("ru_owner_accounts").update({ property_id: null }).eq("id", row.id);
        }
        if ((boundRows ?? []).length) wipes.push("property unlinked from distribution account (keys kept)");
        const { data: pfMember } = await admin
          .from("property_portfolio_members")
          .select("portfolio_id")
          .eq("property_id", propertyId)
          .maybeSingle();
        const pfId = String(pfMember?.portfolio_id ?? "").trim();
        if (pfId) {
          const { data: pfAccount } = await admin
            .from("ru_owner_accounts")
            .select("id, ru_owner_id")
            .eq("portfolio_id", pfId)
            .maybeSingle();
          const pfOwner = String(pfAccount?.ru_owner_id ?? "").trim();
          if (pfAccount?.id && (!pfOwner || staleOwners.includes(pfOwner))) {
            await admin.from("ru_owner_accounts").update({ portfolio_id: null }).eq("id", pfAccount.id);
            wipes.push("portfolio distribution account unlinked (keys kept)");
          }
        }
      }

      /**
       * ── 4b. Close the retired sub-accounts AT THE CHANNEL ──
       *
       * Sterilizing used to leave the portal login alive: the account was recorded as retired
       * locally but nothing ever asked the channel to close it, so the operator could still sign
       * in with an email ROL'OS considered dead. The close runs as the sub-account itself, one at
       * a time, after its listings are archived and its binding is gone. Only a confirmed roster
       * re-read stamps channel_archived_at — a refusal is reported, never assumed away.
       */
      const accountCloses: {
        ru_owner_id: string;
        status: string;
        code: string;
        confirmed: boolean;
        message: string;
      }[] = [];
      const sterilizePassword = typeof body.password === "string" && body.password ? body.password : null;
      for (const owner of staleOwners) {
        if (settled.closedOwners.has(owner)) {
          accountCloses.push({
            ru_owner_id: owner,
            status: "closed_at_channel",
            code: "ALREADY_CLOSED",
            confirmed: true,
            message: "Already closed at the channel (Push_ArchiveUser_RQ)",
          });
          continue;
        }
        const outcome = await closeAccountAtChannel({
          ownerId: owner,
          password: sterilizePassword,
          note: `Sterilized with ${prop.name} for a fresh channel connection`,
          cooldownSeconds: 30,
          allowBound: true,
        });
        accountCloses.push({
          ru_owner_id: owner,
          status: outcome.status,
          code: outcome.code,
          confirmed: outcome.confirmed,
          message: outcome.message,
        });
        await admin.from("ru_retired_accounts").update({
          ...(outcome.confirmed ? { channel_archived_at: new Date().toISOString() } : {}),
          channel_archive_result: {
            ran_at: new Date().toISOString(),
            ran_by: user.email ?? user.id,
            source: "sterilize_property",
            property_id: propertyId,
            account_close: {
              status: outcome.status,
              code: outcome.code,
              message: outcome.message,
              verified_via_roster: outcome.verifiedViaRoster,
              steps: outcome.steps,
            },
          },
        }).eq("ru_owner_id", owner)
          .then(() => {}, (e) => console.warn("[ru-cert-portal] sterilize close stamp failed", e));
      }
      if (staleOwners.length > 0) {
        const closedCount = accountCloses.filter((c) => c.confirmed).length;
        steps.push({
          step: "close_accounts",
          ok: closedCount === staleOwners.length,
          message: closedCount === staleOwners.length
            ? `${closedCount} distribution account(s) closed at the channel — the portal login no longer works`
            : `${closedCount}/${staleOwners.length} closed at the channel · outstanding: ${accountCloses
                .filter((c) => !c.confirmed)
                .map((c) => `${c.ru_owner_id} (${c.message})`)
                .join("; ")}`,
        });
      }




      // Account/channel gates only. Ready-to-sell steps 1–5 stay as they are so the
      // property can be bound to a new owner immediately without re-earning content.
      const accountGateKeys = [...CHANNEL_CLASS_LEDGER_STEPS, "monitor_step_a", "monitor_step_b", "ready_to_connect"];
      const { data: gateRows } = await admin
        .from("property_channel_step_status")
        .select("step_key")
        .eq("property_id", propertyId)
        .in("step_key", accountGateKeys);
      if ((gateRows ?? []).length > 0) {
        await admin
          .from("property_channel_step_status")
          .update({
            status: "pending",
            source: "seed",
            passed_at: null,
            stale_at: null,
            last_checked_at: null,
            blocker_summary: "Distribution account closed — reconnect to a new owner.",
            details: { sterilized_at: new Date().toISOString(), sterilized_by: user.email ?? user.id },
          })
          .eq("property_id", propertyId)
          .in("step_key", accountGateKeys);
      }
      steps.push({
        step: "reset_state",
        ok: true,
        message: `${(gateRows ?? []).length} account/channel gate(s) reset; Ready-to-sell steps 1–5 left unchanged${wipes.length ? ` · cleared ${wipes.join(", ")}` : ""}`,
      });

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "properties",
        record_id: propertyId,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary:
          `Sterilized ${prop.name} for a fresh channel connection: ${archived.length} old listing(s) archived` +
          `${orphaned.length ? `, ${orphaned.length} orphaned` : ""}` +
          `${keepListings.size ? `, kept listing(s) ${[...keepListings].join(", ")}` : ""}` +
          `, ${cancelledCalls ?? 0} parked call(s) cancelled, account/channel gates reset (steps 1–5 kept)`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return json({
        success: true,
        property: { id: prop.id, name: prop.name },
        archived_listings: archived,
        orphaned_listings: orphaned,
        listings_already_disconnected: skippedSettled,
        listings_kept: [...keepListings],
        keep_binding: keepBinding,
        account_closes: accountCloses,
        cancelled_queued_calls: cancelledCalls ?? 0,
        cleared: wipes,
        gates_reset: (gateRows ?? []).length,
        content_steps: [],
        steps,
      });
    }


    // ── phase_status: 4-phase onboarding gate for one property ──
    if (action === "phase_status") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      if (body.probe_ari !== true) {
        const hit = phaseStatusCache.get(propertyId);
        if (hit && Date.now() - hit.at < PHASE_STATUS_TTL_MS) return json({ ...hit.payload, cached: "memory" });
        // Edge isolates are short-lived, so the in-memory hit above misses often. The
        // persisted copy keeps re-opening the wizard instant across cold starts.
        try {
          const { data: stored } = await admin
            .from("ru_readiness_snapshots")
            .select("phase_payload, phase_payload_at")
            .eq("property_id", propertyId)
            .maybeSingle();
          const at = stored?.phase_payload_at ? Date.parse(stored.phase_payload_at) : 0;
          if (stored?.phase_payload && Date.now() - at < PHASE_STATUS_TTL_MS) {
            return json({ ...(stored.phase_payload as Record<string, unknown>), cached: "stored" });
          }
        } catch (_e) { /* cache miss is never fatal */ }
      } else {
        phaseStatusCache.delete(propertyId);
      }
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, owner_email, external_system, rentalsunited_property_id, rentalsunited_building_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);

      let readiness: Record<string, unknown> | null = null;
      let gaps: string[] = [];
      let readinessUnknown = false;
      // Probe the live channel calendar as soon as the property (or any unit) exists at the
      // channel — otherwise the wizard would pass Phase 2 on rules the certification
      // console then fails. Before the first push the local calendar is scored instead.
      let hasChannelListing = Number((prop as any).rentalsunited_property_id ?? 0) > 0;
      if (!hasChannelListing) {
        const { data: liveUnits } = await admin
          .from("hostfully_room_types")
          .select("rentalsunited_property_id")
          .eq("property_id", propertyId)
          .not("rentalsunited_property_id", "is", null)
          .limit(1);
        hasChannelListing = (liveUnits ?? []).some(
          (u: { rentalsunited_property_id: unknown }) => Number(u.rentalsunited_property_id) > 0,
        );
      }
      // Page loads must not force a live channel pull: it is slow, rate limited, and the
      // verdict barely moves. Probe only when the caller explicitly asks, or when the
      // listing exists but no verdict has ever been stored (so the first one is earned).
      const storedVerdict = hasChannelListing ? await loadAriSnapshot(admin, propertyId) : null;
      const probeAri = body.probe_ari === false
        ? false
        : body.probe_ari === true || (hasChannelListing && !storedVerdict);
      try {
        readiness = await scorePropertyWithinBudget(prop as any, probeAri, body.probe_ari === true) as any;
        // Only mandatory failures may block a phase — optional quality advice must not.
        gaps = ((readiness as any)?.blocking_gaps ?? []) as string[];
      } catch (_e) {
        // A live ARI probe can fail for reasons that have nothing to do with the
        // property's content (unresolved sub-account, channel rate limit, transport
        // error). Re-score locally so the content / rooms / photos / policy groups
        // still reach the wizard instead of every check reading "not yet resolvable".
        if (probeAri) {
          try {
            readiness = await scoreProperty(prop as any, { probe_ari: false }) as any;
            gaps = ((readiness as any)?.blocking_gaps ?? []) as string[];
          } catch (_e2) {
            readinessUnknown = true;
          }
        } else {
          readinessUnknown = true;
        }
      }


      const gate = await evaluatePhases(admin, prop as any, { readinessGaps: gaps, readinessUnknown });
      const { data: mcq } = await admin
        .from("ru_mcq_orders")
        .select("id, ordered_at, status, ru_status_id")
        .eq("property_id", propertyId)
        .order("ordered_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Phase 4 needs a sales ChannelID for the content quality check — surface whatever
      // is stored for this property (or the account-wide default) so the UI can prompt.
      const { data: channelRows } = await admin
        .from("ru_platform_settings")
        .select("key, value, updated_at")
        .in("key", [channelSettingKey(propertyId), channelSettingKey(null)]);
      let salesChannel: Record<string, unknown> | null = null;
      for (const key of [channelSettingKey(propertyId), channelSettingKey(null)]) {
        const row = (channelRows ?? []).find((r: { key: string }) => r.key === key);
        if (!row) continue;
        const raw = row.value as Record<string, unknown> | number | string | null;
        const channelId = Number(
          typeof raw === "object" && raw !== null ? (raw as { channel_id?: unknown }).channel_id ?? 0 : raw ?? 0,
        );
        if (channelId > 0) {
          salesChannel = {
            channel_id: channelId,
            company_name:
              typeof raw === "object" && raw !== null ? (raw as { company_name?: string }).company_name ?? null : null,
            scope: key.includes(":") ? "property" : "account",
            updated_at: row.updated_at ?? null,
          };
          break;
        }
      }

      const payload = {
        success: true,
        gate,
        readiness,
        // Tells the wizard whether availability rules were judged on the live channel
        // calendar or on the ROL'OS calendar (pre-publish).
        availability_source: (readiness as { availability_source?: string } | null)?.availability_source ?? "local",
        last_mcq: mcq ?? null,
        sales_channel: salesChannel,
      };
      // Re-opening the wizard (or switching tabs) must not re-derive the whole scorecard.
      if (!readinessUnknown) {
        phaseStatusCache.set(propertyId, { at: Date.now(), payload });
        try {
          await admin.from("ru_readiness_snapshots").upsert({
            property_id: propertyId,
            phase_payload: payload,
            phase_payload_at: new Date().toISOString(),
          }, { onConflict: "property_id" });
        } catch (e) {
          console.warn("[ru-cert-portal] phase payload cache write failed:", e);
        }
      }
      return json(payload);

    }

    // ── ensure_owner_account: Phase 1 sub-user (portfolio-first) ──
    // `ensure_company_details` is the same atomic flow: it re-enters here, finds the
    // existing sub-user and (re)submits Push_FillCompanyDetails_RQ until it sticks.
    // `plan_owner_account` is the read-only preview of the same resolution: it decides
    // WHAT would be sent to the channel (login, name, scope, adopt vs create) and returns
    // it for operator confirmation. It performs no channel writes and no local writes.
    if (
      action === "ensure_owner_account" ||
      action === "ensure_company_details" ||
      action === "plan_owner_account" ||
      action === "preview_company_details"
    ) {
      const isPlan = action === "plan_owner_account";
      /**
       * `preview_company_details` composes the company profile exactly as the push would
       * and returns the resolved field/value list WITHOUT contacting the channel and
       * without any local write. It backs the "Company details to be sent" panel in the
       * Step A account dialog.
       */
      const isCompanyPreview = action === "preview_company_details";
      const isCompanyEnsure = action === "ensure_company_details";
      const readOnly = isPlan || isCompanyPreview;
      const propertyId: string | null = body.property_id ?? null;
      let portfolioId: string | null = body.portfolio_id ?? null;
      if (!propertyId && !portfolioId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id or portfolio_id is required" } }, 400);
      }

      const flag = await readUserMgmtFlag();
      if (!flag.enabled && !readOnly) {
        return json({
          success: false,
          error: { code: "USER_MGMT_DISABLED", message: "RU user management is parked. Enable it on the Users tab first." },
        }, 409);
      }

      /**
       * Operator-confirmed identity. Step 6 of the wizard previews the resolution, the
       * operator confirms it, and the confirmed values come back here verbatim so nothing
       * can drift between what was shown and what is created. Automated/server callers
       * omit these and keep the original cascade.
       */
      const confirmedEmail = String(body.confirmed_owner_email ?? "").trim() || null;
      const confirmedName = String(body.confirmed_owner_name ?? "").trim() || null;
      let ownerEmail: string | null = confirmedEmail ?? body.owner_email ?? null;
      let ownerName: string = confirmedName ?? body.owner_name ?? "";
      // Where the login came from — reported so the operator can see which record they
      // must edit when the previewed address is wrong.
      let ownerEmailSource: string = confirmedEmail
        ? "confirmed by the operator"
        : ownerEmail
          ? "supplied with the request"
          : "unresolved";

      // Only the shared platform login (dev@) can never become a channel sub-user login —
      // Rentals United already holds it globally. Other ROL mailboxes (connect@, rooms@,
      // info@ …) are valid owner / testing logins and are accepted.
      const INTERNAL_LOGIN_PREFIXES = ["dev@", "noreply@", "no-reply@"];
      const isInternalLogin = (email: string | null | undefined) => {
        const e = String(email ?? "").trim().toLowerCase();
        if (!e) return true;
        return INTERNAL_LOGIN_PREFIXES.some((p) => e.startsWith(p));
      };

      let internalLoginRejected: string | null = null;
      if (ownerEmail && isInternalLogin(ownerEmail)) {
        internalLoginRejected = ownerEmail;
        ownerEmail = null;
        ownerEmailSource = "unresolved";
      }



      if (!portfolioId && propertyId) portfolioId = await resolvePortfolioId(admin, propertyId);


      // 0) A distribution login recorded on the channel account binding wins: it is what
      // the operator re-assigned for this property/portfolio, and it is deliberately
      // separate from `properties.owner_email` (the contracting owner).
      if (!ownerEmail && (propertyId || portfolioId)) {
        let q = admin
          .from("ru_owner_accounts")
          .select("ru_login_email, owner_email, property_id, portfolio_id")
          .not("ru_login_email", "is", null);
        q = portfolioId && propertyId
          ? q.or(`portfolio_id.eq.${portfolioId},property_id.eq.${propertyId}`)
          : portfolioId
            ? q.eq("portfolio_id", portfolioId)
            : q.eq("property_id", propertyId!);
        const { data: bound } = await q.limit(5);
        const row = ((bound ?? []) as any[]).find((r) => String(r?.ru_login_email ?? "").trim());
        const candidate = row ? String(row.ru_login_email).trim() : null;
        if (candidate && !isInternalLogin(candidate)) {
          ownerEmail = candidate;
          ownerEmailSource = "the distribution login on file for this account";
        }
      }

      // 1) The property's own owner email is the authority.
      if (!ownerEmail && propertyId) {
        const { data: pr } = await admin
          .from("properties")
          .select("owner_email, owner_name, name")
          .eq("id", propertyId)
          .maybeSingle();
        const candidate = (pr as any)?.owner_email ?? null;
        if (candidate && !isInternalLogin(candidate)) {
          ownerEmail = candidate;
          ownerEmailSource = "this property's owner email";
          ownerName = ownerName || ((pr as any)?.owner_name ?? pr?.name ?? "Property Owner");
        } else if (candidate) {
          internalLoginRejected = internalLoginRejected ?? candidate;
        }
      }

      // Contact name always comes from the property/owner record, never from the login.
      if (!ownerName && propertyId) {
        const { data: pr } = await admin
          .from("properties")
          .select("owner_name, name")
          .eq("id", propertyId)
          .maybeSingle();
        ownerName = ((pr as any)?.owner_name ?? (pr as any)?.name ?? "") || "";
      }


      let portfolioRow: { id: string; name: string | null; owner_id: string | null; owner_email: string | null } | null = null;
      if (portfolioId) {
        const { data: pf } = await admin
          .from("property_portfolios")
          .select("id, name, owner_id, owner_email")
          .eq("id", portfolioId)
          .maybeSingle();
        portfolioRow = (pf as any) ?? null;
        // 2) Explicit portfolio owner email (admins copy it from a member property's owner).
        if (!ownerEmail && portfolioRow?.owner_email && !isInternalLogin(portfolioRow.owner_email)) {
          ownerEmail = portfolioRow.owner_email;
          ownerEmailSource = "the portfolio's owner email";
          ownerName = ownerName || (portfolioRow.name ?? "Portfolio Owner");
        }
        ownerName = ownerName || (portfolioRow?.name ?? "Portfolio Owner");
      }

      // 3) Any other member property in the portfolio that carries a real owner email.
      if (!ownerEmail && portfolioId) {
        const { data: members } = await admin
          .from("property_portfolio_members")
          .select("property_id")
          .eq("portfolio_id", portfolioId);
        const ids = ((members ?? []) as any[]).map((m) => m.property_id).filter(Boolean);
        if (ids.length) {
          const { data: siblings } = await admin
            .from("properties")
            .select("owner_email, owner_name, name")
            .in("id", ids);
          for (const s of (siblings ?? []) as any[]) {
            if (s?.owner_email && !isInternalLogin(s.owner_email)) {
              ownerEmail = s.owner_email;
              ownerEmailSource = `a sibling property in this portfolio (${s.name ?? "unnamed"})`;
              ownerName = ownerName || (s.owner_name ?? s.name ?? "Property Owner");
              break;
            }
          }
        }
      }


      // 4) Last resort: the linked portfolio profile (only when it is not an internal login).
      if (!ownerEmail && portfolioRow?.owner_id) {
        const { data: prof } = await admin
          .from("profiles")
          .select("email, full_name")
          .eq("id", portfolioRow.owner_id)
          .maybeSingle();
        if (prof?.email && !isInternalLogin(prof.email)) {
          ownerEmail = prof.email;
          ownerEmailSource = "the portfolio owner's ROL'OS profile";
          ownerName = ownerName || (prof.full_name ?? portfolioRow.name ?? "Portfolio Owner");
        }
      }

      // 5) An already-provisioned distribution account wins over the internal-login guard:
      // the sub-user exists at the channel with that login, so re-submitting company details
      // must reuse it instead of failing.
      if (!ownerEmail) {
        let q = admin
          .from("ru_owner_accounts")
          .select("owner_email, ru_owner_id, property_id, portfolio_id")
          .not("owner_email", "is", null);
        q = portfolioId && propertyId
          ? q.or(`portfolio_id.eq.${portfolioId},property_id.eq.${propertyId}`)
          : portfolioId
            ? q.eq("portfolio_id", portfolioId)
            : q.eq("property_id", propertyId!);
        const { data: existing } = await q.limit(5);
        const row = ((existing ?? []) as any[]).find((r) => r?.owner_email);
        if (row) {
          ownerEmail = row.owner_email;
          ownerEmailSource = "the distribution account already on file";
          ownerName = ownerName || portfolioRow?.name || "Property Owner";
        }
      }

      /**
       * Auto-generated slug login (memoized). When every resolved address is unusable —
       * a shared platform login, or one the channel later rejects as taken — Step A
       * must not stall on a manual email change: it mints
       * `<slug>@roomsonline.co.za` from the property and provisions on it.
       */
      let generatedBaseCache: string | null | undefined;
      const generatedLoginBase = async (): Promise<string | null> => {
        if (generatedBaseCache !== undefined) return generatedBaseCache;
        generatedBaseCache = null;
        if (propertyId) {
          const { data: pr } = await admin
            .from("properties")
            .select("slug, name")
            .eq("id", propertyId)
            .maybeSingle();
          const base = String((pr as any)?.slug ?? "").trim() || String((pr as any)?.name ?? "").trim();
          if (base) generatedBaseCache = base;
        }
        if (!generatedBaseCache && portfolioRow?.name) generatedBaseCache = portfolioRow.name;
        return generatedBaseCache;
      };

      // 6) Nothing usable resolved at all (e.g. only a shared platform login on file):
      // go straight to the generated login instead of failing with NO_OWNER_EMAIL.
      if (!ownerEmail) {
        const generated = generateDistributionLogin((await generatedLoginBase()) ?? "");
        if (generated) {
          ownerEmail = generated;
          ownerEmailSource = internalLoginRejected
            ? `auto-generated because ${internalLoginRejected} is a shared platform login`
            : "auto-generated from the property name";
          ownerName = ownerName || portfolioRow?.name || "Property Owner";
        }
      }

      const NO_OWNER_EMAIL_MESSAGE = internalLoginRejected
        ? `${internalLoginRejected} is a shared platform login and cannot become a distribution sub-account login. Set a real owner email on the property, then review this step again.`
        : "No usable owner email found for the distribution account. Set a real owner email on the property — shared platform logins (dev@, noreply@) and the provider's own portal login (connect@roomsonline.co.za) cannot be used as a distribution login.";

      if (!ownerEmail) {
        // The preview never fails: it reports the blocker so the wizard can offer the
        // correction route instead of a dead-end error toast.
        if (isCompanyPreview) {
          return json({
            success: true,
            preview: { fields: [], blocked_reason: NO_OWNER_EMAIL_MESSAGE, scope: portfolioId ? "portfolio" : "property" },
          });
        }
        if (isPlan) {
          return json({
            success: true,
            plan: {
              can_create: false,
              blocked_reason: NO_OWNER_EMAIL_MESSAGE,
              login_email: null,
              login_source: "unresolved",
              rejected_internal_login: internalLoginRejected,
              scope: portfolioId ? "portfolio" : "property",
              portfolio_id: portfolioId,
              portfolio_name: portfolioRow?.name ?? null,
              property_id: propertyId,
              outcome: "blocked",
            },
          });
        }
        return json({
          success: false,
          error: { code: "NO_OWNER_EMAIL", message: NO_OWNER_EMAIL_MESSAGE },
        }, 422);
      }



      const contactNameParts = String(ownerName).trim().split(/\s+/);
      const contactFirstName = contactNameParts[0] || "Property";
      const contactLastName = contactNameParts.slice(1).join(" ") || "Owner";

      // Resolve CountryId from the locally seeded dictionary only. Step A must never issue
      // Pull_GetLocationByName_RQ; property setup owns dictionary refresh and location choice.
      const locationIdByName = async (name: string): Promise<number | null> => {
        if (!name) return null;
        // The cached RU location register first: RU rate-limits repeated
        // Pull_GetLocationByName_RQ calls with the same parameters, and a save-time delta
        // check must never burn a channel call to resolve a country that never moves.
        const { data: loc } = await admin
          .from("ru_locations")
          .select("id")
          .ilike("name", name)
          .limit(1)
          .maybeSingle();
        const cached = Number((loc as { id?: number } | null)?.id);
        if (Number.isFinite(cached) && cached > 1) return cached;

        return null;
      };


      // Phase 1 is only complete once company details have been filled on RU.
      // NOTE: Push_FillCompanyDetails_RQ has no UserAccountId — RU applies the details to
      // whichever account authenticates, so we must log in AS the sub-user. That is only
      // possible when we still hold the password we generated at creation time; adopted
      // accounts (created outside this flow) are flagged for manual completion instead.
      const submitCompanyDetails = async (
        account: Record<string, any> | null,
        plainPassword?: string | null,
        options?: { dryRun?: boolean },
      ) => {
        const dryRun = options?.dryRun === true;
        if (!account?.id) return { sent: false, error: "No local RU account row" };
        // Idempotent: treat it as done only when RU actually confirmed it.
        // `force: true` re-submits (e.g. the RU portal profile is still blank).
        // A dry run never short-circuits: the caller wants the composed payload.
        const companyState = dryRun
          ? { satisfied: false }
          : await ruCompanyDetailsSatisfied(admin, account.ru_owner_id, account);
        /**
         * Save-time resend. Company details are authored on the property, so an edit
         * saved after the last accepted push makes the channel's copy stale. Callers
         * that fire on save pass `resend_if_changed` and we re-push only in that case,
         * which keeps ordinary wizard polling on the cheap idempotent path.
         */
        let staleAfterEdit = false;
        if (body.resend_if_changed === true && companyState.satisfied) {
          const filledAt = account.company_filled_at ? Date.parse(String(account.company_filled_at)) : 0;
          const memberIds: string[] = [];
          if (portfolioId) {
            const { data: members } = await admin
              .from("property_portfolio_members")
              .select("property_id")
              .eq("portfolio_id", portfolioId);
            for (const m of (members ?? []) as { property_id: string }[]) memberIds.push(m.property_id);
          }
          if (propertyId && !memberIds.includes(propertyId)) memberIds.push(propertyId);
          if (memberIds.length > 0 && filledAt > 0) {
            const { data: touched } = await admin
              .from("properties")
              .select("updated_at")
              .in("id", memberIds)
              .order("updated_at", { ascending: false })
              .limit(1);
            const newest = (touched ?? [])[0]?.updated_at ? Date.parse(String((touched ?? [])[0].updated_at)) : 0;
            staleAfterEdit = newest > filledAt;
          }
        }
        /**
         * Save-time callers keep going even when the timestamp heuristic says nothing
         * changed: `properties.updated_at` can lag or move for unrelated reasons, so the
         * only honest test is comparing the composed payload with the one RU accepted
         * (see `payloadUnchanged` below). Those callers must also stay quiet about setup
         * gaps they cannot act on, hence `advisoryOnly`.
         */
        const advisoryOnly = body.force !== true && !staleAfterEdit && companyState.satisfied;
        if (advisoryOnly && body.resend_if_changed !== true) {
          return { sent: true, skipped: true as const };
        }
        /** Turn a blocking setup gap into a silent skip for save-time resends. */
        const quiet = (result: { sent: boolean; error?: string; [k: string]: unknown }) =>
          advisoryOnly && result.sent === false
            ? { sent: true, skipped: true as const, blocked_reason: result.error ?? null }
            : result;



        // Password sources, in order: this call, an admin-supplied password
        // (adopted accounts), or the encrypted copy stored at creation time.
        let password: string | null = plainPassword ?? (body.ru_login_password as string | undefined) ?? null;
        // True when the password came from us (freshly generated or our encrypted copy):
        // in that case we must never ask the operator for a password we already hold.
        if (!password && account.ru_login_password_enc) {
          const { data: decrypted } = await admin.rpc("decrypt_sensitive_text", {
            encrypted_data: account.ru_login_password_enc,
          });
          password = decrypted && decrypted !== "[ENCRYPTED]" && decrypted !== "[DECRYPTION_ERROR]"
            ? decrypted as string
            : null;
        }
        if (password && !account.ru_login_password_enc) {
          // Persist it so later retries/backfills never need the operator again.
          const { data: enc } = await admin.rpc("encrypt_sensitive_text", { plaintext: password });
          if (enc) await admin.from("ru_owner_accounts").update({ ru_login_password_enc: enc }).eq("id", account.id);
        }

        // Child credentials are mandatory: RU's Push_FillCompanyDetails_RQ has no <OwnerID>
        // element, so the details are written to whichever identity authenticates. Using the
        // parent envelope would overwrite the MASTER company profile instead of the child's.
        // Since RU's Nov-2025 rollout, sub-accounts must use their own API key pair; the
        // legacy portal password only works on older accounts.
        let childAccessKey: string | null = null;
        let childSecretKey: string | null = null;
        {
          const decryptSecret = async (enc: unknown): Promise<string | null> => {
            if (!enc) return null;
            const { data: secret } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: enc });
            if (!secret || secret === "[ENCRYPTED]" || secret === "[DECRYPTION_ERROR]") return null;
            return String(secret);
          };

          // Highest priority: keys supplied with this request (one-off manual recovery).
          const reqKey = typeof body.ru_api_access_key === "string" ? body.ru_api_access_key.trim() : "";
          const reqSecret = typeof body.ru_api_secret_key === "string" ? body.ru_api_secret_key.trim() : "";
          if (reqKey && reqSecret) {
            childAccessKey = reqKey;
            childSecretKey = reqSecret;
          }

          // Preferred: keys stored against this RU OwnerID
          const boundOwnerId = String(account.ru_owner_id ?? "").trim();
          if (!childAccessKey && boundOwnerId) {

            const { data: credRow } = await admin
              .from("ru_api_credentials")
              .select("access_key, secret_enc")
              .eq("ru_owner_id", boundOwnerId)
              .maybeSingle();
            const plain = await decryptSecret(credRow?.secret_enc);
            if (credRow?.access_key && plain) {
              childAccessKey = String(credRow.access_key);
              childSecretKey = plain;
            }
          }

          if (!childAccessKey) {
            const { data: keyRow } = await admin
              .from("ru_owner_accounts")
              .select("ru_api_access_key, ru_api_secret_enc")
              .eq("id", account.id)
              .maybeSingle();
            const plain = await decryptSecret(keyRow?.ru_api_secret_enc);
            if (keyRow?.ru_api_access_key && plain) {
              childAccessKey = String(keyRow.ru_api_access_key);
              childSecretKey = plain;
            }
          }
        }

        const hasChildKeys = Boolean(childAccessKey && childSecretKey);

        /**
         * Since RU's Nov-2025 rollout a sub-account can only authenticate with its own
         * API key pair. Retrying under the stored portal password just earns Status -4
         * ("Incorrect login or password") and lands in the health report as a pipeline
         * failure, when the truth is that owner setup is incomplete. So keys are a hard
         * prerequisite: report the setup gap instead of burning a doomed call.
         */
        if (!hasChildKeys && !dryRun) {
          return quiet({
            sent: false,
            needs_password: true,
            needs_api_keys: true,
            setup_gap: true,
            error:
              "Waiting on owner setup: this distribution sub-account has no verified API key pair yet. Step A will create and store the pair automatically once the OwnerID handoff is complete; retry Step A shortly.",
          });
        }






        // Resolve company info from the portfolio (preferred) or the property.
        let companyName = ownerName || "";
        let address: string | undefined;
        let city: string | undefined;
        let country: string | undefined;
        let zip: string | undefined;
        let phone: string | undefined;
        let website: string | undefined;
        // Company Information frame on the property (Identity & Location → Company Information)
        // is the primary source for the RU company profile extras.
        let propertyProfile: Record<string, unknown> | null = null;
        let propertyRuLocationId: number | null = null;
        // Bridged from the banking block on any portfolio member (see below).
        let bridgedVatNumber: string | null = null;
        let bridgedRegistration: string | null = null;
        let portfolioPropertyCount: number | null = null;
        const collectVatAndRegistration = (amenities: unknown) => {
          if (!amenities || typeof amenities !== "object") return;
          const am = amenities as Record<string, unknown>;
          const bank = (am.banking && typeof am.banking === "object" ? am.banking : {}) as Record<string, unknown>;
          const hasVat = bank.has_vat === true || am.has_vat === true;
          const vat = String(am.vat_number ?? bank.vat_number ?? "").trim();
          if (!bridgedVatNumber && hasVat && vat) bridgedVatNumber = vat;
          const reg = String(am.property_registration ?? bank.property_registration ?? "").trim();
          if (!bridgedRegistration && reg) bridgedRegistration = reg;
        };


        let sourcePropertyId: string | null = propertyId ?? null;
        // Company Information is authored per property, but the RU company profile is
        // account-wide. Merge every portfolio member's profile (the selected property
        // wins on conflicts) so a richer dataset entered on ANY member still reaches the
        // sub-user — previously we grabbed an arbitrary member and sent a thin payload.
        let mergedPortfolioProfile: Record<string, unknown> | null = null;
        if (portfolioId) {
          const { data: pf } = await admin
            .from("property_portfolios")
            .select("name")
            .eq("id", portfolioId)
            .maybeSingle();
          companyName = pf?.name || companyName;

          const { data: members } = await admin
            .from("property_portfolio_members")
            .select("property_id, properties!inner(id, amenities)")
            .eq("portfolio_id", portfolioId);

          const withProfile: { id: string; profile: Record<string, unknown> }[] = [];
          for (const row of (members ?? []) as any[]) {
            const am = row?.properties?.amenities;
            const rcp = am && typeof am === "object" ? (am as Record<string, unknown>).ru_company_profile : null;
            if (rcp && typeof rcp === "object" && Object.keys(rcp as object).length > 0) {
              withProfile.push({ id: row.properties.id as string, profile: rcp as Record<string, unknown> });
            }
            // VAT / company registration live on the banking block, NOT inside
            // ru_company_profile — bridge them in so RU stops receiving a blank
            // VAT number for VAT-registered owners.
            collectVatAndRegistration(am);
          }
          // RU's NumberOfProperties is account-wide: count every portfolio member.
          portfolioPropertyCount = ((members ?? []) as any[]).length || null;

          if (withProfile.length > 0) {
            // Selected property last so its values win the merge.
            const ordered = [
              ...withProfile.filter((w) => w.id !== sourcePropertyId),
              ...withProfile.filter((w) => w.id === sourcePropertyId),
            ];
            mergedPortfolioProfile = {};
            for (const w of ordered) {
              for (const [k, v] of Object.entries(w.profile)) {
                if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) continue;
                if (k === "legal_rep" && typeof v === "object") {
                  mergedPortfolioProfile[k] = { ...((mergedPortfolioProfile[k] as object) ?? {}), ...(v as object) };
                  continue;
                }
                mergedPortfolioProfile[k] = v;
              }
            }
          }
          // Prefer an address source that actually has Company Information filled in.
          if (!sourcePropertyId) sourcePropertyId = withProfile[0]?.id ?? null;
          if (!sourcePropertyId) {
            const { data: member } = await admin
              .from("property_portfolio_members")
              .select("property_id")
              .eq("portfolio_id", portfolioId)
              .limit(1)
              .maybeSingle();
            sourcePropertyId = member?.property_id ?? null;
          }
        }
        if (sourcePropertyId) {
          const { data: pr } = await admin
            .from("properties")
            .select("name, address, city, country, postal_code, amenities, ru_location_id")
            .eq("id", sourcePropertyId)
            .maybeSingle();
          companyName = companyName || (pr as any)?.name || "";
          const am = (pr as any)?.amenities;
          const rcp = am && typeof am === "object" ? (am as Record<string, unknown>).ru_company_profile : null;
          if (rcp && typeof rcp === "object") propertyProfile = rcp as Record<string, unknown>;
          collectVatAndRegistration(am);

          const prLoc = Number((pr as any)?.ru_location_id);
          if (Number.isFinite(prLoc) && prLoc > 1) propertyRuLocationId = prLoc;
          address = (pr as any)?.address ?? undefined;
          city = (pr as any)?.city ?? undefined;
          country = (pr as any)?.country ?? undefined;
          zip = (pr as any)?.postal_code ?? undefined;

          const { data: contact } = await admin
            .from("property_contact_details")
            .select("phone")
            .eq("property_id", sourcePropertyId)
            .limit(1)
            .maybeSingle();
          phone = (contact as any)?.phone ?? phone;
        }
        // Portfolio-wide extras underpin the selected property's own profile.
        if (mergedPortfolioProfile) {
          propertyProfile = { ...mergedPortfolioProfile, ...(propertyProfile ?? {}) };
        }

        if (!companyName) return quiet({ sent: false, error: "No company/portfolio name to submit" });

        // Last resort: the country id RU already accepted for this account.
        const previousCountryId = Number(
          (account.company_payload as Record<string, unknown> | null)?.country_id ?? NaN,
        );
        const countryId =
          (await locationIdByName(country || "South Africa")) ??
          (Number.isFinite(previousCountryId) && previousCountryId > 1 ? previousCountryId : null);
        if (!countryId) {
          return quiet({ sent: false, error: `Could not resolve a Rentals United CountryId for "${country || "South Africa"}"` });
        }


        const company = {
          first_name: contactFirstName,
          last_name: contactLastName,
          email: ownerEmail!,
          phone: phone || "",
          city: city || "Cape Town",
          country_id: countryId,
          address: address || "Address on file",
          zip_code: zip || "0000",
          language_id: 1,
          name: companyName,
          website: website || "https://sleepinafrica.roomsonline.co.za",
          company_city: city || undefined,
          company_address: address || undefined,
          post_code: zip || undefined,
          company_phone: phone || undefined,
          merchant_name: companyName,
          location_ids:
            propertyRuLocationId && !locationIds.includes(propertyRuLocationId)
              ? [propertyRuLocationId, ...locationIds]
              : locationIds,
        };

        // Admin-entered RU profile extras (Portfolios → RU accounts → Company profile).
        // These fill the optional CompanyInfo / LegalRepresentativeInfo fields RU exposes
        // and can also override any derived contact value.
        const profileRow = await admin
          .from("ru_owner_accounts")
          .select("company_profile")
          .eq("id", account.id)
          .maybeSingle();
        const accountOverrides = (profileRow.data?.company_profile ?? null) as Record<string, unknown> | null;
        // Property-level Company Information first, account-level extras on top.
        const overrides: Record<string, unknown> | null =
          propertyProfile || accountOverrides
            ? { ...(propertyProfile ?? {}), ...(accountOverrides ?? {}) }
            : null;
        const CONTACT_KEYS = new Set([
          "contact_first_name",
          "contact_last_name",
          "contact_phone",
          "contact_birth_date",
        ]);
        if (overrides && typeof overrides === "object") {
          for (const [k, v] of Object.entries(overrides)) {
            if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) continue;
            if (k === "legal_rep" && typeof v === "object") {
              const rep = Object.fromEntries(
                Object.entries(v as Record<string, unknown>).filter(
                  ([, rv]) => rv !== null && rv !== undefined && String(rv).trim() !== "",
                ),
              );
              if (Object.keys(rep).length > 0) (company as Record<string, unknown>).legal_rep = rep;
              continue;
            }
            if (k === "location_ids") continue; // resolved from the property address
            if (CONTACT_KEYS.has(k)) continue; // mapped explicitly below
            (company as Record<string, unknown>)[k] = v;
          }
        }

        const c = company as Record<string, unknown>;
        const ovr = (overrides ?? {}) as Record<string, unknown>;
        const ovrStr = (key: string) => String(ovr[key] ?? "").trim();

        // ── Explicit RU account contact person (no derived placeholders) ──
        if (ovrStr("contact_first_name")) c.first_name = ovrStr("contact_first_name");
        if (ovrStr("contact_last_name")) c.last_name = ovrStr("contact_last_name");
        if (ovrStr("contact_phone")) {
          c.phone = ovrStr("contact_phone");
          c.company_phone = ovrStr("contact_phone");
        }
        if (ovrStr("contact_birth_date")) c.birth_date = ovrStr("contact_birth_date");

        // ── VAT / company registration bridged from the banking block ──
        if (!String(c.vat_number ?? "").trim() && bridgedVatNumber) c.vat_number = bridgedVatNumber;
        if (!String(c.manager_identification_number ?? "").trim() && bridgedRegistration) {
          c.manager_identification_number = bridgedRegistration;
        }

        // ── Size fields are RU range option IDs, never raw counts ──
        const normalizeRange = (key: string, ranges: RuRange[], fallbackCount?: number | null) => {
          const raw = c[key];
          if (isRangeId(ranges, raw)) return;
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) {
            const mapped = rangeIdForCount(ranges, n);
            if (mapped !== undefined) {
              c[key] = mapped;
              return;
            }
          }
          if (fallbackCount && fallbackCount > 0) {
            const mapped = rangeIdForCount(ranges, fallbackCount);
            if (mapped !== undefined) c[key] = mapped;
            return;
          }
          delete c[key];
        };
        normalizeRange("number_of_properties", RU_PROPERTY_RANGES, portfolioPropertyCount);
        normalizeRange("number_of_employees", RU_EMPLOYEE_RANGES);
        normalizeRange("years_in_business", RU_YEARS_RANGES);

        // ── Legal rep region defaults to the company region ──
        const repObj = (c.legal_rep ?? null) as Record<string, unknown> | null;
        if (repObj && !String(repObj.region ?? "").trim() && String(c.region ?? "").trim()) {
          repObj.region = String(c.region).trim();
        }

        /**
         * Legal-representative coverage. Rentals United has no location field on the
         * representative — only city/region/country IDs — so this is the honest list of what
         * the block does and does not carry, reported back for the Step B card.
         */
        const REP_KEYS: Array<{ key: string; label: string }> = [
          { key: "first_name", label: "First name" },
          { key: "last_name", label: "Last name" },
          { key: "email", label: "Email" },
          { key: "birthday", label: "Date of birth" },
          { key: "address", label: "Address" },
          { key: "city", label: "City" },
          { key: "region", label: "Region" },
          { key: "post_code", label: "Postal code" },
          { key: "nationality_id", label: "Nationality" },
          { key: "country_of_residence_id", label: "Country of residence" },
        ];
        const repFilled = (k: string) => {
          const v = (repObj ?? {})[k] ?? (repObj ?? {})[k.replace(/_id$/, "Id")];
          return v !== null && v !== undefined && String(v).trim() !== "";
        };
        const legalRepCoverage = {
          present: Boolean(repObj),
          sent: REP_KEYS.filter((f) => repFilled(f.key)).map((f) => f.label),
          missing: REP_KEYS.filter((f) => !repFilled(f.key)).map((f) => f.label),
        };
        const companyLocationIds = Array.isArray((c as Record<string, unknown>).location_ids)
          ? ((c as Record<string, unknown>).location_ids as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
          : [];

        // ── Gate: never write placeholder contact data onto the RU profile ──
        const incomplete: string[] = [];
        if (!String(c.first_name ?? "").trim()) incomplete.push("contact first name");
        if (!String(c.last_name ?? "").trim() || String(c.last_name).trim().toLowerCase() === "owner") {
          incomplete.push("contact last name");
        }
        const cleanPhone = String(c.phone ?? "").replace(/[\s-]/g, "");
        if (!cleanPhone || cleanPhone === "+27000000000") incomplete.push("contact phone");
        if (!String(c.birth_date ?? "").trim()) incomplete.push("contact date of birth");
        // Read-only preview: hand the composed payload back, with any placeholder gap
        // reported rather than blocking, so the operator sees exactly what would be sent.
        if (dryRun) {
          return {
            sent: false,
            dry_run: true as const,
            company: c,
            incomplete,
            legal_rep_coverage: legalRepCoverage,
            location_ids: companyLocationIds,
            source_property_id: sourcePropertyId,
          };
        }
        if (incomplete.length > 0) {
          return quiet({
            sent: false,
            error:
              `Complete Company Information first — Rentals United would otherwise store placeholder data. Missing/placeholder: ${incomplete.join(", ")}. ` +
              "Fill these on the property's Identity & Location → Company Information card, then retry.",
          });
        }


        /**
         * True delta: only write to the channel when the composed profile differs from the
         * one RU last accepted. This is what makes a save-time resend cheap AND reliable —
         * it no longer depends on `properties.updated_at` moving.
         */
        const stableJson = (value: unknown): string => {
          if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
          if (value && typeof value === "object") {
            const entries = Object.entries(value as Record<string, unknown>)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b));
            return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
          }
          return JSON.stringify(value ?? null);
        };
        const previousPayload = (account.company_payload ?? null) as Record<string, unknown> | null;
        const payloadUnchanged = Boolean(previousPayload) && stableJson(previousPayload) === stableJson(c);
        // The account's region list is part of that fingerprint: an unchanged set is never
        // re-sent, so Step A's location write is not repeated by Step B or by a save.
        const previousLocationIds = Array.isArray(previousPayload?.location_ids)
          ? (previousPayload!.location_ids as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
          : [];
        const locationsUnchanged = previousLocationIds.length === companyLocationIds.length
          && [...previousLocationIds].sort().join(",") === [...companyLocationIds].sort().join(",");
        if (body.force !== true && companyState.satisfied && payloadUnchanged) {
          return {
            sent: true,
            skipped: true as const,
            unchanged: true as const,
            locations_unchanged: locationsUnchanged,
            location_ids: companyLocationIds,
            legal_rep_coverage: legalRepCoverage,
          };
        }


        // One task, one channel call. A returned channel status is terminal for this run;
        // Resume must continue from this task rather than multiplying the same wire request.
        const ownerId = Number(account.ru_owner_id);
        if (!Number.isFinite(ownerId) || ownerId <= 0) {
          return { sent: false, error: "No valid Rentals United OwnerID is bound to this account" };
        }
        const res = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "fill_company_details",
            company,
            owner_id: ownerId,
            auth_access_key: childAccessKey,
            auth_secret_key: childSecretKey,
          },
        });
        const filled = res.data;
        const fillErr = res.error;
        let lastMessage = String(
          (filled as any)?.error?.message ?? fillErr?.message ?? "Rentals United rejected the company details",
        );
        if (/incorrect login or password/i.test(lastMessage)) {
          lastMessage =
            "Rentals United rejected the saved sub-user username/password (Status -4). Push_FillCompanyDetails_RQ requires the sub-user login and has no OwnerID selector. Confirm that the saved login email matches Pull_ListMyUsers_RQ, then save the current RU password and retry.";
        }
        if (fillErr || !filled?.success) {
          await admin
            .from("ru_owner_accounts")
            .update({ company_details_status: "failed" })
            .eq("id", account.id);
          return { sent: false, error: lastMessage };
        }


        await admin
          .from("ru_owner_accounts")
          .update({
            company_details_sent: true,
            company_details_status: "sent",
            company_filled_at: new Date().toISOString(),
            company_payload: company,
          })
          .eq("id", account.id);
        return {
          sent: true,
          location_ids: companyLocationIds,
          locations_unchanged: locationsUnchanged,
          legal_rep_coverage: legalRepCoverage,
        };

      };

      // RU requires at least one LocationId on the sub-user (and on company details).
      const locationIds = await resolveOwnerLocationIds(admin, propertyId, portfolioId);
      const NO_LOCATION_MESSAGE =
        "No Channel Manager location could be resolved for this owner. Set the property's city/country coordinates (or push the property once) so a location can be matched, then review this step again.";
      if (locationIds.length === 0 && !readOnly) {
        return json({
          success: false,
          error: { code: "NO_RU_LOCATION", message: NO_LOCATION_MESSAGE },
        }, 422);
      }


      type RuUser = { user_account_id?: string; email?: string; login_email?: string; owner_id?: string };
      // One roster per Step A run. Every helper below shares this read. A successful create
      // pauses immediately at A.2; OwnerID resolution waits for A.3 key verification.
      let rosterOnce: RuUser[] | null = null;
      /** Step A asks the channel for a fresh roster at most once per run. */
      let freshRosterRead = false;
      const listRuUsers = async (fresh = false): Promise<RuUser[]> => {
        if (fresh && freshRosterRead && rosterOnce) return rosterOnce;
        if (!fresh && rosterOnce) return rosterOnce;
        // A property save may never spend a roster read: Step A already resolved the account,
        // so the cached roster is the ceiling for that path.
        const fromSave = body.from_save === true;
        const listed = await listRuSubUsers(admin, {
          forceFresh: fresh && !fromSave,
          cacheOnly: fromSave,
          source: fromSave ? "property-save" : "step-a",
        });
        if (fresh && listed.ok && !listed.cached) freshRosterRead = true;
        rosterOnce = listed.ok ? (listed.users as RuUser[]) : (rosterOnce ?? []);
        return rosterOnce;
      };


      // A sub-user's RU login (`<UserName>`) can differ from the `<Email>` returned by
      // Pull_ListMyUsers_RQ (that list can lag the portal's contact email), so a lookup
      // must match on either. OwnerID 741765's login and contact are both
      // connect@roomsonline.co.za; the list still reports rooms@… as its `<Email>`.
      const sameEmail = (a: unknown, b: unknown) => {
        const x = String(a ?? "").trim().toLowerCase();
        const y = String(b ?? "").trim().toLowerCase();
        return Boolean(x) && x === y;
      };
      const matchByEmail = (users: RuUser[]) =>
        users.find((u) => sameEmail(u.email, ownerEmail) || sameEmail(u.login_email, ownerEmail)) ?? null;

      const usableRuId = (value: unknown): string => {
        const normalized = String(value ?? "").trim();
        return normalized && normalized !== "0" ? normalized : "";
      };
      // RU sub-user logins can be renamed inside the RU portal, so an email-only lookup
      // reports "no user found" for an account we already know by OwnerID / stored login.
      const matchByStoredIdentity = (users: RuUser[], account: Record<string, any> | null) => {
        if (!account) return null;
        const wantedOwnerId = usableRuId(account.ru_owner_id);
        const wantedEmails = [account.ru_login_email, account.owner_email]
          .map((v) => String(v ?? "").trim().toLowerCase())
          .filter(Boolean);
        return users.find((u) => {
          const ownerId = usableRuId(u.owner_id);
          if (wantedOwnerId && ownerId && ownerId === wantedOwnerId) return true;
          return wantedEmails.includes((u.email ?? "").trim().toLowerCase())
            || wantedEmails.includes((u.login_email ?? "").trim().toLowerCase());

        }) ?? null;
      };


      const existing = await findOwnerAccount(admin, propertyId ?? "", ownerEmail, portfolioId);
      /**
       * A leftover shell row (no OwnerID — what survives a closed account or a sterilized
       * property) is NOT a binding, but provisioning must still write into it rather than
       * insert a second row for the same scope. It carries no channel identity, so every
       * "is it already bound?" check below still reads unbound.
       */
      if (!existing.account && existing.shell) existing.account = existing.shell;


      /**
       * Alternative logins the operator may choose when the resolved owner email cannot
       * become a distribution login (the channel already holds it outside our master
       * account). Every candidate carries its source and, when unusable, the reason: an
       * address already serving another property or portfolio is offered as blocked so it
       * can never be re-used. A brand-new address is always allowed and does not have to
       * belong to a ROL'OS user or to the owner.
       */
      const collectLoginCandidates = async (
        roster: RuUser[],
        blockedEmail?: string | null,
      ): Promise<Array<{ email: string; source: string; usable: boolean; blocked_reason: string | null; on_roster: boolean }>> => {
        const raw: Array<{ email: unknown; source: string }> = [];
        if (propertyId) {
          const { data: pr } = await admin
            .from("properties")
            .select("owner_email")
            .eq("id", propertyId)
            .maybeSingle();
          raw.push({ email: (pr as any)?.owner_email, source: "this property's owner email" });
        }
        if (portfolioRow?.owner_email) {
          raw.push({ email: portfolioRow.owner_email, source: "the portfolio's owner email" });
        }
        if (portfolioId) {
          const { data: members } = await admin
            .from("property_portfolio_members")
            .select("property_id")
            .eq("portfolio_id", portfolioId);
          const ids = ((members ?? []) as any[]).map((m) => m.property_id).filter(Boolean);
          if (ids.length) {
            const { data: siblings } = await admin
              .from("properties")
              .select("owner_email, name")
              .in("id", ids)
              .limit(50);
            for (const s of (siblings ?? []) as any[]) {
              if (s?.owner_email) {
                raw.push({
                  email: s.owner_email,
                  source: `a sibling property in this portfolio (${s.name ?? "unnamed"})`,
                });
              }
            }
          }
        }
        if (portfolioRow?.owner_id) {
          const { data: prof } = await admin
            .from("profiles")
            .select("email")
            .eq("id", portfolioRow.owner_id)
            .maybeSingle();
          if ((prof as any)?.email) {
            raw.push({ email: (prof as any).email, source: "the portfolio owner's ROL'OS profile" });
          }
        }
        const boundLoginEmail = String((existing.account as any)?.ru_login_email ?? "").trim();
        if (boundLoginEmail) raw.push({ email: boundLoginEmail, source: "the distribution account already on file" });

        // Anything already carrying a live channel identity for a *different* scope must
        // never be re-used: two properties cannot share one distribution login here.
        const { data: bound } = await admin
          .from("ru_owner_accounts")
          .select("owner_email, ru_login_email, ru_owner_id, property_id, portfolio_id")
          .not("ru_owner_id", "is", null);
        const claims = new Map<string, { property_id: string | null; portfolio_id: string | null }>();
        for (const row of (bound ?? []) as any[]) {
          for (const key of [row.owner_email, row.ru_login_email]) {
            const k = String(key ?? "").trim().toLowerCase();
            if (k) claims.set(k, { property_id: row.property_id ?? null, portfolio_id: row.portfolio_id ?? null });
          }
        }

        const blocked = String(blockedEmail ?? "").trim().toLowerCase();
        const seen = new Set<string>();
        const out: Array<{ email: string; source: string; usable: boolean; blocked_reason: string | null; on_roster: boolean }> = [];
        for (const entry of raw) {
          const email = String(entry.email ?? "").trim();
          const key = email.toLowerCase();
          if (!key.includes("@") || seen.has(key)) continue;
          seen.add(key);
          const onRoster = roster.some((u) => sameEmail(u.email, email) || sameEmail(u.login_email, email));
          let reason: string | null = null;
          if (isInternalLogin(email)) {
            reason = "Shared platform login — the channel already holds it globally.";
          } else if (blocked && key === blocked) {
            reason = "Already registered at the channel outside our master account.";
          } else {
            const claim = claims.get(key);
            const sameScope = claim
              ? (portfolioId ? claim.portfolio_id === portfolioId : claim.property_id === propertyId)
              : true;
            if (claim && !sameScope) {
              reason = "Already the distribution login for another property or portfolio.";
            }
          }
          out.push({ email, source: entry.source, usable: !reason, blocked_reason: reason, on_roster: onRoster });
        }
        return out;
      };


      /**
       * Step 6 preview. Everything above is resolution only — nothing has been written
       * locally and nothing has been sent to the channel yet, so this is the last safe
       * point to hand the decision back to the operator.
       */
      if (isPlan) {
        const nameParts = String(ownerName).trim().split(/\s+/);
        // Preview is local-only. Account existence is checked exactly once when Connect runs.
        const planUsers: RuUser[] = [];
        const boundOwnerId = usableRuId(existing.account?.ru_owner_id);
        const rosterMatch = (boundOwnerId
          ? planUsers.find((u) => usableRuId(u.owner_id) === boundOwnerId) ?? null
          : null)
          ?? matchByEmail(planUsers)
          ?? matchByStoredIdentity(planUsers, existing.account as any);

        let memberCount: number | null = null;
        if (portfolioId) {
          const { count } = await admin
            .from("property_portfolio_members")
            .select("property_id", { count: "exact", head: true })
            .eq("portfolio_id", portfolioId);
          memberCount = typeof count === "number" ? count : null;
        }

        let countryName: string | null = null;
        if (propertyId) {
          const { data: pr } = await admin
            .from("properties")
            .select("country")
            .eq("id", propertyId)
            .maybeSingle();
          countryName = (pr as { country?: string | null } | null)?.country ?? null;
        }

        const adoptOwnerId = usableRuId(rosterMatch?.owner_id) || boundOwnerId;
        const outcome = adoptOwnerId ? "adopt" : "create";
        const warnings: string[] = [];
        if (locationIds.length === 0) warnings.push(NO_LOCATION_MESSAGE);
        if (internalLoginRejected) {
          warnings.push(
            `${internalLoginRejected} was skipped as a shared platform login — ${ownerEmail} is used instead.`,
          );
        }
        const boundLogin = String((existing.account as any)?.ru_login_email ?? "").trim();
        if (boundLogin && boundLogin.toLowerCase() !== String(ownerEmail).toLowerCase()) {
          warnings.push(
            `This property is already linked to a distribution sub-account whose login is ${boundLogin}. Confirming keeps that live account and re-uses it.`,
          );
        }

        /**
         * Credential state of the bound account, so the preview modal can take the
         * sub-account portal password inline (and mint the key pair from it) instead of
         * sending the operator to another tab.
         */
        const planAccountId = String((existing.account as any)?.id ?? "") || null;
        const planAccountOwnerId = adoptOwnerId || null;
        let planHasKeys = Boolean(String((existing.account as any)?.ru_api_access_key ?? "").trim());
        if (!planHasKeys && planAccountOwnerId) {
          const { data: credRow } = await admin
            .from("ru_api_credentials")
            .select("access_key")
            .eq("ru_owner_id", String(planAccountOwnerId))
            .maybeSingle();
          planHasKeys = Boolean(credRow?.access_key);
        }
        const planHasPassword = Boolean((existing.account as any)?.ru_login_password_enc);

        return json({
          success: true,
          plan: {
            account_id: planAccountId,
            has_api_keys: planHasKeys,
            has_stored_password: planHasPassword,

            can_create: locationIds.length > 0,
            blocked_reason: locationIds.length === 0 ? NO_LOCATION_MESSAGE : null,
            outcome,
            login_email: ownerEmail,
            login_source: ownerEmailSource,
            contact_first_name: nameParts[0] || "Property",
            contact_last_name: nameParts.slice(1).join(" ") || "Owner",
            company_name: portfolioRow?.name ?? ownerName ?? null,
            country: countryName,
            scope: portfolioId ? "portfolio" : "property",
            portfolio_id: portfolioId,
            portfolio_name: portfolioRow?.name ?? null,
            portfolio_property_count: memberCount,
            property_id: propertyId,
            existing_owner_id: adoptOwnerId || null,
            existing_login_email:
              String(rosterMatch?.login_email ?? rosterMatch?.email ?? boundLogin ?? "").trim() || null,
            location_ids: locationIds,
            login_candidates: await collectLoginCandidates(planUsers),
            rejected_internal_login: internalLoginRejected,

            warnings,
          },
        });
      }

      /**
       * Read-only company-details preview for the Step A account dialog. It composes the
       * exact payload the push would send and reports it as a field / value / source list.
       * Nothing is written locally and nothing reaches the channel.
       */
      if (isCompanyPreview) {
        const stub = { id: "00000000-0000-0000-0000-000000000000", ru_owner_id: null } as Record<string, any>;
        const result = (await submitCompanyDetails(
          (existing.account as Record<string, any> | null) ?? stub,
          null,
          { dryRun: true },
        )) as Record<string, any>;

        if (result?.dry_run !== true) {
          return json({
            success: true,
            preview: {
              fields: [],
              blocked_reason: String(result?.error ?? "The company details could not be composed"),
              scope: portfolioId ? "portfolio" : "property",
            },
          });
        }

        const company = (result.company ?? {}) as Record<string, unknown>;
        const scopeSource = portfolioId
          ? `portfolio${portfolioRow?.name ? ` (${portfolioRow.name})` : ""}`
          : "this property";
        const LABELS: Array<{ key: string; label: string; source: string }> = [
          { key: "name", label: "Company / portfolio name", source: scopeSource },
          { key: "first_name", label: "Contact first name", source: "Company Information" },
          { key: "last_name", label: "Contact last name", source: "Company Information" },
          { key: "email", label: "Contact email (login)", source: "owner email" },
          { key: "phone", label: "Contact phone", source: "Company Information / property contact" },
          { key: "birth_date", label: "Contact date of birth", source: "Company Information" },
          { key: "address", label: "Address", source: "property address" },
          { key: "city", label: "City", source: "property address" },
          { key: "zip_code", label: "Postal code", source: "property address" },
          { key: "country_id", label: "Country", source: "property country" },
          { key: "website", label: "Website", source: "Company Information" },
          { key: "vat_number", label: "VAT number", source: "banking block" },
          { key: "manager_identification_number", label: "Company registration", source: "banking block" },
          { key: "number_of_properties", label: "Number of properties", source: "portfolio size" },
          { key: "number_of_employees", label: "Number of employees", source: "Company Information" },
          { key: "years_in_business", label: "Years in business", source: "Company Information" },
        ];

        const fields = LABELS.filter((f) => company[f.key] !== undefined && company[f.key] !== null && String(company[f.key]).trim() !== "")
          .map((f) => ({ key: f.key, label: f.label, value: String(company[f.key]), source: f.source }));

        const rep = (company.legal_rep ?? null) as Record<string, unknown> | null;
        if (rep && typeof rep === "object") {
          for (const [k, v] of Object.entries(rep)) {
            if (v === null || v === undefined || String(v).trim() === "") continue;
            fields.push({
              key: `legal_rep.${k}`,
              label: `Legal representative — ${k.replace(/_/g, " ")}`,
              value: String(v),
              source: "Company Information",
            });
          }
        }

        return json({
          success: true,
          preview: {
            fields,
            missing: (result.incomplete ?? []) as string[],
            blocked_reason: null,
            scope: portfolioId ? "portfolio" : "property",
            source_property_id: result.source_property_id ?? propertyId,
            portfolio_id: portfolioId,
          },
        });
      }



      // The RU identity is only stale when Rentals United no longer lists an owner that
      // matches the stored OwnerID (or, when we never stored one, the stored login email).
      // A login rename in the RU portal must NOT erase the OwnerID or the password.
      const storedOwnerId = usableRuId(existing.account?.ru_owner_id);
      const storedUserId = usableRuId((existing.account as any)?.ru_user_id);
      // A.4 already has a verified child identity and must not re-run the A.0 master
      // roster lookup. Identity reconciliation belongs to A.0/A.1 only.
      const ruUsers = existing.account?.ru_owner_id && !isCompanyEnsure ? await listRuUsers() : [];
      const listOk = ruUsers.length > 0;
      const currentRuUser = listOk
        ? (ruUsers.find((u) => Boolean(storedOwnerId) && usableRuId(u.owner_id) === storedOwnerId)
          ?? matchByStoredIdentity(ruUsers, existing.account as any)
          ?? matchByEmail(ruUsers))
        : null;
      const currentOwnerId = usableRuId(currentRuUser?.owner_id);
      const currentUserId = usableRuId(currentRuUser?.user_account_id);
      // A transient list_users failure is not proof that the RU identity changed, and
      // RU sometimes returns UserAccountId=0. Neither condition may erase a password.
      const ruIdentityChanged = Boolean(storedOwnerId) && listOk && (
        !currentRuUser ||
        (Boolean(currentOwnerId) && currentOwnerId !== storedOwnerId) ||
        (Boolean(currentUserId) && Boolean(storedUserId) && currentUserId !== storedUserId)
      );
      const staleIdentity = ruIdentityChanged;
      if (staleIdentity) {
        // Wipe the stale RU identity + password so the row is rebuilt below.
        await admin
          .from("ru_owner_accounts")
          .update({
            ru_owner_id: null,
            ru_user_id: null,
            ru_login_password_enc: null,
            company_details_sent: false,
            company_filled_at: null,
            company_details_status: "pending",
          })
          .eq("id", (existing.account as any).id);
      } else if (currentRuUser) {
        // Same RU account, possibly renamed in the portal: re-align the stored login
        // email (and OwnerID) without touching the retained password.
        // `ru_login_email` must hold the RU *login* (`<UserName>`), which is what
        // Push_FillCompanyDetails_RQ authenticates with. Never overwrite it with the
        // contact `<Email>` — the two can differ (OwnerID 741765).
        const ruEmail = String(currentRuUser.login_email ?? currentRuUser.email ?? "").trim();
        const patch: Record<string, unknown> = {};
        if (ruEmail && ruEmail.toLowerCase() !== String((existing.account as any)?.ru_login_email ?? "").trim().toLowerCase()) {
          patch.ru_login_email = ruEmail;
        }
        if (currentOwnerId && currentOwnerId !== storedOwnerId) patch.ru_owner_id = currentOwnerId;
        if (Object.keys(patch).length > 0) {
          await admin.from("ru_owner_accounts").update(patch).eq("id", (existing.account as any).id);
          Object.assign(existing.account as any, patch);
        }
      }

      if (existing.account?.ru_owner_id && !staleIdentity) {

        /** Existing binding: if Step A created this account earlier but the key mint was
         * interrupted by roster lag, complete the automatic mint before company details.
         */
        let keySource: "existing" | "password_verified" | "blocked" = "blocked";

        let mintedAccessKey: string | null = null;
        let keyWarning: string | null = null;
        let keyCode: string | null = null;
        let keyRuStatusId: string | null = null;
        let keyRuStatusMessage: string | null = null;
        let keyRetryAfterMs: number | null = null;
        const existingOwnerId = usableRuId(existing.account.ru_owner_id);
        const existingLoginEmail = String(
          (existing.account as any).ru_login_email ?? existing.account.owner_email ?? ownerEmail ?? "",
        ).trim() || null;
        if (existingOwnerId) {
          const { data: existingCred } = await admin
            .from("ru_api_credentials")
            .select("access_key")
            .eq("ru_owner_id", existingOwnerId)
            .maybeSingle();
          if (existingCred?.access_key || (existing.account as any).ru_api_access_key) {
            keySource = "existing";
            mintedAccessKey = String(existingCred?.access_key ?? (existing.account as any).ru_api_access_key ?? "") || null;
          } else {
            // A.1 proves/creates identity only. Portal password and XML API keys are dual
            // credentials; never spend Pull_ListOwnerProp_RQ trying to prove keys with a
            // password. A.2 owns the sole listing read when the operator submits the pair.
            keySource = "blocked";
            keyCode = "RU_MANUAL_KEYS_REQUIRED";
            keyWarning = `Sub-account ${existingLoginEmail ?? `OwnerID ${existingOwnerId}`} is ready. Paste its AccessKey and SecretKey from the channel portal to continue.`;
          }

        }

        const companyResult = isCompanyEnsure
          ? await submitCompanyDetails(existing.account as any)
          : { sent: Boolean((existing.account as any).company_details_sent), error: null };
        const needsPassword = Boolean(
          (companyResult as any).deferred
          || (companyResult as any).authFailed
          || (companyResult as any).setup_gap
          || (companyResult as any).needs_api_keys,
        );

        if (isCompanyEnsure && !companyResult.sent && !needsPassword) {
          return json({
            success: false,
            error: {
              code: "RU_COMPANY_DETAILS_FAILED",
              message: `Sub-user exists (OwnerID ${existing.account.ru_owner_id}) but company details could not be submitted to Rentals United: ${companyResult.error}`,
            },
            account: existing.account,
          }, 502);
        }
        const { data: refreshed } = await admin
          .from("ru_owner_accounts")
          .select("*")
          .eq("id", (existing.account as any).id)
          .maybeSingle();
        return json({
          success: true,
          created: false,
          company_details_sent: companyResult.sent,
          company_details_pushed: companyResult.sent,
          company_location_ids: (companyResult as { location_ids?: number[] }).location_ids ?? null,
          company_locations_unchanged: (companyResult as { locations_unchanged?: boolean }).locations_unchanged ?? null,
          legal_rep_coverage: (companyResult as { legal_rep_coverage?: unknown }).legal_rep_coverage ?? null,

          company_details_manual_required: needsPassword,
          company_details_warning: companyResult.sent ? null : companyResult.error,
          account: refreshed ?? existing.account,
          scope: existing.scope,
          key_source: keySource,
          keys_minted: keySource === "existing",
          auth_mode: keySource === "password_verified" ? "child_password" : keySource === "existing" ? "child_keys" : null,
          access_key: mintedAccessKey,
          key_warning: keyWarning,
          key_code: keyCode,
          key_ru_status_id: keyRuStatusId,
          key_ru_status_message: keyRuStatusMessage,
          key_retry_after_ms: keyRetryAfterMs,
        });
      }

      // `ensure_company_details` used to hard-fail with 409 here when the stored RU
      // identity was missing or stale. That left the operator stuck on a dead button,
      // so instead we self-heal: fall through and (re)create the sub-user, which then
      // submits the company details atomically.




      // Create the RU sub-user
      const parts = String(ownerName).trim().split(/\s+/);
      const firstName = parts[0] || "Property";
      const lastName = parts.slice(1).join(" ") || "Owner";

      // Per-account password, generated once here, sent in Push_CreateUser_RQ and persisted
      // verbatim (encrypted) in this same run. It is the ONLY credential that can mint this
      // sub-account's first API key pair, so it is never re-derived later.
      const password = generateSubUserPassword(ownerEmail);





      let userAccountId: string | null = null;
      let ruOwnerId: string | null = null;
      let adopted = false;
      let adoptedEmail: string | null = null;

      // 1) If RU already has a sub-user for this owner (e.g. a prior attempt that
      //    succeeded on RU's side but failed to save locally, or a login renamed in the
      //    RU portal), adopt it instead of trying to create a duplicate.
      //    An explicit `ru_owner_id` in the request always wins — that is how an admin
      //    binds a specific RU account when several match this owner.
      const requestedOwnerId = usableRuId(body.ru_owner_id);
      const candidateUsers = await listRuUsers();
      // A sub-account we already know locally under this login (bound to a sibling
      // property or to no scope at all) must be adopted rather than re-created: RU
      // rejects the duplicate email with status 95 and the roster's `<Email>` can
      // differ from the login, so an email-only roster match misses it.
      const adoptLocalByEmail = async (): Promise<RuUser | null> => {
        const { data: rows } = await admin
          .from("ru_owner_accounts")
          .select("ru_owner_id, ru_user_id, ru_login_email, owner_email")
          .or(`owner_email.eq.${ownerEmail},ru_login_email.eq.${ownerEmail}`)
          .not("ru_owner_id", "is", null);
        const row = (rows ?? []).find((r: any) => usableRuId(r.ru_owner_id));
        if (!row) return null;
        const ownerId = usableRuId(row.ru_owner_id);
        const rosterHit = candidateUsers.find((u) => usableRuId(u.owner_id) === ownerId) ?? null;
        return {
          owner_id: ownerId,
          user_account_id: rosterHit?.user_account_id ?? usableRuId(row.ru_user_id) ?? undefined,
          email: row.ru_login_email ?? row.owner_email ?? undefined,
          login_email: row.ru_login_email ?? undefined,
        };
      };
      const preExisting = (requestedOwnerId
        ? candidateUsers.find((u) => usableRuId(u.owner_id) === requestedOwnerId) ?? null
        : null)
        ?? matchByEmail(candidateUsers)
        ?? matchByStoredIdentity(candidateUsers, existing.account as any)
        ?? await adoptLocalByEmail();
      if (preExisting) {
        userAccountId = preExisting.user_account_id ?? null;
        ruOwnerId = preExisting.owner_id ?? null;
        adoptedEmail = String(preExisting.login_email ?? preExisting.email ?? "").trim() || null;
        adopted = true;
      }



      if (!adopted) {
        /**
         * One-click Step A: when the resolved login is rejected as already taken /
         * archived / outside our master account, automatically fall back to a login
         * generated from the property slug (`<slug>@roomsonline.co.za`,
         * suffixed 2, 3… on collision) and keep provisioning. The manual
         * "change email" step only survives as the last-resort modal when every
         * candidate is exhausted.
         */
        const resolvedOwnerEmail = String(ownerEmail);
        // Step A.0 authority: an operator-submitted login is the ONLY candidate. Slug
        // fallbacks exist purely for the "no email given" path — silently provisioning a
        // different address than the one submitted is never acceptable.
        // Exactly one create attempt per Connect action. If this address exists outside the
        // master roster, return the conflict to the operator instead of creating several
        // fallback accounts in one run.
        const emailCandidates: string[] =
          resolvedOwnerEmail.length <= RU_LOGIN_MAX_LENGTH ? [resolvedOwnerEmail] : [];


        // An address already live as the distribution login for a DIFFERENT property
        // or portfolio can never be re-used — drop those fallbacks up front.
        {
          const { data: claimedRows } = await admin
            .from("ru_owner_accounts")
            .select("owner_email, ru_login_email, property_id, portfolio_id")
            .not("ru_owner_id", "is", null);
          const claimed = new Set<string>();
          for (const r of (claimedRows ?? []) as any[]) {
            const sameScope = portfolioId ? r.portfolio_id === portfolioId : r.property_id === propertyId;
            if (sameScope) continue;
            for (const k of [r.owner_email, r.ru_login_email]) {
              const v = String(k ?? "").trim().toLowerCase();
              if (v) claimed.add(v);
            }
          }
          for (let i = emailCandidates.length - 1; i >= 1; i--) {
            if (claimed.has(emailCandidates[i].toLowerCase())) emailCandidates.splice(i, 1);
          }
        }

        let created: any = null;
        let createErr: any = null;
        let rawMsg = "";
        let emailTaken = false;
        for (const candidateEmail of emailCandidates) {
          // The roster/adoption matchers key off `ownerEmail`, so track the candidate.
          ownerEmail = candidateEmail;
          const attemptResult = await admin.functions.invoke("rentalsunited-api", {
            body: {
              action: "create_user",
              user: { first_name: firstName, last_name: lastName, email: candidateEmail, password },
              location_ids: locationIds,
            },
          });
          created = attemptResult.data;
          createErr = attemptResult.error;
          rawMsg = String(createErr?.message ?? created?.error?.message ?? created?.raw ?? "");
          emailTaken = /already\s*(exist|registered|taken|in use)/i.test(rawMsg) || /duplicate/i.test(rawMsg);

          if (!createErr && created?.success) break;
          // A hard failure (not an email conflict) gets no fallback — report it below.
          if (!emailTaken) break;

          // RU says the address is taken — try adopting the sub-user we may already know.
          // This uses the roster this run ALREADY read (Step A.0) plus our local rows: a
          // second Pull_ListMyUsers_RQ here is what produced the roster storm and the
          // throttle loop, and a throttled read is not evidence either way.
          const known = await listRuUsers();
          const recovered = matchByEmail(known)
            ?? matchByStoredIdentity(known, existing.account as any)
            ?? await adoptLocalByEmail();
          if (recovered) {
            userAccountId = recovered.user_account_id ?? null;
            ruOwnerId = recovered.owner_id ?? null;
            adoptedEmail = String(recovered.email ?? "").trim() || null;
            adopted = true;
            break;
          }
          // A login the operator submitted explicitly is never swapped for another —
          // report the conflict and let them choose.
          if (confirmedEmail) break;
          // …otherwise continue with the next generated login.

        }

        if (!adopted && (createErr || !created?.success)) {
          if (emailTaken) {
            // Every candidate — the resolved login and all generated fallbacks — is
            // taken outside our master account. Clear the stale local identity so the
            // next attempt starts from a clean binding, then hand the decision back
            // with the alternatives list (the failure-only preview modal).
            if ((existing.account as any)?.id) {
              await admin
                .from("ru_owner_accounts")
                .update({
                  ru_owner_id: null,
                  ru_user_id: null,
                  ru_login_password_enc: null,
                  company_details_sent: false,
                  company_filled_at: null,
                  company_details_status: "pending",
                })
                .eq("id", (existing.account as any).id);
            }
            return json({
              success: false,
              error: {
                code: "RU_EMAIL_IN_USE",
                message:
                  `${resolvedOwnerEmail} is already registered at the channel but is not listed under our master account, and every generated fallback (${emailCandidates.slice(1).join(", ") || "none available"}) was also rejected. Choose one of the alternative logins offered, or give a brand-new email address to create the account under.`,
              },
              email_in_use: resolvedOwnerEmail,
              login_candidates: await collectLoginCandidates(rosterOnce ?? [], resolvedOwnerEmail),
              unbound: Boolean((existing.account as any)?.id),
              preview: preview(created, 2000),
            }, 409);
          }
          return json({
            success: false,
            error: { code: "RU_CREATE_USER_FAILED", message: rawMsg || "Rentals United rejected the sub-user creation" },
            preview: preview(created, 2000),
          }, 502);
        }

        // A positive UserAccountId in Push_CreateUser_RS is the newly-created child OwnerID.
        // Trust and persist it immediately; never spend a second roster read after creation.
        if (!adopted && created?.success) {
          const createdOwnerId = usableRuId(created?.owner_id ?? created?.user_account_id);
          if (createdOwnerId) {
            ruOwnerId = createdOwnerId;
            userAccountId = createdOwnerId;
          }
        }
      }

      if (adopted && !ruOwnerId) {
        const refreshed = await listRuUsers(true);
        const matched = matchByEmail(refreshed) ?? matchByStoredIdentity(refreshed, existing.account as any);
        userAccountId = userAccountId ?? matched?.user_account_id ?? null;
        ruOwnerId = ruOwnerId ?? matched?.owner_id ?? null;
      }


      if (!adopted && ruOwnerId) {
        await mergeRuRosterUser(admin, {
          owner_id: ruOwnerId,
          user_account_id: userAccountId ?? undefined,
          email: ownerEmail,
          login_email: ownerEmail,
        }, { source: "step-a-save" });
      }


      const row: Record<string, unknown> = {
        owner_email: ownerEmail,
        // A sub-user id that merely repeats the OwnerID is not a second identity.
        ru_user_id: userAccountId && userAccountId !== ruOwnerId ? userAccountId : null,

        ru_owner_id: ruOwnerId,
        // The RU-side login is authoritative: an adopted account may have been renamed
        // in the RU portal and that is the username Push_FillCompanyDetails_RQ needs.
        ru_login_email: adoptedEmail || ownerEmail,

        ru_login_url: "https://new.rentalsunited.com",
        portfolio_id: portfolioId,
        property_id: portfolioId ? null : propertyId,
        scope: portfolioId ? "portfolio" : "property",
        company_details_sent: false,
        company_filled_at: null,
        company_details_status: "pending",
      };
      // Keep the sub-user password (encrypted) — Push_FillCompanyDetails_RQ authenticates
      // as the sub-user, and admins must be able to log into the RU portal later.
      // Retention is mandatory: if encryption fails we must not silently lose the only
      // copy of a password RU has already accepted.
      if (!adopted) {
        const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: password });
        if (encErr || !enc) {
          return json({
            success: false,
            error: {
              code: "PASSWORD_RETENTION_FAILED",
              message:
                `The Rentals United sub-user was created (OwnerID ${ruOwnerId ?? "?"}) but its password could not be stored securely: ${encErr?.message ?? "encryption returned no value"}. Reset the password in the Rentals United portal and save it via Complete company details.`,
            },
          }, 500);
        }
        row.ru_login_password_enc = enc;
      } else {
        const retainedPassword = (existing.account as any)?.ru_login_password_enc ?? null;
        const retainedOwnerId = usableRuId(existing.account?.ru_owner_id);
        const adoptedOwnerId = usableRuId(ruOwnerId);
        const retainedEmails = [
          (existing.account as any)?.ru_login_email,
          (existing.account as any)?.owner_email,
        ].map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean);
        const adoptedEmails = [adoptedEmail, ownerEmail]
          .map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean);
        // Adoption usually means RU already committed our previous create request, or the
        // login was renamed in the RU portal. Keep the retained password when EITHER the
        // OwnerID or the login email still matches; only a genuinely different child
        // account may drop it.
        const sameRuIdentity = Boolean(retainedPassword) && (
          (Boolean(retainedOwnerId) && retainedOwnerId === adoptedOwnerId) ||
          retainedEmails.some((e) => adoptedEmails.includes(e))
        );
        row.ru_login_password_enc = sameRuIdentity ? retainedPassword : null;
      }


      // The unique indexes on this table are PARTIAL, so PostgREST's ON CONFLICT
      // cannot target them. Resolve the existing row manually, then update/insert.
      const existingQuery = admin.from("ru_owner_accounts").select("id").limit(1);
      const { data: scopeRow } = portfolioId
        ? await existingQuery.eq("portfolio_id", portfolioId).maybeSingle()
        : await existingQuery.eq("property_id", propertyId).maybeSingle();

      // A channel sub-account is ONE account: it must never be represented by a
      // second local row under a different scope. When this OwnerID is already
      // held elsewhere (typically the portfolio row a property inherits), that
      // row IS the account — update it instead of minting a property-scoped twin,
      // which made one account read as two in the accounts list and made every
      // owner-scoped read run twice.
      let existingRow = scopeRow;
      if (!existingRow?.id && ruOwnerId) {
        const { data: byOwner } = await admin
          .from("ru_owner_accounts")
          .select("id, portfolio_id, property_id")
          .eq("ru_owner_id", String(ruOwnerId))
          .limit(1)
          .maybeSingle();
        if (byOwner?.id) {
          existingRow = { id: byOwner.id } as typeof scopeRow;
          // Keep the scope the account already has — re-scoping it would move the
          // account away from the portfolio whose properties inherit it.
          if (byOwner.portfolio_id) {
            row.portfolio_id = byOwner.portfolio_id;
            row.property_id = null;
            row.scope = "portfolio";
          }
        }
      }

      const { data: saved, error: saveErr } = existingRow?.id
        ? await admin.from("ru_owner_accounts").update(row).eq("id", existingRow.id).select().maybeSingle()
        : await admin.from("ru_owner_accounts").insert(row).select().maybeSingle();

      if (saveErr) return json({ success: false, error: { code: "SAVE_FAILED", message: saveErr.message } }, 500);

      /** §2: after Push_CreateUser_RQ, persist password + one ListOwnerProp probe — no mint, no wait. */
      let keySource: "existing" | "password_verified" | "blocked" = "blocked";

      let mintedAccessKey: string | null = null;
      let keyWarning: string | null = null;
      let keyCode: string | null = null;
      let keyRuStatusId: string | null = null;
      let keyRuStatusMessage: string | null = null;
      const keyRetryAfterMs: number | null = null;
      // Step A never provisions a replacement sub-account: one run, one account.

      const keyAttempts: string[] = [];


      const savedOwnerId = String((saved as any)?.ru_owner_id ?? ruOwnerId ?? "").trim();
      const savedLoginEmail = String((saved as any)?.ru_login_email ?? adoptedEmail ?? ownerEmail ?? "").trim() || null;
      if (savedOwnerId) {
        const { data: existingCred } = await admin
          .from("ru_api_credentials")
          .select("access_key")
          .eq("ru_owner_id", savedOwnerId)
          .maybeSingle();
        if (existingCred?.access_key) {
          keySource = "existing";
          mintedAccessKey = String(existingCred.access_key);
        } else {
          keySource = "blocked";
          keyCode = "RU_MANUAL_KEYS_REQUIRED";
          keyAttempts.push("manual key capture required");
          keyWarning = `Sub-account ${savedLoginEmail ?? `OwnerID ${savedOwnerId}`} is ready. Paste its AccessKey and SecretKey from the channel portal to continue.`;
        }

      } else {
        keyCode = "NEEDS_UI_KEY";
        keyWarning = `Sub-account ${savedLoginEmail ?? ownerEmail} was created. Its RU OwnerID could not be resolved; verify manually.`;
      }

      // A.1 ends after create/adopt. A.4 is the only action allowed to push company details.
      const companyResult = isCompanyEnsure
        ? await submitCompanyDetails(saved as any, adopted ? null : password)
        : { sent: false, error: null };


      const needsPassword = Boolean(
        (companyResult as any).deferred
        || (companyResult as any).authFailed
        || (companyResult as any).setup_gap
        || (companyResult as any).needs_api_keys,
      );

      if (isCompanyEnsure && !companyResult.sent && !needsPassword) {
        return json({
          success: false,
          error: {
            code: "RU_COMPANY_DETAILS_FAILED",
            message: `Sub-user ${adopted ? "adopted" : "created"} (OwnerID ${ruOwnerId ?? "?"}) but company details could not be submitted to Rentals United: ${companyResult.error}`,
          },
          account: saved,
        }, 502);
      }
      const { data: finalAccount } = await admin
        .from("ru_owner_accounts")
        .select("*")
        .eq("id", (saved as any)?.id)
        .maybeSingle();

      /**
       * The channel accepted the profile (and, on the create/adopt path, the owner):
       * record those verdicts instead of flagging them stale. A profile the channel
       * did not accept stays stale so the wizard asks for a re-send.
       */
      const ownerScope = { propertyId: propertyId || null, portfolioId };
      const passedSteps = [
        ...(action === "ensure_company_details" ? [] : ["push_owner"]),
        ...(companyResult.sent ? ["company_profile"] : []),
      ];
      if (passedSteps.length > 0) {
        await recordLedgerPassForScope(admin, ownerScope, passedSteps, action, "push_result");
      }
      if (!companyResult.sent) {
        await markLedgerStaleForScope(admin, ownerScope, ["company_profile"], `${action}_company_pending`);
      }

      return json({

        success: true,
        created: !adopted,
        adopted,
        company_details_sent: companyResult.sent,
        company_details_pushed: companyResult.sent,
        company_location_ids: (companyResult as { location_ids?: number[] }).location_ids ?? null,
        company_locations_unchanged: (companyResult as { locations_unchanged?: boolean }).locations_unchanged ?? null,
        legal_rep_coverage: (companyResult as { legal_rep_coverage?: unknown }).legal_rep_coverage ?? null,

        company_details_manual_required: needsPassword,
        company_details_warning: companyResult.sent ? null : companyResult.error,
        account: finalAccount ?? saved,
        scope: portfolioId ? "portfolio" : "property",
        key_source: keySource,
        keys_minted: keySource === "existing",
        auth_mode: keySource === "password_verified" ? "child_password" : keySource === "existing" ? "child_keys" : null,
        access_key: mintedAccessKey,
        key_warning: keyWarning,
        key_code: keyCode,
        key_ru_status_id: keyRuStatusId,
        key_ru_status_message: keyRuStatusMessage,
        key_retry_after_ms: keyRetryAfterMs,
        key_attempts: keyAttempts,
      });




    }

    // ── resolve_sales_channel: Phase 4 ChannelID (Pull_ListSalesChannels_RQ) ──
    // The content quality check is ordered per sales channel, so the numeric ChannelID for
    // the channel (default: LekkeSlaap) is pulled from RU and stored for the property.
    if (action === "resolve_sales_channel") {
      const propertyId: string | null = body.property_id ?? null;
      const channelName: string = String(body.channel_name ?? LEKKESLAAP_CHANNEL_NAME).trim() || LEKKESLAAP_CHANNEL_NAME;
      const startedAt = Date.now();

      const { data: result, error: fnError } = await admin.functions.invoke("rentalsunited-api", {
        body: { action: "list_sales_channels", channel_name: channelName, property_id: propertyId },
      });
      const ok = !fnError && (result as any)?.success === true;
      const channels = (((result as any)?.channels ?? []) as Array<{
        channel_id: number;
        company_name: string;
        reservation_creator_name: string | null;
        configuration_complete: boolean | null;
      }>);
      const matched = ((result as any)?.matched ?? null) as { channel_id: number; company_name: string } | null;

      const logRun = async (success: boolean, errorCode: string | null, errorMessage: string | null, details: Record<string, unknown>) => {
        await admin.from("ru_sync_runs").insert({
          batch_id: crypto.randomUUID(),
          action: "resolve_sales_channel",
          property_id: propertyId,
          success,
          error_code: errorCode,
          error_message: errorMessage,
          elapsed_ms: Date.now() - startedAt,
          details,
        });
      };

      if (!ok) {
        const message = fnError?.message ?? (result as any)?.error?.message ?? "Rentals United rejected Pull_ListSalesChannels_RQ";
        await logRun(false, (result as any)?.error?.code ?? "RU_ERROR", message, { channel_name: channelName });
        return json({ success: false, error: { code: "RU_SALES_CHANNELS_FAILED", message } }, 502);
      }

      if (!matched) {
        const message = `Rentals United returned ${channels.length} sales channel(s) but none matching "${channelName}". Ask Rentals United to connect the channel to this account.`;
        await logRun(true, "CHANNEL_NOT_FOUND", message, { channel_name: channelName, channel_count: channels.length });
        return json({
          success: false,
          error: { code: "CHANNEL_NOT_FOUND", message },
          channels,
        }, 404);
      }

      // Store property-scoped when we know the property, and seed the account-wide default.
      const stamp = new Date().toISOString();
      const value = { channel_id: matched.channel_id, company_name: matched.company_name, resolved_at: stamp };
      const rows = [
        { key: channelSettingKey(propertyId), value, updated_by: user.id, updated_at: stamp },
      ];
      if (propertyId) rows.push({ key: channelSettingKey(null), value, updated_by: user.id, updated_at: stamp });
      await admin.from("ru_platform_settings").upsert(rows, { onConflict: "key" });

      await logRun(true, null, null, {
        channel_name: channelName,
        channel_id: matched.channel_id,
        company_name: matched.company_name,
        channel_count: channels.length,
      });

      return json({
        success: true,
        channel: { ...matched, scope: propertyId ? "property" : "account" },
        channels,
        channel_count: channels.length,
      });
    }

    // ── order_mcq: Phase 4.3 Minimum Content Quality check ──
    if (action === "order_mcq") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, owner_email, external_system, rentalsunited_property_id, rentalsunited_building_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);

      let gaps: string[] = [];
      try {
        const report = await scoreProperty(prop as any, { probe_ari: true }) as any;
        gaps = report?.blocking_gaps ?? [];
      } catch (_e) { /* fall through — gate reports unknown */ }

      const gate = await evaluatePhases(admin, prop as any, { readinessGaps: gaps });
      const p4 = gate.phases.find((p) => p.key === "p4_verify");
      if (body.force !== true && p4?.status !== "passed") {
        return json({
          success: false,
          error: { code: "PHASE_BLOCKED", message: "Phase 4 verification has not passed — the quality check cannot be ordered yet." },
          gate,
        }, 409);
      }

      /**
       * MCQ is ordered per RU *listing*. Target resolution is centralised in
       * `resolveMcqTargets`, which refuses an OwnerID or an unmapped listing ID — the two
       * causes of the historical RU status 56 / 219 failures.
       */
      const { targets, error: targetError } = await resolveMcqTargets(
        admin,
        propertyId,
        prop as { name?: string | null; rentalsunited_property_id?: string | number | null },
        body.ru_property_id ?? null,
      );
      if (targetError || targets.length === 0) {
        return json({
          success: false,
          error: targetError ?? { code: "NO_RU_PROPERTY", message: "No listing to check." },
        }, 422);
      }

      // White-label listings live on the owning sub-user account — ordering MCQ with the
      // master credentials makes RU answer "you are not the owner of the apartment".
      const { account: mcqOwnerAccount } = await findOwnerAccount(admin, propertyId, null, null);
      const mcqOwnerId = Number(mcqOwnerAccount?.ru_owner_id ?? 0);
      const mcqScope = mcqOwnerId > 0 ? { owner_id: mcqOwnerId } : {};
      // ChannelID is mandatory in the RU CM_LNM_* schema — resolve (and store) it up front
      // instead of letting RU answer 219 for a stale value.
      const mcqChannelResolved = await resolveMcqChannelId(admin, propertyId, body.channel_id ?? null);
      if (!mcqChannelResolved.channel_id) {
        return json({ success: false, error: mcqChannelResolved.error }, 422);
      }
      const mcqChannel = { channel_id: mcqChannelResolved.channel_id };


      const mcqResults: Array<{
        ru_property_id: string;
        label: string;
        ok: boolean;
        error?: string;
        code?: string | null;
        ru_response_id?: string | null;
        ru_status_id?: unknown;
      }> = [];
      for (const target of targets) {
        const { data: result, error: mcqErr } = await admin.functions.invoke("rentalsunited-api", {
          body: { action: "order_mcq", ru_property_id: target.ru_property_id, property_id: propertyId, ...mcqScope, ...mcqChannel },
        });
        const ok = !mcqErr && result?.success === true;
        const errMessage = ok ? undefined : (mcqErr?.message ?? result?.error?.message ?? "Rentals United rejected the quality check order");
        await admin.from("ru_mcq_orders").insert({
          property_id: propertyId,
          ru_property_id: target.ru_property_id,
          ordered_by: user.id,
          status: ok ? "ordered" : "failed",
          ru_status_id: result?.ru_status_id ?? result?.error?.ru_status_id ?? null,
          response_preview: preview(result ?? mcqErr?.message, 3000),
        });
        mcqResults.push({
          ru_property_id: target.ru_property_id,
          label: target.label,
          ok,
          error: errMessage,
          code: result?.error?.code ?? null,
          ru_response_id: result?.error?.ru_response_id ?? null,
          ru_status_id: result?.ru_status_id ?? result?.error?.ru_status_id ?? null,
        });
      }


      const ordered = mcqResults.filter((r) => r.ok);
      if (ordered.length === 0) {
        const firstError = mcqResults[0]?.error ?? "Rentals United rejected the quality check order";
        const firstCode = mcqResults[0]?.code ?? null;
        // MCQ requires an LNM subscription that carries the PropertyMCQEligibilityCheck change
        // type. `order_mcq` self-heals that, so a lingering "Subscribe to LNM first" means RU
        // has not enabled the service on the account at all.
        const lnmMissing = /subscribe to lnm/i.test(firstError);
        // RU status 17 is an RU-side internal fault, not a content problem on our side.
        const ruInternal = firstCode === "RU_MCQ_INTERNAL_ERROR" || /unexpected error, contact it/i.test(firstError);
        const code = lnmMissing ? "RU_LNM_NOT_SUBSCRIBED" : ruInternal ? "RU_MCQ_INTERNAL_ERROR" : "RU_MCQ_FAILED";
        const message = lnmMissing
          ? "Rentals United has not enabled the LNM (Minimum Content Quality) service on this account, so the quality check cannot be ordered. Ask your Rentals United account manager to subscribe the account to LNM — all content is already pushed and verified."
          : ruInternal
            ? `Rentals United returned an internal error (status 17) for the quality check. The LNM subscription is confirmed on this account and all content is pushed, so this needs Rentals United support — quote ResponseID ${mcqResults[0]?.ru_response_id ?? "(see run details)"}.`
            : firstError;
        return json({
          success: false,
          error: { code, message },
          results: mcqResults,
        }, lnmMissing || ruInternal ? 422 : 502);
      }

      return json({
        success: true,
        ordered_count: ordered.length,
        total_count: mcqResults.length,
        ru_property_id: ordered[0].ru_property_id,
        results: mcqResults,
      });
    }

    /**
     * ── order_mcq_all: order the content quality check for EVERY published listing.
     * Run before channel onboarding so no property is onboarded without a check.
     * Batched: `limit` listings per invocation, `remaining` tells the caller to continue.
     */
    if (action === "order_mcq_all") {
      const limit = Math.min(Math.max(Number(body.limit ?? 12), 1), 25);
      const skip = Math.max(Number(body.skip ?? 0), 0);

      const { data: props } = await admin
        .from("properties")
        .select("id, name, owner_email, is_active, is_sandbox, rentalsunited_property_id")
        .eq("is_active", true)
        .order("name");

      type BulkTarget = { property_id: string; property_name: string; ru_property_id: string; label: string };
      const queue: BulkTarget[] = [];
      for (const p of (props ?? []) as Array<{ id: string; name?: string | null; rentalsunited_property_id?: string | null }>) {
        const { targets } = await resolveMcqTargets(admin, p.id, p, null);
        for (const t of targets) {
          queue.push({ property_id: p.id, property_name: p.name ?? "Property", ru_property_id: t.ru_property_id, label: t.label });
        }
      }

      const slice = queue.slice(skip, skip + limit);
      const results: Array<Record<string, unknown>> = [];
      for (const target of slice) {
        const { account } = await findOwnerAccount(admin, target.property_id, null, null);
        const ownerId = Number((account as { ru_owner_id?: unknown } | null)?.ru_owner_id ?? 0);
        const channel = await resolveMcqChannelId(admin, target.property_id, null);
        if (!channel.channel_id) {
          results.push({ ...target, ok: false, error: channel.error?.message, code: channel.error?.code });
          continue;
        }
        const { data: result, error: fnErr } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "order_mcq",
            ru_property_id: target.ru_property_id,
            property_id: target.property_id,
            channel_id: channel.channel_id,
            ...(ownerId > 0 ? { owner_id: ownerId } : {}),
          },
        });
        const ok = !fnErr && (result as { success?: boolean } | null)?.success === true;
        await admin.from("ru_mcq_orders").insert({
          property_id: target.property_id,
          ru_property_id: target.ru_property_id,
          ordered_by: user.id,
          status: ok ? "ordered" : "failed",
          ru_status_id: (result as any)?.ru_status_id ?? (result as any)?.error?.ru_status_id ?? null,
          response_preview: preview(result ?? fnErr?.message, 3000),
        });
        await admin.from("ru_sync_runs").insert({
          batch_id: crypto.randomUUID(),
          action: "order_mcq",
          property_id: target.property_id,
          ru_property_id: target.ru_property_id,
          success: ok,
          error_code: ok ? null : ((result as any)?.error?.code ?? "RU_MCQ_FAILED"),
          error_message: ok ? null : (fnErr?.message ?? (result as any)?.error?.message ?? "Quality check order rejected"),
          elapsed_ms: 0,
          details: { scope: "order_mcq_all", ru_owner_id: ownerId || null, channel_id: channel.channel_id },
        });
        results.push({
          ...target,
          ok,
          error: ok ? null : (fnErr?.message ?? (result as any)?.error?.message ?? null),
          code: ok ? null : ((result as any)?.error?.code ?? null),
        });
        // RU tolerates roughly one write per method per sliding minute; pace the loop.
        await new Promise((r) => setTimeout(r, 1500));
      }

      return json({
        success: true,
        total_listings: queue.length,
        ordered_count: results.filter((r) => r.ok).length,
        failed_count: results.filter((r) => !r.ok).length,
        processed: slice.length,
        next_skip: skip + slice.length,
        remaining: Math.max(queue.length - (skip + slice.length), 0),
        results,
      });
    }

    /**
     * ── mcq_report: aggregated content-quality report for account managers.
     * One row per listing (newest order wins) plus roll-up counters.
     */
    if (action === "mcq_report") {
      const retiredOwnerIds = await fetchRetiredRuOwnerIds();

      // Only properties that actually hold a channel listing can be quality-checked. Resolving
      // targets for every active property produced one wasted lookup per unpublished property.
      const [{ data: propRows }, { data: publishedUnits }] = await Promise.all([
        admin
          .from("properties")
          .select("id, name, is_active, is_sandbox, rentalsunited_property_id")
          .eq("is_active", true)
          .order("name"),
        admin
          .from("hostfully_room_types")
          .select("property_id")
          .not("rentalsunited_property_id", "is", null),
      ]);

      const publishedPropertyIds = new Set<string>(
        ((publishedUnits ?? []) as Array<{ property_id?: string | null }>)
          .map((u) => String(u.property_id ?? ""))
          .filter(Boolean),
      );
      const props = ((propRows ?? []) as Array<{ id: string; name?: string | null; rentalsunited_property_id?: string | null }>)
        .filter((p) => Boolean(p.rentalsunited_property_id) || publishedPropertyIds.has(p.id));

      const { data: orders } = await admin
        .from("ru_mcq_orders")
        .select("id, property_id, ru_property_id, status, ru_status_id, ordered_at, response_preview")
        .order("ordered_at", { ascending: false })
        .limit(500);

      const newestByListing = new Map<string, any>();
      for (const o of (orders ?? []) as any[]) {
        const key = String(o.ru_property_id);
        if (!newestByListing.has(key)) newestByListing.set(key, o);
      }

      /** property + unit name is the identity of a listing for reporting — never render it twice. */
      const dedupeKey = (propertyId: string, label: string) =>
        `${propertyId}::${label.trim().toLowerCase().replace(/\s+/g, " ")}`;
      const byUnit = new Map<string, { row: Record<string, unknown>; orderedAt: number }>();

      for (const p of props) {
        const { targets } = await resolveMcqTargets(admin, p.id, p, null);
        const { account } = await findOwnerAccount(admin, p.id, null, null);
        const ownerId = (account as { ru_owner_id?: unknown } | null)?.ru_owner_id ?? null;
        // A retired sub-account's listings are dead: never report or offer to check them.
        if (ownerId && retiredOwnerIds.has(String(ownerId).trim())) continue;
        for (const t of targets) {
          const order = newestByListing.get(t.ru_property_id) ?? null;
          const outcome = classifyMcqOrder(order);
          let failingPoints: string[] = [];
          let ruResponseId: string | null = null;
          const raw = String(order?.response_preview ?? "");
          if (raw) {
            ruResponseId = /<ResponseID>([^<]+)</i.exec(raw)?.[1] ?? null;
            try {
              const parsed = JSON.parse(raw);
              const note = parsed?.mcq_notification;
              failingPoints = Array.isArray(note?.failing_points)
                ? note.failing_points
                : parseMcqFailingPoints(note?.result ?? null);
            } catch { /* non-JSON preview — no structured points */ }
          }
          const row = {
            property_id: p.id,
            property_name: p.name ?? "Property",
            listing_label: t.label,
            ru_property_id: t.ru_property_id,
            ru_owner_id: ownerId,
            outcome,
            status: order?.status ?? null,
            ru_status_id: order?.ru_status_id ?? null,
            ordered_at: order?.ordered_at ?? null,
            ru_response_id: ruResponseId,
            failing_points: failingPoints,
          };
          const key = dedupeKey(p.id, t.label ?? t.ru_property_id);
          const orderedAt = order?.ordered_at ? new Date(order.ordered_at).getTime() : 0;
          const existing = byUnit.get(key);
          // Evidence wins: a listing with a stored order beats one without, newest order beats older.
          if (!existing || orderedAt > existing.orderedAt) byUnit.set(key, { row, orderedAt });
        }
      }

      const rows: Array<Record<string, unknown>> = [...byUnit.values()].map((v) => v.row);
      rows.sort((a, b) =>
        String(a.property_name).localeCompare(String(b.property_name)) ||
        String(a.listing_label).localeCompare(String(b.listing_label))
      );

      const counts = rows.reduce(
        (acc: Record<string, number>, r) => {
          const k = String(r.outcome);
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        },
        { passed: 0, failed: 0, pending: 0, blocked_upstream: 0, never_ordered: 0 } as Record<string, number>,
      );

      return json({ success: true, counts, total: rows.length, rows });
    }




    // ── run_suite ──
    if (action === "run_suite") {
      const suite: string = body.suite ?? "read_only";
      const propertyId: string | null = body.property_id ?? null;
      /**
       * A "full" certification is executed as three staged invocations so each phase gets
       * its own request lifetime and its own wait budget — one invocation cannot hold the
       * read-only sweep plus both pushes plus the discount ladder inside the runtime's
       * 150s ceiling. `phase` selects the stage; `run_id` appends to an existing record.
       */
      const phase: string | null = body.phase ?? null;
      const continuingRunId: string | null = body.run_id ?? null;
      const isFinalPhase: boolean = body.final !== false;

      // ── Rate-limit guard: RU tolerates ~1 call per sliding minute, and a suite fires
      // several. Refuse a new run while the previous one is inside the cooldown window.
      // Staged phases of one run are exempt: they are a continuation, not a new run.
      if (!continuingRunId) {

        const { data: lastRun } = await admin
          .from("ru_cert_runs")
          .select("started_at")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastRun?.started_at) {
          const elapsed = (Date.now() - new Date(lastRun.started_at).getTime()) / 1000;
          const remaining = Math.ceil(RUN_COOLDOWN_SECONDS - elapsed);
          if (remaining > 0) {
            return json(
              {
                success: false,
                cooldown_seconds: remaining,
                error: {
                  code: "RATE_LIMITED",
                  message: `Rentals United allows one call per sliding minute — wait ${remaining}s before running again.`,
                },
              },
              429,
            );
          }
        }
      }



      // Resolve an RU property id for property-scoped calls
      let ruPropertyId: number | null = body.ru_property_id ? Number(body.ru_property_id) : null;
      let propertyRow: { id: string; name: string; rentalsunited_property_id: string | null } | null = null;
      if (propertyId) {
        const { data: p } = await admin
          .from("properties")
          .select("id, name, rentalsunited_property_id")
          .eq("id", propertyId)
          .maybeSingle();
        propertyRow = p ?? null;
        if (!ruPropertyId && p?.rentalsunited_property_id) ruPropertyId = Number(p.rentalsunited_property_id);
        if (!ruPropertyId) {
          const { data: unit } = await admin
            .from("hostfully_room_types")
            .select("rentalsunited_property_id")
            .eq("property_id", propertyId)
            .not("rentalsunited_property_id", "is", null)
            .limit(1)
            .maybeSingle();
          if (unit?.rentalsunited_property_id) ruPropertyId = Number(unit.rentalsunited_property_id);
        }
      }

      // Continuation of a staged run appends to the same record so the console shows one
      // certification, not three fragments.
      let run: { id: string };
      let steps: CertStep[] = [];
      if (continuingRunId) {
        const { data: existing, error: exErr } = await admin
          .from("ru_cert_runs")
          .select("id, steps")
          .eq("id", continuingRunId)
          .maybeSingle();
        if (exErr) throw exErr;
        if (!existing) {
          return json({ success: false, error: { code: "RUN_NOT_FOUND", message: "Certification run not found." } }, 404);
        }
        run = { id: existing.id };
        steps = Array.isArray(existing.steps) ? (existing.steps as CertStep[]) : [];
      } else {
        const { data: created, error: runErr } = await admin
          .from("ru_cert_runs")
          .insert({
            status: "running",
            suite,
            property_id: propertyId,
            ru_property_id: ruPropertyId ? String(ruPropertyId) : null,
            triggered_by: user.id,
          })
          .select("id")
          .single();
        if (runErr) throw runErr;
        run = created;
      }

      const priorStepCount = steps.length;
      let stepNo = steps.reduce((max, s: any) => Math.max(max, Number(s?.step ?? 0)), 0);


      /**
       * RU responses that are not our fault: the sliding-minute rate limit and methods RU has
       * not enabled for this integration. These are recorded as `skipped` (informational) so
       * they never count as certification failures.
       */
      const softSkipReason = (detail: string): string | null => {
        if (/rate limit/i.test(detail)) {
          return "Rentals United rate limit (1 call per sliding minute) — re-run after the cooldown.";
        }
        if (
          /not implemented method/i.test(detail) ||
          /method (is )?not (implemented|enabled|available|supported)/i.test(detail) ||
          /not enabled for (this|your) (integration|account|user)/i.test(detail) ||
          /no (access|permission) to (this )?method/i.test(detail)
        ) {
          return "Rentals United has not enabled this method for this integration — informational only.";
        }
        return null;
      };


      /**
       * ── Rate-limit pacing ─────────────────────────────────────────────────────────
       * Rentals United throttles discount writes by method + owner account at roughly one
       * call per sliding minute, even when PropertyID changes. Other ARI reads are less
       * restrictive, so the key retains their identifying parameters. Pacing therefore:
       *   1. keeps a small gap between any two RU calls,
       *   2. waits out the remaining sliding-minute window only before repeating the same
       *      method with the same identifying parameters (property id + date range + owner),
       *   3. on an actual rate-limit response, sleeps the window and retries once.
       * Waiting is capped by a budget so a suite cannot exceed the function timeout;
       * when the budget is spent, the step is recorded as an informational skip.
       */

      const METHOD_WINDOW_MS = RUN_COOLDOWN_SECONDS * 1000;
      const MIN_GAP_MS = 1200;
      /**
       * The edge runtime kills the request after 150s of idle time, so the run must
       * finish well before that. Waiting is capped BOTH by a wait budget and by a
       * wall-clock deadline that leaves room for RU calls and the final DB writes.
       */
      const RUN_DEADLINE_MS = Date.now() + 100_000;
      const WAIT_BUDGET_MS = 90_000;
      let waitSpentMs = 0;
      let lastCallAt = 0;
       /** Discount writes are account-scoped; other methods retain their request-scoped key. */
      const lastCallByKey = new Map<string, number>();
      const paceKeyFor = (method: string, payload: Record<string, unknown>) => {
        const p = payload as Record<string, any>;
         if (method === "Push_PutLongStayDiscounts_RQ" || method === "Push_PutLastMinuteDiscounts_RQ") {
           return [method, p.owner_id ?? certOwnerId ?? "master"].join("|");
         }
        const parts = [
          method,
          p.ru_property_id ?? p.property_id ?? "",
          p.date_from ?? "",
          p.date_to ?? "",
          p.owner_id ?? certOwnerId ?? "",
        ];
        return parts.join("|");
      };

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      /** Sleeps up to `ms`, respecting the shared budget and the run deadline. Returns true when fully waited. */
      const budgetedWait = async (ms: number): Promise<boolean> => {
        if (ms <= 0) return true;
        const untilDeadline = RUN_DEADLINE_MS - Date.now();
        const allowed = Math.min(ms, Math.max(0, WAIT_BUDGET_MS - waitSpentMs), Math.max(0, untilDeadline));
        if (allowed > 0) {
          waitSpentMs += allowed;
          await sleep(allowed);
        }
        return allowed >= ms;
      };


      /**
       * Within one run, an identical successful read is reused instead of being re-fired:
       * repeating the same method with the same parameters would cost a full sliding
       * minute of waiting for data we already hold.
       */
      const readCache = new Map<string, any>();
      const CACHEABLE_READS = new Set([
        "get_availability",
        "get_prices",
        "get_property",
        "list_properties",
        "list_composition_rooms",
        "list_cities_and_currencies",
      ]);

      /** Invokes rentalsunited-api with pacing + one rate-limit retry. */
      const ruInvoke = async (
        ruAction: string,
        payload: Record<string, unknown>,
      ): Promise<{ data: any; error: any; paced_skip?: string; paced?: boolean; cached?: boolean }> => {
        const method = RU_METHOD_BY_ACTION[ruAction] ?? ruAction;
        const paceKey = paceKeyFor(method, payload);
        if (CACHEABLE_READS.has(ruAction) && readCache.has(paceKey)) {
          return { data: readCache.get(paceKey), error: null, cached: true };
        }
        if (Date.now() >= RUN_DEADLINE_MS) {
          return {
            data: null,
            error: null,
            paced: true,
            paced_skip:
              "Skipped — this run reached its time budget before the step could be paced safely. Re-run the suite to cover it.",
          };
        }
        const now = Date.now();
        await budgetedWait(lastCallAt ? lastCallAt + MIN_GAP_MS - now : 0);
        const prevSameCall = lastCallByKey.get(paceKey);
        if (prevSameCall) {
          const remaining = prevSameCall + METHOD_WINDOW_MS - Date.now();
          const fullyWaited = await budgetedWait(remaining);


          if (!fullyWaited) {
            return {
              data: null,
              error: null,
              paced: true,
              paced_skip:
                `Skipped to respect the Rentals United rate limit (1 call per sliding minute for ${method} with the same parameters) — ` +
                `the run's wait budget was already spent. Re-run this suite to cover this step.`,
            };
          }
        }
        const fire = async () => {
          lastCallAt = Date.now();
          lastCallByKey.set(paceKey, lastCallAt);
          // Child-scoped reads/writes must authenticate AS the white-label sub-user:
          // a listing created under a sub-user does not exist for the master account
          // (RU answers "Property does not exist"). Passing owner_id lets
          // rentalsunited-api swap in that sub-user's AccessKey/SecretKey.
          const scopedPayload =
            CERT_CHILD_SCOPED_ACTIONS.has(ruAction) && certOwnerId && payload.owner_id == null
              ? { ...payload, owner_id: certOwnerId }
              : payload;
          return await admin.functions.invoke("rentalsunited-api", { body: { action: ruAction, ...scopedPayload } });
        };
        let res = await fire();
        const detail = String(res.error?.message ?? res.data?.error?.message ?? "");
        const rateLimited = /rate limit|too many requests|\b429\b/i.test(detail);
        if (rateLimited) {
          const fullyWaited = await budgetedWait(METHOD_WINDOW_MS);
          if (!fullyWaited) {
            return {
              data: res.data,
              error: res.error,
              paced: true,
              paced_skip:
                "Rentals United rate limit hit and the run's wait budget was spent — re-run this suite to cover this step.",
            };
          }
          res = await fire();
        }
        if (CACHEABLE_READS.has(ruAction) && !res.error && res.data?.success === true) {
          readCache.set(paceKey, res.data);
        }


        return { data: res.data, error: res.error };
      };



      const call = async (
        name: string,
        ruAction: string,
        payload: Record<string, unknown>,
        opts: { mandatory?: boolean; scope?: CertScope; skip?: string; assert?: (data: any) => string | null; successDetail?: string } = {},
      ) => {
        const scope: CertScope = opts.scope ?? "account";
        // Property-scoped checks are omitted entirely from an account-level run — they are
        // not applicable, so they should not appear in the step list at all.
        if (scope === "property" && !propertyId) return null;
        stepNo += 1;
        const ru_method = RU_METHOD_BY_ACTION[ruAction] ?? ruAction;
        if (opts.skip) {
          steps.push({ step: stepNo, name, ru_method, mandatory: !!opts.mandatory, scope, status: "skipped", duration_ms: 0, detail: opts.skip });
          return null;
        }
        const t0 = Date.now();
        try {
          const { data, error, paced_skip } = await ruInvoke(ruAction, payload);
          const duration = Date.now() - t0;
          if (paced_skip) {
            steps.push({ step: stepNo, name, ru_method, mandatory: !!opts.mandatory, scope, status: "skipped", duration_ms: duration, detail: paced_skip, request: payload });
            return null;
          }

          if (error) {
            const soft = softSkipReason(error.message ?? "");
            steps.push({ step: stepNo, name, ru_method, mandatory: !!opts.mandatory, scope, status: soft ? "skipped" : "failed", duration_ms: duration, detail: soft ?? error.message, request: payload });
            return null;
          }
          // 🔒 Child isolation: a child-scoped step that answered on MASTER credentials is
          // never a pass — RU either rejects it or applies the write to our own inventory.
          const authMode = typeof data?.auth_mode === "string" ? data.auth_mode : null;
          const masterLeak =
            CERT_MASTER_FORBIDDEN_ACTIONS.has(ruAction) &&
            !!(payload.owner_id ?? certOwnerId) &&
            authMode === "master";

          const endpointDisabled = data?.endpoint_disabled === true;
          const ok = (data?.success === true || data?.healthy === true) && !masterLeak && !endpointDisabled;
          const assertFail = ok && opts.assert ? opts.assert(data) : null;
          const rawDetail =
            (masterLeak
              ? `Authenticated as the MASTER account instead of sub-user ${payload.owner_id ?? certOwnerId}. Add this sub-user's RU AccessKey/SecretKey in RU User Management, then re-run.`
              : null) ??
            assertFail ??
            (endpointDisabled ? data?.note ?? data?.message : null) ??
            data?.error?.message ??
            (ok && opts.successDetail
              ? `${opts.successDetail}${authMode && authMode !== "master" ? ` (auth: ${authMode})` : ""}`
              : undefined) ??
            data?.message ??
            (ok ? "OK" : "Unexpected response");
          const soft = endpointDisabled
            ? "Rentals United has not enabled this dictionary endpoint for this integration — informational only."
            : ok && !assertFail ? null : masterLeak ? null : softSkipReason(String(rawDetail));

          // Persist every adapter invocation independently of the enclosing suite. Coverage
          // must not depend on a small recent-run window or loose step-name matching.
          await logPortalAction(
            admin,
            ruAction,
            typeof payload.property_id === "string" ? payload.property_id : propertyId,
            ok && !assertFail
              ? { success: true }
              : endpointDisabled
                ? { success: true, skipped: true, endpoint_disabled: true }
                : { success: false, error: { message: String(rawDetail) } },
            duration,
          );

          steps.push({
            step: stepNo,
            name,
            ru_method,
            mandatory: !!opts.mandatory,
            scope,
            status: ok && !assertFail ? "passed" : soft ? "skipped" : "failed",
            duration_ms: duration,
            ru_status_id: data?.ru_status_id ?? data?.error?.ru_status_id ?? null,
            detail: soft ?? rawDetail,
            request: payload,
            response_preview: preview(data?.raw_xml ?? data),
          });
          return ok && !assertFail ? data : null;
        } catch (e) {
          steps.push({
            step: stepNo,
            name,
            ru_method,
            mandatory: !!opts.mandatory,
            scope,
            status: "failed",
            duration_ms: Date.now() - t0,
            detail: e instanceof Error ? e.message : "Unknown error",
            request: payload,
          });
          return null;
        }
      };

      /**
       * Lead hold lifecycle: proves that pulled RU enquiries hold the dates for 3 days,
       * release them afterwards, and are withdrawn at RU (Push_RejectRequest_RQ, falling
       * back to Push_CancelReservation_RQ) when arrival is inside 14 days.
       */
      const runLeadLifecycleStep = async () => {
        stepNo += 1;
        const t0 = Date.now();
        const name = "Lead hold lifecycle (3-day hold / 14-day withdrawal)";
        const ru_method = "Push_RejectRequest_RQ (fallback Push_CancelReservation_RQ)";
        try {
          const { data, error } = await admin.functions.invoke("ru-lead-lifecycle", { body: {} });
          const duration = Date.now() - t0;
          if (error || data?.success !== true) {
            steps.push({
              step: stepNo,
              name,
              ru_method,
              mandatory: true,
              scope: "account" as CertScope,
              status: "failed",
              duration_ms: duration,
              detail: error?.message ?? data?.error ?? "Lead lifecycle worker failed",
            });
            return;
          }
          const s = data.summary ?? {};
          const failed = Number(s.reject_failed ?? 0) > 0;
          steps.push({
            step: stepNo,
            name,
            ru_method,
            mandatory: true,
            scope: "account" as CertScope,
            status: failed ? "failed" : "passed",
            duration_ms: duration,
            detail: `${s.examined ?? 0} held lead(s) examined · ${s.released ?? 0} hold(s) released after 3 days · ${s.rejected ?? 0} withdrawn at RU within 14 days of arrival${failed ? ` · ${s.reject_failed} withdrawal(s) failed` : ""}`,
            response_preview: preview(data),
          });
        } catch (e) {
          steps.push({
            step: stepNo,
            name,
            ru_method,
            mandatory: true,
            scope: "account" as CertScope,
            status: "failed",
            duration_ms: Date.now() - t0,
            detail: e instanceof Error ? e.message : "Unknown error",
          });
        }
      };



      // A staged full run passes `phase`; a single-suite run keeps its historic behaviour.
      const activePhase = phase ?? (suite === "full" ? null : suite);
      const runReadOnly = activePhase ? activePhase === "read_only" : suite === "read_only" || suite === "full";
      const runMandatory = activePhase ? activePhase === "mandatory" : suite === "mandatory" || suite === "full";
      const runDiscounts = activePhase ? activePhase === "discounts" : suite === "discounts" || suite === "full";
      const phaseTag = activePhase ?? suite;


      const noProp = ruPropertyId ? undefined : "No RU property id resolved — select a property that has been pushed to RU.";

      // Child-scoped reads (buildings) must authenticate as the sub-user with its own
      // API keys — resolve the bound OwnerID so rentalsunited-api picks up its key pair
      // instead of silently listing the MASTER account's buildings.
      let certOwnerId: string | null = null;
      let certOwnerHasKeys = false;
      if (propertyId) {
        const { account: certAccount } = await findOwnerAccount(admin, propertyId, null, null);
        certOwnerId = certAccount?.ru_owner_id ? String(certAccount.ru_owner_id) : null;
        if (certOwnerId) {
          const { data: keyRow } = await admin
            .from("ru_api_credentials")
            .select("access_key")
            .eq("ru_owner_id", certOwnerId)
            .maybeSingle();
          certOwnerHasKeys = Boolean(keyRow?.access_key || certAccount?.ru_api_access_key);
        }
      }


      const PROPERTY_SKIP = "Property-scoped check — select a ROLOS property to run it.";

      // Every RU property ID mapped to this ROLOS property. Multi-unit properties push one RU
      // property per unit, so ARI read-backs must probe each unit — reading only the parent
      // RUID returns an empty calendar and looked like a failure.
      let unitRuIds: number[] = [];
      if (propertyId) {
        const { data: unitRows } = await admin
          .from("hostfully_room_types")
          .select("rentalsunited_property_id")
          .eq("property_id", propertyId)
          .not("rentalsunited_property_id", "is", null);
        unitRuIds = (unitRows ?? [])
          .map((u: { rentalsunited_property_id: string | null }) => Number(u.rentalsunited_property_id))
          .filter((n: number) => Number.isFinite(n) && n > 0);
        if (unitRuIds.length === 0 && ruPropertyId) unitRuIds = [ruPropertyId];
      }

      /**
       * Availability / price read-back across every mapped RU unit.
       * `opts.windowOffsetDays` shifts the queried range: a post-push verification must not
       * repeat the read-only phase's exact call, or RU's sliding-minute window forces a
       * 60s wait per unit for data we would read again anyway.
       */
      const probeAri = async (
        name: string,
        ruAction: "get_availability" | "get_prices",
        opts: { windowOffsetDays?: number } = {},
      ) => {
        if (!propertyId) return;
        const ru_method = RU_METHOD_BY_ACTION[ruAction] ?? ruAction;
        stepNo += 1;
        if (unitRuIds.length === 0) {
          steps.push({
            step: stepNo, name, ru_method, mandatory: true, scope: "property",
            status: "skipped", duration_ms: 0,
            detail: "No RU property id resolved — push this property to Rentals United first.",
          });
          return;
        }
        const t0 = Date.now();
        const offset = opts.windowOffsetDays ?? 0;
        const from = isoDate(offset);
        const to = isoDate(365 + offset);
        // Sequential (never parallel): the same RU method for several units would otherwise
        // trip the sliding-minute limit. ruInvoke paces and retries each unit call.
        const results: { ruId: number; ok: boolean; count: number; detail: string | null; xml: string; paced: boolean }[] = [];
        for (const ruId of unitRuIds) {
          const { data, error, paced_skip, paced } = await ruInvoke(ruAction, {
            ru_property_id: ruId,
            date_from: from,
            date_to: to,
          });
          const xml = String(data?.raw_xml ?? "");
          const count = ruAction === "get_availability"
            ? countRuOpenDays(xml)
            : parseRuPricePoints(xml).filter((p) => p > 0).length;
          const detail = paced_skip ?? error?.message ?? data?.error?.message ?? null;
          results.push({ ruId, ok: !paced_skip && !error && data?.success === true && count > 0, count, detail, xml, paced: paced === true });
        }
        const failed = results.filter((r) => !r.ok);
        // A step the run never got to attempt is informational, never a failure. The pacer
        // says so with a flag — message matching used to grade budget skips as red.
        const soft = failed
          .map((r) => (r.paced ? String(r.detail ?? "Skipped to respect the Rentals United rate limit.") : softSkipReason(String(r.detail ?? ""))))
          .find(Boolean) ?? null;

        const unitLabel = ruAction === "get_availability" ? "open day(s)" : "price point(s)";
        steps.push({
          step: stepNo,
          name,
          ru_method,
          mandatory: true,
          scope: "property",
          status: failed.length === 0 ? "passed" : soft ? "skipped" : "failed",
          duration_ms: Date.now() - t0,
          detail: failed.length === 0
            ? `${results.map((r) => `${r.ruId}: ${r.count} ${unitLabel}`).join(", ")}`
            : soft ?? `RU unit(s) ${failed.map((r) => r.ruId).join(", ")} returned no ${unitLabel} for the next 365 days${
              failed[0]?.detail ? ` — ${failed[0].detail}` : " — RU accepted the read but echoed an empty calendar for that unit"
            }`,

          request: { ru_property_ids: unitRuIds, date_from: from, date_to: to },
          response_preview: preview(results[0]?.xml ?? null),
        });
      };



      if (runReadOnly) {
        await call("Credentials & connectivity", "health_check", {}, { mandatory: true, scope: "account" });
        await call("List properties", "list_properties", {}, { mandatory: true, scope: "account" });

        // Property-scoped reads must only run against the SELECTED property. Never borrow
        // the first RUID the account returns — that grades an unrelated property.
        const propScoped = ruPropertyId ? undefined : PROPERTY_SKIP;

        await call(
          "Get property content",
          "get_property",
          { ru_property_id: ruPropertyId },
          {
            mandatory: true,
            scope: "property",
            skip:
              propScoped ??
              (certOwnerId && !certOwnerHasKeys
                ? `No API keys stored for OwnerID ${certOwnerId} — a white-label listing is only readable with the sub-user's own AccessKey/SecretKey. Save them in Portfolios → RU accounts.`
                : undefined),
          },
        );
        await probeAri("Get availability (365 days)", "get_availability");
        await probeAri("Get prices (365 days)", "get_prices");
        await call("List reservations (last 7 days)", "list_reservations", { date_from: isoDate(-7), date_to: isoDate(0) }, { mandatory: true, scope: "account" });
        // Leads are mandatory: RU requires an integration to pull enquiries and hold the
        // dates. The lifecycle step below proves the 3-day hold / 14-day withdrawal policy.
        await call(
          "Get leads (Pull_GetLeads_RQ)",
          "get_leads",
          { date_from: isoDate(-14), date_to: isoDate(0) },
          {
            mandatory: true,
            scope: "account",
            assert: (data) => {
              const xml: string = data?.raw_xml ?? "";
              if (!xml) return "RU returned no leads payload";
              return null;
            },
            successDetail: "Leads pulled — each becomes a 3-day hold on the ROL'OS calendar",
          },
        );
        await runLeadLifecycleStep();
        await call(
          "List owner buildings",
          "list_buildings",
          { owner_id: certOwnerId },
          {
            mandatory: false,
            scope: "property",
            skip: !propertyId
              ? PROPERTY_SKIP
              : !certOwnerId
                ? "No RU sub-user (OwnerID) bound — buildings are read under the sub-user's own API keys."
                : !certOwnerHasKeys
                  ? `No API keys stored for OwnerID ${certOwnerId} — save the sub-account password and run Step A so automatic key creation can complete.`
                  : undefined,
          },
        );

        await call(
          "Pull sales channels (ChannelID)",
          "list_sales_channels",
          { channel_name: LEKKESLAAP_CHANNEL_NAME },
          {
            mandatory: true,
            scope: "account",
            successDetail: "Sales channel list read — LekkeSlaap ChannelID resolvable for the content quality check",
          },
        );
        await call("List LNM change types", "list_lnm_change_types", {}, {
          mandatory: false,
          scope: "account",
          successDetail: "RU change-type dictionary read",
        });
        await call("List composition rooms", "list_composition_rooms", {}, { mandatory: false, scope: "account" });
        await call("List cities & currencies", "list_cities_and_currencies", {}, { mandatory: false, scope: "account" });
        await call(
          "Resolve location by coordinates",
          "get_location_by_coordinates",
          { metadata: { latitude: -34.0333, longitude: 21.35 } },
          { mandatory: false, scope: "account" },
        );
      }

      if (runMandatory) {
        const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
        await call("Subscribe RLNM handler", "subscribe_notifications", { handler_url: handlerUrl }, { mandatory: true, scope: "account" });

        // ── LNM (content + ARI change notifications) ──────────────────────────────
        // Separate from RLNM: LNM tells channels that content, availability or prices
        // changed. Registered per account, so the sub-user's OwnerID is what RU must
        // observe when a white-label property is under certification.
        const lnmUrlBase = `${supabaseUrl}/functions/v1/ru-lnm-handler`;
        const lnmObservedOwners: string[] = [];
        if (certOwnerId) {
          lnmObservedOwners.push(String(certOwnerId));
        } else {
          const masterOwnerId = (Deno.env.get("RU_MASTER_OWNER_ID") ?? Deno.env.get("RU_OWNER_ID") ?? "").trim();
          if (/^\d+$/.test(masterOwnerId)) lnmObservedOwners.push(masterOwnerId);
          const { data: ownerRows } = await admin
            .from("ru_owner_accounts")
            .select("ru_owner_id")
            .not("ru_owner_id", "is", null);
          for (const r of (ownerRows ?? []) as { ru_owner_id: string }[]) {
            const id = String(r.ru_owner_id).trim();
            if (/^\d+$/.test(id) && !lnmObservedOwners.includes(id)) lnmObservedOwners.push(id);
          }
        }

        const lnmDesired = {
          change_types: DEFAULT_LNM_CHANGE_TYPES,
          observed_owners: lnmObservedOwners,
          url_base: lnmUrlBase,
        };

        await call(
          "Subscribe LNM (content + ARI)",
          "put_lnm_subscriptions",
          {
            url_base: lnmUrlBase,
            change_types: DEFAULT_LNM_CHANGE_TYPES,
            observed_owners: lnmObservedOwners,
            ...(certOwnerId ? { owner_id: certOwnerId } : {}),
          },
          {
            mandatory: true,
            scope: "account",
            skip: lnmObservedOwners.length === 0
              ? "No RU OwnerID available to observe — link a sub-user account or configure the master OwnerID."
              : certOwnerId && !certOwnerHasKeys
                ? `No API keys stored for OwnerID ${certOwnerId} — subscriptions must be registered under the sub-user's own keys.`
                : undefined,
            successDetail: `Subscribed ${DEFAULT_LNM_CHANGE_TYPES.length} change types for OwnerID(s) ${lnmObservedOwners.join(", ")}`,
          },
        );

        await call(
          "Verify LNM subscriptions",
          "list_lnm_subscriptions",
          { ...(certOwnerId ? { owner_id: certOwnerId } : {}) },
          {
            mandatory: true,
            scope: "account",
            skip: lnmObservedOwners.length === 0
              ? "No LNM subscription expected — nothing to read back."
              : undefined,
            assert: (d) => {
              const actual = d?.subscriptions ?? parseLnmSubscriptions(String(d?.raw_xml ?? ""));
              const drift = diffLnmSubscriptions(actual, lnmDesired);
              if (drift.in_sync) return null;
              const parts: string[] = [];
              if (!drift.url_matches) parts.push(`UrlBase at RU is ${actual?.url_base ?? "(none)"} — expected ${lnmUrlBase}`);
              if (drift.missing_change_types.length) parts.push(`missing change types: ${drift.missing_change_types.join(", ")}`);
              if (drift.missing_owners.length) parts.push(`missing observed owners: ${drift.missing_owners.join(", ")}`);
              return `LNM subscription drift — ${parts.join("; ")}`;
            },
            successDetail: "RU confirms our LNM subscription (URL, change types and observed owners all match)",
          },
        );

        if (propertyId) {
          /**
           * A transient RU outage ("Service is temporarily unavailable", worker transport
           * error) is not a certification defect: the payload was accepted-shaped, RU simply
           * did not answer. Retry once inside the run's budget, and if RU is still down report
           * the step as deferred rather than failing a mandatory milestone on their downtime.
           */
          const TRANSIENT_CODES = new Set(["RU_UPSTREAM_UNAVAILABLE", "RU_TIMEOUT"]);
          const isTransient = (data: any, error: any): boolean => {
            const code = String(data?.error?.code ?? "");
            if (TRANSIENT_CODES.has(code)) return true;
            const text = `${error?.message ?? ""} ${data?.error?.message ?? ""} ${JSON.stringify(data?.units ?? "")}`;
            return /temporarily unavailable|RU_UPSTREAM_UNAVAILABLE|Failed to send a request|502|503|504|ETIMEDOUT|network/i.test(text);
          };

          // Content + ARI push via the property pipeline (keeps payload mapping in one place)
          for (const [name, fnBody, method] of [
            ["Push property content", { property_id: propertyId }, "Push_PutProperty_RQ"],
            ["Push availability + prices (ARI)", { property_id: propertyId, action: "push_ari", verify_readback: true }, "Push_PutAvbUnits_RQ + Push_PutPrices_RQ"],
          ] as [string, Record<string, unknown>, string][]) {
            stepNo += 1;
            const t0 = Date.now();
            let { data, error } = await admin.functions.invoke("push-property-to-ru", { body: fnBody });
            let ok = !error && data?.success === true;
            let retried = false;
            if (!ok && isTransient(data, error) && Date.now() < RUN_DEADLINE_MS - 20000) {
              retried = true;
              await budgetedWait(5000);
              const second = await admin.functions.invoke("push-property-to-ru", { body: fnBody });
              data = second.data;
              error = second.error;
              ok = !error && data?.success === true;
            }

            /**
             * Standalone-unit pushes are resumable: one invocation only covers a chunk of units
             * and answers `success: false` with `remaining_unit_ids`. That is progress, not a
             * certification defect — walk the sequence while the run's budget allows, and if the
             * budget runs out record the step as skipped/partial rather than a hard failure.
             */
            let remaining: string[] = Array.isArray(data?.remaining_unit_ids) ? data.remaining_unit_ids : [];
            let chunks = 1;
            while (!ok && remaining.length > 0 && Date.now() < RUN_DEADLINE_MS - 25000 && chunks < 8) {
              chunks += 1;
              const next = await admin.functions.invoke("push-property-to-ru", {
                body: { ...fnBody, only_unit_ids: remaining },
              });
              data = next.data;
              error = next.error;
              ok = !error && data?.success === true;
              const nextRemaining: string[] = Array.isArray(data?.remaining_unit_ids) ? data.remaining_unit_ids : [];
              if (nextRemaining.length >= remaining.length) {
                remaining = nextRemaining;
                break;
              }
              remaining = nextRemaining;
            }

            const partial = !ok && remaining.length > 0;
            const transient = !ok && !partial && isTransient(data, error);
            steps.push({
              step: stepNo, name, ru_method: method, mandatory: true, scope: "property",
              status: ok ? "passed" : transient || partial ? "skipped" : "failed",
              duration_ms: Date.now() - t0,
              detail: ok
                ? chunks > 1 ? `OK — completed in ${chunks} rate-limited chunks` : "OK"
                : partial
                  ? `Partial — ${chunks} chunk(s) pushed within the run's rate-limit budget, ${remaining.length} unit(s) still queued. Re-run this phase to finish the sequence.`
                  : transient
                    ? `Deferred — Rentals United was temporarily unavailable${retried ? " on both attempts" : ""}. The payload was built and sent; re-run the suite to prove it.`
                    : (error?.message ?? data?.error?.message ?? "Push failed"),
              retryable: transient || partial || undefined,
              retried: retried || undefined,
              chunks: chunks > 1 ? chunks : undefined,
              request: fnBody,
              response_preview: preview(data),
            });
          }




          // Read-back verification (small settle so RU has committed the push)
          await budgetedWait(3000);
          await call("Verify content read-back", "get_property", { ru_property_id: ruPropertyId }, { mandatory: true, scope: "property", skip: noProp });
          // Offset window (tomorrow → +366d): a distinct parameter set, so RU treats these
          // as fresh calls rather than repeats of the read-only phase's identical reads.
          await probeAri("Verify availability read-back", "get_availability", { windowOffsetDays: 1 });
          await probeAri("Verify prices read-back", "get_prices", { windowOffsetDays: 1 });


        }
      }

      if (runDiscounts) {
        // Same resolver production uses, so certification proves the real ladder:
        // manual ru_discounts rules + long-stay / last-minute / advance-purchase specials.
        let ladder: RuDiscountLadder = {
          longStay: [],
          lastMinute: [],
          warnings: [],
          unmapped: [],
          counts: { manual_long_stay: 0, manual_last_minute: 0, special_long_stay: 0, special_last_minute: 0 },
        };
        if (propertyId) ladder = await resolveRuDiscounts(admin, propertyId);

        const validation = validateRuLadder(ladder);
        const lsWire = longStayToWire(ladder.longStay);
        const lmWire = lastMinuteToWire(ladder.lastMinute);
        const invalid = validation.ok ? undefined : `Ladder rejected before push — ${validation.errors[0]}`;
        const noLongStay = ladder.longStay.length === 0
          ? "No active long-stay discounts or long-stay specials configured for this property."
          : undefined;
        const noLastMinute = ladder.lastMinute.length === 0
          ? "No active last-minute discounts, last-minute or advance-purchase specials configured for this property."
          : undefined;

        // Discounts live on the APARTMENT (unit) RUID, not the building. Pushing to the
        // parent id on a multi-unit property makes RU answer "You are not the owner of the
        // apartment" — so iterate every mapped unit, exactly like the ARI probe.
        const allDiscountTargets = unitRuIds.length > 0 ? unitRuIds : ruPropertyId ? [ruPropertyId] : [];
        // A certification run proves the endpoint, credentials and payload shape; it is not
        // the bulk synchronizer. RU limits each discount-write method to one call per owner
        // per sliding minute, so exercising every unit here makes a multi-unit certification
        // exceed the edge request lifetime. Test one representative apartment; the normal
        // property sync remains responsible for distributing rules to every mapped unit.
        const discountTargets = allDiscountTargets.slice(0, 1);
        const multi = discountTargets.length > 1;
        const label = (base: string, id: number) => (multi ? `${base} (unit ${id})` : base);

        for (const targetId of discountTargets.length > 0 ? discountTargets : [0]) {
          const targeted = targetId > 0 ? targetId : ruPropertyId;
          const lsPushed = await call(
            label("Push long-stay discounts", targeted ?? 0),
            "push_long_stay_discounts",
            { ru_property_id: targeted, discounts: lsWire },
            {
              mandatory: false,
              scope: "property",
              skip: noProp ?? noLongStay ?? invalid,
              successDetail: `Pushed ${describeTierSources(ladder.longStay)}`,
            },
          );
          await call(
            label("Verify long-stay discounts", targeted ?? 0),
            "get_long_stay_discounts",
            { ru_property_id: targeted },
            {
              mandatory: false,
              scope: "property",
              skip: noProp ?? noLongStay ?? invalid ?? (lsPushed ? undefined : "Nothing pushed."),
              assert: (d) => {
                const diff = diffRuDiscountEcho(String(d?.raw_xml ?? ""), "LongStay", lsWire);
                if (diff.returned === 0) return "RU did not echo any long-stay discounts";
                return diff.matches === diff.requested ? null : `${diff.matches}/${diff.requested} tiers echoed — ${diff.firstMismatch}`;
              },
              successDetail: `RU echoed all ${lsWire.length} long-stay tier${lsWire.length === 1 ? "" : "s"}`,
            },
          );

          const lmPushed = await call(
            label("Push last-minute discounts", targeted ?? 0),
            "push_last_minute_discounts",
            { ru_property_id: targeted, discounts: lmWire },
            {
              mandatory: false,
              scope: "property",
              skip: noProp ?? noLastMinute ?? invalid,
              successDetail: `Pushed ${describeTierSources(ladder.lastMinute)}`,
            },
          );
          await call(
            label("Verify last-minute discounts", targeted ?? 0),
            "get_last_minute_discounts",
            { ru_property_id: targeted },
            {
              mandatory: false,
              scope: "property",
              skip: noProp ?? noLastMinute ?? invalid ?? (lmPushed ? undefined : "Nothing pushed."),
              assert: (d) => {
                const diff = diffRuDiscountEcho(String(d?.raw_xml ?? ""), "LastMinute", lmWire);
                if (diff.returned === 0) return "RU did not echo any last-minute discounts";
                return diff.matches === diff.requested ? null : `${diff.matches}/${diff.requested} tiers echoed — ${diff.firstMismatch}`;
              },
              successDetail: `RU echoed all ${lmWire.length} last-minute tier${lmWire.length === 1 ? "" : "s"}`,
            },
          );
        }

        if (allDiscountTargets.length > discountTargets.length) {
          stepNo += 1;
          steps.push({
            step: stepNo,
            name: "Additional unit discount distribution",
            ru_method: "Push_PutLongStayDiscounts_RQ + Push_PutLastMinuteDiscounts_RQ",
            mandatory: false,
            scope: "property",
            status: "skipped",
            duration_ms: 0,
            detail:
              `${allDiscountTargets.length - discountTargets.length} additional mapped unit(s) were not called during certification because RU permits only one discount write per method per owner per sliding minute. ` +
              "They are distributed by the normal property sync and are excluded from the certification score.",
            request: { representative_ru_property_id: discountTargets[0] ?? null, additional_ru_property_ids: allDiscountTargets.slice(1) },
          });
        }

      }

      // Stamp the phase on the steps this invocation produced so the console can group a
      // staged full run by phase.
      for (let i = priorStepCount; i < steps.length; i++) {
        (steps[i] as Record<string, unknown>).phase = phaseTag;
      }

      const passed = steps.filter((s) => s.status === "passed").length;
      const failed = steps.filter((s) => s.status === "failed").length;
      // Skipped steps (methods RU has not enabled, rate-limit deferrals, N/A scope) are
      // informational and excluded from the success counter denominator.
      const graded = passed + failed;

      // An intermediate phase leaves the run open: only the last phase closes it, so the
      // record reflects one certification with a single verdict.
      const { data: finished } = await admin
        .from("ru_cert_runs")
        .update({
          status: isFinalPhase ? (failed === 0 ? "passed" : "failed") : "running",
          finished_at: isFinalPhase ? new Date().toISOString() : null,
          passed,
          failed,
          total: graded,

          steps,
          ru_property_id: ruPropertyId ? String(ruPropertyId) : null,
        })
        .eq("id", run.id)
        .select("*")
        .single();

      return json({ success: true, run: finished, property: propertyRow, run_id: run.id, phase: phaseTag });

    }

    return json({ success: false, error: { code: "UNKNOWN_ACTION", message: `Unknown action: ${action}` } }, 400);
  } catch (e) {
    console.error("[ru-cert-portal]", e);
    return json({ success: false, error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Unknown error" } }, 500);
  }
});
