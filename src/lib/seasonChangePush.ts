/**
 * Season changes are a rates & availability change — they must reach the channel.
 *
 * A season is a date window, and every nightly price the channel holds is resolved through it.
 * Moving, adding, renaming or removing a season therefore re-prices real nights even though no
 * rate figure was touched. Two things have to happen before the delta is worth pushing:
 *
 *  1. The Calendar's seasons are mirrored into `rolos_shared_seasons` — Rate Plans price against
 *     that mirror. It used to be refreshed only when the Rate Plan editor was opened, so a save
 *     that moved a season pushed the *old* windows (or resolved nothing new at all and reported
 *     "nothing owed"), which is exactly why season edits looked like they never left ROL'OS.
 *  2. Portfolio siblings that inherited the new dates get the same treatment — their published
 *     prices moved too.
 */

import { supabase } from "@/integrations/supabase/client";
import { pushRatePlanRates } from "@/lib/channelSavePush";

/** Refresh the shared-season mirror so rate resolution sees the new windows. */
export async function mirrorCalendarSeasons(propertyId: string): Promise<void> {
  try {
    await supabase.functions.invoke("rolos-rate-plans", {
      body: { action: "sync_seasons", property_id: propertyId },
    });
  } catch (error) {
    console.warn("[season change] shared-season mirror failed:", error);
  }
}

/**
 * Mirror the edited property's seasons, then mirror and push each sibling that inherited them.
 * The edited property's own delta is pushed by the save's changed-field flow; this only closes
 * the gap for the siblings so no property is left publishing stale season windows.
 */
export async function propagateSeasonChange(
  propertyId: string,
  siblingIds: readonly string[],
): Promise<void> {
  await mirrorCalendarSeasons(propertyId);
  for (const siblingId of siblingIds) {
    await mirrorCalendarSeasons(siblingId);
    await pushRatePlanRates(siblingId, "rate_plan_update", { label: "Season dates" });
  }
}
