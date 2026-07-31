/**
 * Frontend helpers for the Rentals United amenity catalogue.
 *
 * The catalogue itself lives in `public.ru_amenities` (synced from
 * `Pull_ListAmenities_RQ`). Selections are stored on each room type as
 * `ru:<AmenityID>` tokens so they map 1:1 onto RU's dictionary.
 */

/** RU requires at least this many amenities per room/unit before a push is accepted. */
export const RU_MIN_ROOM_AMENITIES = 10;

export interface RuAmenity {
  id: number;
  name: string;
  category: string | null;
  is_recommended: boolean;
}

export const ruToken = (id: number) => `ru:${id}`;

export const isRuToken = (value: string) => /^ru:\d+$/i.test(value);

export const ruTokenId = (value: string): number | null => {
  const m = value.match(/^ru:(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
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

/** Split a stored amenity array into RU-mapped ids and leftover legacy labels. */
export function splitAmenityValues(values: string[]): { ids: number[]; legacy: string[] } {
  const ids: number[] = [];
  const legacy: string[] = [];
  for (const v of values) {
    const id = ruTokenId(v);
    if (id != null) ids.push(id);
    else if (v.trim()) legacy.push(v);
  }
  return { ids, legacy };
}
