/**
 * Confirmed channel delivery for property saves.
 *
 * A push is only reported as delivered once the sync ledger (`ru_sync_runs`) shows an
 * accepted run for the section — never on the strength of "the request returned 200".
 * Rate-limited / queued outcomes report `deferred` so the operator is told the truth
 * instead of a false success.
 */

import { supabase } from "@/integrations/supabase/client";
import type { ChannelPushSection } from "@/lib/channelPushFields";

export type ChannelPushVerdict = "delivered" | "deferred" | "failed" | "not_owed" | "unknown";

export interface ChannelPushOutcome {
  verdict: ChannelPushVerdict;
  reason: string | null;
}

/** Ledger actions per section: [accepted, deferred/queued, skipped]. */
const SECTION_ACTIONS: Record<ChannelPushSection, { accepted: string[]; deferred: string[]; skipped: string[] }> = {
  company: {
    accepted: ["ensure_company_details", "fill_company_details", "push_company_details"],
    deferred: ["ensure_company_details_deferred"],
    skipped: ["ensure_company_details_skipped"],
  },
  content: {
    accepted: ["static_delta", "push_property", "push_static"],
    deferred: ["static_delta_deferred", "static_delta_pending", "static_delta_queued"],
    skipped: ["static_delta_skipped", "static_delta_noop"],
  },
  rates: {
    accepted: ["refresh_ari", "push_ari", "ari_delta"],
    deferred: ["refresh_ari_deferred", "ari_delta_pending", "refresh_ari_queued"],
    skipped: ["refresh_ari_skipped", "ari_delta_noop"],
  },
};

const RATE_LIMIT_PATTERN = /rate.?limit|too many|deferred|429|queued|throttl/i;

interface SyncRunRow {
  action: string | null;
  success: boolean | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

/**
 * Poll the sync ledger until this section reports an outcome newer than `sinceIso`.
 * The poll interval is deliberately slow (5s): confirming delivery must never itself
 * contribute to a channel rate limit.
 */
export async function confirmChannelPush(options: {
  propertyId: string;
  section: ChannelPushSection;
  sinceIso: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<ChannelPushOutcome> {
  const { propertyId, section, sinceIso } = options;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const actions = SECTION_ACTIONS[section];
  const watched = [...actions.accepted, ...actions.deferred, ...actions.skipped];
  const deadline = Date.now() + timeoutMs;
  let lastDeferredReason: string | null = null;
  let sawAny = false;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("ru_sync_runs")
      .select("action, success, error_code, error_message, created_at")
      .eq("property_id", propertyId)
      .in("action", watched)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      // No read access to the ledger (or a transient failure) — say so rather than guess.
      return { verdict: "unknown", reason: error.message };
    }

    for (const row of ((data ?? []) as SyncRunRow[])) {
      const action = String(row.action ?? "");
      sawAny = true;
      const reason = row.error_message ?? row.error_code ?? null;
      if (actions.skipped.includes(action)) {
        return { verdict: "not_owed", reason };
      }
      if (actions.accepted.includes(action)) {
        if (row.success === true) return { verdict: "delivered", reason: null };
        if (reason && RATE_LIMIT_PATTERN.test(reason)) {
          lastDeferredReason = reason;
          continue;
        }
        return { verdict: "failed", reason };
      }
      if (actions.deferred.includes(action)) {
        lastDeferredReason = reason ?? "The channel is rate-limited — the push is queued.";
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastDeferredReason) return { verdict: "deferred", reason: lastDeferredReason };
  return sawAny
    ? { verdict: "deferred", reason: "The channel has not confirmed this change yet." }
    : { verdict: "unknown", reason: "No delivery record appeared for this change yet." };
}
