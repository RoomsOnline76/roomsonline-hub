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
