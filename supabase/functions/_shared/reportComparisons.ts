/**
 * Resolves a run's extra comparison series from its report profile.
 *
 * The aggregation engine only ever knows this year, last year and the previous
 * review. Everything beyond that — older calendar years, same-time-last-year and
 * the client's budget column — is assembled here from three month-aligned
 * sources, in order of authority:
 *
 *   1. `report_snapshots.actuals_by_year` / `.stly` (parsed from the ledger)
 *   2. the imported prior workbook (`report_runs.imported_baseline`)
 *   3. the property's stored historical baseline
 *
 * Every builder (Excel and draft HTML) consumes the same resolved list, so a
 * client's column set can never drift between the two.
 */
import { parseReportProfile, type ReportProfile } from "./reportProfile.ts";
import { formatAsOf } from "./reportStly.ts";


export interface ReportComparison {
  /** Stable id, e.g. `year-2024`, `stly`, `budget`. */
  key: string;
  /** Column heading, e.g. `2024 ACTUAL`. */
  label: string;
  revenue: Record<string, number>;
  room_nights: Record<string, number>;
  occupancy: Record<string, number>;
  adr: Record<string, number>;
  /**
   * Variance columns the printed grid must show next to this column. Cathedral
   * Peak's pack prints "OTB vs Target" and "Target vs Last Year" beside Target.
   */
  deltas?: ComparisonDelta[];
}

/** A variance column derived from this comparison and one of the base series. */
export interface ComparisonDelta {
  /** `otb` prints OTB − column; `last_year` prints column − last year actual. */
  against: "otb" | "last_year";
  label: string;
}

export interface ComparisonSources {
  months: string[];
  /** `{ "2024": { revenue: {"2024-07": 1}, room_nights, occupancy } }` */
  actualsByYear?: unknown;
  /** `{ revenue: {...}, room_nights: {...} }` from the same-time-last-year pack. */
  stly?: unknown;
  /** As-of date behind the STLY series, printed in its column heading. */
  stlyAsOfDate?: string | null;
  importedBaseline?: unknown;
  historicalBaseline?: unknown;
  capacityDays?: Record<string, number>;
  roomCount?: number;
  /** Last year's actuals for the window months, used to derive a Target column. */
  lastYear?: { revenue?: Record<string, number>; room_nights?: Record<string, number> };

}

const numberMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
};

const pick = (value: unknown, key: string): unknown =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

/** Same month-of-year, shifted onto `year`. `2026-07` + 2024 → `2024-07`. */
const shiftKey = (monthKey: string, year: number): string =>
  `${year}-${monthKey.slice(5, 7)}`;

const derive = (
  months: string[],
  revenue: Record<string, number>,
  nights: Record<string, number>,
  occupancy: Record<string, number>,
  capacityDays: Record<string, number>,
  roomCount: number,
): Pick<ReportComparison, "revenue" | "room_nights" | "occupancy" | "adr"> => {
  const adr: Record<string, number> = {};
  const occ: Record<string, number> = { ...occupancy };
  for (const key of months) {
    const rev = revenue[key];
    const rn = nights[key];
    if (Number.isFinite(rev) && Number.isFinite(rn) && rn > 0) adr[key] = rev / rn;
    if (occ[key] === undefined && Number.isFinite(rn)) {
      const capacity = capacityDays[key] ?? roomCount * 30;
      if (capacity > 0) occ[key] = rn / capacity;
    }
  }
  return { revenue, room_nights: nights, occupancy: occ, adr };
};

const hasAnyValue = (comparison: ReportComparison, months: string[]): boolean =>
  months.some(
    (key) =>
      Number.isFinite(comparison.revenue[key]) || Number.isFinite(comparison.room_nights[key]),
  );

