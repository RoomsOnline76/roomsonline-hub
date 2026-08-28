/**
 * Two-step channel onboarding orchestrator (client side).
 *
 * The whole channel connection is two operator actions in the Channel Monitor:
 *
 *   Step A — confirm or create the distribution sub-account (identity, keys, company
 *            profile, adopt any pre-existing listings)
 *   Step B — push the property and its full ARI, read it back, verify currency and
 *            switch Channel Manager on
 *
 * Each step is a short chain of individually retryable tasks. The chain is driven from
 * the browser on purpose: every leg is its own edge request, so a slow channel can never
 * exhaust a single function's idle budget, and a failed leg is retried on its own instead
 * of replaying the whole step.
 *
 * Every channel call is delegated to the existing isolated surfaces
 * (`ru-cert-portal`, `push-property-to-ru`, `channel-manager-entitlement`) — this module
 * never speaks channel wire format.
 */

import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/functionError";
import {
  ensureFreshSession,
  isUnauthorizedFunctionError,
  SessionExpiredError,
} from "@/lib/ensureFreshSession";
import { pushPropertyToRu, type RuPushResult } from "@/lib/ruPushDriver";
import { invalidateChannelEditGate } from "@/lib/channelEditGate";
import { notifyRuAccountsChanged } from "@/lib/ruAccountsSignal";
import {
  CHANNEL_ONBOARD_TASKS,
  type ChannelOnboardStep,
  type ChannelOnboardTaskId,
} from "@/config/channelOnboard";

/**
 * `blocked` is a "cannot proceed automatically, and retrying will not help" state: the
 * operator has to supply something (e.g. an adopted account's portal password). It is
 * shown amber rather than red, and — unlike `failed` — never reads as a channel error.
 */
export type TaskOutcome = "passed" | "skipped" | "pending" | "failed" | "blocked";

export interface TaskResult {
  id: ChannelOnboardTaskId;
  outcome: TaskOutcome;
  /** Operator-facing detail: what happened, or why it stopped. */
  detail: string;
  /**
   * Milliseconds until the channel's rate window reopens. Only set on `pending`
   * outcomes — the UI counts this down and resumes the step on its own.
   */
  retryAfterMs?: number;
  /** Structured failure code, when the surface named one (e.g. RU_EMAIL_IN_USE). */
  code?: string;
  /**
   * Alternative distribution logins the operator may pick, returned when the resolved
   * owner email cannot become a login. Only set alongside `RU_EMAIL_IN_USE`.
   */
  loginCandidates?: LoginCandidate[];
}

/** One selectable (or explicitly blocked) distribution login. */
export interface LoginCandidate {
  email: string;
  /** Where the address came from, in plain language. */
  source: string;
  usable: boolean;
  blocked_reason: string | null;
  on_roster: boolean;
}


export interface StepRunResult {
  step: ChannelOnboardStep;
  /** Every mandatory task passed (or was legitimately skipped). */
  passed: boolean;
  /** A channel rate window deferred a task — nothing failed, it just is not done yet. */
  pending: boolean;
  /** How long to wait before resuming, when the step is waiting on a rate window. */
  retryAfterMs?: number;
  /** The deferred task the resume must restart from. */
  resumeFromTaskId?: ChannelOnboardTaskId;
  results: TaskResult[];
  summary: string;
  /** Latest account identity established during this run, including pending OwnerID. */
  accountContext?: { accountId: string | null; ownerId: string | null; loginEmail: string | null };
}

interface RunContext {
  propertyId: string;
  /** Operator-confirmed sub-account login, exactly as previewed. Step A only. */
  confirmedOwnerEmail?: string | null;
  confirmedOwnerName?: string | null;
  /** Resume a rate-deferred step from this task instead of replaying the whole chain. */
  startAtTaskId?: ChannelOnboardTaskId | null;
  /** The manual A.2 submission already performed the A.3 ownership probe. */
  keysVerifiedInRun?: boolean;
  onTask?: (
    id: ChannelOnboardTaskId,
    state: "running" | TaskOutcome,
    detail?: string,
    retryAfterMs?: number,
    code?: string,
  ) => void;
  onPushProgress?: (progress: { pushed: number; total: number }) => void;
  /**
   * Filled in by the `review_listings` task and consumed by `push_property`: what the
   * channel still owes. `unchanged` skips the content push entirely; `unitIds` narrows it
   * to the rooms whose content moved. Absent means "push everything" (first publish).
   */
  pushScope?: { unchanged: boolean; unitIds: string[] | null; changedFields: string[] };
  /** What the account task did about the sub-account's API key pair. Step A only. */
  keyProvisioning?: {
    source: KeySource;
    accessKey: string | null;
    warning: string | null;
    code: string | null;
    ruStatusId: string | null;
    ruStatusMessage: string | null;
    retryAfterMs: number | null;
    /** Ordered trail of every mint envelope / replacement login Step A tried. */
    attempts: string[];
  };

  /**
   * Set when a task in this run already sent the company profile (key provisioning does it
   * as part of minting), so the company task never re-sends it in the same run.
   */
  companyPushedInRun?: boolean;
  /** Set when the key pair was minted or ownership-probed in this run (verdict already in). */
  keysProvenInRun?: boolean;

  /**
   * The sub-account's published listing roster, read once per run. `adopt_listings`,
   * `review_listings` and `verify_listings` all ask the channel the same owner-scoped
   * question; caching it here keeps a run to one read instead of three.
   */
  listingRoster?: {
    readAt: number;
    data: Record<string, unknown>;
  };
  /** RU property IDs the push itself confirmed per unit, used instead of a read-back. */
  pushConfirmedListings?: { units: number; ids: string[] };

  /**
   * The LIVE account binding for this run. The gate snapshot is read once, before the
   * account task runs, so on a first run it still says "not bound" — every later task that
   * trusted it reported a freshly created sub-account as missing. The account task updates
   * this instead, and all later tasks read it.
   */
  binding?: OnboardGateSnapshot["binding"];

}


