// Event-driven Rentals United ARI delta.
//
// RU requires availability and pricing to be re-pushed on change, not only on the
// 24h/6h cron. Any ROLOS event that changes availability (booking confirmed, cancelled,
// modified, calendar block) calls `queueRuAriDelta`, which:
//   - skips properties that are not RU-connected,
//   - debounces per property so a burst of events becomes one push,
//   - respects RU's per-owner sliding-minute window by never firing more than one delta
//     per property inside the debounce window,
//   - delegates the actual push to `push-property-to-ru` (action: 'refresh_ari'), which is
//     the single owner of the RU push contract.
//
// Failures are logged and swallowed: a channel refresh must never break the booking flow.

import { readInvokeErrorBody } from "./ruInvokeBody.ts";
import { evaluateRuOperationalSync, RU_WIZARD_SYNC_CODE } from "./ruSyncGate.ts";

/** Minimum gap between two deltas for the same property. */
export const RU_ARI_DELTA_DEBOUNCE_MS = 5 * 60 * 1000;

export interface RuAriDeltaOutcome {
  queued: boolean;
  reason?: "not_connected" | "debounced" | "error" | "no_property" | "gate_pending" | "confirm_pending";
  error?: string;
  blockers?: string[];
}


/** ru_sync_runs.action used to park an ARI delta refused by the readiness / phase gate. */
export const RU_ARI_DELTA_PENDING_ACTION = "ari_delta_pending";

/** Gate refusals that mean "correct data, not yet allowed" rather than a hard failure. */
const GATE_CODES = ["PHASE_BLOCKED", "READINESS_UNVERIFIED", "READINESS_FAILED", RU_WIZARD_SYNC_CODE];


async function isRuConnected(supabase: any, propertyId: string): Promise<boolean> {
  const gate = await evaluateRuOperationalSync(supabase, propertyId);
  return gate.allowed;
}


async function recentlyPushed(supabase: any, propertyId: string): Promise<boolean> {
  const since = new Date(Date.now() - RU_ARI_DELTA_DEBOUNCE_MS).toISOString();
  const { data } = await supabase
    .from("ru_sync_runs")
    .select("id")
    .eq("property_id", propertyId)
    .eq("action", "refresh_ari")
    .gte("created_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * A parked acceptance needs the reservation's own nights to stay open until it lands. An
 * availability delta in that window re-closes them (the stay itself holds those nights locally),
 * which is exactly what made every queued `confirm_request` fail on "not available for a given
 * dates". While an acceptance is pending for this property, the delta waits.
 */
async function confirmAcceptancePending(supabase: any, propertyId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("ru_call_queue")
      .select("id")
      .eq("action", "confirm_request")
      .eq("property_id", propertyId)
      .eq("status", "pending")
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch (_err) {
    return false;
  }
}


/**
 * Fire an ARI delta for one property. Awaiting it is optional — callers in a request path
 * should not block on the RU round-trip.
 */
export async function queueRuAriDelta(
  supabase: any,
  propertyId: string | null | undefined,
  trigger: string,
  /**
   * Bypass the debounce. Booking events MUST use this: if a cron refresh happened seconds
   * before the booking, debouncing would drop the only push that closes the sold nights and
   * the unit stays sellable at the channel until the next scheduled run.
   */
  options: { force?: boolean } = {},
): Promise<RuAriDeltaOutcome> {
  if (!propertyId) return { queued: false, reason: "no_property" };
  try {
    if (!(await isRuConnected(supabase, propertyId))) {
      return { queued: false, reason: "not_connected" };
    }
    if (await confirmAcceptancePending(supabase, propertyId)) {
      console.log(`[ruAriDelta] ${trigger} delta held: a channel acceptance is pending for ${propertyId}`);
      return { queued: false, reason: "confirm_pending" };
    }

    if (!options.force && (await recentlyPushed(supabase, propertyId))) {
      console.log(`[ruAriDelta] Debounced ${trigger} delta for property ${propertyId}`);
      return { queued: false, reason: "debounced" };
    }

    const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
      body: { property_id: propertyId, action: "refresh_ari", trigger },
    });
    // A 422 gate refusal surfaces as an "error" with the structured body on error.context.
    const errorBody = error ? await readInvokeErrorBody(error) : null;
    const payload = (data ?? errorBody ?? {}) as Record<string, any>;
    const code: string | undefined = payload?.error?.code;
    if (code && ["RU_NOT_LISTED", "RU_NOT_CONFIGURED", "RU_LISTING_STALE", "CHANNEL_MANAGER_DISABLED"].includes(code)) {
      console.log(`[ruAriDelta] ${trigger} delta skipped for ${propertyId}: ${code}`);
      return { queued: false, reason: "not_connected" };
    }
    if (code && GATE_CODES.includes(code)) {
      // The rates/availability are real and still owed to the channel — park the delta so the
      // readiness re-arm fires it automatically once the blockers clear.
      const blockers = Array.isArray(payload?.blockers)
        ? (payload.blockers as unknown[]).map((b) => String(b))
        : Array.isArray(payload?.gaps)
          ? (payload.gaps as unknown[]).map((b) => String(b))
          : [];
      try {
        await supabase.from("ru_sync_runs").insert({
          property_id: propertyId,
          action: RU_ARI_DELTA_PENDING_ACTION,
          success: false,
          error_message: payload?.error?.message ?? "Parked behind the channel readiness gate",
          details: { trigger, gate_pending: true, error_code: code, blockers },
        });
      } catch (logErr) {
        console.warn("[ruAriDelta] pending log insert failed", logErr);
      }
      return { queued: false, reason: "gate_pending", error: payload?.error?.message, blockers };
    }
    if (error || payload?.success === false) {
      const message = payload?.error?.message || error?.message || "ARI delta failed";
      console.warn(`[ruAriDelta] ${trigger} delta failed for ${propertyId}: ${message}`);
      return { queued: true, reason: "error", error: message };
    }
    console.log(`[ruAriDelta] ${trigger} delta pushed for property ${propertyId}`);
    return { queued: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[ruAriDelta] ${trigger} delta threw for ${propertyId}: ${message}`);
    return { queued: false, reason: "error", error: message };
  }
}

export default queueRuAriDelta;
