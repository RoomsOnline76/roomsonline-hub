/**
 * Extra comparison series for properties whose pack prints more than
 * "previous review + last year": calendar-year actuals (Krige: 2025, 2024) and
 * same-time-last-year (STLY).
 *
 * Everything here is presentation overlay. The aggregation engine and the
 * parsers stay untouched: series are assembled from figures the pipeline
 * already stores — earlier runs' snapshots, the property's historical baseline,
 * the run's last-year maps and the imported prior workbook.
 */

export type NumberMap = Record<string, number>;

export interface YearSeries {
  revenue: NumberMap;
  room_nights: NumberMap;
  occupancy: NumberMap;
  adr: NumberMap;
}

/** One printable comparison column set, month-aligned to the run's window. */
export interface ComparisonSeries extends YearSeries {
  /** Stable key: `"2024"` for a year column, `"stly"` for same-time-last-year. */
  key: string;
  label: string;
  /** As-of date the series was captured at — STLY only. */
  as_of?: string | null;
}

export interface YearOverlay {
  /** Keyed `"YYYY"`, month keys are the *run's* months (aligned, not shifted). */
  actuals_by_year: Record<string, YearSeries>;
  stly: (YearSeries & { as_of: string | null }) | null;
  /** Ready-to-print column sets, newest year first, STLY last. */
  comparisons: ComparisonSeries[];
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const num = (map: NumberMap | undefined, key: string): number | null => {
  const value = Number(map?.[key]);
  return Number.isFinite(value) ? value : null;
};

/** `2026-08` shifted by `years` → `2025-08`. */
export const shiftMonthKey = (key: string, years: number): string => {
  const [y, m] = key.split("-");
  const year = Number(y);
  if (!Number.isFinite(year) || !m) return key;
  return `${year + years}-${m}`;
};

/** Same calendar month of `year`: (`2026-08`, 2024) → `2024-08`. */
const monthOfYear = (key: string, year: number): string => `${year}-${key.split("-")[1] ?? "01"}`;

export interface YearOverlaySources {
  /** Report-window months, `YYYY-MM`, in print order. */
  months: string[];
  /** Sellable room-nights per month key — divides nights into occupancy. */
  capacityDays: NumberMap;
  roomCount: number;
  /** `property_report_settings.historical_baseline` maps, keyed `YYYY-MM`. */
  historicalRevenue: NumberMap;
  historicalRoomNights: NumberMap;
  historicalOccupancy: NumberMap;
  /** The run's own last-year maps, keyed by the run's month keys. */
  lastYearActual: NumberMap;
  lastYearRoomNights: NumberMap;
  lastYearOccupancy: NumberMap;
  /** Snapshots of earlier runs, keyed `YYYY-MM` (already merged by the caller). */
  storedRevenue: NumberMap;
  storedRoomNights: NumberMap;
  /** The calendar year the run's current OTB column belongs to. */
  currentYear: number;
  /** STLY series read off the prior pack, keyed by *last year's* month keys. */
  stlyRevenue: NumberMap;
  stlyRoomNights: NumberMap;
  stlyOccupancy: NumberMap;
  stlyAsOf: string | null;
}

const capacityFor = (sources: YearOverlaySources, runKey: string): number => {
  const stated = num(sources.capacityDays, runKey);
  if (stated && stated > 0) return stated;
  const rooms = sources.roomCount > 0 ? sources.roomCount : 1;
  const [y, m] = runKey.split("-").map(Number);
  const days = Number.isFinite(y) && Number.isFinite(m) ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 30;
  return rooms * days;
};

const derive = (
  sources: YearOverlaySources,
  revenue: NumberMap,
  roomNights: NumberMap,
  occupancy: NumberMap,
): YearSeries => {
  const adr: NumberMap = {};
  const occ: NumberMap = { ...occupancy };
  for (const key of sources.months) {
    const nights = num(roomNights, key);
    const rev = num(revenue, key);
    if (nights && nights > 0 && rev !== null) adr[key] = rev / nights;
    if (occ[key] === undefined && nights !== null) {
      const capacity = capacityFor(sources, key);
      if (capacity > 0) occ[key] = nights / capacity;
    }
  }
  return { revenue, room_nights: roomNights, occupancy: occ, adr };
};

/**
 * Build one column set per requested calendar year plus STLY.
 *
 * Year figures are month-aligned onto the run's own month keys, so a window
 * spanning Mar 26 → Feb 27 prints Mar 24 → Feb 25 under the "2024" column the
 * same way the owner's hand-kept workbook does.
 */
export function buildYearOverlay(
  sources: YearOverlaySources,
  compareYears: number[],
  stlyEnabled: boolean,
): YearOverlay {
  const actualsByYear: Record<string, YearSeries> = {};
  const comparisons: ComparisonSeries[] = [];

  const years = [...new Set(compareYears)]
    .filter((year) => Number.isInteger(year) && year !== sources.currentYear)
    .sort((a, b) => b - a);

  for (const year of years) {
    const revenue: NumberMap = {};
    const roomNights: NumberMap = {};
    const occupancy: NumberMap = {};
    const isLastYear = year === sources.currentYear - 1;

    for (const runKey of sources.months) {
      // A window that straddles new year holds months of two calendar years, so
      // the source key is always "same month, requested year".
      const offset = Number(runKey.split("-")[0]) - sources.currentYear;
      const sourceKey = monthOfYear(runKey, year + offset);

      const rev =
        num(sources.storedRevenue, sourceKey) ??
        num(sources.historicalRevenue, sourceKey) ??
        (isLastYear ? num(sources.lastYearActual, runKey) : null);
      const nights =
        num(sources.storedRoomNights, sourceKey) ??
        num(sources.historicalRoomNights, sourceKey) ??
        (isLastYear ? num(sources.lastYearRoomNights, runKey) : null);
      const occ =
        num(sources.historicalOccupancy, sourceKey) ??
        (isLastYear ? num(sources.lastYearOccupancy, runKey) : null);

      if (rev !== null) revenue[runKey] = rev;
      if (nights !== null) roomNights[runKey] = nights;
      if (occ !== null) occupancy[runKey] = occ;
    }

    const series = derive(sources, revenue, roomNights, occupancy);
    actualsByYear[`${year}`] = series;
    comparisons.push({ key: `${year}`, label: `${year} ACTUAL`, ...series });
  }

  let stly: (YearSeries & { as_of: string | null }) | null = null;
  if (stlyEnabled) {
    const revenue: NumberMap = {};
    const roomNights: NumberMap = {};
    const occupancy: NumberMap = {};
    for (const runKey of sources.months) {
      // The prior pack's keys are last year's months; align them forward.
      const sourceKey = shiftMonthKey(runKey, -1);
      const rev = num(sources.stlyRevenue, sourceKey) ?? num(sources.stlyRevenue, runKey);
      const nights = num(sources.stlyRoomNights, sourceKey) ?? num(sources.stlyRoomNights, runKey);
      const occ = num(sources.stlyOccupancy, sourceKey) ?? num(sources.stlyOccupancy, runKey);
      if (rev !== null) revenue[runKey] = rev;
      if (nights !== null) roomNights[runKey] = nights;
      if (occ !== null) occupancy[runKey] = occ;
    }
    const hasAny = Object.keys(revenue).length > 0 || Object.keys(roomNights).length > 0;
    if (hasAny) {
      stly = { ...derive(sources, revenue, roomNights, occupancy), as_of: sources.stlyAsOf };
      comparisons.push({
        key: "stly",
        label: stlyLabel(sources.stlyAsOf),
        as_of: sources.stlyAsOf,
        revenue: stly.revenue,
        room_nights: stly.room_nights,
        occupancy: stly.occupancy,
        adr: stly.adr,
      });
    }
  }

  return { actuals_by_year: actualsByYear, stly, comparisons };
}

/** `STLY (as-of 14 Aug 2025)` — never a bare "STLY" when the date is known. */
export function stlyLabel(asOf: string | null): string {
  const iso = (asOf ?? "").slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "STLY";
  return `STLY (as-of ${d} ${MONTH_LABELS[m - 1]} ${y})`;
}
