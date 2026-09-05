/**
 * Space-scoped slices of the channel amenity catalogue.
 *
 * The full dictionary is ~1600 entries covering the whole property. When an owner is
 * describing one space — a bedroom, a living area, the kitchen — offering the entire
 * catalogue makes the choice harder and invites nonsense (a swimming pool inside
 * Bedroom 2). Each space therefore browses only the categories that can plausibly
 * live in it, while anything already ticked stays visible so nothing silently hides.
 */

import type { RuAmenity } from "@/lib/ruAmenities";

export type RuSpaceKind = "bedroom" | "living" | "kitchen";

/** Categories offered per space, taken from the curated `ru_amenities.category` values. */
export const RU_SPACE_CATEGORIES: Record<RuSpaceKind, string[]> = {
  bedroom: [
    "Bedroom & Beds",
    "Bathroom",
    "Heating & Cooling",
    "Entertainment & Media",
    "Internet & Workspace",
    "Safety & Security",
    "Accessibility",
  ],
  living: [
    "Living Areas",
    "Entertainment & Media",
    "Heating & Cooling",
    "Internet & Workspace",
    "Safety & Security",
    "Accessibility",
  ],
  kitchen: ["Kitchen & Dining", "Laundry & Cleaning"],
};

export const RU_SPACE_LABELS: Record<RuSpaceKind, string> = {
  bedroom: "this bedroom",
  living: "this living area",
  kitchen: "the kitchen",
};

/**
 * Keep only the amenities that belong in the given space. `keepIds` (usually the
 * current selection) is always kept so an existing choice never disappears.
 */
export function filterSpaceAmenities(
  list: RuAmenity[],
  space: RuSpaceKind,
  keepIds: number[] = [],
): RuAmenity[] {
  const allowed = new Set(RU_SPACE_CATEGORIES[space]);
  const keep = new Set(keepIds);
  return list.filter((a) => keep.has(a.id) || allowed.has(a.category || "General"));
}
