/**
 * Frontend helpers for the Rentals United amenity catalogue.
 *
 * The catalogue itself lives in `public.ru_amenities` (synced from
 * `Pull_ListAmenities_RQ`) and is curated with:
 *   - `scope`         — `unit` | `property` | `both` | `hidden`
 *   - `popular_rank`  — RU's "Popular amenities" block, in RU's own order
 *   - `ru_group`      — RU's own grouping (Popular, Security & Safety, Policies, Accessibility)
 *   - `supports_count`— amenities RU accepts a quantity for (internet, parking, cot, pool)
 *
 * Selections are stored on the property / room type as `ru:<AmenityID>` tokens
 * (or `ru:<AmenityID>:<count>` where a quantity applies) so they map 1:1 onto
 * RU's dictionary. Free-text labels remain supported for ROLOS-only facilities.
 */

/** RU requires at least this many amenities per room/unit before a push is accepted. */
export const RU_MIN_ROOM_AMENITIES = 10;

export type RuAmenityScope = "unit" | "property" | "both" | "hidden";

export interface RuAmenity {
  id: number;
  name: string;
  category: string | null;
  is_recommended: boolean;
  scope?: string | null;
  popular_rank?: number | null;
  ru_group?: string | null;
  supports_count?: boolean | null;
}

export const ruToken = (id: number, count?: number) =>
  count && count > 1 ? `ru:${id}:${count}` : `ru:${id}`;

export const isRuToken = (value: string) => /^ru:\d+(:\d+)?$/i.test(value);

export const ruTokenId = (value: string): number | null => {
  const m = value.match(/^ru:(\d+)(?::\d+)?$/i);
  return m ? parseInt(m[1], 10) : null;
};

export const ruTokenCount = (value: string): number => {
  const m = value.match(/^ru:\d+:(\d+)$/i);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
};

/** Ordered category display so the picker always reads the same way. */
export const RU_CATEGORY_ORDER = [
  "Bathroom",
  "Bedroom & Beds",
  "Kitchen & Dining",
  "Living Areas",
  "Internet & Workspace",
  "Entertainment & Media",
  "Heating & Cooling",
  "Laundry & Cleaning",
  "Outdoor & Garden",
  "Pool, Spa & Leisure",
  "Family & Children",
  "Safety & Security",
  "Accessibility",
  "Parking & Transport",
  "Services & Facilities",
  "Views & Location",
  "General",
];

/** RU's own property-level grouping order (COVID "Cleanliness/Safety" is deliberately excluded). */
export const RU_GROUP_ORDER = ["Popular", "Security & Safety", "Policies", "Accessibility"];

export function groupRuAmenities(list: RuAmenity[]): { category: string; items: RuAmenity[] }[] {
  const buckets = new Map<string, RuAmenity[]>();
  for (const a of list) {
    const key = a.category || "General";
    const arr = buckets.get(key);
    if (arr) arr.push(a);
    else buckets.set(key, [a]);
  }
  return [...buckets.entries()]
    .sort((a, b) => {
      const ai = RU_CATEGORY_ORDER.indexOf(a[0]);
      const bi = RU_CATEGORY_ORDER.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .map(([category, items]) => ({
      category,
      items: items.sort((x, y) => x.name.localeCompare(y.name)),
    }));
}

/** Group by RU's own `ru_group` (used for the property-level picker). */
export function groupByRuGroup(list: RuAmenity[]): { group: string; items: RuAmenity[] }[] {
  const buckets = new Map<string, RuAmenity[]>();
  for (const a of list) {
    const key = a.ru_group || a.category || "General";
    const arr = buckets.get(key);
    if (arr) arr.push(a);
    else buckets.set(key, [a]);
  }
  return [...buckets.entries()]
    .sort((a, b) => {
      const ai = RU_GROUP_ORDER.indexOf(a[0]);
      const bi = RU_GROUP_ORDER.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .map(([group, items]) => ({
      group,
      items: items.sort((x, y) => {
        const ar = x.popular_rank ?? 9999;
        const br = y.popular_rank ?? 9999;
        return ar !== br ? ar - br : x.name.localeCompare(y.name);
      }),
    }));
}

/** True when the amenity should be offered on the given picker scope. */
export function inScope(a: RuAmenity, scope: "unit" | "property"): boolean {
  const s = (a.scope || "unit") as RuAmenityScope;
  if (s === "hidden") return false;
  if (s === "both") return true;
  return s === scope;
}

/** Split a stored amenity array into RU-mapped ids (with counts) and leftover labels. */
export function splitAmenityValues(values: string[]): {
  ids: number[];
  counts: Record<number, number>;
  legacy: string[];
} {
  const ids: number[] = [];
  const counts: Record<number, number> = {};
  const legacy: string[] = [];
  for (const v of values) {
    const id = ruTokenId(v);
    if (id != null) {
      ids.push(id);
      counts[id] = ruTokenCount(v);
    } else if (v.trim()) legacy.push(v);
  }
  return { ids, counts, legacy };
}
