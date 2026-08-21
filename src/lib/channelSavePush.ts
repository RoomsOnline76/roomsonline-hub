/**
 * Save-time channel delivery for mandatory field changes.
 *
 * When a property save touches a field the channel requires, the matching section is
 * pushed and then *confirmed* against the sync ledger before the operator is told it
 * landed. Sections run one after another so a single save cannot trip the channel's
 * rate limit, and a rate-limited section reports "queued", never "sent".
 */

import { queueChannelContentSync, queueChannelRatesSync } from "@/lib/channelContentSync";
import { CHANNEL_EDIT_GATE_REASON, channelEditGateState } from "@/lib/channelEditGate";
import { CHANNEL_MANAGER } from "@/lib/channelVocabulary";
import { confirmChannelPush } from "@/lib/channelPushConfirm";
import {
  joinFieldLabels,
  sectionsOf,
  type ChangedChannelField,
  type ChannelPushSection,
} from "@/lib/channelPushFields";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export interface ChannelPushNotifier {
  (input: { title: string; description: string; variant?: "default" | "destructive" }): void;
}

const activeConfirmations = new Map<string, symbol>();

async function triggerSection(propertyId: string, section: ChannelPushSection): Promise<string | null> {
  if (section === "company") {
    const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
      body: { action: "ensure_company_details", property_id: propertyId, resend_if_changed: true },
    });
    if (error) return error.message;
    if (data?.success === false) return data?.error?.message ?? "The channel rejected the company profile.";
    return null;
  }
  const outcome = section === "content"
    ? await queueChannelContentSync(propertyId, "property_save_mandatory_fields")
    : await queueChannelRatesSync(propertyId, "property_save_mandatory_fields");
  return outcome?.error ?? null;
}

/**
 * Push and confirm every section touched by this save, then report per section with the
 * exact field names that were sent.
 */
export async function pushChangedChannelFields(
  propertyId: string,
  changed: ChangedChannelField[],
  notify: ChannelPushNotifier,
): Promise<void> {
  const sections = sectionsOf(changed);
  if (sections.length === 0) return;
  // Before the property has cleared the first thirteen Channel onboarding steps there is
  // nothing to push and nothing to report: no channel call, no toast lifecycle.
  const gate = await channelEditGateState(propertyId);
  if (!gate.open) {
    console.log(
      `[channel save push] silent for ${propertyId} — Channel onboarding incomplete: ${gate.missing.join("; ")}`,
    );
    return;
  }
  const confirmation = Symbol(propertyId);
  activeConfirmations.set(propertyId, confirmation);
  const delivered: string[] = [];
  const deferred: string[] = [];

  // Sections whose delta parked: keep watching so the eventual background delivery is
  // reported instead of landing silently minutes later.
  const parked: { section: ChannelPushSection; labels: string; sinceIso: string }[] = [];
  const failed: string[] = [];
  const reasons: string[] = [];

  for (const section of sections) {
    const fields = changed.filter((f) => f.section === section);
    const labels = joinFieldLabels(fields);
    const sinceIso = new Date(Date.now() - 5_000).toISOString();

    const triggerError = await triggerSection(propertyId, section);
    if (triggerError) {
      failed.push(labels);
      reasons.push(triggerError);
      continue;
    }

    const { verdict, reason } = await confirmChannelPush({ propertyId, section, sinceIso });
    if (verdict === "delivered") {
      delivered.push(labels);
    } else if (verdict === "not_owed") {
      // Nothing is owed: the channel already holds this value, or the listing is not distributed.
      // Stay silent unless the ledger gave a reason worth telling the operator.
      if (reason && !/nothing the channel cares about|already pushed/i.test(reason)) {
        deferred.push(labels);
        reasons.push(reason);
      }
      continue;
    } else if (verdict === "failed") {
      failed.push(labels);
      reasons.push(reason ?? "No reason returned");
    } else {
      deferred.push(labels);
      parked.push({ section, labels, sinceIso });
      if (reason) reasons.push(reason);
    }
  }

  // A newer save owns the UI now; its watcher will report the final state.
  if (activeConfirmations.get(propertyId) !== confirmation) return;
  activeConfirmations.delete(propertyId);
  if (failed.length > 0) {
    notify({
      title: `Channel update rejected`,
      description: `${failed.join(", ")}: ${Array.from(new Set(reasons)).join("; ")}`,
      variant: "destructive",
    });
  } else if (deferred.length > 0) {
    notify({
      title: `Channel update queued`,
      description: `${deferred.join(", ")} will be delivered automatically${reasons.length ? ` — ${Array.from(new Set(reasons)).join("; ")}` : ""}.`,
    });
  } else if (delivered.length > 0) {
    notify({
      title: `Sent to the ${CHANNEL_MANAGER}`,
      description: `${delivered.join(", ")} — delivery confirmed.`,
    });
  }

  // Parked deltas are re-armed by the backend once readiness clears (typically well inside a
  // few minutes). Watch that longer window in the background and close the loop with a toast.
  if (parked.length === 0) return;
  const late: string[] = [];
  for (const item of parked) {
    const { verdict } = await confirmChannelPush({
      propertyId,
      section: item.section,
      sinceIso: item.sinceIso,
      timeoutMs: 300_000,
      intervalMs: 15_000,
    });
    if (verdict === "delivered") late.push(item.labels);
  }
  if (late.length > 0) {
    notify({
      title: `Sent to the ${CHANNEL_MANAGER}`,
      description: `${late.join(", ")} — delivery confirmed after the readiness gate cleared.`,
    });
  }
}

