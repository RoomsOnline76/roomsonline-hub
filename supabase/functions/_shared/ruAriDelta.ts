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

import { ruDeltaScopeForTrigger } from './ruDeltaScope.ts';
import { readInvokeErrorBody } from "./ruInvokeBody.ts";
import { evaluateRuOperationalSync, RU_WIZARD_SYNC_CODE } from "./ruSyncGate.ts";

/**
 * Minimum gap between two deltas of the SAME half (prices or availability) for one property.
 *
 * This exists only to protect the channel's per-minute call window from a burst of clicks. It is
 * deliberately short: an operator who blocks nights or re-prices a season expects the channel to
 * have it moments later, not minutes later.
 */
export const RU_ARI_DELTA_DEBOUNCE_MS = 60 * 1000;


export interface RuAriDeltaOutcome {
  queued: boolean;
  reason?: "not_connected" | "debounced" | "coalesced" | "error" | "no_property" | "gate_pending" | "confirm_pending";

  error?: string;
  blockers?: string[];
}


/** ru_sync_runs.action used to park an ARI delta refused by the readiness / phase gate. */
export const RU_ARI_DELTA_PENDING_ACTION = "ari_delta_pending";

/**
 * `ru_call_queue.action` used to park a debounced ARI delta. The queue drain replays it against
 * `push-property-to-ru` (action `refresh_ari`) once the debounce window has elapsed.
 */
export const RU_ARI_DELTA_QUEUE_ACTION = "refresh_ari_delta";


/** Gate refusals that mean "correct data, not yet allowed" rather than a hard failure. */
const GATE_CODES = ["PHASE_BLOCKED", "ONBOARDING_INCOMPLETE", "READINESS_UNVERIFIED", "READINESS_FAILED", RU_WIZARD_SYNC_CODE];




/**
 * Age of the last refresh that actually wrote THIS half of ARI to the channel.
 *
 * A run that skipped its writes because nothing had moved cost the owner nothing, so it must not
 * lock the property out of the next real delta. Just as important: a price push must never park a
 * block, and a block must never park a price change — they are different channel calls, and
 * treating them as one is what made nearly every operator edit sit in the queue.
 */
