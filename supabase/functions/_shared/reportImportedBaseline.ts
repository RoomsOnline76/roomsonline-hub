/**
 * Baseline figures imported from a property's existing consolidated revenue
 * report workbook (`report_runs.imported_baseline`, written by
 * `report-prior-workbook-import`).
 *
 * A first run has no earlier run to compare against, so the imported previous
 * OTB and last-year columns fill the gaps. Anything the pipeline derived itself
 * always wins — the import only supplies months that are still empty.
 */

export interface ImportedBaseline {
  previous_otb_revenue?: Record<string, number>;
  previous_room_nights?: Record<string, number>;
  last_year_actual?: Record<string, number>;
  last_year_room_nights?: Record<string, number>;
  /** Occupancy stays occupancy — it must never reach a room-night map. */
  previous_occupancy?: Record<string, number>;
  last_year_occupancy?: Record<string, number>;
  /** Target column recovered from the client's own workbook. */
  targets?: Record<string, number>;
  target_uplift?: number | null;
  historical_occupancy?: Record<string, number>;
  /** Sheets the revenue team maintains by hand (PROTEL Online Res / Web Comparison). */
  carry_forward?: Record<string, Array<Array<string | number | null>>>;
  as_of_date?: string | null;
  /** Owner's-report packs: the printed on-the-books grid for the run's own year. */
  current_otb_revenue?: Record<string, number>;
  current_otb_occupancy?: Record<string, number>;
  provisional_revenue?: Record<string, number>;
  source_kind?: string;
  fiscal_year_label?: string | null;
}


export interface BaselineMaps {
  previousRevenue: Record<string, number>;
  previousNights: Record<string, number>;
  lastYearRevenue: Record<string, number>;
  lastYearNights: Record<string, number>;
}

/**
 * Room nights are counts. A fractional value is an occupancy percentage that
 * was read out of the wrong workbook column — accepting it would make previous
 * ADR (revenue / nights) explode into the millions and rescale every chart.
 */
export const isPlausibleNights = (value: unknown): boolean => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1;
};

const fill = (
  target: Record<string, number>,
  source: Record<string, number> | undefined,
  months: string[],
  guard?: (value: number) => boolean,
): void => {
  if (!source) return;
  for (const month of months) {
    const value = Number(source[month]);
    if (!Number.isFinite(value)) continue;
    if (guard && !guard(value)) continue;
    if (target[month] === undefined) target[month] = value;
  }
};

/** Fills empty months in `maps` from the run's imported baseline, in place. */
export function applyImportedBaseline(
  imported: unknown,
  months: string[],
  maps: BaselineMaps,
): boolean {
  if (!imported || typeof imported !== "object") return false;
  const baseline = imported as ImportedBaseline;
  const before = JSON.stringify(maps);
  fill(maps.previousRevenue, baseline.previous_otb_revenue, months);
  fill(maps.previousNights, baseline.previous_room_nights, months, isPlausibleNights);
  fill(maps.lastYearRevenue, baseline.last_year_actual, months);
  fill(maps.lastYearNights, baseline.last_year_room_nights, months, isPlausibleNights);
  return JSON.stringify(maps) !== before;
}


const asBaseline = (imported: unknown): ImportedBaseline | null =>
  imported && typeof imported === "object" ? (imported as ImportedBaseline) : null;

/** Every month the imported baseline knows about, sorted. */
export function importedBaselineMonths(imported: unknown): string[] {
  const baseline = asBaseline(imported);
  if (!baseline) return [];
  const keys = new Set<string>();
  for (const map of [
    baseline.previous_otb_revenue,
    baseline.previous_room_nights,
    baseline.last_year_actual,
    baseline.last_year_room_nights,
  ]) {
    for (const key of Object.keys(map ?? {})) {
      if (/^\d{4}-\d{2}$/.test(key)) keys.add(key);
    }
  }
  return [...keys].sort();
}

/** Minimal shape shared by every source aggregator's result. */
export interface WindowedAggregate {
  months: string[];
  otb_revenue: Record<string, number>;
  room_nights: Record<string, number>;
  capacity_days: Record<string, number>;
  adr: Record<string, number>;
  occupancy: Record<string, number>;
}

const daysIn = (key: string): number => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

/**
 * Widens the report window so months the uploaded files never covered but the
 * prior workbook does still appear (with zero OTB rather than being dropped).
 */
export function extendReportWindow(
  aggregate: WindowedAggregate,
  extraMonths: string[],
  roomCount: number,
): string[] {
  const rooms = roomCount > 0 ? Math.floor(roomCount) : 1;
  const added: string[] = [];
  for (const key of extraMonths) {
    if (aggregate.months.includes(key)) continue;
    added.push(key);
    aggregate.months.push(key);
    aggregate.otb_revenue[key] = aggregate.otb_revenue[key] ?? 0;
    aggregate.room_nights[key] = aggregate.room_nights[key] ?? 0;
    aggregate.capacity_days[key] = rooms * daysIn(key);
    aggregate.adr[key] = 0;
    aggregate.occupancy[key] = 0;
  }
  aggregate.months.sort();
  return added;
}

export interface SubstitutedMonth {
  month: string;
  parsed_revenue: number;
  imported_revenue: number;
}

/**
 * A month the uploaded files barely covered (a stray booking or two against a
 * baseline that says otherwise) would publish as a catastrophic decline. Where
 * the parsed figure is under a quarter of the imported baseline, the imported
 * figure is used and reported back so the reviewer can see the substitution.
 */
