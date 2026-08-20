/**
 * Rentals United photo-tag dictionary (ImageTypeID 1-210).
 *
 * RU forwards these tags to sales channels (Booking.com, Airbnb, ...). When we do not
 * supply a tag, RU defaults the first photo to Main (1) and every other photo to
 * Interior (3) — which is why untagged galleries show up as "main / interior" only.
 */
export interface RuImageTag {
  id: number;
  label: string;
  group: string;
}

export const RU_IMAGE_TAGS: RuImageTag[] = [
  { id: 1, label: "Main", group: "General" },
  { id: 2, label: "Floor plan", group: "General" },
  { id: 3, label: "Interior", group: "General" },
  { id: 4, label: "Exterior", group: "General" },
  { id: 5, label: "Aerobics", group: "Activities" },
  { id: 6, label: "Arcade", group: "Activities" },
  { id: 7, label: "Archery", group: "Activities" },
  { id: 8, label: "Basketball court", group: "Activities" },
  { id: 9, label: "BBQ", group: "Activities" },
  { id: 10, label: "Billiard", group: "Activities" },
  { id: 11, label: "Boating", group: "Activities" },
  { id: 12, label: "Bowling", group: "Activities" },
  { id: 13, label: "Canoeing", group: "Activities" },
  { id: 14, label: "Casino", group: "Activities" },
  { id: 15, label: "Children activities", group: "Activities" },
  { id: 16, label: "Cycling", group: "Activities" },
  { id: 17, label: "Darts", group: "Activities" },
  { id: 18, label: "Diving", group: "Activities" },
  { id: 19, label: "Entertainment", group: "Activities" },
  { id: 20, label: "Equipment storage", group: "Activities" },
  { id: 21, label: "Fishing", group: "Activities" },
  { id: 22, label: "Fitness centre / facilities", group: "Activities" },
  { id: 23, label: "Fitness studio", group: "Activities" },
  { id: 24, label: "Game room", group: "Activities" },
  { id: 25, label: "Golf", group: "Activities" },
  { id: 26, label: "Golf cart", group: "Activities" },
  { id: 27, label: "Gym", group: "Activities" },
  { id: 28, label: "Hiking", group: "Activities" },
  { id: 29, label: "Horse-riding", group: "Activities" },
  { id: 30, label: "Hot Spring Bath", group: "Activities" },
  { id: 31, label: "Hunting", group: "Activities" },
  { id: 32, label: "Indoor golf driving range", group: "Activities" },
  { id: 33, label: "Karaoke", group: "Activities" },
  { id: 34, label: "Massage", group: "Activities" },
  { id: 35, label: "Minigolf", group: "Activities" },
  { id: 36, label: "Nightclub", group: "Activities" },
  { id: 37, label: "Outdoor rock climbing", group: "Activities" },
  { id: 38, label: "Pilates", group: "Activities" },
  { id: 39, label: "Pro shop", group: "Activities" },
  { id: 40, label: "Rock climbing wall indoor", group: "Activities" },
  { id: 41, label: "Ropes course team building", group: "Activities" },
  { id: 42, label: "Ski Hill", group: "Activities" },
  { id: 43, label: "Ski School", group: "Activities" },
  { id: 44, label: "Ski Sports", group: "Activities" },
  { id: 45, label: "Skiing", group: "Activities" },
  { id: 46, label: "Snorkeling", group: "Activities" },
  { id: 47, label: "Snowboarding", group: "Activities" },
  { id: 48, label: "Sports", group: "Activities" },
  { id: 49, label: "Squash", group: "Activities" },
  { id: 50, label: "Table tennis", group: "Activities" },
  { id: 51, label: "Tennis court", group: "Activities" },
  { id: 52, label: "Windsurfing", group: "Activities" },
  { id: 53, label: "Yoga", group: "Activities" },
  { id: 54, label: "Alcoholic drinks", group: "Dining" },
  { id: 55, label: "American breakfast", group: "Dining" },
  { id: 56, label: "Asian breakfast", group: "Dining" },
  { id: 57, label: "Breakfast", group: "Dining" },
  { id: 58, label: "Buffet breakfast", group: "Dining" },
  { id: 59, label: "Coffee service", group: "Dining" },
  { id: 60, label: "Continental breakfast", group: "Dining" },
  { id: 61, label: "Couples dining", group: "Dining" },
  { id: 62, label: "Delicatessen", group: "Dining" },
  { id: 63, label: "Dining", group: "Dining" },
  { id: 64, label: "Dinner", group: "Dining" },
  { id: 65, label: "Drinks", group: "Dining" },
  { id: 66, label: "English / Irish breakfast", group: "Dining" },
  { id: 67, label: "Family dining", group: "Dining" },
  { id: 68, label: "Food", group: "Dining" },
  { id: 69, label: "Food and drinks", group: "Dining" },
  { id: 70, label: "Food close-up", group: "Dining" },
  { id: 71, label: "Food court", group: "Dining" },
  { id: 72, label: "Italian breakfast", group: "Dining" },
  { id: 73, label: "Lunch", group: "Dining" },
  { id: 74, label: "Meals", group: "Dining" },
  { id: 75, label: "Non alcoholic drinks", group: "Dining" },
  { id: 76, label: "Outdoor dining", group: "Dining" },
  { id: 77, label: "Restaurant", group: "Dining" },
  { id: 78, label: "Room service dining", group: "Dining" },
  { id: 79, label: "Snack bar", group: "Dining" },
  { id: 80, label: "Airport shuttle", group: "Exterior" },
  { id: 81, label: "Area and facilities", group: "Exterior" },
  { id: 82, label: "Beach", group: "Exterior" },
  { id: 83, label: "Beach / Ocean / Sea view", group: "Exterior" },
  { id: 84, label: "Birds eye", group: "Exterior" },
  { id: 85, label: "Children Playground", group: "Exterior" },
  { id: 86, label: "City shuttle", group: "Exterior" },
  { id: 87, label: "City view", group: "Exterior" },
  { id: 88, label: "Courtyard", group: "Exterior" },
  { id: 89, label: "Detail", group: "Exterior" },
  { id: 90, label: "Dock", group: "Exterior" },
  { id: 91, label: "Entrance", group: "Exterior" },
  { id: 92, label: "Fountain", group: "Exterior" },
  { id: 93, label: "Garden", group: "Exterior" },
  { id: 94, label: "Gated community", group: "Exterior" },
  { id: 95, label: "Gazebo", group: "Exterior" },
  { id: 96, label: "Lake", group: "Exterior" },
  { id: 97, label: "Lake view", group: "Exterior" },
  { id: 98, label: "Landmark", group: "Exterior" },
  { id: 99, label: "Marina", group: "Exterior" },
  { id: 100, label: "Mountain view", group: "Exterior" },
  { id: 101, label: "On-site shops", group: "Exterior" },
  { id: 102, label: "Outdoor banquet area", group: "Exterior" },
  { id: 103, label: "Outdoor wedding area", group: "Exterior" },
  { id: 104, label: "Parking", group: "Exterior" },
  { id: 105, label: "Patio", group: "Exterior" },
  { id: 106, label: "Porch", group: "Exterior" },
  { id: 107, label: "Property", group: "Exterior" },
  { id: 108, label: "Property grounds", group: "Exterior" },
  { id: 109, label: "River view", group: "Exterior" },
  { id: 110, label: "Shopping area", group: "Exterior" },
  { id: 111, label: "Street view", group: "Exterior" },
  { id: 112, label: "Sundeck", group: "Exterior" },
  { id: 113, label: "Supermarket / grocery shop", group: "Exterior" },
  { id: 114, label: "View from property", group: "Exterior" },
  { id: 115, label: "View from room", group: "Exterior" },
  { id: 116, label: "ATM banking on site", group: "Interior" },
  { id: 117, label: "Ballroom", group: "Interior" },
  { id: 118, label: "Bar", group: "Interior" },
  { id: 119, label: "Birthday party area", group: "Interior" },
  { id: 120, label: "Business facilities", group: "Interior" },
  { id: 121, label: "Cafe", group: "Interior" },
  { id: 122, label: "Chapel", group: "Interior" },
  { id: 123, label: "Check in / out kiosk", group: "Interior" },
  { id: 124, label: "Children Playground", group: "Interior" },
  { id: 125, label: "Childrens area", group: "Interior" },
  { id: 126, label: "Concierge desk", group: "Interior" },
  { id: 127, label: "Day care", group: "Interior" },
  { id: 128, label: "Detail", group: "Interior" },
  { id: 129, label: "Entrance", group: "Interior" },
  { id: 130, label: "Fireplace", group: "Interior" },
  { id: 131, label: "Gift shop", group: "Interior" },
  { id: 132, label: "Hallway", group: "Interior" },
  { id: 133, label: "Indoor wedding", group: "Interior" },
  { id: 134, label: "Laundry room", group: "Interior" },
  { id: 135, label: "Library", group: "Interior" },
  { id: 136, label: "Lobby", group: "Interior" },
  { id: 137, label: "Lobby sitting area", group: "Interior" },
  { id: 138, label: "Lounge", group: "Interior" },
  { id: 139, label: "Meeting / conference room", group: "Interior" },
  { id: 140, label: "Patio", group: "Interior" },
  { id: 141, label: "Property amenity", group: "Interior" },
  { id: 142, label: "Reception", group: "Interior" },
  { id: 143, label: "Reception hall", group: "Interior" },
  { id: 144, label: "RV or truck parking", group: "Interior" },
  { id: 145, label: "Sports bar", group: "Interior" },
  { id: 146, label: "Staircase", group: "Interior" },
  { id: 147, label: "Animals", group: "Other" },
  { id: 148, label: "Certificate / award", group: "Other" },
  { id: 149, label: "Location / map", group: "Other" },
  { id: 150, label: "Logo / sign", group: "Other" },
  { id: 151, label: "Other", group: "Other" },
  { id: 152, label: "Pets", group: "Other" },
  { id: 153, label: "Aqua park", group: "Pool" },
  { id: 154, label: "Children's pool", group: "Pool" },
  { id: 155, label: "Indoor pool", group: "Pool" },
  { id: 156, label: "Indoor / Outdoor pool", group: "Pool" },
  { id: 157, label: "Infinity pool", group: "Pool" },
  { id: 158, label: "Lap pool", group: "Pool" },
  { id: 159, label: "Natural pool", group: "Pool" },
  { id: 160, label: "Outdoor pool", group: "Pool" },
  { id: 161, label: "Pool view", group: "Pool" },
  { id: 162, label: "Pool waterfall", group: "Pool" },
  { id: 163, label: "Poolside bar", group: "Pool" },
  { id: 164, label: "Rooftop pool", group: "Pool" },
  { id: 165, label: "Swimming pool", group: "Pool" },
  { id: 166, label: "Water park", group: "Pool" },
  { id: 167, label: "Waterslide", group: "Pool" },
  { id: 168, label: "Balcony / terrace", group: "Rooms" },
  { id: 169, label: "Bathroom", group: "Rooms" },
  { id: 170, label: "Bathroom amenities", group: "Rooms" },
  { id: 171, label: "Bed", group: "Rooms" },
  { id: 172, label: "Bedroom", group: "Rooms" },
  { id: 173, label: "Bunk bed", group: "Rooms" },
  { id: 174, label: "Business facilities", group: "Rooms" },
  { id: 175, label: "Coffee / tea facilities", group: "Rooms" },
  { id: 176, label: "Communal kitchen", group: "Rooms" },
  { id: 177, label: "Cot", group: "Rooms" },
  { id: 178, label: "Deep soaking bathtub", group: "Rooms" },
  { id: 179, label: "Dining area", group: "Rooms" },
  { id: 180, label: "Hot Tub", group: "Rooms" },
  { id: 181, label: "Jetted Tub", group: "Rooms" },
  { id: 182, label: "Kitchen", group: "Rooms" },
  { id: 183, label: "Kitchenette", group: "Rooms" },
  { id: 184, label: "Living area", group: "Rooms" },
  { id: 185, label: "Living room", group: "Rooms" },
  { id: 186, label: "Microwave", group: "Rooms" },
  { id: 187, label: "Minibar", group: "Rooms" },
  { id: 188, label: "Mosquito nets", group: "Rooms" },
  { id: 189, label: "Refrigerator", group: "Rooms" },
  { id: 190, label: "Room", group: "Rooms" },
  { id: 191, label: "Room changing table", group: "Rooms" },
  { id: 192, label: "Safe", group: "Rooms" },
  { id: 193, label: "Shower", group: "Rooms" },
  { id: 194, label: "Sink", group: "Rooms" },
  { id: 195, label: "Toilet", group: "Rooms" },
  { id: 196, label: "TV and multimedia", group: "Rooms" },
  { id: 197, label: "Facial", group: "Spa" },
  { id: 198, label: "Hair Salon", group: "Spa" },
  { id: 199, label: "Indoor spa tub", group: "Spa" },
  { id: 200, label: "Nail Salon", group: "Spa" },
  { id: 201, label: "Outdoor spa tub", group: "Spa" },
  { id: 202, label: "Reception", group: "Spa" },
  { id: 203, label: "Sauna", group: "Spa" },
  { id: 204, label: "Solarium", group: "Spa" },
  { id: 205, label: "Spa treatment", group: "Spa" },
  { id: 206, label: "Spa tub", group: "Spa" },
  { id: 207, label: "Steam room", group: "Spa" },
  { id: 208, label: "Treatment room", group: "Spa" },
  { id: 209, label: "Turkish bath", group: "Spa" },
  { id: 210, label: "Vichy Shower", group: "Spa" },
];

