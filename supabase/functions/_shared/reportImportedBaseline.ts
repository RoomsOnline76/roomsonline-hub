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
}

export interface BaselineMaps {
  previousRevenue: Record<string, number>;
  previousNights: Record<string, number>;
  lastYearRevenue: Record<string, number>;
  lastYearNights: Record<string, number>;
}

const fill = (
  target: Record<string, number>,
  source: Record<string, number> | undefined,
  months: string[],
): void => {
  if (!source) return;
  for (const month of months) {
    const value = Number(source[month]);
    if (!Number.isFinite(value)) continue;
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
  fill(maps.previousNights, baseline.previous_room_nights, months);
  fill(maps.lastYearRevenue, baseline.last_year_actual, months);
  fill(maps.lastYearNights, baseline.last_year_room_nights, months);
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
    if (Number.isFinite(importedNights) && importedNights > 0) {
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

