// Bed configuration types and utilities

export interface BedEntry {
  type: string;
  count: number;
}

export const BED_TYPES = [
  { value: "king", label: "King" },
  { value: "queen", label: "Queen" },
  { value: "double", label: "Double" },
  { value: "twin", label: "Twin" },
  { value: "single", label: "Single" },
  { value: "sofa-bed", label: "Sofa Bed" },
  { value: "bunk", label: "Bunk Bed" },
] as const;

export const bedTypeLabels: Record<string, string> = {
  king: "King",
  queen: "Queen",
  double: "Double",
  twin: "Twin",
  single: "Single",
  "sofa-bed": "Sofa Bed",
  bunk: "Bunk Bed",
  // Legacy mappings
  "king-twin": "King / Twin",
};

/**
 * How many people each bed of a given type sleeps.
 * `count` on a BedEntry is the NUMBER OF BEDS, never the number of people.
 */
export const bedTypeSleeps: Record<string, number> = {
  king: 2,
  queen: 2,
  double: 2,
  twin: 1,
  single: 1,
  "sofa-bed": 2,
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
