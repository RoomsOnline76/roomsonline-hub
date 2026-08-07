import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Manual restrictions (stop sell / min stay / max stay / lead days) are stored in
 * `property_availability` and overlay the season-derived ARI window when we push to
 * Rentals United. Saving a restriction therefore has to trigger an ARI refresh, otherwise
 * the channel keeps selling on the old rules until the 6-hourly cron catches up.
 *
 * Properties that are not listed at RU return RU_NOT_LISTED — that is a skip, not a failure.
 */
export async function syncRestrictionsToChannels(
  propertyIds: string[],
  label = "restriction",
): Promise<{ pushed: number; skipped: number; failed: number }> {
  const unique = Array.from(new Set(propertyIds.filter(Boolean)));
  const summary = { pushed: 0, skipped: 0, failed: 0 };
  if (unique.length === 0) return summary;

  const toastId = toast.loading("Syncing to channels…");
  const failures: string[] = [];

  for (const propertyId of unique) {
    try {
      const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
        body: { property_id: propertyId, action: "refresh_ari", trigger: `${label}_change` },
      });
      const code: string | undefined = data?.error?.code;
      if (code === "RU_NOT_LISTED" || code === "RU_NOT_CONFIGURED") {
        summary.skipped += 1;
        continue;
      }
      if (error || data?.success === false) {
        summary.failed += 1;
        failures.push(data?.error?.message || error?.message || "Unknown channel error");
        continue;
      }
      summary.pushed += 1;
    } catch (e: any) {
      summary.failed += 1;
      failures.push(e?.message || "Unknown channel error");
    }
  }

  if (summary.failed > 0) {
    toast.error(`Channel sync failed for ${summary.failed} propert${summary.failed === 1 ? "y" : "ies"}`, {
      id: toastId,
      description: failures[0]?.slice(0, 240),
    });
  } else if (summary.pushed > 0) {
    toast.success(
      `Synced to channels (${summary.pushed} propert${summary.pushed === 1 ? "y" : "ies"})`,
      { id: toastId },
    );
  } else {
    toast.info("Saved — no Channel Manager listing to sync", { id: toastId });
  }

  return summary;
}
