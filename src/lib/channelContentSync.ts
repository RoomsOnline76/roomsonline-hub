import { supabase } from "@/integrations/supabase/client";

/**
 * Outcome of a delta. `reason: "gate_pending"` means the change is real and still owed to the
 * channel: it was parked because the listing does not currently satisfy the mandatory channel
 * gate, and it re-fires automatically as soon as readiness clears. No manual push required.
 */
export interface ChannelSyncOutcome {
  queued?: boolean;
  accepted?: boolean;
  reason?: string;
  error?: string;
  blockers?: string[];
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
  options: { force?: boolean; wait?: boolean } = {},
): Promise<ChannelSyncOutcome | null> {
  if (!propertyId) return null;
  // Phase 2 ledger bookkeeping: the section data is already persisted by the time a
  // delta is queued, so this is the safe place to mark only the affected steps stale.
  void markChannelStepsStale(propertyId, channelLedgerStepsForTrigger(trigger, "content"));
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