async function lastRealPushAgeMs(
  supabase: any,
  propertyId: string,
  scope: RuDeltaScope,
): Promise<number> {
  const since = new Date(Date.now() - RU_ARI_DELTA_DEBOUNCE_MS).toISOString();
  const { data } = await supabase
    .from("ru_sync_runs")
    .select("created_at, details")
    .eq("property_id", propertyId)
    .eq("action", "refresh_ari")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  type Run = {
    created_at: string;
    details?: {
      skipped?: boolean;
      trigger?: string | null;
      skipped_avb?: number | null;
      skipped_prices?: number | null;
      total_targets?: number | null;
    } | null;
  };
  for (const row of (data ?? []) as Run[]) {
    const d = row.details ?? {};
    if (d.skipped === true) continue;
    const ranScope = ruDeltaScopeForTrigger(d.trigger ?? null);
    // Only a run that carried this half can hold this half back.
    if (scope !== "both" && ranScope !== "both" && ranScope !== scope) continue;
    const targets = Number(d.total_targets ?? 0) || 0;
    if (scope === "availability" && targets > 0 && Number(d.skipped_avb ?? 0) >= targets) continue;
    if (scope === "rates" && targets > 0 && Number(d.skipped_prices ?? 0) >= targets) continue;
    return Date.now() - Date.parse(row.created_at);
  }
  return Number.MAX_SAFE_INTEGER;
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
  options: {
    force?: boolean;
    /**
     * Write availability even when the payload hash matches the last push. A reopen (block
     * removed, nights partially released) must land at the channel; a hash race must never
     * swallow it. Unlike `force` it does not bypass the debounce.
     */
    forceAvailability?: boolean;
    /** Restrict the write to these unit ids. */
    onlyUnitIds?: string[] | null;
    /** Affected span — a restriction range, rate-plan season or booking stay. */
    dateFrom?: string | null;
    dateTo?: string | null;
    /** Pull the channel calendar back after the write (booking events only). */
    verifyAvailabilityReadback?: boolean;
  } = {},
): Promise<RuAriDeltaOutcome> {
  if (!propertyId) return { queued: false, reason: "no_property" };
  try {
    const connected = await evaluateRuOperationalSync(supabase, propertyId);
    if (!connected.allowed) {
      // Record the refusal: a silent skip let the editor keep saying "queued for the channel"
      // while nothing was ever owed or attempted.
      try {
        await supabase.from("ru_sync_runs").insert({
          property_id: propertyId,
          action: "refresh_ari_skipped",
          success: true,
          error_code: connected.code ?? "not_connected",
          error_message: connected.message ?? "Property is not distributed to the channel.",
          details: { trigger, skipped: true, reason: connected.code ?? "not_connected" },
        });
      } catch (logErr) {
        console.warn("[ruAriDelta] skip log insert failed", logErr);
      }
      console.log(`[ruAriDelta] ${trigger} delta skipped for ${propertyId}: ${connected.code ?? "not_connected"}`);
      return { queued: false, reason: "not_connected", error: connected.message };
    }
    if (await confirmAcceptancePending(supabase, propertyId)) {
      console.log(`[ruAriDelta] ${trigger} delta held: a channel acceptance is pending for ${propertyId}`);
      return { queued: false, reason: "confirm_pending" };
    }

    // Park the edit instead of sleeping on it: a Deno isolate dies long before a 5-minute wait
    // elapses, so an in-process sleep silently lost the last click. The shared background queue
    // already collapses one pending row per `method_key`, so a burst of restriction/rate clicks
    // becomes exactly one delayed refresh — carrying the UNION of the parked spans, so a block
    // in September followed by a release in October cannot lose either range.
    const scope = ruDeltaScopeForTrigger(trigger);
    if (!options.force) {
      const sinceLast = await lastRealPushAgeMs(supabase, propertyId);
      if (sinceLast < RU_ARI_DELTA_DEBOUNCE_MS) {
        const delayMs = RU_ARI_DELTA_DEBOUNCE_MS - sinceLast;
        // Scope-keyed: a rates delta and an availability delta must never collapse into each
        // other, or the coalesced row would publish the half nobody edited.
        const methodKey = `${RU_ARI_DELTA_QUEUE_ACTION}:${propertyId}:${scope}`;
        let from = options.dateFrom ?? null;
        let to = options.dateTo ?? null;
        let units = options.onlyUnitIds && options.onlyUnitIds.length > 0 ? [...options.onlyUnitIds] : null;
        let forceAvb = options.forceAvailability === true && scope !== 'rates';
        try {
          const { data: pending } = await supabase
            .from("ru_call_queue")
            .select("payload")
            .eq("method_key", methodKey)
            .eq("status", "pending")
            .limit(1);
          const prior = (pending?.[0]?.payload ?? null) as Record<string, unknown> | null;
          if (prior) {
            const priorFrom = typeof prior.ari_date_from === "string" ? prior.ari_date_from : null;
            const priorTo = typeof prior.ari_date_to === "string" ? prior.ari_date_to : null;
            // Either side unscoped means the parked delta already covers the full window.
            if (!priorFrom || !priorTo || !from || !to) {
              from = null;
              to = null;
            } else {
              from = priorFrom < from ? priorFrom : from;
              to = priorTo > to ? priorTo : to;
            }
            const priorUnits = Array.isArray(prior.only_unit_ids) ? (prior.only_unit_ids as unknown[]).map(String) : null;
            if (!priorUnits || !units) units = null;
            else units = Array.from(new Set([...priorUnits, ...units]));
            if (prior.force_availability === true) forceAvb = true;
          }
        } catch (mergeErr) {
          console.warn("[ruAriDelta] could not merge the parked span, using this one", mergeErr);
        }
        try {
          await supabase.rpc("ru_enqueue_call", {
            _method_key: methodKey,
            _action: RU_ARI_DELTA_QUEUE_ACTION,
            _payload: {
              property_id: propertyId,
              trigger,
              only_unit_ids: units && units.length > 0 ? units : null,
              ari_date_from: from,
              ari_date_to: to,
              force_availability: forceAvb,
              verify_availability_readback: options.verifyAvailabilityReadback === true && scope !== 'rates',
            },
            _property_id: propertyId,
            _priority: 120,
            _delay_ms: delayMs,
          });
          console.log(
            `[ruAriDelta] ${trigger} delta coalesced for ${propertyId} — replays in ${Math.round(delayMs / 1000)}s` +
            ` (window ${from ?? "full"} → ${to ?? "full"})`,
          );
          return { queued: true, reason: "coalesced" };

        } catch (queueErr) {
          // Parking failed — fall through and write now rather than losing the edit entirely.
          console.warn("[ruAriDelta] coalesce enqueue failed, pushing inline", queueErr);
        }
      }
    }


    const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
      body: {
        property_id: propertyId,
        action: "refresh_ari",
        trigger,
        ...(options.onlyUnitIds && options.onlyUnitIds.length > 0 ? { only_unit_ids: options.onlyUnitIds } : {}),
        ...(options.dateFrom ? { ari_date_from: options.dateFrom } : {}),
        ...(options.dateTo ? { ari_date_to: options.dateTo } : {}),
        verify_readback: false,
        verify_availability_readback: options.verifyAvailabilityReadback === true && scope !== 'rates',
        // A booking must close the sold nights, and a reopen must open them, even if a hash race
        // says availability is unchanged.
        ...((options.force || options.forceAvailability) && scope !== 'rates' ? { force_availability: true } : {}),

      },
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