/** The binding as it stands NOW: the account task refreshes it mid-run. */
function liveBinding(ctx: RunContext, snapshot: OnboardGateSnapshot): OnboardGateSnapshot["binding"] {
  return ctx.binding ?? snapshot.binding;
}

/** How the sub-account's key pair was resolved during account provisioning. */
export type KeySource = "minted" | "existing" | "deferred" | "blocked" | "manual" | "";


/** The channel's sliding read window, used when it does not say how long to wait. */
const DEFAULT_RATE_WINDOW_MS = 60_000;

/** Channel verbs whose sliding minute a replayed Step B would immediately collide with. */
const REPLAY_GUARDED_ACTIONS = ["Push_PutAvbUnits_RQ", "Pull_ListOwnerProp_RQ"];

/**
 * Milliseconds left on the channel's one-call-per-minute window for this property's last
 * availability write or roster read. 0 when the window is clear (or the check itself fails —
 * bookkeeping must never block a real push).
 */
async function recentChannelWriteCooldownMs(propertyId: string): Promise<number> {
  try {
    const sinceIso = new Date(Date.now() - DEFAULT_RATE_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("ru_api_log")
      .select("created_at")
      .eq("property_id", propertyId)
      .in("action", REPLAY_GUARDED_ACTIONS)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.created_at) return 0;
    const elapsed = Date.now() - new Date(data.created_at).getTime();
    return Math.max(0, DEFAULT_RATE_WINDOW_MS - elapsed);
  } catch {
    return 0;
  }
}



const STEP_A_RECOVERABLE_CODES = new Set([
  "RU_MANUAL_KEYS_REQUIRED",
  "RU_CREATE_KEY_API_REJECTED",
  "RU_KEY_CREATION_NOT_ENABLED",


  "RU_CREATE_KEY_FAILED",
  "RU_CREATE_KEY_BAD_LOGIN",
  "RU_PASSWORD_PROBE_UNSUPPORTED",

  "RU_CHILD_LOGIN_REJECTED",
  "NO_CHILD_CREDENTIALS",
  "NO_STORED_PASSWORD",
  "NO_API_KEYS",
  "RU_CHILD_KEYS_REJECTED",
  "RU_CHILD_KEYS_WRONG_ACCOUNT",
  "RU_CHILD_KEYS_DUPLICATE",
  "RU_IDENTITY_INCOMPLETE",
  "NO_OWNER_EMAIL",
  "RU_OWNER_NOT_BOUND",
  "RU_OWNER_NOT_FOUND",
  "RU_ACCOUNT_RETIRED",
  "RU_COMPANY_DETAILS_FAILED",
]);

function isRecoverableStepACode(code: string | undefined): boolean {
  return Boolean(code && STEP_A_RECOVERABLE_CODES.has(code));
}

/**
 * Every onboarding edge call goes through here: the login token is renewed when it is
 * expired or nearly so, and a session refusal is retried once against a fresh token.
 * A genuinely dead session throws `SessionExpiredError` so the UI can offer a re-login
 * instead of printing "Invalid session (UNAUTHORIZED)".
 */
async function invokeWithSession(
  fn: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: unknown }> {
  if (!(await ensureFreshSession())) throw new SessionExpiredError();
  let res = await supabase.functions.invoke(fn, { body });
  if (isUnauthorizedFunctionError(res.error, (res.data ?? {}) as Record<string, unknown>)) {
    if (!(await ensureFreshSession(true))) throw new SessionExpiredError();
    res = await supabase.functions.invoke(fn, { body });
    if (isUnauthorizedFunctionError(res.error, (res.data ?? {}) as Record<string, unknown>)) {
      throw new SessionExpiredError();
    }
  }
  return { data: res.data, error: res.error };
}

/** Normalise whatever the channel surface reported as a wait into milliseconds. */
function readRetryAfterMs(payload: Record<string, unknown>): number {
  const raw = Number(payload.retry_after_ms ?? payload.retryAfterMs ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.max(5_000, raw) : DEFAULT_RATE_WINDOW_MS;
}

/** Invoke a cert-portal action and normalise the three answers we care about. */
async function portal(
  body: Record<string, unknown>,
  fallback: string,
): Promise<{
  ok: boolean;
  pending: boolean;
  retryAfterMs?: number;
  detail: string;
  /** Structured error code, when the surface gave one (e.g. RU_EMAIL_IN_USE). */
  code?: string;
  data: Record<string, unknown>;
}> {
  const { data, error } = await invokeWithSession("ru-cert-portal", body);
  let payload = (data ?? {}) as Record<string, unknown>;
  // A non-2xx answer (409 email conflict, 502 channel refusal) arrives as an error with the
  // JSON body attached; recover it so the code and any candidate logins survive.
  if (error && Object.keys(payload).length === 0) {
    const recovered = await readPortalErrorBody(error);
    if (recovered) payload = recovered;
  }
  // The channel allows one identical read per sliding minute; a queued read is progress,
  // not a failure, so it must never be recorded as a blocker.
  if (payload.pending === true || payload.rate_deferred === true) {
    return {
      ok: false,
      pending: true,
      retryAfterMs: readRetryAfterMs(payload),
      detail: "Waiting on the channel's rate window — this resumes on its own.",
      data: payload,
    };
  }
  const err = payload.error as { message?: string; code?: string } | undefined;
  if (payload.success !== true || error) {
    return {
      ok: false,
      pending: false,
      detail: err?.message ?? (error ? await extractFunctionError(error, fallback) : fallback),
      code: err?.code,
      data: payload,
    };
  }
  return { ok: true, pending: false, detail: "", data: payload };
}

/** Pull the JSON body off a failed function invocation, when there is one. */
async function readPortalErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.text !== "function") return null;
  try {
    return JSON.parse(await response.clone().text()) as Record<string, unknown>;
  } catch {
    return null;
  }
}