/** Reserved: the main photo always carries tag 1, the fallback for untagged photos is 3. */
export const RU_TAG_MAIN = 1;
export const RU_TAG_INTERIOR = 3;

/** Popular-first shortlist surfaced before the full searchable dictionary. */
export const RU_POPULAR_TAG_IDS: number[] = [
  1, 4, 3, 2, 107, 114, 83, 93, 105, 104, 91,
  172, 171, 169, 193, 195, 182, 183, 185, 184, 179, 190, 168,
  160, 156, 196, 192, 100, 63,
];

const BY_ID = new Map<number, RuImageTag>(RU_IMAGE_TAGS.map((t) => [t.id, t]));

export function getRuImageTag(id: number): RuImageTag | undefined {
  return BY_ID.get(id);
}

export function ruImageTagLabel(id: number): string {
  const tag = BY_ID.get(id);
  if (!tag) return `Tag ${id}`;
  return tag.group === "General" ? tag.label : `${tag.group} - ${tag.label}`;
}

export const RU_POPULAR_TAGS: RuImageTag[] = RU_POPULAR_TAG_IDS
  .map((id) => BY_ID.get(id))
  .filter((t): t is RuImageTag => Boolean(t));

/** Grouped view of the full dictionary, for the searchable picker. */
export function ruImageTagGroups(): { group: string; tags: RuImageTag[] }[] {
  const map = new Map<string, RuImageTag[]>();
  for (const tag of RU_IMAGE_TAGS) {
    const list = map.get(tag.group) || [];
    list.push(tag);
    map.set(tag.group, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === "General" ? -1 : b[0] === "General" ? 1 : a[0].localeCompare(b[0])))
    .map(([group, tags]) => ({ group, tags }));
}

