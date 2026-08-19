// Channel step ledger — Phase 0 safety rails.
//
// Flag reader + PII-safe logging helper. Nothing in the wizard, readiness scoring or
// RU transport calls these yet: this module exists so later phases can ship behind a
// flag that is off by default.

/** Platform settings key holding `{ "enabled": boolean }`. */
export const CHANNEL_STEP_LEDGER_SETTING_KEY = "channel_step_ledger_enabled";

/** Canonical step keys — mirrors `src/config/channelStepLedger.ts`. */
export const CHANNEL_LEDGER_STEP_KEYS = [
  "identity",
  "location",
  "rooms",
  "media",
  "commercial",
  "push_owner",
  "keys",
  "company_profile",
  "signoff",
  "pull_listings",
  "publish",
  "currency",
  "entitlement",
  "connect",
] as const;

export type ChannelLedgerStepKey = (typeof CHANNEL_LEDGER_STEP_KEYS)[number];

/**
 * Is the ledger enabled? Any failure resolves to `false` so the production path is
 * unchanged when the settings row is absent or unreadable.
 */
export async function isChannelStepLedgerEnabled(admin: any): Promise<boolean> {
  try {
    const { data } = await admin
      .from("ru_platform_settings")
      .select("value")
      .eq("key", CHANNEL_STEP_LEDGER_SETTING_KEY)
      .maybeSingle();
    return (data?.value as { enabled?: boolean } | null)?.enabled === true;
  } catch {
    return false;
  }
}

/** Field names whose values must never reach a log line. */
const CREDENTIAL_KEY = /(access[_-]?key|secret|password|passwd|token|apikey|api[_-]key|authorization|bearer)/i;

