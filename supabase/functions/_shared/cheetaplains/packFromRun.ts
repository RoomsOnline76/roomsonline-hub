/**
 * Builds the CheetaPlains owner pack from the *run's own* figures.
 *
 * Until now the pack could only be reproduced from last month's PDF, which meant
 * it reprinted last month's numbers. Here the two financial-year grids are
 * assembled from:
 *
 *  - confirmed revenue and occupancy — the run's aggregated snapshot
 *  - active enquiries — the run's provisional-bookings export
 *  - budget, BOB STLY and LY actual — carried from the property's last pack
 *
 * Everything else (variances, quarter roll-ups, totals) is calculated. A month
 * with no source for a column stays blank rather than being invented, and the
 * caller is told which months were short.
 */

import type {
  DeclinedBookingRow,
  NationalityRow,
  NumberMap,
  OwnerFiscalYearGrid,
  OwnerNarrative,
  OwnerReportExtract,
  PartnerRow,
  PartnerTrendTable,
} from "../priorOwnerReport.ts";

/** March–February financial year, as CheetaPlains runs it. */
const FISCAL_START_MONTH = 3;

export interface CarriedYearFigures {
  budget: NumberMap;
  bobStly: NumberMap;
  lastYearActual: NumberMap;
  occupancyStly: NumberMap;
  occupancyLastYear: NumberMap;
}

export interface CarriedPack {
  current: CarriedYearFigures;
  forward: CarriedYearFigures;
  declined: DeclinedBookingRow[];
  declinedTotal: number | null;
  declinedPeriod: string | null;
  partnerTrends: PartnerTrendTable[];
  narratives: OwnerNarrative[];
  nationality: NationalityRow[];
  nationalityCurrentLabel: string | null;
  nationalityPriorLabel: string | null;
  partnersCurrent: PartnerRow[];
  partnersPrior: PartnerRow[];
  partnersCurrentLabel: string | null;
  partnersPriorLabel: string | null;
}

export const emptyCarriedYear = (): CarriedYearFigures => ({
  budget: {},
  bobStly: {},
  lastYearActual: {},
  occupancyStly: {},
  occupancyLastYear: {},
});

export const emptyCarriedPack = (): CarriedPack => ({
  current: emptyCarriedYear(),
  forward: emptyCarriedYear(),
  declined: [],
  declinedTotal: null,
  declinedPeriod: null,
  partnerTrends: [],
  narratives: [],
  nationality: [],
  nationalityCurrentLabel: null,
  nationalityPriorLabel: null,
  partnersCurrent: [],
  partnersPrior: [],
  partnersCurrentLabel: null,
  partnersPriorLabel: null,
});

export interface RunPackSources {
  /** Run as-of date, `YYYY-MM-DD`. */
  asOfDate: string;
  /** Confirmed revenue by `YYYY-MM` from the run snapshot. */
  confirmedRevenue: NumberMap;
  /** Occupancy by `YYYY-MM` (0–1 or 0–100; the slide handles both). */
  occupancy: NumberMap;
  /** Provisional revenue by `YYYY-MM`. */
  provisionalRevenue: NumberMap;
  carried: CarriedPack;
}

/** Calendar year the financial year containing `iso` opens in. */
export const fiscalStartYear = (iso: string): number => {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return month >= FISCAL_START_MONTH ? year : year - 1;
};

/** `2026` → `2026/27`, as the grid headings print it. */
export const fiscalGridLabel = (startYear: number): string =>
  `${startYear}/${`${startYear + 1}`.slice(-2)}`;

/** The twelve `YYYY-MM` keys of a financial year, in fiscal order. */
export const fiscalMonths = (startYear: number): string[] => {
  const keys: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    const monthNumber = ((FISCAL_START_MONTH - 1 + index) % 12) + 1;
    const year = FISCAL_START_MONTH + index > 12 ? startYear + 1 : startYear;
    keys.push(`${year}-${`${monthNumber}`.padStart(2, "0")}`);
  }
  return keys;
};

const value = (map: NumberMap | undefined, key: string): number | undefined => {
  const raw = map?.[key];
  return Number.isFinite(raw) ? Number(raw) : undefined;
};

const put = (map: NumberMap, key: string, amount: number | undefined) => {
  if (amount !== undefined) map[key] = amount;
};

interface GridBuild {
  grid: OwnerFiscalYearGrid | null;
  monthsWithoutBudget: string[];
  monthsWithoutLastYear: string[];
}

