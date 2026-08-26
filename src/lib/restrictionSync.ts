import { toast } from "sonner";
import { queueChannelRatesSync } from "@/lib/channelContentSync";
import { CHANNEL_EDIT_GATE_REASON, channelEditGateState } from "@/lib/channelEditGate";

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
  /** The nights this restriction touched — scopes the channel write to that span. */
  range: { from?: string | null; to?: string | null } = {},
): Promise<{ pushed: number; skipped: number; failed: number; pending: number }> {
  const unique = Array.from(new Set(propertyIds.filter(Boolean)));
  const summary = { pushed: 0, skipped: 0, failed: 0, pending: 0 };
  if (unique.length === 0) return summary;

  // Properties still inside Channel onboarding own no channel delivery: no spinner, no
  // toast, no queued delta. Silence here keeps the save honest.
  const gated: string[] = [];
  for (const propertyId of unique) {
    const gate = await channelEditGateState(propertyId);
    if (gate.open) gated.push(propertyId);
    else summary.skipped += 1;
  }
  if (gated.length === 0) return summary;

  const toastId = toast.loading("Updating the Channel Manager…");
  const failures: string[] = [];

  for (const propertyId of gated) {
    try {
      // Not awaited to completion at the channel: the delta is queued server-side and the push
      // continues in the background so the save never hangs on the round-trip.
      // No force: repeated clicks coalesce into one full-window write instead of one write
      // each, and the shared helper waits out the debounce rather than dropping the edit.
      const result = await queueChannelRatesSync(propertyId, `${label}_change`, {
        dateFrom: range.from ?? null,
        dateTo: range.to ?? null,
      });
      if (result?.reason === "gate_pending") {
        summary.pending += 1;
        continue;
      }
      if (
        result?.reason === "not_connected" ||
        result?.reason === "no_property" ||
        result?.reason === CHANNEL_EDIT_GATE_REASON
      ) {
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
      `Saved — Channel Manager updating in the background (${summary.pushed} propert${summary.pushed === 1 ? "y" : "ies"})`,
      { id: toastId },
    );
  } else {
    toast.info("Saved — no Channel Manager listing to update", { id: toastId });
  }

  return summary;
}