/**
 * URL-keyed tag map stored on `properties.ru_image_tags` /
 * `hostfully_room_types.ru_image_tags`: `{ "<image url>": [4, 83] }`.
 */
export type RuImageTagMap = Record<string, number[]>;

export function normalizeRuImageTagMap(value: unknown): RuImageTagMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: RuImageTagMap = {};
  for (const [url, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!url) continue;
    const list = Array.isArray(ids) ? ids : [ids];
    const clean = list
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id >= 1 && id <= 210);
    if (clean.length) out[url] = [...new Set(clean)];
  }
  return out;
}

/** Explicit main-image designation: tag 1 (Main) on exactly one gallery URL. */
export function mainImageState(
  map: RuImageTagMap | undefined,
  urls: string[],
): { url: string | null; count: number } {
  const gallery = new Set(urls.filter(Boolean));
  const flagged = Object.entries(map || {})
    .filter(([url, ids]) => gallery.has(url) && (ids || []).includes(RU_TAG_MAIN))
    .map(([url]) => url);
  return { url: flagged[0] ?? null, count: flagged.length };
}

/** The single URL flagged Main, or null when none / more than one is flagged. */
export function findMainImageUrl(
  map: RuImageTagMap | undefined,
  urls: string[],
): string | null {
  const state = mainImageState(map, urls);
  return state.count === 1 ? state.url : null;
}

