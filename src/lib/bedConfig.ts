// Bed configuration types and utilities

/**
 * A bed, optionally placed in a named sleeping space.
 *
 * The channel reviews beds PER BEDROOM, so every entry can carry the slot it belongs to.
 * Legacy rows have no `room` — those fold into bedroom 1 so nothing is lost on read.
 */
export interface BedEntry {
  type: string;
  count: number;
  room?: BedRoomSlot;
}

/** Where a bed sits. Only `bedroom` slots count as bedrooms for the channel. */
export interface BedRoomSlot {
  /** 1-based index within its kind: Bedroom 1, Bedroom 2, Living area 1. */
  index: number;
  kind: "bedroom" | "living";
  /**
   * Amenities that belong to THIS sleeping space (`ru:<id>` tokens, same vocabulary as the
   * unit picker). A unit's amenity list describes the whole unit; the channel also reviews
   * what each bedroom itself holds (en-suite, air-conditioning, TV, safe), so those are
   * authored per bedroom here and pushed inside that bedroom's composition block.
   *
   * Stored on the slot, which every bed of the space carries, so no schema change is needed
   * and the value survives the legacy read/flatten round-trip untouched.
   */
  amenities?: string[];
}

/** A sleeping space with the beds authored inside it. */
export interface BedRoomGroup {
  slot: BedRoomSlot;
  beds: BedEntry[];
}


export const BED_TYPES = [
  { value: "king", label: "King" },
  { value: "queen", label: "Queen" },
  { value: "double", label: "Double" },
  { value: "twin", label: "Twin" },
  { value: "single", label: "Single" },
  { value: "sofa-bed", label: "Sofa Bed" },
  { value: "double-sofa-bed", label: "Sleeper Couch / Double Sofa Bed" },

  { value: "bunk", label: "Bunk Bed" },
] as const;

export const bedTypeLabels: Record<string, string> = {
  king: "King",
  queen: "Queen",
  double: "Double",
  twin: "Twin",
  single: "Single",
  "sofa-bed": "Sofa Bed",
  "double-sofa-bed": "Sleeper Couch",
  bunk: "Bunk Bed",
  // Legacy mappings
  "king-twin": "King / Twin",
};

/**
 * How many people each bed of a given type sleeps.
 * `count` on a BedEntry is the NUMBER OF BEDS, never the number of people.
 *
 * These values MUST mirror the channel's sleeping-place table
 * (`RU_BED_SLEEPS` in push-property-to-ru): a single sofa bed counts as one
 * sleeping place, only a sleeper couch / double sofa bed counts as two.
 * Diverging here makes the wizard report 100% coverage while certification blocks.
 */
export const bedTypeSleeps: Record<string, number> = {
  king: 2,
  queen: 2,
  double: 2,
  twin: 1,
  single: 1,
  "sofa-bed": 1,
  "double-sofa-bed": 2,
  bunk: 2,
  // Legacy mappings
  "king-twin": 2,
};


export function sleepsPerBed(type: string): number {
  return bedTypeSleeps[type] ?? 1;
}

/**
 * Total sleeping capacity implied by a bed configuration.
 * e.g. 3 double beds => 6 people.
 */
export function calculateBedCapacity(config: string | BedEntry[] | undefined): number {
  return parseBedConfiguration(config).reduce(
    (sum, bed) => sum + sleepsPerBed(bed.type) * (bed.count || 0),
    0
  );
}


/**
 * Parse bed configuration - handles both legacy string format and new array format
 */
export function parseBedConfiguration(config: string | BedEntry[] | undefined): BedEntry[] {
  if (!config) return [];
  
  // If already an array, return it
  if (Array.isArray(config)) {
    return config.filter(b => b.type && b.count > 0);
  }
  
  // Legacy string format - convert to new format with count of 1
  if (typeof config === "string" && config.trim()) {
    return [{ type: config, count: 1 }];
  }
  
  return [];
}

/**
 * Format bed configuration for display
 */
export function formatBedConfiguration(config: string | BedEntry[] | undefined): string {
  const beds = parseBedConfiguration(config);
  
  if (beds.length === 0) return "Not specified";
  
  return beds
    .map(bed => {
      const label = bedTypeLabels[bed.type] || bed.type;
      if (bed.count === 1) {
        return `1 ${label} Bed`;
      }
      return `${bed.count} ${label} Beds`;
    })
    .join(", ");
}

/**
 * Check if bed configuration has any beds
 */
export function hasBedConfiguration(config: string | BedEntry[] | undefined): boolean {
  return parseBedConfiguration(config).length > 0;
}

/** Read a stored slot, tolerating loose JSON coming back from the database. */
/** Keep only non-empty string tokens, de-duplicated and order-stable. */
export function readSlotAmenities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const token = typeof v === "string" ? v.trim() : "";
    if (token && !out.includes(token)) out.push(token);
  }
  return out;
}

