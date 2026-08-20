/**
 * Save-time channel delivery for mandatory field changes.
 *
 * When a property save touches a field the channel requires, the matching section is
 * pushed and then *confirmed* against the sync ledger before the operator is told it
 * landed. Sections run one after another so a single save cannot trip the channel's
 * rate limit, and a rate-limited section reports "queued", never "sent".
 */

import { queueChannelContentSync, queueChannelRatesSync } from "@/lib/channelContentSync";
import { CHANNEL_MANAGER } from "@/lib/channelVocabulary";
import { confirmChannelPush } from "@/lib/channelPushConfirm";
import {
  joinFieldLabels,
  sectionsOf,
  type ChangedChannelField,
  type ChannelPushSection,
} from "@/lib/channelPushFields";
import { supabase } from "@/integrations/supabase/client";

export interface ChannelPushNotifier {
  (input: { title: string; description: string; variant?: "default" | "destructive" }): void;
}

const activeConfirmations = new Map<string, symbol>();

const SECTION_LABEL: Record<ChannelPushSection, string> = {
  company: "Company information",
  content: "Listing content",
  rates: "Rates & availability",
};

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
  const confirmation = Symbol(propertyId);
  activeConfirmations.set(propertyId, confirmation);
  const delivered: string[] = [];
  const deferred: string[] = [];
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
}