/**
 * Confirmed rates & availability push for a rate plan change (new season, new/changed season
 * rate, removed season, plan activated/retired/deleted, plan copied).
 *
 * Rate edits always force the delta: the shared helper debounces rates pushes for five minutes
 * per property, which would otherwise silently drop the very change the operator just made.
 *
 * Never blocks the caller's own save toast and never turns a channel failure into a save
 * failure — the toast lifecycle resolves in the background.
 */
export async function pushRatePlanRates(
  propertyId: string | null | undefined,
  trigger:
    | "rate_plan_create"
    | "rate_plan_update"
    | "rate_plan_toggle"
    | "rate_plan_delete"
    | "rate_plan_copy",
  options: { label?: string } = {},
): Promise<void> {
  if (!propertyId) return;
  const label = options.label ?? "Rates";
  const toastId = `ru-rates-${propertyId}`;
  const sinceIso = new Date(Date.now() - 5_000).toISOString();

  toast.loading(`Sending ${label.toLowerCase()} to the ${CHANNEL_MANAGER}…`, { id: toastId });

  const outcome = await queueChannelRatesSync(propertyId, trigger, { force: true });
  if (outcome?.error) {
    toast.error(`${CHANNEL_MANAGER} update rejected`, { id: toastId, description: outcome.error });
    return;
  }
  if (outcome?.queued === false && outcome?.reason === "not_connected") {
    // Not distributed to the channel — nothing is owed, so stay quiet.
    toast.dismiss(toastId);
    return;
  }

  const { verdict, reason } = await confirmChannelPush({ propertyId, section: "rates", sinceIso });
  if (verdict === "delivered") {
    toast.success(`${label} sent to the ${CHANNEL_MANAGER}`, {
      id: toastId,
      description: "Delivery confirmed.",
    });
    return;
  }
  if (verdict === "failed") {
    toast.error(`${CHANNEL_MANAGER} update rejected`, {
      id: toastId,
      description: reason ?? "No reason returned",
    });
    return;
  }
  if (verdict === "not_owed") {
    toast.dismiss(toastId);
    return;
  }

  toast.info(`${label} queued for the ${CHANNEL_MANAGER}`, {
    id: toastId,
    description: `Will be delivered automatically${reason ? ` — ${reason}` : ""}.`,
  });

  // Parked behind the readiness gate: the backend re-arms it. Keep watching so the eventual
  // delivery is reported instead of landing silently minutes later.
  const late = await confirmChannelPush({
    propertyId,
    section: "rates",
    sinceIso,
    timeoutMs: 300_000,
    intervalMs: 15_000,
  });
  if (late.verdict === "delivered") {
    toast.success(`${label} sent to the ${CHANNEL_MANAGER}`, {
      id: toastId,
      description: "Delivery confirmed after the readiness gate cleared.",
    });
  }
}

