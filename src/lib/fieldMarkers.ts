/**
 * Unified field marker helper.
 *
 * A marked field has exactly two visual states:
 *   - outstanding  → solid 2px pink (mandatory) / blue (recommended) border
 *   - complete     → the same border, faded, no ring, no tint
 *
 * There are two ways a marker can be applied:
 *   1. Declaratively, by the component that owns the control (this helper). The
 *      component knows the value currently on screen, so the border flips the
 *      instant the requirement is met — before the record is saved.
 *   2. Imperatively, by the requirement painter (`requirementFocus.ts`), which
 *      is driven by SAVED data and only covers fields the component has not
 *      marked itself.
 *
 * Controls marked with this helper publish `data-req-live="1"`, which tells the
 * painter to leave their border alone (it still tags them so "Show me" can walk
 * to them). That way the two systems can never contradict each other.
 */

import { isChannelMandatory } from "@/lib/channelMandatoryFields";

export type MarkerTier = "mandatory" | "recommended";

export interface MarkerProps {
  className?: string;
  "data-channel-satisfied"?: "1" | "0";
  "data-req-live"?: "1";
  "data-req-tier"?: MarkerTier;
}

/**
 * Props for a marked control. Returns `{}` for fields that are not marked, so it
 * can be spread unconditionally.
 *
 * @param field     property-editor field name (same key the registry uses)
 * @param satisfied whether the value currently on screen meets the requirement
 * @param tier      visual tier; mandatory (pink) by default
 */
export function fieldMarker(
  field: string,
  satisfied: boolean | null | undefined,
  tier: MarkerTier = "mandatory",
): MarkerProps {
  if (tier === "mandatory" && !isChannelMandatory(field)) return {};
  return {
    className: tier === "mandatory" ? "channel-required" : "channel-recommended",
    "data-channel-satisfied": satisfied ? "1" : "0",
    "data-req-live": "1",
    "data-req-tier": tier,
  };
}

/**
 * Marker props for a control that is not in the channel-mandatory registry but
 * still needs the same treatment (cards that own their own mandatory set).
 */
export function forcedFieldMarker(
  satisfied: boolean | null | undefined,
  tier: MarkerTier = "mandatory",
): MarkerProps {
  return {
    className: tier === "mandatory" ? "channel-required" : "channel-recommended",
    "data-channel-satisfied": satisfied ? "1" : "0",
    "data-req-live": "1",
    "data-req-tier": tier,
  };
}

/** True when an element already carries a live marker. */
export function hasLiveMarker(el: Element): boolean {
  return el.getAttribute("data-req-live") === "1";
}

/**
 * Data flags only, for controls that already compose their border class through
 * `cn(..., channelMandatoryClass(field))`. Spread next to the class:
 *   className={cn("h-7", channelMandatoryClass("toilets"))} {...markerFlags(ok)}
 */
export function markerFlags(
  satisfied: boolean | null | undefined,
): { "data-channel-satisfied": "1" | "0"; "data-req-live": "1" } {
  return { "data-channel-satisfied": satisfied ? "1" : "0", "data-req-live": "1" };
}