/** Drop credential-shaped entries from a detail bag before it is logged. */
export function sanitizeLedgerDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!detail) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (CREDENTIAL_KEY.test(key)) {
      safe[key] = "[REDACTED]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      safe[key] = sanitizeLedgerDetail(value as Record<string, unknown>);
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export interface LedgerEvent {
  propertyId?: string | null;
  event: string;
  detail?: Record<string, unknown>;
}

/**
 * Structured, credential-free ledger log line. Never throws — observability must not
 * be able to break a push. Phase 0 writes nothing to the database.
 */
export function logLedgerEvent(entry: LedgerEvent): void {
  try {
    console.log(
      "[channel-ledger]",
      JSON.stringify({
        event: entry.event,
        property_id: entry.propertyId ?? null,
        at: new Date().toISOString(),
        ...sanitizeLedgerDetail(entry.detail),
      }),
    );
  } catch {
    /* logging must never break a caller */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — durable per-step status storage.
//
// Persistence + mapping helpers for `public.property_channel_step_status`.
// Nothing in the wizard reads these yet: the ledger is written by explicit
// `ledger_*` actions only, and every action is gated on the Phase 0 flag.
// ─────────────────────────────────────────────────────────────────────────────

export const CHANNEL_LEDGER_TABLE = "property_channel_step_status";

export type ChannelLedgerStatus = "pending" | "blocked" | "passed" | "stale" | "unknown";

export type ChannelLedgerSource = "local" | "channel_probe" | "push_result" | "manual_signoff" | "seed";

export interface ChannelLedgerRowInput {
  step_key: string;
  status: ChannelLedgerStatus;
  blocker_summary?: string | null;
  input_fingerprint?: string | null;
  source?: ChannelLedgerSource | null;
  details?: Record<string, unknown> | null;
}

/** Stable, cheap fingerprint of the inputs behind a step decision (djb2, hex). */
export function ledgerFingerprint(input: unknown): string {
  const text = (() => {
    try {
      return JSON.stringify(input) ?? "";
    } catch {
      return String(input);
    }
  })();
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

/** Which readiness check groups belong to which macro step key. */
const GROUP_TO_STEP: Record<string, string> = {
  "Content": "identity",
  "Address & geo": "location",
  "Rooms & beds": "rooms",
  "Photos": "media",
  "Policies & payments": "commercial",
  "Availability 365d": "commercial",
  "Pricing 365d": "commercial",
  "Channel publishing": "publish",
};

/** Check keys that own their own step, regardless of the group they render in. */
const CHECK_KEY_TO_STEP: Record<string, string> = {
  currency_verified: "currency",
};

interface ReadinessCheckLike {
  key?: string;
  group?: string;
  label?: string;
  mandatory?: boolean;
  passed?: boolean;
  detail?: string;
  unit?: string;
}

export interface ReadinessReportLike {
  error?: string | null;
  checks?: ReadinessCheckLike[];
  blocked?: boolean;
}

function stepForCheck(check: ReadinessCheckLike): string | null {
  const byKey = CHECK_KEY_TO_STEP[String(check.key ?? "")];
  if (byKey) return byKey;
  return GROUP_TO_STEP[String(check.group ?? "")] ?? null;
}

/**
 * Translate a readiness report into ledger rows.
 *
 * Only steps the scorer actually answered are returned. A report that failed to
 * build (dry-run error, no checks) yields `unknown` rows so a transient channel
 * or transport failure can never be recorded as a blocker — and, because the DB
 * trigger preserves `passed_at`, never erases a prior pass either.
 */
export function mapReadinessToLedgerRows(report: ReadinessReportLike | null | undefined): ChannelLedgerRowInput[] {
  const checks = Array.isArray(report?.checks) ? report!.checks! : [];
  const answered = !report?.error && checks.length > 0;

  if (!answered) {
    const reason = report?.error
      ? `Readiness could not be evaluated: ${report.error}`
      : "Readiness returned no checks — status left unknown.";
    return Object.values({ ...GROUP_TO_STEP, ...CHECK_KEY_TO_STEP })
      .filter((step, index, all) => all.indexOf(step) === index)
      .map((step_key) => ({
        step_key,
        status: "unknown" as ChannelLedgerStatus,
        blocker_summary: reason,
        source: "channel_probe" as ChannelLedgerSource,
        details: { answered: false },
      }));
  }

  const byStep = new Map<string, ReadinessCheckLike[]>();
  for (const check of checks) {
    const step = stepForCheck(check);
    if (!step) continue;
    const bucket = byStep.get(step) ?? [];
    bucket.push(check);
    byStep.set(step, bucket);
  }

  return [...byStep.entries()].map(([step_key, stepChecks]) => {
    const failedMandatory = stepChecks.filter((c) => c.mandatory && !c.passed);
    const status: ChannelLedgerStatus = failedMandatory.length === 0 ? "passed" : "blocked";
    const summary = failedMandatory
      .map((c) => [c.unit, c.detail || c.label].filter(Boolean).join(": "))
      .join(" · ");
    return {
      step_key,
      status,
      blocker_summary: status === "blocked" ? summary.slice(0, 2000) : null,
      input_fingerprint: ledgerFingerprint(
        stepChecks.map((c) => [c.key ?? c.label, c.unit ?? "", c.passed === true]).sort(),
      ),
      source: "channel_probe",
      details: {
        answered: true,
        checks_total: stepChecks.length,
        checks_passed: stepChecks.filter((c) => c.passed).length,
      },
    };
  });
}

/** Insert any missing step rows as `pending`. Existing rows are never touched. */
// deno-lint-ignore no-explicit-any
export async function seedLedger(admin: any, propertyId: string): Promise<{ seeded: number }> {
  const { data: existing } = await admin
    .from(CHANNEL_LEDGER_TABLE)
    .select("step_key")
    .eq("property_id", propertyId);
  const have = new Set((existing ?? []).map((r: { step_key: string }) => r.step_key));
  const missing = CHANNEL_LEDGER_STEP_KEYS.filter((key) => !have.has(key));
  if (missing.length === 0) return { seeded: 0 };
  await admin.from(CHANNEL_LEDGER_TABLE).insert(
    missing.map((step_key) => ({ property_id: propertyId, step_key, status: "pending", source: "seed" })),
  );
  return { seeded: missing.length };
}

/** Read the ledger for one property. Never calls the channel, never writes. */
// deno-lint-ignore no-explicit-any
export async function readLedger(admin: any, propertyId: string) {
  const { data, error } = await admin
    .from(CHANNEL_LEDGER_TABLE)
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(error.message);
  const order = new Map(CHANNEL_LEDGER_STEP_KEYS.map((key, index) => [key as string, index]));
  return (data ?? []).sort(
    (a: { step_key: string }, b: { step_key: string }) =>
      (order.get(a.step_key) ?? 99) - (order.get(b.step_key) ?? 99),
  );
}

/**
 * Flag steps as `stale`. Only the status, `stale_at` and `last_checked_at`-adjacent
 * metadata move: `passed_at` and `blocker_summary` history are deliberately kept so
 * a later recheck can show what changed.
 */
// deno-lint-ignore no-explicit-any
export async function markLedgerStale(
  admin: any,
  propertyId: string,
  stepKeys?: string[] | null,
): Promise<{ marked: number }> {
  const keys = (stepKeys?.length ? stepKeys : [...CHANNEL_LEDGER_STEP_KEYS]).filter((key) =>
    (CHANNEL_LEDGER_STEP_KEYS as readonly string[]).includes(key)
  );
  if (keys.length === 0) return { marked: 0 };
  const { data, error } = await admin
    .from(CHANNEL_LEDGER_TABLE)
    .update({ status: "stale", stale_at: new Date().toISOString() })
    .eq("property_id", propertyId)
    .in("step_key", keys)
    .neq("status", "stale")
    .select("step_key");
  if (error) throw new Error(error.message);
  return { marked: (data ?? []).length };
}

/** Upsert evaluated rows. `passed_at` preservation is enforced by the DB trigger. */
// deno-lint-ignore no-explicit-any
export async function writeLedgerRows(
  admin: any,
  propertyId: string,
  rows: ChannelLedgerRowInput[],
): Promise<{ written: number }> {
  if (rows.length === 0) return { written: 0 };
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    property_id: propertyId,
    step_key: row.step_key,
    status: row.status,
    blocker_summary: row.blocker_summary ?? null,
    input_fingerprint: row.input_fingerprint ?? null,
    source: row.source ?? null,
    details: row.details ?? {},
    last_checked_at: now,
    ...(row.status === "passed" ? { passed_at: now } : {}),
  }));
  const { error } = await admin
    .from(CHANNEL_LEDGER_TABLE)
    .upsert(payload, { onConflict: "property_id,step_key" });
  if (error) throw new Error(error.message);
  return { written: payload.length };
}
