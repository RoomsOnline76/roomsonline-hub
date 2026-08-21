import { supabase } from "@/integrations/supabase/client";
import { channelLedgerStepsForTrigger, markChannelStepsStale } from "@/lib/channelStepLedger";
import { CHANNEL_EDIT_GATE_REASON, channelEditGateState } from "@/lib/channelEditGate";


/**
 * Outcome of a delta. `reason: "gate_pending"` means the change is real and still owed to the
 * channel: it was parked because the listing does not currently satisfy the mandatory channel
 * gate, and it re-fires automatically as soon as readiness clears. No manual push required.
 *
 * `reason: "onboarding_incomplete"` means the property has not cleared the first thirteen
 * Channel onboarding steps: no channel call was made at all and nothing should be reported.
 */
export interface ChannelSyncOutcome {
  queued?: boolean;
  accepted?: boolean;
  reason?: string;
  error?: string;
  blockers?: string[];
}

export interface ChannelSyncOptions {
  force?: boolean;
  wait?: boolean;
  /**
   * Explicit operator/system action (manual "push now", wizard publish, certification
   * console, cron). Bypasses the onboarding gate; ordinary saves must not set this.
   */
  manual?: boolean;
}

/** Ordinary edits stay silent and make no channel call before wizard step 13. */
async function gateBlocks(propertyId: string, manual?: boolean): Promise<boolean> {
  if (manual) return false;
  const gate = await channelEditGateState(propertyId);
  if (gate.open) return false;
  console.log(
    `[channel sync] skipped for ${propertyId} — Channel onboarding incomplete: ${gate.missing.join("; ")}`,
  );
  return true;
}


/**
 * Static content delta to the Channel Manager.
 *
 * Rentals United requires static content (name, type, description, amenities, photos, bed
 * composition, location, policies) to be re-pushed whenever it changes in the PMS — the weekly
 * full refresh alone does not satisfy the White-Label certification requirement.
 *
 * Every save surface that persists static property content should call this after a successful
 * write. The edge function owns all channel logic (connectivity, pause state, fingerprint,
 * debounce, resumable chunking), so a no-op save, an unlisted property or a paused listing costs
 * nothing here.
 *
 * Fire-and-forget: never block a save on the channel round-trip and never surface a channel
 * failure as a save failure. The push itself continues server-side after this call returns, so
 * navigating away from the editor cannot strand it.
 */
export async function queueChannelContentSync(
  propertyId: string | null | undefined,
  trigger: string,
  options: ChannelSyncOptions = {},
): Promise<ChannelSyncOutcome | null> {
  if (!propertyId) return null;
  // Phase 2 ledger bookkeeping: the section data is already persisted by the time a
  // delta is queued, so this is the safe place to mark only the affected steps stale.
  void markChannelStepsStale(propertyId, channelLedgerStepsForTrigger(trigger, "content"));
  if (await gateBlocks(propertyId, options.manual)) {
    return { queued: false, reason: CHANNEL_EDIT_GATE_REASON };
  }
  try {


    const { data, error } = await supabase.functions.invoke("ru-static-delta", {
      body: {
        property_id: propertyId,
        trigger,
        ...(options.force ? { force: true } : {}),
        ...(options.wait ? { wait: true } : {}),
      },
    });
    if (error) {
      console.warn("[channel content sync] failed:", error.message);
      return { error: error.message };
    }
    if (data?.accepted) {
      console.log(`[channel content sync] accepted for ${propertyId} (${trigger})`);
    } else if (data?.queued) {
      console.log(`[channel content sync] pushed content for ${propertyId} (${trigger})`);
    } else {
      console.log(`[channel content sync] skipped (${data?.reason ?? "unknown"}) for ${propertyId}`);
    }
    return data ?? null;
  } catch (err) {
    console.warn("[channel content sync] error:", err);
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Rates & availability (ARI) delta to the Channel Manager.
 *
 * Static content and ARI are separate pushes at Rentals United, so a save that changes what a
 * night costs (seasons, rate plans, season rates, rate prices) or whether it is sellable
 * (stop-sell, restrictions, blocks) must trigger this as well as — or instead of — the content
 * delta. Without it the channel keeps selling on the old prices until the scheduled cron runs.
 *
 * Same rules as the content sync: fire-and-forget, never block a save, never turn a channel
 * failure into a save failure. The shared helper owns connectivity, pause state and the
 * one-push-per-window debounce, so a burst of rate edits becomes a single channel write.
 */
export async function queueChannelRatesSync(
  propertyId: string | null | undefined,
  trigger: string,
  options: { force?: boolean; wait?: boolean } = {},
): Promise<ChannelSyncOutcome | null> {
  if (!propertyId) return null;
  void markChannelStepsStale(propertyId, channelLedgerStepsForTrigger(trigger, "rates"));
  try {

    const { data, error } = await supabase.functions.invoke("ru-ari-delta", {
      body: {
        property_id: propertyId,
        trigger,
        ...(options.force ? { force: true } : {}),
        ...(options.wait ? { wait: true } : {}),
      },
    });
    if (error) {
      console.warn("[channel rates sync] failed:", error.message);
      return { error: error.message };
    }
    if (data?.accepted) {
      console.log(`[channel rates sync] accepted for ${propertyId} (${trigger})`);
    } else if (data?.queued) {
      console.log(`[channel rates sync] pushed rates for ${propertyId} (${trigger})`);
    } else {
      console.log(`[channel rates sync] skipped (${data?.reason ?? "unknown"}) for ${propertyId}`);
    }
    return data ?? null;
  } catch (err) {
    console.warn("[channel rates sync] error:", err);
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