function readSlot(raw: unknown): BedRoomSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { index?: unknown; kind?: unknown };
  const index = Number(candidate.index);
  const kind = candidate.kind === "living" ? "living" : candidate.kind === "bedroom" ? "bedroom" : null;
  if (!kind || !Number.isFinite(index) || index < 1) return null;
  const amenities = readSlotAmenities((raw as { amenities?: unknown }).amenities);
  return { index: Math.floor(index), kind, ...(amenities.length > 0 ? { amenities } : {}) };
}

/**
 * Group an authored bed configuration into sleeping spaces.
 *
 * Legacy shapes (a bare string, or a flat array with no slots) fold into Bedroom 1 so the
 * editor never renders empty and no authored bed is silently dropped. Slot indexes are
 * re-sequenced per kind, so removing "Bedroom 2" leaves 1, 2, 3 rather than a gap.
 */
export function groupBedsByRoom(config: string | BedEntry[] | undefined): BedRoomGroup[] {
  const beds = parseBedConfiguration(config);
  if (beds.length === 0) return [];

  const buckets = new Map<string, BedRoomGroup>();
  for (const bed of beds) {
    const slot = readSlot(bed.room) ?? { index: 1, kind: "bedroom" as const };
    const key = `${slot.kind}:${slot.index}`;
    const existing = buckets.get(key);
    const entry: BedEntry = { type: bed.type, count: bed.count, room: slot };
    if (existing) {
      existing.beds.push(entry);
      // Only one bed of a space normally carries the space's amenities — never lose them.
      if ((existing.slot.amenities?.length ?? 0) === 0 && (slot.amenities?.length ?? 0) > 0) {
        existing.slot = { ...existing.slot, amenities: slot.amenities };
      }
    } else buckets.set(key, { slot, beds: [entry] });
  }

  const ordered = [...buckets.values()].sort((a, b) => {
    if (a.slot.kind !== b.slot.kind) return a.slot.kind === "bedroom" ? -1 : 1;
    return a.slot.index - b.slot.index;
  });

  // Re-sequence so indexes are always contiguous within their kind.
  const counters: Record<BedRoomSlot["kind"], number> = { bedroom: 0, living: 0 };
  return ordered.map((group) => {
    counters[group.slot.kind] += 1;
    const slot: BedRoomSlot = {
      kind: group.slot.kind,
      index: counters[group.slot.kind],
      ...(group.slot.amenities?.length ? { amenities: group.slot.amenities } : {}),
    };
    return { slot, beds: group.beds.map((bed) => ({ ...bed, room: slot })) };
  });
}

/** Flatten sleeping spaces back into the stored `bed_configuration` array. */
export function flattenBedGroups(groups: BedRoomGroup[]): BedEntry[] {
  const counters: Record<BedRoomSlot["kind"], number> = { bedroom: 0, living: 0 };
  return groups.flatMap((group) => {
    counters[group.slot.kind] += 1;
    const slot: BedRoomSlot = {
      kind: group.slot.kind,
      index: counters[group.slot.kind],
      ...(group.slot.amenities?.length ? { amenities: readSlotAmenities(group.slot.amenities) } : {}),
    };
    return group.beds
      .filter((bed) => bed.type && (bed.count || 0) > 0)
      .map((bed) => ({ type: bed.type, count: bed.count, room: slot }));
  });
}

/** Human label for a sleeping space, e.g. "Bedroom 2" / "Living area". */
export function bedRoomSlotLabel(slot: BedRoomSlot, livingCount = 1): string {
  if (slot.kind === "bedroom") return `Bedroom ${slot.index}`;
  return livingCount > 1 ? `Living area ${slot.index}` : "Living area";
}

/** Bedrooms that hold at least one bed — what the channel counts as a bedroom block. */
export function authoredBedroomCount(config: string | BedEntry[] | undefined): number {
  return groupBedsByRoom(config).filter(
    (group) => group.slot.kind === "bedroom" && group.beds.some((bed) => (bed.count || 0) > 0),
  ).length;
}

/**
 * Are the beds distributed across the unit's bedrooms?
 *
 * Mirrors the channel content review: every authored bedroom must hold a bed, and the
 * authored bedrooms must cover the bedroom count declared on the unit.
 */
export function areBedsDistributed(
  config: string | BedEntry[] | undefined,
  declaredBedrooms: unknown,
): boolean {
  const groups = groupBedsByRoom(config);
  const bedrooms = groups.filter((group) => group.slot.kind === "bedroom");
  if (bedrooms.length === 0) return false;
  if (bedrooms.some((group) => !group.beds.some((bed) => (bed.count || 0) > 0))) return false;
  const declared = Number(declaredBedrooms);
  const required = Number.isFinite(declared) && declared >= 1 ? Math.floor(declared) : 1;
  return bedrooms.length >= required;
}


/** Amenities authored on a sleeping space. */
export function bedRoomAmenities(group: BedRoomGroup): string[] {
  return readSlotAmenities(group.slot.amenities);
}
