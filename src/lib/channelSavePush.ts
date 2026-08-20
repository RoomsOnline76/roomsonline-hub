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

  for (const section of sections) {
    const fields = changed.filter((f) => f.section === section);
    const labels = joinFieldLabels(fields);
    const sinceIso = new Date(Date.now() - 5_000).toISOString();

    const triggerError = await triggerSection(propertyId, section);
    if (triggerError) {
      notify({
        title: `${SECTION_LABEL[section]} not sent to the ${CHANNEL_MANAGER}`,
        description: `${labels} could not be delivered: ${triggerError}`,
        variant: "destructive",
      });
      continue;
    }

    const { verdict, reason } = await confirmChannelPush({ propertyId, section, sinceIso });
    if (verdict === "delivered") {
      notify({
        title: `Sent to the ${CHANNEL_MANAGER}`,
        description: `${labels} — confirmed on the ${SECTION_LABEL[section].toLowerCase()} push.`,
      });
    } else if (verdict === "not_owed") {
      // Nothing is owed: the channel already holds this value, or the listing is not distributed.
      // Stay silent unless the ledger gave a reason worth telling the operator.
      if (reason && !/nothing the channel cares about|already pushed/i.test(reason)) {
        notify({
          title: `${SECTION_LABEL[section]} not sent to the ${CHANNEL_MANAGER}`,
          description: `${labels} — ${reason}.`,
        });
      }
      continue;
    } else if (verdict === "failed") {
      notify({
        title: `${SECTION_LABEL[section]} rejected by the ${CHANNEL_MANAGER}`,
        description: `${labels}: ${reason ?? "no reason returned"}`,
        variant: "destructive",
      });
    } else {
      notify({
        title: `${SECTION_LABEL[section]} queued for the ${CHANNEL_MANAGER}`,
        description: `${labels} will be delivered automatically${reason ? ` — ${reason}` : ""}.`,
      });
    }
  }
}