export function resolveComparisons(
  profileValue: unknown,
  sources: ComparisonSources,
): ReportComparison[] {
  const profile: ReportProfile = parseReportProfile(profileValue);
  const months = sources.months ?? [];
  if (months.length === 0) return [];

  const capacityDays = sources.capacityDays ?? {};
  const roomCount = sources.roomCount && sources.roomCount > 0 ? sources.roomCount : 1;
  const byYear = (sources.actualsByYear ?? {}) as Record<string, unknown>;
  const imported = sources.importedBaseline ?? {};
  const historical = sources.historicalBaseline ?? {};
  const historicalRevenue = numberMap(pick(historical, "revenue"));
  const historicalNights = numberMap(pick(historical, "room_nights"));
  const historicalOccupancy = numberMap(pick(historical, "occupancy"));
  const importedYears = (pick(imported, "historical_by_year") ?? {}) as Record<string, unknown>;

  const out: ReportComparison[] = [];

  for (const year of profile.compare_years) {
    const fromSnapshot = byYear[String(year)];
    const fromImported = importedYears[String(year)];
    const revenue: Record<string, number> = {};
    const nights: Record<string, number> = {};
    const occupancy: Record<string, number> = {};

    const snapRevenue = numberMap(pick(fromSnapshot, "revenue"));
    const snapNights = numberMap(pick(fromSnapshot, "room_nights"));
    const snapOccupancy = numberMap(pick(fromSnapshot, "occupancy"));
    const impRevenue = numberMap(pick(fromImported, "revenue"));
    const impNights = numberMap(pick(fromImported, "room_nights"));
    const impOccupancy = numberMap(pick(fromImported, "occupancy"));

    for (const monthKey of months) {
      const shifted = shiftKey(monthKey, year);
      const rev = snapRevenue[shifted] ?? impRevenue[shifted] ?? historicalRevenue[shifted];
      const rn = snapNights[shifted] ?? impNights[shifted] ?? historicalNights[shifted];
      const oc = snapOccupancy[shifted] ?? impOccupancy[shifted] ?? historicalOccupancy[shifted];
      if (Number.isFinite(rev)) revenue[monthKey] = Number(rev);
      if (Number.isFinite(rn)) nights[monthKey] = Number(rn);
      if (Number.isFinite(oc)) occupancy[monthKey] = Number(oc);
    }

    const comparison: ReportComparison = {
      key: `year-${year}`,
      label: `${year} ACTUAL`,
      ...derive(months, revenue, nights, occupancy, capacityDays, roomCount),
    };
    // A year with nothing behind it still prints, so the client's column set is
    // stable review to review — dashes rather than a shifting grid.
    out.push(comparison);
  }

  if (profile.stly_from_prior_workbook) {
    const stly = sources.stly ?? pick(imported, "stly");
    const revenue = numberMap(pick(stly, "revenue"));
    const nights = numberMap(pick(stly, "room_nights"));
    const occupancy = numberMap(pick(stly, "occupancy"));
    // The heading names the vintage the column came from, so the client can see
    // it is "what the books looked like then", not last year's actuals.
    const asOf = formatAsOf(sources.stlyAsOfDate ?? (pick(imported, "as_of_date") as string));
    const comparison: ReportComparison = {
      key: "stly",
      label: asOf ? `STLY (as at ${asOf})` : "STLY",

      ...derive(
        months,
        Object.fromEntries(months.filter((k) => revenue[k] !== undefined).map((k) => [k, revenue[k]])),
        Object.fromEntries(months.filter((k) => nights[k] !== undefined).map((k) => [k, nights[k]])),
        occupancy,
        capacityDays,
        roomCount,
      ),
    };
    out.push(comparison);
  }

  // A growth target the client never uploads: last year's actuals plus a fixed
  // percentage (Cathedral Peak targets last year + 10%).
  const growth = profile.target_growth_pct;
  const growthFactor = growth === null ? null : 1 + growth / 100;
  const lastYearRevenue = numberMap(sources.lastYear?.revenue);
  const lastYearNights = numberMap(sources.lastYear?.room_nights);
  const columns = growthFactor !== null && !profile.year_columns.includes("target")
    ? [...profile.year_columns, "target" as const]
    : profile.year_columns;

  for (const column of columns) {
    const source = column === "budget" ? pick(imported, "budget") ?? pick(imported, "targets") : pick(imported, "targets");
    let revenue = numberMap(pick(source, "revenue") ?? source);
    let nights = numberMap(pick(source, "room_nights"));
    let deltas: ComparisonDelta[] | undefined;

    // Derived target: only when the client supplied no target of their own, so an
    // uploaded budget always wins over the growth rule.
    if (column === "target" && growthFactor !== null && months.every((k) => revenue[k] === undefined)) {
      revenue = {};
      nights = {};
      for (const key of months) {
        const rev = lastYearRevenue[key];
        const rn = lastYearNights[key];
        if (Number.isFinite(rev)) revenue[key] = Number(rev) * growthFactor;
        if (Number.isFinite(rn)) nights[key] = Number(rn) * growthFactor;
      }
      deltas = [
        { against: "otb", label: "OTB vs Target" },
        { against: "last_year", label: "Target vs Last Year" },
      ];
    }

    const comparison: ReportComparison = {
      key: column,
      label: column === "budget" ? "Budget" : "Target",
      ...derive(months, revenue, nights, {}, capacityDays, roomCount),
      ...(deltas ? { deltas } : {}),
    };
    out.push(comparison);
  }

  return out;
}

/** Diagnostics for the run timeline: which columns actually carried data. */
export const summariseComparisons = (
  comparisons: ReportComparison[],
  months: string[],
): Record<string, boolean> =>
  Object.fromEntries(comparisons.map((c) => [c.key, hasAnyValue(c, months)]));