export function substituteThinMonths(
  aggregate: WindowedAggregate,
  imported: unknown,
  threshold = 0.25,
): SubstitutedMonth[] {
  const baseline = asBaseline(imported);
  if (!baseline) return [];
  const revenue = baseline.previous_otb_revenue ?? {};
  const nights = baseline.previous_room_nights ?? {};
  const swapped: SubstitutedMonth[] = [];

  for (const month of aggregate.months) {
    const importedRevenue = Number(revenue[month]);
    if (!Number.isFinite(importedRevenue) || importedRevenue <= 0) continue;
    const parsed = Number(aggregate.otb_revenue[month]) || 0;
    if (parsed >= importedRevenue * threshold) continue;

    swapped.push({ month, parsed_revenue: parsed, imported_revenue: importedRevenue });
    aggregate.otb_revenue[month] = importedRevenue;
    const importedNights = Number(nights[month]);
    if (isPlausibleNights(importedNights)) {
      aggregate.room_nights[month] = importedNights;
    }

    const monthNights = aggregate.room_nights[month] ?? 0;
    const capacity = aggregate.capacity_days[month] ?? 0;
    aggregate.adr[month] =
      monthNights > 0 ? Math.round((importedRevenue / monthNights) * 100) / 100 : 0;
    aggregate.occupancy[month] = capacity > 0 ? monthNights / capacity : 0;
  }
  return swapped;
}


export interface TotalledAggregate extends WindowedAggregate {
  totals: {
    revenue: number;
    nights: number;
    capacity_days: number;
    adr: number;
    occupancy: number;
    [key: string]: number;
  };
}

/**
 * One call for every source parser: widen the window with months only the prior
 * workbook knows, replace thin months, and recompute the affected totals.
 */
export function reconcileWithImportedBaseline(
  aggregate: TotalledAggregate,
  imported: unknown,
  roomCount: number,
): { addedMonths: string[]; substituted: SubstitutedMonth[] } {
  const addedMonths = extendReportWindow(aggregate, importedBaselineMonths(imported), roomCount);
  const substituted = substituteThinMonths(aggregate, imported);
  if (!addedMonths.length && !substituted.length) return { addedMonths, substituted };

  let revenue = 0;
  let nights = 0;
  let capacity = 0;
  for (const key of aggregate.months) {
    revenue += aggregate.otb_revenue[key] ?? 0;
    nights += aggregate.room_nights[key] ?? 0;
    capacity += aggregate.capacity_days[key] ?? 0;
  }
  aggregate.totals.revenue = Math.round(revenue * 100) / 100;
  aggregate.totals.nights = nights;
  aggregate.totals.capacity_days = capacity;
  aggregate.totals.adr = nights > 0 ? Math.round((revenue / nights) * 100) / 100 : 0;
  aggregate.totals.occupancy = capacity > 0 ? nights / capacity : 0;
  return { addedMonths, substituted };
}

/**
 * Builds a report aggregate straight from an owner's-report import.
 *
 * Some properties (the Cheetah Plains owner pack) never produce a PMS day grid
 * for the reporting period — the owner's report *is* the revenue source. The
 * printed grid carries revenue and occupancy but no room nights, so nights and
 * ADR stay empty rather than being invented; occupancy is used as printed.
 */
export function aggregateFromImportedBaseline(
  imported: unknown,
  months: string[],
  roomCount: number,
): TotalledAggregate | null {
  const baseline = asBaseline(imported);
  if (!baseline) return null;
  const revenueMap = baseline.current_otb_revenue ?? {};
  const occupancyMap = baseline.current_otb_occupancy ?? {};
  const rooms = roomCount > 0 ? Math.floor(roomCount) : 1;

  const keys = months.length
    ? months
    : [...new Set(Object.keys(revenueMap).filter((key) => /^\d{4}-\d{2}$/.test(key)))].sort();
  if (!keys.length) return null;

  const aggregate: TotalledAggregate = {
    months: [...keys].sort(),
    otb_revenue: {},
    room_nights: {},
    capacity_days: {},
    adr: {},
    occupancy: {},
    totals: { revenue: 0, nights: 0, capacity_days: 0, adr: 0, occupancy: 0 },
  };

  let revenue = 0;
  let capacity = 0;
  let nights = 0;
  for (const key of aggregate.months) {
    const monthRevenue = Number(revenueMap[key]);
    const value = Number.isFinite(monthRevenue) ? monthRevenue : 0;
    const capacityDays = rooms * daysIn(key);
    const occupancy = Number(occupancyMap[key]);
    const monthOccupancy = Number.isFinite(occupancy) ? occupancy : 0;
    // The report prints occupancy, not nights: nights are that occupancy read
    // back against capacity so the totals row reconciles with the months.
    const monthNights = Math.round(monthOccupancy * capacityDays);
    aggregate.otb_revenue[key] = value;
    aggregate.room_nights[key] = monthNights;
    aggregate.capacity_days[key] = capacityDays;
    aggregate.adr[key] = 0;
    aggregate.occupancy[key] = monthOccupancy;
    revenue += value;
    capacity += capacityDays;
    nights += monthNights;
  }

  if (revenue <= 0) return null;
  aggregate.totals.revenue = Math.round(revenue * 100) / 100;
  aggregate.totals.capacity_days = capacity;
  aggregate.totals.nights = nights;
  aggregate.totals.occupancy = capacity > 0 ? nights / capacity : 0;
  return aggregate;
}