/** The gate as the backend sees it: readiness, monitor steps and the current binding. */
export interface OnboardGateSnapshot {
  property: {
    id: string;
    name: string;
    owner_email: string | null;
    listing_id: string | null;
    push_enabled: boolean;
    /** Room types that carry a channel listing id — how standalone-unit properties publish. */
    unit_listings_recorded?: number | null;
    unit_listings_verified?: number | null;
    unit_listings_expected?: number | null;
    listings_verified_at?: string | null;
  };

  binding: {
    portfolio_id: string | null;
    account_id: string | null;
    account_scope: "portfolio" | "property" | null;
    owner_email: string | null;
    ru_owner_id: string | null;
    login_email: string | null;
    password_stored: boolean;
    /** Set when the binding lookup itself failed — never read as "not bound". */
    read_error?: string | null;
    keys_stored: boolean;
    keys_verified: boolean;
    company_details_sent: boolean;
    sibling_properties: Array<{ id: string; name: string }>;
  };
  steps: Record<
    string,
    {
      step_key: string;
      status: "pending" | "blocked" | "passed" | "stale" | "unknown";
      blocker_summary: string | null;
      passed_at: string | null;
      last_checked_at: string | null;
      details: Record<string, unknown> | null;
    }
  >;
}

/**
 * One place that decides how the Owner binding panel words the listing state.
 * A property publishes either as a single property-level listing or — far more
 * commonly here — as standalone unit listings recorded per room type, so the
 * property-level id alone must never decide "not published".
 */
export function describeListingState(property: OnboardGateSnapshot["property"] | null | undefined): string {
  if (!property) return "not published";
  if (property.listing_id) return property.listing_id;

  const verified = Number(property.unit_listings_verified ?? 0);
  const expected = Number(property.unit_listings_expected ?? 0);
  const recorded = Number(property.unit_listings_recorded ?? 0);

  if (verified > 0) {
    const total = expected > 0 ? expected : verified;
    const when = property.listings_verified_at
      ? ` · verified ${new Date(property.listings_verified_at).toLocaleDateString()}`
      : "";
    return `${verified} of ${total} units published${when}`;
  }
  if (recorded > 0) {
    return `${recorded} unit${recorded === 1 ? "" : "s"} recorded · not verified`;
  }
  return "not published";
}

/** Total properties served by the bound account, including the selected one. */
export function describeAccountScope(binding: OnboardGateSnapshot["binding"] | null | undefined): string {
  if (!binding?.account_id) return "not bound";
  if (binding.account_scope !== "portfolio") return "This property only";
  const total = (binding.sibling_properties?.length ?? 0) + 1;
  return `Portfolio-wide (${total} propert${total === 1 ? "y" : "ies"})`;
}



async function gate(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await invokeWithSession("ru-onboard-property", body);
  const payload = (data ?? {}) as Record<string, unknown>;
  if (error) throw new Error(await extractFunctionError(error, "The onboarding gate could not be read"));
  if (payload.success !== true) {
    throw new Error(((payload.error as { message?: string }) ?? {}).message ?? "The onboarding gate refused the request");
  }
  return payload;
}

export async function fetchOnboardGate(propertyId: string): Promise<OnboardGateSnapshot> {
  const payload = await gate({ action: "gate_status", property_id: propertyId });
  return payload as unknown as OnboardGateSnapshot;
}

/** Re-grade mandatory steps 1–5 and persist the durable Ready-to-sell flag. */
export async function gradeReadyToSell(propertyId: string): Promise<{
  ready: boolean;
  summary: string;
  failing: Array<{ key: string; group: string; label: string; unit: string | null; detail: string | null }>;
}> {
  const payload = await gate({ action: "grade_ready_to_sell", property_id: propertyId });
  return {
    ready: payload.ready_to_sell === true,
    summary: String(payload.summary ?? ""),
    failing: (payload.failing ?? []) as Array<{
      key: string;
      group: string;
      label: string;
      unit: string | null;
      detail: string | null;
    }>,
  };
}

async function recordStep(
  propertyId: string,
  stepKey: "monitor_step_a" | "monitor_step_b" | "ready_to_connect",
  status: "passed" | "blocked" | "pending",
  summary: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await gate({
    action: "record_step",
    property_id: propertyId,
    step_key: stepKey,
    status,
    summary,
    details: details ?? null,
  });
}

/** Atomic archive → unbind → re-assign → archive-if-empty. Never partial by design. */
export async function rebindOwner(
  propertyId: string,
  newOwnerEmail: string,
  options: { confirmPortfolioScope?: boolean } = {},
): Promise<{ legs: Array<{ leg: string; ok: boolean; detail?: string }>; closedPreviousAccount: boolean }> {
  const payload = await gate({
    action: "rebind_owner",
    property_id: propertyId,
    new_owner_email: newOwnerEmail,
    confirm: true,
    ...(options.confirmPortfolioScope ? { confirm_portfolio_scope: true } : {}),
  });
  invalidateChannelEditGate(propertyId);
  notifyRuAccountsChanged();
  return {
    legs: (payload.legs ?? []) as Array<{ leg: string; ok: boolean; detail?: string }>,
    closedPreviousAccount: payload.closed_previous_account === true,
  };
}

/** Read-only preview of the sub-account that Step A would create or adopt. */
export interface OwnerAccountPlan {
  login_email?: string;
  owner_name?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  scope?: string;
  action?: string;
  adopt?: boolean;
  ru_owner_id?: string | null;
  account_id?: string | null;
  has_api_keys?: boolean;
  has_stored_password?: boolean;
  [key: string]: unknown;
}

export async function planOwnerAccount(propertyId: string): Promise<OwnerAccountPlan> {
  const { ok, detail, data } = await portal(
    { action: "plan_owner_account", property_id: propertyId },
    "Could not work out the distribution account details",
  );
  if (!ok) throw new Error(detail);
  return (data.plan ?? {}) as OwnerAccountPlan;
}

