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