/** Strip Main from every image, then flag `url` as Main. */
export function setMainImageUrl(
  map: RuImageTagMap | undefined,
  urls: string[],
  url: string,
): RuImageTagMap {
  const out: RuImageTagMap = {};
  for (const [key, ids] of Object.entries(map || {})) {
    const rest = (ids || []).filter((id) => id !== RU_TAG_MAIN);
    if (rest.length) out[key] = rest;
  }
  if (url) out[url] = [RU_TAG_MAIN, ...(out[url] || [])];
  return out;
}

/** Drop tag entries whose image is no longer in the gallery. */
export function pruneRuImageTagMap(map: RuImageTagMap, urls: string[]): RuImageTagMap {
  const keep = new Set(urls);
  const out: RuImageTagMap = {};
  for (const [url, ids] of Object.entries(map)) {
    if (keep.has(url)) out[url] = ids;
  }
  return out;
}

/**
 * Primary tag pushed as `ImageTypeID`. The gallery's first photo is always Main (1);
 * everything else uses its first selected tag, falling back to Interior (3).
 */
export function resolvePrimaryRuTag(tags: number[] | undefined, isMain: boolean): number {
  if (isMain) return RU_TAG_MAIN;
  const first = (tags || []).find((id) => id !== RU_TAG_MAIN);
  return first ?? RU_TAG_INTERIOR;
}

/** Extra tags emitted as repeated <Image> nodes (RU carries one tag per node). */
export function resolveSecondaryRuTags(tags: number[] | undefined, primary: number): number[] {
  return [...new Set(tags || [])].filter((id) => id !== primary && id !== RU_TAG_MAIN);
}

/**
 * Gallery order with `url` first.
 *
 * The channel always treats the first photo as the main one, so flagging an image Main
 * must also move it to position 1 — otherwise the tag and the pushed order disagree.
 */
export function moveImageFirst(urls: string[], url: string): string[] {
  const list = (urls || []).filter(Boolean);
  if (!url || !list.includes(url)) return list;
  return [url, ...list.filter((u) => u !== url)];
}