// ── Step runner ────────────────────────────────────────────────────────────────

type TaskRunner = (ctx: RunContext, snapshot: OnboardGateSnapshot) => Promise<TaskResult>;

const RUNNERS: Record<ChannelOnboardTaskId, TaskRunner> = {
  // Step A ────────────────────────────────────────────────────────────────────
  owner_account: async (ctx) => {
    const { ok, pending, retryAfterMs, detail, code, data } = await portal(
      {
        action: "ensure_owner_account",
        property_id: ctx.propertyId,
        ...(ctx.confirmedOwnerEmail ? { confirmed_owner_email: ctx.confirmedOwnerEmail } : {}),
        ...(ctx.confirmedOwnerName ? { confirmed_owner_name: ctx.confirmedOwnerName } : {}),
      },
      "Could not confirm the distribution identity",
    );
    if (!ok) {
      return {
        id: "owner_account",
        outcome: pending ? "pending" : isRecoverableStepACode(code) ? "blocked" : "failed",
        retryAfterMs,
        detail,
        code,
        ...(Array.isArray(data.login_candidates)
          ? { loginCandidates: data.login_candidates as LoginCandidate[] }
          : {}),
      };
    }

    notifyRuAccountsChanged();
    // Record the key pair created or found by atomic Step A.
    ctx.keyProvisioning = {
      source: String(data.key_source ?? "") as KeySource,
      accessKey: (data.access_key as string | null) ?? null,
      warning: (data.key_warning as string | null) ?? null,
      code: (data.key_code as string | null) ?? null,
      ruStatusId: (data.key_ru_status_id as string | null) ?? null,
      ruStatusMessage: (data.key_ru_status_message as string | null) ?? null,
      retryAfterMs: Number(data.key_retry_after_ms ?? 0) || null,
      attempts: Array.isArray(data.key_attempts) ? (data.key_attempts as string[]) : [],
    };

    // Minting sends the company profile as part of provisioning; remember that so the
    // company task does not send Push_FillCompanyDetails_RQ a second time in this run.
    if (data.company_details_pushed === true) ctx.companyPushedInRun = true;

    // Always name the account that was used: operators need the OwnerID and login to
    // recognise it in the channel portal, not just "adopted" vs "created".
    const account = (data.account ?? null) as Record<string, unknown> | null;
    const ownerId = String(account?.ru_owner_id ?? "").trim();
    const loginEmail = String(account?.ru_login_email ?? account?.owner_email ?? "").trim();
    const scope = String(data.scope ?? account?.scope ?? "").trim();
    const identity = [
      ownerId ? `OwnerID ${ownerId}` : null,
      loginEmail || null,
      scope ? `${scope} scope` : null,
    ].filter(Boolean).join(" · ");

    // Hand the account this task just created or adopted to every later task. Without this
    // they keep reading the pre-run snapshot, which for a new account still says "not bound".
    if (ownerId || account?.id || loginEmail) {
      ctx.binding = {
        ...(ctx.binding ?? ({} as OnboardGateSnapshot["binding"])),
        account_id: (account?.id as string | null) ?? ctx.binding?.account_id ?? null,
        account_scope: (scope === "portfolio" || scope === "property"
          ? scope
          : ctx.binding?.account_scope ?? null) as "portfolio" | "property" | null,
        ru_owner_id: ownerId || ctx.binding?.ru_owner_id || null,
        login_email: loginEmail || ctx.binding?.login_email || null,
        owner_email: loginEmail || ctx.binding?.owner_email || null,
        keys_stored:
          ctx.keyProvisioning?.source === "minted"
          || ctx.keyProvisioning?.source === "existing"
          || ctx.binding?.keys_stored === true,
        company_details_sent:
          data.company_details_pushed === true || ctx.binding?.company_details_sent === true,
      };
    } else {
      // No OwnerID in the payload: never guess it — re-read the gate so later tasks work off
      // a real binding rather than a stale one.
      try {
        ctx.binding = (await fetchOnboardGate(ctx.propertyId)).binding;
      } catch {
        /* keep the pre-run binding; the next task reports the missing binding itself */
      }
    }

    return {
      id: "owner_account",
      outcome: "passed",
      detail:
        `${data.created === false ? "Existing sub-account adopted" : "Sub-account created"}${identity ? ` — ${identity}` : ""}`,
    };
  },


  api_keys: async (ctx, snapshot) => {
    const binding = liveBinding(ctx, snapshot);
    const accountLabel = [
      binding.ru_owner_id ? `OwnerID ${binding.ru_owner_id}` : null,
      binding.login_email || binding.owner_email || null,
    ].filter(Boolean).join(" · ");

    const provisioning = ctx.keyProvisioning;
    const keyLabel = (access: string | null) =>
      access ? ` · AccessKey ${access.slice(0, 6)}…` : "";
    // The mint runs server-side in one call, so its ordered attempt trail is the only
    // way an operator can see which envelopes and replacement logins were tried.
    const trail = (provisioning?.attempts ?? []).filter(Boolean);
    const trailText = trail.length ? ` · ${trail.map((t) => t.trim()).join(" → ")}` : "";

    // Existing accounts can report a stored pair without another wire call.
    if (provisioning?.source === "minted") {
      // A successful mint IS the credential verdict — the next task must not re-probe it.
      ctx.keysProvenInRun = true;
      return {
        id: "api_keys",
        outcome: "passed",
        detail: `Key pair minted and stored${accountLabel ? ` for ${accountLabel}` : ""}${keyLabel(provisioning.accessKey)}${trailText}`,
      };
    }

    if (provisioning?.source === "existing" || binding.keys_stored) {
      return {
        id: "api_keys",
        outcome: "skipped",
        detail: `A key pair is already stored${accountLabel ? ` for ${accountLabel}` : ""}${keyLabel(provisioning?.accessKey ?? null)}`,
      };
    }
    if (provisioning?.source === "deferred") {
      return {
        id: "api_keys",
        outcome: "pending",
        retryAfterMs: provisioning.retryAfterMs ?? undefined,
        detail: (provisioning.warning
          ?? "The channel rate-limited the key request — waiting for the window to reopen.") + trailText,
      };
    }
    // Step A.2 is a deliberate manual pause: the sub-account exists, and the operator now
    // pastes the AccessKey/SecretKey pair issued in the channel portal for that login.
    if (provisioning?.source === "manual" || provisioning?.code === "RU_MANUAL_KEYS_REQUIRED") {
      return {
        id: "api_keys",
        outcome: "blocked",
        code: "RU_MANUAL_KEYS_REQUIRED",
        detail: (provisioning?.warning
          ?? `${accountLabel ? `${accountLabel}: ` : ""}Sub-account created — enter its AccessKey and SecretKey to continue.`) + trailText,
      };
    }
    return {
      id: "api_keys",
      outcome: "blocked",
      code: provisioning?.code ?? "RU_MANUAL_KEYS_REQUIRED",
      detail: (provisioning?.warning
        ?? `${accountLabel ? `${accountLabel}: ` : ""}No key pair is stored for this sub-account — enter its AccessKey and SecretKey to continue.`) + trailText,
    };



  },

  verify_keys: async (ctx, snapshot) => {
    const binding = liveBinding(ctx, snapshot);
    // A mint earlier in this run IS the verdict — check it before the binding so a freshly
    // created account never reads as "not bound" just because the snapshot predates it.
    if (!binding.ru_owner_id && !ctx.keysProvenInRun) {
      return { id: "verify_keys", outcome: "failed", detail: "No sub-account is bound yet" };
    }
    // Nothing to verify, and nothing the channel can tell us: refuse without a wire call
    // rather than authenticating as a child we hold no credential for.
    if (!binding.keys_stored && ctx.keyProvisioning?.source !== "minted" && !ctx.keysProvenInRun) {
      return {
        id: "verify_keys",
        outcome: "blocked",
        code: "NO_API_KEYS",
        detail: "No key pair is stored for this sub-account yet, so there is nothing to verify.",
      };
    }
    // The mint (or the ownership probe on a pasted pair) already proved the credential in
    // this run. Re-asking the channel spends its most rate-limited read on a known answer.
    if (ctx.keysProvenInRun) {
      const label = [
        `OwnerID ${binding.ru_owner_id}`,
        binding.login_email || binding.owner_email || null,
      ].filter(Boolean).join(" · ");
      return {
        id: "verify_keys",
        outcome: "skipped",
        detail: `Credentials proven when the key pair was minted — ${label}`,
      };
    }
    const { ok, pending, retryAfterMs, detail, code, data } = await portal(
      {
        action: "verify_api_keys",
        ...(binding.account_id ? { account_id: binding.account_id } : {}),
        ru_owner_id: binding.ru_owner_id,
      },
      "The sub-account credentials did not verify",
    );
    if (ok && data.company_details_pushed === true) ctx.companyPushedInRun = true;
    if (!ok) {
      return {
        id: "verify_keys",
        outcome: pending ? "pending" : isRecoverableStepACode(code) ? "blocked" : "failed",
        retryAfterMs,
        detail,
        code,
      };
    }

    if (data.verified === false) {
      const rejectedCode = ((data.error as { code?: string } | undefined)?.code ?? "RU_CHILD_KEYS_REJECTED");
      return {
        id: "verify_keys",
        outcome: isRecoverableStepACode(rejectedCode) ? "blocked" : "failed",
        code: rejectedCode,
        detail: String(
          (data.error as { message?: string } | undefined)?.message
          ?? (data.message as string | undefined)
          ?? "The channel rejected the stored key pair",
        ),
      };
    }
    const verifiedLabel = [
      String(data.ru_owner_id ?? binding.ru_owner_id ?? "").trim()
        ? `OwnerID ${String(data.ru_owner_id ?? binding.ru_owner_id)}`
        : null,
      String(data.login_email ?? binding.login_email ?? binding.owner_email ?? "").trim() || null,
    ].filter(Boolean).join(" · ");
    return {
      id: "verify_keys",
      outcome: "passed",
      detail: `Sub-account credentials verified${verifiedLabel ? ` — ${verifiedLabel}` : ""}`,
    };
  },

  company_profile: async (ctx, snapshot) => {
    const binding = liveBinding(ctx, snapshot);
    const companyLabel = binding.ru_owner_id ? ` (OwnerID ${binding.ru_owner_id})` : "";

    if (binding.company_details_sent) {
      return {
        id: "company_profile",
        outcome: "skipped",
        detail: `Company profile already accepted${companyLabel}`,
      };
    }
    // Key provisioning sends the company profile itself (it is the first write a fresh pair
    // makes), so a second Push_FillCompanyDetails_RQ in the same run is pure duplication.
    if (ctx.companyPushedInRun) {
      return {
        id: "company_profile",
        outcome: "skipped",
        detail: `Company profile sent with the credentials earlier in this run${companyLabel}`,
      };
    }

    const { ok, pending, retryAfterMs, detail, code, data } = await portal(
      { action: "ensure_company_details", property_id: ctx.propertyId },
      "The company profile was not accepted",
    );
    const locationIds = (data?.company_location_ids ?? null) as number[] | null;
    const locationsUnchanged = data?.company_locations_unchanged === true;
    const rep = (data?.legal_rep_coverage ?? null) as { missing?: string[] } | null;
    const extras = [
      locationIds?.length
        ? `region list ${locationIds.join(", ")}${locationsUnchanged ? " unchanged — not re-sent" : " sent"}`
        : null,
      rep
        ? rep.missing?.length
          ? `legal representative sent without ${rep.missing.join(", ")}`
          : "legal representative complete"
        : null,
    ].filter(Boolean).join("; ");
    return {
      id: "company_profile",
      outcome: ok ? "passed" : pending ? "pending" : isRecoverableStepACode(code) ? "blocked" : "failed",
      retryAfterMs,
      detail: ok ? `Company profile accepted${companyLabel}${extras ? ` — ${extras}` : ""}` : detail,
      code,
    };

  },

  adopt_listings: async (ctx) => {
    // Adopting anything already under the sub-account is what stops Step B duplicating.
    const { ok, pending, retryAfterMs, detail, code, data } = await portal(
      { action: "resolve_ru_property_ids", property_id: ctx.propertyId },
      "Could not review the sub-account's existing listings",
    );
    if (!ok) {
      return {
        id: "adopt_listings",
        outcome: pending ? "pending" : isRecoverableStepACode(code) ? "blocked" : "failed",
        retryAfterMs,
        detail,
        code,
      };
    }
    // Cache the roster: Step B's read-back asks the channel this exact owner-scoped
    // question, so one run should only ever read it once.
    ctx.listingRoster = { readAt: Date.now(), data };

    // Name the listings that were adopted — the IDs are what an operator cross-checks in
    // the channel portal, so a bare count is not enough to trust the adoption.
    const rows = Array.isArray(data.matched)
      ? (data.matched as Array<{ scope?: string; name?: string; ru_property_id?: string }>)
      : [];
    const unmatched = Array.isArray(data.unmatched) ? (data.unmatched as unknown[]).map(String) : [];
    const label = rows
      .map((m) => `${m.name?.trim() || (m.scope === "property" ? "property" : "unit")} → ${m.ru_property_id ?? "?"}`)
      .join(", ");
    return {
      id: "adopt_listings",
      outcome: "passed",
      detail: rows.length > 0
        ? `${rows.length} existing listing(s) adopted: ${label}${
          unmatched.length > 0 ? ` · not yet published: ${unmatched.join(", ")}` : ""
        }`
        : "Sub-account is empty — nothing to adopt, Step B will publish everything",
    };
  },


  // Step B ────────────────────────────────────────────────────────────────────
  review_listings: async (ctx) => {
    // Read-only: compare what is published with local content so the push below only
    // re-sends what actually moved. A failure here is never fatal — the scope simply
    // stays unset and the push falls back to sending everything.
    const { data, error } = await invokeWithSession("ru-onboard-property", {
      action: "plan_push_scope",
      property_id: ctx.propertyId,
    });
    const payload = (data ?? {}) as Record<string, unknown>;
    if (error || payload.success !== true) {
      return {
        id: "review_listings",
        outcome: "skipped",
        detail: "Could not compare against the published listings — the push will send everything.",
      };
    }
    const unchanged = payload.unchanged === true;
    const unitIds = Array.isArray(payload.scope_unit_ids) ? (payload.scope_unit_ids as string[]) : null;
    const changedFields = Array.isArray(payload.changed_fields) ? (payload.changed_fields as string[]) : [];
    ctx.pushScope = { unchanged, unitIds, changedFields };
    if (payload.first_push === true || !payload.listed) {
      return { id: "review_listings", outcome: "passed", detail: "Nothing published yet — a full publish is needed." };
    }
    if (unchanged) {
      return { id: "review_listings", outcome: "passed", detail: "Published content already matches — no re-push needed." };
    }
    return {
      id: "review_listings",
      outcome: "passed",
      detail: unitIds
        ? `${unitIds.length} room(s) changed — the push is narrowed to those.`
        : `${changedFields.length} property-level field(s) changed — a full content push is needed.`,
    };
  },

  push_property: async (ctx) => {
    const scope = ctx.pushScope;
    if (scope?.unchanged) {
      return {
        id: "push_property",
        outcome: "skipped",
        detail: "Content is already current on the channel; availability and pricing stay live on the scheduled sync.",
      };
    }
    /**
     * Replay cooldown. The channel allows one identical availability write / roster read per
     * sliding minute, so replaying a step within 60s of the last one manufactures the very 429s
     * the run just avoided. Wait the remainder out as a countdown instead of spending the slot.
     */
    const cooldown = await recentChannelWriteCooldownMs(ctx.propertyId);
    if (cooldown > 0) {
      return {
        id: "push_property",
        outcome: "pending",
        retryAfterMs: cooldown,
        detail: `The channel handled availability for this property moments ago — waiting ${Math.ceil(cooldown / 1000)}s for its one-call-per-minute window to reopen before replaying the push.`,
      };
    }
    let result: RuPushResult;

    try {
      result = await pushPropertyToRu(ctx.propertyId, {
        subscribeRlnm: true,
        // Onboarding is the one flow that must prove the channel holds our rates, so it asks for
        // the price read-back explicitly. Routine saves never do.
        verifyReadback: true,
        ...(scope?.unitIds && scope.unitIds.length > 0 ? { onlyUnitIds: scope.unitIds } : {}),
        onProgress: ({ pushed, total }) => ctx.onPushProgress?.({ pushed, total }),
      });
    } catch (err) {

      return {
        id: "push_property",
        outcome: "failed",
        detail: err instanceof Error ? err.message : "The property push failed",
      };
    }
    const outstanding = (result.remaining_unit_ids ?? []).length;
    if (result.success !== true || outstanding > 0) {
      const failedUnits = (result.units ?? []).filter((u) => u.success === false);
      const detail =
        result.error?.message ??
        (failedUnits.length
          ? failedUnits.map((u) => [u.name, u.error].filter(Boolean).join(": ")).slice(0, 4).join(" · ")
          : "The push did not complete");
      return {
        id: "push_property",
        outcome: outstanding > 0 ? "pending" : "failed",
        ...(outstanding > 0 ? { retryAfterMs: DEFAULT_RATE_WINDOW_MS } : {}),
        detail: outstanding > 0 ? `${outstanding} unit(s) still outstanding — retry to continue. ${detail}` : detail,
      };
    }
    const unitRows = result.units ?? [];
    const units = unitRows.length;
    // Every unit came back with the channel's own listing id, so the publish already told us
    // what a read-back would: record it and let verify_listings skip the extra read.
    const confirmedIds = unitRows
      .filter((u) => u.success !== false && typeof u.rentalsunited_property_id === "string")
      .map((u) => String(u.rentalsunited_property_id));
    if (units > 0 && confirmedIds.length === units) {
      ctx.pushConfirmedListings = { units, ids: confirmedIds };
    }
    return {
      id: "push_property",
      outcome: "passed",
      detail: units > 0 ? `${units} unit(s) pushed with full ARI` : "Property pushed with full ARI",
    };
  },

  verify_listings: async (ctx) => {
    // The push returned a channel listing id for every unit — that IS the confirmation.
    // Re-reading the owner's roster here only spends the channel's tightest read quota.
    const confirmed = ctx.pushConfirmedListings;
    if (confirmed && confirmed.units > 0) {
      return {
        id: "verify_listings",
        outcome: "passed",
        detail: `${confirmed.units} unit(s) confirmed live on the channel (ids returned by the publish: ${confirmed.ids.join(", ")})`,
      };
    }
    const { ok, pending, retryAfterMs, detail, data } = await portal(
      { action: "resolve_ru_property_ids", property_id: ctx.propertyId },
      "The published listings could not be read back",
    );
    if (!ok) {
      return pending
        ? {
          id: "verify_listings",
          outcome: "pending",
          retryAfterMs,
          detail: "Behind the channel's read window — the listing review resumes automatically.",
        }
        : { id: "verify_listings", outcome: "failed", detail };
    }
    ctx.listingRoster = { readAt: Date.now(), data };
    if (data.listings_verified !== true) {
      const expected = data.listings_expected_units ?? "?";
      const verified = data.listings_verified_units ?? 0;
      return {
        id: "verify_listings",
        outcome: "failed",
        detail: `Only ${verified}/${expected} unit(s) were confirmed on the channel`,
      };
    }
    return {
      id: "verify_listings",
      outcome: "passed",
      detail: `${data.listings_verified_units ?? ""} unit(s) confirmed live on the channel`.trim(),
    };
  },


  /**
   * The currency read-back lives on the push surface (it reads the live listing), not on
   * the cert portal — sending it to the portal is what produced `UNKNOWN_ACTION`.
   */
  verify_currency: async (ctx) => {
    const { data, error } = await invokeWithSession("push-property-to-ru", {
      action: "verify_ru_currency",
      property_ids: [ctx.propertyId],
    });
    if (error) {
      return {
        id: "verify_currency",
        outcome: "failed",
        detail: await extractFunctionError(error, "The published currency could not be verified"),
      };
    }
    const rows = ((data ?? {}) as {
      results?: Array<Record<string, unknown>>;
    }).results ?? [];
    const row = rows.find((r) => r.property_id === ctx.propertyId) ?? rows[0] ?? null;
    if (!row) {
      return {
        id: "verify_currency",
        outcome: "failed",
        detail: "The channel has no published listing to read a currency from yet",
      };
    }
    if (row.rate_deferred === true) {
      return {
        id: "verify_currency",
        outcome: "pending",
        retryAfterMs: readRetryAfterMs(row),
        detail: "Behind the channel's read window — the currency check resumes automatically.",
      };
    }
    const listings = (row.listings ?? []) as Array<{
      ru_property_id?: number;
      ru_reported_iso?: string | null;
      ru_reported_location_id?: number | null;
      location_matches?: boolean | null;
      matches?: boolean;
      deferred?: boolean;
    }>;
    if (listings.length > 0 && listings.every((l) => l.deferred === true)) {
      return {
        id: "verify_currency",
        outcome: "pending",
        retryAfterMs: readRetryAfterMs(row),
        detail: "Behind the channel's read window — the currency check resumes automatically.",
      };
    }
    const mismatched = listings.filter((l) => l.ru_reported_iso && l.matches === false);
    if (mismatched.length > 0) {
      return {
        id: "verify_currency",
        outcome: "failed",
        detail: `The channel reports ${mismatched.map((l) => l.ru_reported_iso).join(", ")} on ${mismatched.length} listing(s)`,
      };
    }
    // Location travelled with the property push and the account's region list was sent in
    // Step A — this step only states which side said what, it never re-writes either.
    const expectedLocation = row.expected_location_id ?? null;
    const locationVerdict = String(row.location_verdict ?? "unknown");
    const locationMismatches = (row.location_mismatches ?? []) as Array<{
      ru_property_id?: number;
      ru_reported_location_id?: number | null;
    }>;
    if (locationVerdict === "mismatch") {
      return {
        id: "verify_currency",
        outcome: "failed",
        detail:
          `The channel publishes a different location than the property authors: expected ${expectedLocation}, ` +
          `channel reports ${locationMismatches.map((l) => `${l.ru_reported_location_id} on listing ${l.ru_property_id}`).join(", ")}. ` +
          "Re-push the property so the listing carries the authored location.",
      };
    }
    if (row.gate_passed === true || listings.some((l) => l.matches === true)) {
      const iso = String(row.ru_reported_iso ?? row.expected_iso ?? "").toUpperCase();
      const locationLine = locationVerdict === "matched"
        ? `location ${expectedLocation} confirmed on the published listing`
        : expectedLocation
          ? `location ${expectedLocation} authored locally (the channel reported none to compare)`
          : "no location authored locally to compare";
      const currencyLine = row.used_existing_verdict === true
        ? `${iso} already confirmed earlier — no read needed`
        : `${iso} already set at the channel — no write sent`;
      return {
        id: "verify_currency",
        outcome: "passed",
        detail: `Read-back: ${locationLine}; currency ${currencyLine}.`,
      };
    }
    return {
      id: "verify_currency",
      outcome: "failed",
      detail: String(row.error ?? row.reason ?? "The channel did not answer with a currency"),
    };

  },

  entitlement: async (ctx) => {
    const { data, error } = await invokeWithSession("channel-manager-entitlement", {
      scope: "property",
      entity_id: ctx.propertyId,
      enabled: true,
      include_units: true,
      notify: false,
      // The push task immediately before this one already sent availability and prices for the
      // whole year. Activation must not re-send them — that is what tripped the channel's
      // one-write-per-minute window at the very end of a clean run.
      skip_ari_refresh: true,
    });

    if (error) {
      return {
        id: "entitlement",
        outcome: "failed",
        detail: await extractFunctionError(error, "Channel Manager could not be enabled"),
      };
    }
    const failed = Number((data as { failed?: number } | null)?.failed ?? 0);
    if (failed > 0) {
      return { id: "entitlement", outcome: "failed", detail: `${failed} listing(s) did not activate at the channel` };
    }
    return { id: "entitlement", outcome: "passed", detail: "Channel Manager enabled — channels can connect" };
  },
};

