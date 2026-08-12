import { toast } from "sonner";
import { queueChannelRatesSync } from "@/lib/channelContentSync";

/**
 * Manual restrictions (stop sell / min stay / max stay / lead days) are stored in
 * `property_availability` and overlay the season-derived ARI window when we push to
 * the Channel Manager. Saving a restriction therefore triggers an ARI delta automatically —
 * the operator never has to press a sync button.
 *
 * The delta goes through the shared queue so every outcome is handled the same way everywhere:
 *  - not listed / pushes paused → a skip, not a failure,
 *  - refused by the channel readiness gate → parked and re-fired automatically once the
 *    outstanding readiness items clear,
 *  - transport/channel error → surfaced once, the save itself still stands.
 */
export async function syncRestrictionsToChannels(
  propertyIds: string[],
  label = "restriction",
): Promise<{ pushed: number; skipped: number; failed: number; pending: number }> {
  const unique = Array.from(new Set(propertyIds.filter(Boolean)));
  const summary = { pushed: 0, skipped: 0, failed: 0, pending: 0 };
  if (unique.length === 0) return summary;

  const toastId = toast.loading("Updating the Channel Manager…");
  const failures: string[] = [];

  for (const propertyId of unique) {
    try {
      const result = await queueChannelRatesSync(propertyId, `${label}_change`, {
        force: true,
        wait: true,
      });
      if (result?.reason === "gate_pending") {
        summary.pending += 1;
        continue;
      }
      if (result?.reason === "not_connected" || result?.reason === "no_property") {
        summary.skipped += 1;
        continue;
      }
      if (result?.error) {
        summary.failed += 1;
        failures.push(result.error);
        continue;
      }
      summary.pushed += 1;
    } catch (e: any) {
      summary.failed += 1;
      failures.push(e?.message || "Unknown channel error");
    }
  }

  if (summary.failed > 0) {
    toast.error(`Channel update failed for ${summary.failed} propert${summary.failed === 1 ? "y" : "ies"}`, {
      id: toastId,
      description: failures[0]?.slice(0, 240),
    });
  } else if (summary.pending > 0 && summary.pushed === 0) {
    toast.info("Saved — the channel update pushes itself once readiness clears", { id: toastId });
  } else if (summary.pushed > 0) {
    toast.success(
      `Channel updated (${summary.pushed} propert${summary.pushed === 1 ? "y" : "ies"})`,
      { id: toastId },
    );
  } else {
    toast.info("Saved — no Channel Manager listing to update", { id: toastId });
  }

  return summary;
}
