/**
 * Rate parity + kill switch helpers.
 *
 * Purpose: let a consumer compute BOTH its legacy rate hierarchy and the shared
 * resolver, serve the legacy result until a property is proven at parity, and
 * record every comparison in rolos_rate_resolution_audit.
 *
 * Nothing here changes a served price on its own. A property only follows the
 * shared resolver once properties.rate_resolution_mode = 'unified'.
 */

export const RESOLVER_VERSION = "v1";

export type RateResolutionMode = "legacy" | "unified";

export interface ParityRow {
  property_id: string;
  room_type_id?: string | null;
  rate_plan_id?: string | null;
  stay_date: string;
  resolved_rate?: number | null;
  resolved_tier?: string | null;
  legacy_rate?: number | null;
  legacy_tier?: string | null;
  currency?: string | null;
  notes?: Record<string, unknown> | null;
}

/** Reads the per-property kill switch. Defaults to 'legacy' on any doubt. */
export async function getRateResolutionMode(
  supabase: any,
  propertyId: string,
): Promise<RateResolutionMode> {
  try {
    const { data } = await supabase
      .from("properties")
      .select("rate_resolution_mode")
      .eq("id", propertyId)
      .maybeSingle();
    return data?.rate_resolution_mode === "unified" ? "unified" : "legacy";
  } catch {
    return "legacy";
  }
}

/** Batch variant for multi-property consumers (portfolio listings). */
export async function getRateResolutionModes(
  supabase: any,
  propertyIds: string[],
): Promise<Record<string, RateResolutionMode>> {
  const out: Record<string, RateResolutionMode> = {};
  for (const id of propertyIds) out[id] = "legacy";
  if (propertyIds.length === 0) return out;
  try {
    const { data } = await supabase
      .from("properties")
      .select("id, rate_resolution_mode")
      .in("id", propertyIds);
    for (const row of (data ?? []) as any[]) {
      out[row.id] = row.rate_resolution_mode === "unified" ? "unified" : "legacy";
    }
  } catch {
    /* keep every property on legacy */
  }
  return out;
}

function roundMoney(value: unknown): number | null {
  // "no rate" must stay null: coercing it to 0 would log a phantom delta for
  // every night a tier legitimately did not price.
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Best-effort write of parity rows. NEVER throws and never blocks the caller —
 * a failed audit write must not affect a price that is being served.
 */
export async function logRateParity(
  supabase: any,
  consumer: string,
  rows: ParityRow[],
  runId?: string,
): Promise<{ logged: number; run_id: string; deltas: number }> {
  const run_id = runId ?? crypto.randomUUID();
  if (!Array.isArray(rows) || rows.length === 0) return { logged: 0, run_id, deltas: 0 };

  let deltas = 0;
  const payload = rows.slice(0, 5000).map((r) => {
    const resolved = roundMoney(r.resolved_rate);
    const legacy = roundMoney(r.legacy_rate);
    const delta = resolved !== null && legacy !== null ? roundMoney(resolved - legacy) : null;
    if (delta !== null && delta !== 0) deltas++;
    return {
      run_id,
      property_id: r.property_id,
      room_type_id: r.room_type_id ?? null,
      rate_plan_id: r.rate_plan_id ?? null,
      stay_date: r.stay_date,
      resolved_rate: resolved,
      resolved_tier: r.resolved_tier ?? null,
      legacy_rate: legacy,
      legacy_tier: r.legacy_tier ?? null,
      delta,
      currency: r.currency ?? null,
      resolver_version: RESOLVER_VERSION,
      consumer,
      notes: r.notes ?? null,
    };
  });

  try {
    const { error } = await supabase.from("rolos_rate_resolution_audit").insert(payload);
    if (error) {
      console.warn(`[rateParity] audit insert failed for ${consumer}:`, error.message);
      return { logged: 0, run_id, deltas };
    }
  } catch (e) {
    console.warn(`[rateParity] audit insert threw for ${consumer}:`, (e as Error).message);
    return { logged: 0, run_id, deltas };
  }

  return { logged: payload.length, run_id, deltas };
}

/**
 * Chooses which value to actually serve.
 * legacy mode  -> the legacy value (today's behaviour, byte for byte)
 * unified mode -> the shared-resolver value, falling back to legacy when the
 *                 resolver produced nothing.
 */
export function pickServedRate<T>(
  mode: RateResolutionMode,
  legacyValue: T,
  unifiedValue: T,
): T {
  if (mode !== "unified") return legacyValue;
  if (unifiedValue === null || unifiedValue === undefined) return legacyValue;
  if (typeof unifiedValue === "number" && !Number.isFinite(unifiedValue)) return legacyValue;
  return unifiedValue;
}
