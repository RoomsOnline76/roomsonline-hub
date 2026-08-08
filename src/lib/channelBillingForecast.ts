/**
 * Channel Manager (distribution account) cost forecasting.
 *
 * Billing is per active listing (a pushed room/unit), charged at a fixed monthly
 * price per listing that steps down as volume grows. Each period also carries a
 * minimum commitment — the account is billed the higher of the minimum and the
 * actual usage.
 *
 * Pure functions only: no data access, no formatting side effects.
 */

export interface ListingTier {
  /** Inclusive lower bound of the tier. */
  min: number;
  /** Inclusive upper bound, or null for open-ended. */
  max: number | null;
  /** Fixed EUR price per listing per month. */
  rateEur: number;
  label: string;
}

export const LISTING_TIERS: ListingTier[] = [
  { min: 101, max: 500, rateEur: 3.5, label: "101–500 listings · €3.50" },
  { min: 501, max: 1000, rateEur: 3.0, label: "501–1000 listings · €3.00" },
  { min: 1001, max: null, rateEur: 2.5, label: "1001+ listings · €2.50" },
];

/** The first tier's floor — below this only the period minimum applies. */
export const FIRST_TIER_FLOOR = LISTING_TIERS[0].min;

export interface PeriodMinimum {
  /** First month this minimum applies, as YYYY-MM. */
  from: string;
  minimumEur: number;
  label: string;
}

/** Agreed commitment ramp. Ordered oldest → newest. */
export const PERIOD_MINIMUMS: PeriodMinimum[] = [
  { from: "2026-09", minimumEur: 0, label: "Grace period" },
  { from: "2026-10", minimumEur: 0, label: "Grace period" },
  { from: "2026-11", minimumEur: 250, label: "€250 minimum or actual usage" },
  { from: "2026-12", minimumEur: 250, label: "€250 minimum or actual usage" },
  { from: "2027-01", minimumEur: 500, label: "€500 minimum or actual usage" },
];

/** YYYY-MM key for a date, in the account's calendar month terms. */
export function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Add whole months to a YYYY-MM key. */
export function addMonths(key: string, count: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + count;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Human month label, e.g. "Nov 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} ${y}`;
}

/** The commitment in force for a month. Months before the ramp are treated as grace. */
export function periodMinimumFor(key: string): PeriodMinimum {
  let current: PeriodMinimum = { from: key, minimumEur: 0, label: "Grace period" };
  for (const p of PERIOD_MINIMUMS) {
    if (p.from <= key) current = { ...p, from: key };
  }
  return current;
}

/** The tier a listing count falls into, or null when below the first tier floor. */
export function tierFor(listings: number): ListingTier | null {
  return (
    LISTING_TIERS.find(
      (t) => listings >= t.min && (t.max === null || listings <= t.max),
    ) ?? null
  );
}

/** Listings still needed before the per-listing rate steps down again. */
export function listingsToNextTier(listings: number): { needed: number; tier: ListingTier } | null {
  const next = LISTING_TIERS.find((t) => t.min > listings);
  if (!next) return null;
  return { needed: next.min - listings, tier: next };
}

export type ForecastDriver = "grace" | "minimum" | "usage";

export interface ForecastResult {
  month: string;
  monthLabel: string;
  listings: number;
  tier: ListingTier | null;
  /** Usage at the applicable tier rate. Zero below the first tier floor. */
  usageEur: number;
  minimumEur: number;
  minimumLabel: string;
  /** What will actually be billed. */
  billableEur: number;
  driver: ForecastDriver;
}

export function forecastForMonth(listings: number, key: string): ForecastResult {
  const safeListings = Math.max(0, Math.round(listings || 0));
  const tier = tierFor(safeListings);
  const usageEur = tier ? round2(safeListings * tier.rateEur) : 0;
  const period = periodMinimumFor(key);
  const billableEur = round2(Math.max(usageEur, period.minimumEur));

  let driver: ForecastDriver;
  if (period.minimumEur === 0 && usageEur === 0) driver = "grace";
  else if (usageEur >= period.minimumEur) driver = "usage";
  else driver = "minimum";

  return {
    month: key,
    monthLabel: monthLabel(key),
    listings: safeListings,
    tier,
    usageEur,
    minimumEur: period.minimumEur,
    minimumLabel: period.label,
    billableEur,
    driver,
  };
}

export function forecastForDate(listings: number, date: Date = new Date()): ForecastResult {
  return forecastForMonth(listings, monthKey(date));
}

/**
 * Rolling schedule from the ramp start (or the current month, whichever is earlier)
 * forward, holding the listing count flat.
 */
export function forecastSchedule(
  listings: number,
  from: Date = new Date(),
  months = 8,
): ForecastResult[] {
  const startKey = monthKey(from);
  const rampStart = PERIOD_MINIMUMS[0].from;
  const first = startKey < rampStart ? startKey : rampStart;
  const rows: ForecastResult[] = [];
  for (let i = 0; i < months; i += 1) {
    rows.push(forecastForMonth(listings, addMonths(first, i)));
  }
  return rows;
}

/** Monthly EUR cost attributable to a single property's listings, at the account's tier. */
export function costContributionEur(propertyListings: number, accountListings: number): number {
  const tier = tierFor(accountListings);
  if (!tier) return 0;
  return round2(propertyListings * tier.rateEur);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatEur(value: number): string {
  return `€${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatZar(value: number): string {
  return `R ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
