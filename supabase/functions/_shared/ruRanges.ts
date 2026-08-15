/**
 * Rentals United company-profile "size" fields.
 *
 * NumberOfProperties, NumberOfEmployees and YearsInBusiness are NOT counts —
 * RU stores them as the ID of a range option shown in its dashboard dropdowns.
 * Sending a raw count (e.g. 4 units) makes RU display the 4th bucket ("20 - 29"),
 * which is exactly the drift we saw on the Jongensfontein profile.
 *
 * Values are therefore captured as range IDs in the UI and pushed unchanged.
 * Legacy stored counts are re-read as counts and mapped onto the matching bucket.
 */
export interface RuRange {
  /** RU option ID — this is what goes on the wire. */
  id: number;
  label: string;
  /** Inclusive lower bound of the bucket. */
  min: number;
  /** Inclusive upper bound, or null for the open-ended top bucket. */
  max: number | null;
}

export const RU_PROPERTY_RANGES: RuRange[] = [
  { id: 1, label: "1 - 4", min: 1, max: 4 },
  { id: 2, label: "5 - 9", min: 5, max: 9 },
  { id: 3, label: "10 - 19", min: 10, max: 19 },
  { id: 4, label: "20 - 29", min: 20, max: 29 },
  { id: 5, label: "30 - 49", min: 30, max: 49 },
  { id: 6, label: "50 - 99", min: 50, max: 99 },
  { id: 7, label: "100+", min: 100, max: null },
];

export const RU_EMPLOYEE_RANGES: RuRange[] = [
  { id: 1, label: "1 - 4", min: 1, max: 4 },
  { id: 2, label: "5 - 9", min: 5, max: 9 },
  { id: 3, label: "10 - 19", min: 10, max: 19 },
  { id: 4, label: "20 - 49", min: 20, max: 49 },
  { id: 5, label: "50 - 99", min: 50, max: 99 },
  { id: 6, label: "100+", min: 100, max: null },
];

export const RU_YEARS_RANGES: RuRange[] = [
  // RU only accepts option IDs 0 - 4 for YearsInBusiness (verified against
  // Push_FillCompanyDetails_RQ status 306: "Valid values are 0 - 4").
  { id: 0, label: "Less than 1 year", min: 0, max: 0 },
  { id: 1, label: "1 - 2 years", min: 1, max: 2 },
  { id: 2, label: "3 - 5 years", min: 3, max: 5 },
  { id: 3, label: "6 - 10 years", min: 6, max: 10 },
  { id: 4, label: "More than 10 years", min: 11, max: null },
];

/** Maps a real-world count onto the RU range option that contains it. */
export function rangeIdForCount(ranges: RuRange[], count: number): number | undefined {
  if (!Number.isFinite(count) || count < 0) return undefined;
  const hit = ranges.find((r) => count >= r.min && (r.max === null || count <= r.max));
  return hit?.id ?? ranges[ranges.length - 1]?.id;
}

/** True when the stored value is already a valid RU range ID for this field. */
export function isRangeId(ranges: RuRange[], value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && ranges.some((r) => r.id === n);
}

export function rangeLabel(ranges: RuRange[], value: unknown): string {
  const n = Number(value);
  return ranges.find((r) => r.id === n)?.label ?? "";
}