/** One financial-year grid from run figures plus the carried comparison columns. */
export function buildFiscalGrid(
  startYear: number,
  sources: RunPackSources,
  carried: CarriedYearFigures,
): GridBuild {
  const months = fiscalMonths(startYear);
  const grid: OwnerFiscalYearGrid = {
    label: fiscalGridLabel(startYear),
    startYear,
    months: [],
    confirmedBob: {},
    budget: {},
    activeEnquiries: {},
    varianceToBudget: {},
    bobStly: {},
    lastYearActual: {},
    varianceToStly: {},
    combined: {},
    occupancyBob: {},
    occupancyStly: {},
    occupancyLastYear: {},
  };

  const monthsWithoutBudget: string[] = [];
  const monthsWithoutLastYear: string[] = [];
  let hasAnything = false;

  for (const key of months) {
    const confirmed = value(sources.confirmedRevenue, key);
    const provisional = value(sources.provisionalRevenue, key);
    const budget = value(carried.budget, key);
    const stly = value(carried.bobStly, key);
    const lastYear = value(carried.lastYearActual, key);
    const occupancy = value(sources.occupancy, key);

    const printed =
      confirmed !== undefined ||
      provisional !== undefined ||
      budget !== undefined ||
      stly !== undefined ||
      lastYear !== undefined;
    if (!printed) continue;

    grid.months.push(key);
    hasAnything = hasAnything || confirmed !== undefined || provisional !== undefined;

    put(grid.confirmedBob, key, confirmed);
    put(grid.activeEnquiries, key, provisional ?? (confirmed !== undefined ? 0 : undefined));
    put(grid.budget, key, budget);
    put(grid.bobStly, key, stly);
    put(grid.lastYearActual, key, lastYear);
    put(grid.occupancyBob, key, occupancy);
    put(grid.occupancyStly, key, value(carried.occupancyStly, key));
    put(grid.occupancyLastYear, key, value(carried.occupancyLastYear, key));

    if (confirmed !== undefined) {
      grid.combined[key] = confirmed + (provisional ?? 0);
      if (budget !== undefined) grid.varianceToBudget[key] = confirmed - budget;
      if (stly !== undefined) grid.varianceToStly[key] = confirmed - stly;
    }
    if (budget === undefined) monthsWithoutBudget.push(key);
    if (lastYear === undefined) monthsWithoutLastYear.push(key);
  }

  return {
    grid: hasAnything ? grid : null,
    monthsWithoutBudget,
    monthsWithoutLastYear,
  };
}

export interface RunPackExtract {
  extract: OwnerReportExtract;
  warnings: string[];
}

/**
 * An `OwnerReportExtract` shaped exactly like a parsed pack, so the existing
 * slide builders render it unchanged.
 */
export function buildRunOwnerExtract(sources: RunPackSources): RunPackExtract {
  const startYear = fiscalStartYear(sources.asOfDate);
  const current = buildFiscalGrid(startYear, sources, sources.carried.current);
  const forward = buildFiscalGrid(startYear + 1, sources, sources.carried.forward);

  const warnings: string[] = [];
  if (current.monthsWithoutBudget.length) {
    warnings.push(
      `No budget carried for ${current.monthsWithoutBudget.length} month(s) of ${fiscalGridLabel(startYear)} — those cells print blank`,
    );
  }
  if (current.monthsWithoutLastYear.length) {
    warnings.push(
      `No last-year figure carried for ${current.monthsWithoutLastYear.length} month(s) of ${fiscalGridLabel(startYear)}`,
    );
  }
  if (!current.grid) warnings.push("This run holds no figures for the current financial year");

  const months = [...new Set([...(current.grid?.months ?? []), ...(forward.grid?.months ?? [])])].sort();

  const extract: OwnerReportExtract = {
    asOfDate: sources.asOfDate,
    otbColumnLabel: "Confirmed BOB",
    baselineSheet: "run",
    months,
    currentYear: current.grid,
    forwardYear: forward.grid,
    declined: sources.carried.declined,
    declinedTotal: sources.carried.declinedTotal,
    declinedPeriod: sources.carried.declinedPeriod,
    nationality: sources.carried.nationality,
    nationalityCurrentLabel: sources.carried.nationalityCurrentLabel,
    nationalityPriorLabel: sources.carried.nationalityPriorLabel,
    partnersCurrent: sources.carried.partnersCurrent,
    partnersPrior: sources.carried.partnersPrior,
    partnersCurrentLabel: sources.carried.partnersCurrentLabel,
    partnersPriorLabel: sources.carried.partnersPriorLabel,
    narratives: sources.carried.narratives,
    partnerTrends: sources.carried.partnerTrends,
    pagesRead: ["run snapshot", "provisional bookings", "carried comparison columns"],
    pagesSkipped: [],
    warnings,
  };

  return { extract, warnings };
}