/**
 * Run one step's task chain. Stops at the first mandatory failure so nothing downstream
 * runs against a half-built account, and records the step verdict on the durable ledger.
 *
 * A `pending` task means the channel's rate window is closed: the chain stops there so no
 * downstream task reads against a half-confirmed state, and the caller is told which task
 * to resume from once the window reopens. That is never a failure.
 */
export async function runOnboardStep(step: ChannelOnboardStep, ctx: RunContext): Promise<StepRunResult> {
  const snapshot = await fetchOnboardGate(ctx.propertyId);
  if (snapshot.steps.ready_to_sell?.status !== "passed") {
    throw new Error("This property is not marked Ready to sell yet — clear steps 1–5 first.");
  }
  if (step === "b" && snapshot.steps.monitor_step_a?.status !== "passed") {
    throw new Error("Confirm the distribution sub-account (Step A) before pushing.");
  }

  const allTasks = CHANNEL_ONBOARD_TASKS.filter((task) => task.step === step);
  // A resume picks the chain up at the deferred task, so already-passed legs are not replayed
  // against the channel (which is what closed the rate window in the first place).
  const startIndex = ctx.startAtTaskId ? Math.max(0, allTasks.findIndex((t) => t.id === ctx.startAtTaskId)) : 0;
  const tasks = allTasks.slice(startIndex);
  const stepKeyForLedger = step === "a" ? "monitor_step_a" : "monitor_step_b";
  /**
   * A resume must not erase the legs it deliberately skipped. Recording only the resumed
   * tasks left the earlier ones (review, push) with no outcome on the ledger, so a passed
   * step rendered them as never-run. Carry their last recorded outcome forward instead.
   */
  const recordedTasks =
    ((snapshot.steps?.[stepKeyForLedger]?.details as { tasks?: TaskResult[] } | null | undefined)?.tasks ?? [])
      .filter((r): r is TaskResult => Boolean(r && typeof r.id === "string"));
  const carriedResults: TaskResult[] = allTasks
    .slice(0, startIndex)
    .map((t) => {
      if (step === "a" && ctx.keysVerifiedInRun && t.id === "api_keys") {
        return { id: "api_keys", outcome: "passed", detail: "Key pair verified and stored" } as TaskResult;
      }
      if (step === "a" && ctx.keysVerifiedInRun && t.id === "verify_keys") {
        return { id: "verify_keys", outcome: "passed", detail: "Sub-account credentials verified" } as TaskResult;
      }
      return recordedTasks.find((r) => r.id === t.id);
    })
    .filter((r): r is TaskResult => Boolean(r));
  const results: TaskResult[] = [];

  let pending = false;
  let failed = false;
  let retryAfterMs: number | undefined;
  let resumeFromTaskId: ChannelOnboardTaskId | undefined;

  for (const task of tasks) {
    ctx.onTask?.(task.id, "running");
    let result: TaskResult;
    try {
      result = await RUNNERS[task.id](ctx, snapshot);
    } catch (err) {
      result = {
        id: task.id,
        outcome: "failed",
        detail: err instanceof Error ? err.message : "Task failed",
      };
    }
    results.push(result);
    ctx.onTask?.(task.id, result.outcome, result.detail, result.retryAfterMs, result.code);

    if (result.outcome === "pending") {
      pending = true;
      retryAfterMs = result.retryAfterMs ?? DEFAULT_RATE_WINDOW_MS;
      resumeFromTaskId = task.id;
      break;
    }
    if (result.outcome === "failed" || result.outcome === "blocked") {
      failed = true;
      if (!task.optional) break;
    }
  }

  const passed = !failed && !pending;
  const summary = results
    .filter((r) => r.outcome === "failed" || r.outcome === "blocked" || r.outcome === "pending")
    .map((r) => `${CHANNEL_ONBOARD_TASKS.find((t) => t.id === r.id)?.title ?? r.id}: ${r.detail}`)
    .join(" · ");

  const stepKey = stepKeyForLedger;
  const ledgerTasks = [...carriedResults, ...results];
  await recordStep(
    ctx.propertyId,
    stepKey,
    passed ? "passed" : pending && !failed ? "pending" : "blocked",
    summary,
    { tasks: ledgerTasks },
  );


  // Step B completing is what makes the property sellable — and what opens the ordinary
  // delta path, so the edit gate's cached verdict must go.
  if (passed && step === "b") {
    await recordStep(ctx.propertyId, "ready_to_connect", "passed", "");
    invalidateChannelEditGate(ctx.propertyId);
    notifyRuAccountsChanged();
  }

  const finalBinding = ctx.binding;
  return {
    step,
    passed,
    pending,
    retryAfterMs,
    resumeFromTaskId,
    results: ledgerTasks,
    summary,
    accountContext: finalBinding
      ? {
          accountId: finalBinding.account_id ?? null,
          ownerId: finalBinding.ru_owner_id ?? null,
          loginEmail: finalBinding.login_email ?? finalBinding.owner_email ?? null,
        }
      : undefined,
  };
}
