/**
 * Gate #10 — Distances to attractions.
 *
 * Nearby attractions are captured per property in `local_experiences` (title, category,
 * `distance_km`). The channel supports them through the optional `<Distances>` block of
 * Push_PutProperty_RQ, where every entry references a destination id from the channel's own
 * dictionary (verified live via Pull_ListDestinations_RQ, cached in `ru_destinations`).
 *
 * This is a NICE-TO-HAVE: it never blocks a push. When nothing maps we emit nothing at all —
 * an empty `<Distances/>` wrapper is exactly the shape the channel parser rejects elsewhere.
 */

export interface RuDistanceEntry {
  destination_id: number;
  /** Distance in kilometres, one decimal. */
  value: number;
  /** Dictionary name, kept for evidence/logging only. */
  destination_name: string;
  /** Attraction the distance came from, for evidence/logging only. */
  source: string;
}

/** Generic dictionary names we look for. Order matters: first match wins per attraction. */
export const GENERIC_DESTINATION_KEYWORDS: Array<{ slug: string; keywords: string[] }> = [
  // Named venues first: a title like "Maritime Museum at Darling Harbour" is a museum, not a port.
  { slug: "beach", keywords: ["beach", "strand"] },
  { slug: "museum", keywords: ["museum", "gallery", "heritage"] },
  { slug: "zoo", keywords: ["zoo", "aquarium"] },
  { slug: "golf course", keywords: ["golf"] },
  { slug: "restaurant", keywords: ["restaurant", "bistro", "eatery", "dining", "cafe", "coffee"] },
  { slug: "supermarket", keywords: ["supermarket", "grocer", "spar", "checkers", "woolworths"] },
  { slug: "market", keywords: ["market"] },
  { slug: "shopping centre", keywords: ["shopping", "mall"] },
  { slug: "park", keywords: ["park", "nature reserve", "trail", "hike", "hiking"] },
  // Then the generic infrastructure destinations.
  { slug: "sea", keywords: ["sea", "ocean", "tidal pool", "coast", "lagoon"] },
  { slug: "marina", keywords: ["marina"] },
  { slug: "port", keywords: ["port", "harbour", "harbor"] },
  { slug: "town centre", keywords: ["town centre", "town center", "village"] },
  { slug: "city centre", keywords: ["city centre", "city center", "downtown", "cbd"] },
  { slug: "airport", keywords: ["airport", "airfield"] },
  { slug: "railway station", keywords: ["railway", "train station"] },
  { slug: "bus stop", keywords: ["bus stop", "bus station"] },
  { slug: "ski-lift", keywords: ["ski lift", "ski-lift"] },
];


/** Category fallback when the attraction title carries no recognisable keyword. */
const CATEGORY_FALLBACK_SLUG: Record<string, string> = {
  dining: "restaurant",
  culture: "museum",
  nature: "park",
};

export const normalizeDestinationName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/["'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** True when a dictionary entry is one of the generic, location-agnostic places. */
export function isGenericDestination(name: string): boolean {
  const slug = normalizeDestinationName(name);
  return GENERIC_DESTINATION_KEYWORDS.some((g) => slug === normalizeDestinationName(g.slug));
}

interface ExperienceRow {
  title?: string | null;
  category?: string | null;
  distance_km?: number | string | null;
  is_active?: boolean | null;
  /** Explicit dictionary mapping chosen by the owner — wins over keyword matching. */
  ru_destination_id?: number | null;
}

interface DestinationRow {
  ru_destination_id: number;
  name: string;
}

/** Resolve the dictionary id for an attraction, or null when nothing matches. */
export function matchDestination(
  experience: ExperienceRow,
  dictionary: Map<string, DestinationRow>,
  byId?: Map<number, DestinationRow>,
): DestinationRow | null {
  const explicit = Number(experience.ru_destination_id);
  if (Number.isFinite(explicit) && explicit > 0) {
    const hit = byId?.get(explicit);
    if (hit) return hit;
    return { ru_destination_id: explicit, name: "explicit" };
  }
  const haystack = normalizeDestinationName(`${experience.title ?? ""} ${experience.category ?? ""}`);
  for (const group of GENERIC_DESTINATION_KEYWORDS) {
    if (group.keywords.some((kw) => haystack.includes(normalizeDestinationName(kw)))) {
      const hit = dictionary.get(normalizeDestinationName(group.slug));
      if (hit) return hit;
    }
  }
  const fallback = CATEGORY_FALLBACK_SLUG[String(experience.category ?? "").toLowerCase()];
  if (fallback) {
    const hit = dictionary.get(normalizeDestinationName(fallback));
    if (hit) return hit;
  }
  return null;
}


/** Map attraction rows + dictionary rows into channel distance entries (nearest wins). */
export function buildDistanceEntries(
  experiences: ExperienceRow[],
  destinations: DestinationRow[],
  maxEntries: number = 10,
): RuDistanceEntry[] {
  const dictionary = new Map<string, DestinationRow>();
  for (const row of destinations) {
    const key = normalizeDestinationName(row.name);
    if (!dictionary.has(key)) dictionary.set(key, row);
  }

  const byId = new Map<number, DestinationRow>();
  for (const row of destinations) byId.set(row.ru_destination_id, row);

  const nearest = new Map<number, RuDistanceEntry>();
  for (const exp of experiences) {
    if (exp.is_active === false) continue;
    const km = Number(exp.distance_km);
    if (!Number.isFinite(km) || km <= 0) continue;
    const dest = matchDestination(exp, dictionary, byId);
    if (!dest) continue;

    const entry: RuDistanceEntry = {
      destination_id: dest.ru_destination_id,
      value: Math.round(km * 10) / 10,
      destination_name: dest.name,
      source: String(exp.title ?? "").trim(),
    };
    const existing = nearest.get(dest.ru_destination_id);
    if (!existing || entry.value < existing.value) nearest.set(dest.ru_destination_id, entry);
  }

  // The channel rejects a whole push with "Duplicate value in distances." — keep one entry per
  // distance value as well as per destination so two attractions at the same km cannot trip it.
  const seenValues = new Set<number>();
  return [...nearest.values()]
    .sort((a, b) => a.value - b.value)
    .filter((e) => {
      if (seenValues.has(e.value)) return false;
      seenValues.add(e.value);
      return true;
    })
    .slice(0, maxEntries);

}

type MinimalClient = {
  from: (table: string) => {
    select: (cols: string) => any;
  };
};

/**
 * Load a property's mappable distances. Returns an empty array on any failure — this is a
 * nice-to-have, so a dictionary miss or a query error must never affect the push outcome.
 */
export async function loadPropertyDistances(
  supabase: MinimalClient,
  propertyId: string,
  maxEntries?: number,
): Promise<RuDistanceEntry[]> {
  try {
    const [{ data: experiences }, { data: destinations }] = await Promise.all([
      supabase
        .from("local_experiences")
        .select("title, category, distance_km, is_active, ru_destination_id")
        .eq("property_id", propertyId)
        .eq("is_active", true),
      supabase.from("ru_destinations").select("ru_destination_id, name").eq("is_generic", true),
    ]);
    if (!Array.isArray(experiences) || !Array.isArray(destinations)) return [];
    return buildDistanceEntries(
      experiences as ExperienceRow[],
      destinations as DestinationRow[],
      maxEntries && maxEntries > 0 ? maxEntries : undefined,
    );
  } catch (_e) {
    return [];
  }
}
