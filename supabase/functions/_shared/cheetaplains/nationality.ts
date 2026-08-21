/**
 * CheetaPlains "Bookings by Nationality" source normalisation.
 *
 * protel's Nationality report exports one worksheet per horizon
 * (`Current Year`, `Last Year`, `Next Year`, `Next Year+1`). Each sheet repeats
 * the same block three times — `Confirmed`, `Provisional`, `Total` — and every
 * block is a country × month matrix of Quantity (villa nights) and Amount,
 * closed by a `Grand Total` row and a `Grand Total` column.
 *
 * The owner report is published off the **Confirmed** block, which is what the
 * signed-off sample packs reproduce; provisional business is reported
 * separately rather than blended into the headline table.
 */

export type NationalityBlock = "confirmed" | "provisional" | "total";

export interface NationalityCountryRow {
  country: string;
  villaNights: number;
  revenue: number;
}

export interface NationalityYear {
  /** Worksheet the figures came from. */
  sheet: string;
  block: NationalityBlock;
  countries: NationalityCountryRow[];
  grandTotal: { villaNights: number; revenue: number } | null;
}

export interface NationalityParseResult {
  currentYear: NationalityYear | null;
  lastYear: NationalityYear | null;
  errors: string[];
  warnings: string[];
}

type Grid = unknown[][];

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);

const numeric = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = text(value).replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const BLOCK_LABELS: Record<string, NationalityBlock> = {
  confirmed: "confirmed",
  provisional: "provisional",
  total: "total",
};

/** True when the workbook looks like a protel Nationality report sheet. */
export function isNationalityGrid(grid: Grid): boolean {
  for (let r = 0; r < Math.min(grid.length, 40); r += 1) {
    const row = grid[r] ?? [];
    if (/^country$/i.test(text(row[0])) && row.some((cell) => /^grand total$/i.test(text(cell)))) {
      return true;
    }
  }
  return false;
}

/** Reads one `Confirmed` / `Provisional` / `Total` block from a sheet. */
export function parseNationalitySheet(
  grid: Grid,
  sheet: string,
  block: NationalityBlock = "confirmed",
): NationalityYear | null {
  let inBlock = false;
  let grandTotalColumn = -1;
  let reading = false;
  const countries: NationalityCountryRow[] = [];
  let grandTotal: NationalityYear["grandTotal"] = null;

  for (const raw of grid) {
    const row = raw ?? [];
    const first = text(row[0]);
    const firstLower = first.toLowerCase();

    if (BLOCK_LABELS[firstLower] && !/^country$/i.test(first)) {
      // A new block heading ends the previous one.
      if (inBlock && reading) break;
      inBlock = BLOCK_LABELS[firstLower] === block;
      reading = false;
      grandTotalColumn = -1;
      continue;
    }
    if (!inBlock) continue;

    if (/^country$/i.test(first)) {
      grandTotalColumn = row.findIndex((cell) => /^grand total$/i.test(text(cell)));
      reading = grandTotalColumn >= 0;
      continue;
    }
    if (!reading || grandTotalColumn < 0) continue;
    if (/^quantity$/i.test(text(row[1]))) continue; // sub-header row
    if (!first) continue;

    const villaNights = numeric(row[grandTotalColumn]);
    const revenue = numeric(row[grandTotalColumn + 1]);

    if (/^grand total$/i.test(first)) {
      grandTotal = { villaNights, revenue };
      break;
    }
    countries.push({ country: first, villaNights, revenue });
  }

  if (!countries.length) return null;
  return { sheet, block, countries, grandTotal };
}

/** Sheet names, most specific first, for the two horizons the pack needs. */
const CURRENT_SHEETS = [/^current year$/i, /^this year$/i];
const LAST_SHEETS = [/^last year$/i, /^previous year$/i, /^prior year$/i];

const pickSheet = (
  sheets: Record<string, Grid>,
  patterns: RegExp[],
): { name: string; grid: Grid } | null => {
  for (const pattern of patterns) {
    for (const [name, grid] of Object.entries(sheets)) {
      if (pattern.test(name.trim())) return { name, grid };
    }
  }
  return null;
};

/**
 * Parses a whole Nationality workbook. Prior-year figures come from the
 * workbook's own `Last Year` sheet, so a single upload produces both columns of
 * the owner report.
 */
export function parseNationalityWorkbook(
  sheets: Record<string, Grid>,
  filename: string,
  block: NationalityBlock = "confirmed",
): NationalityParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const current = pickSheet(sheets, CURRENT_SHEETS);
  const last = pickSheet(sheets, LAST_SHEETS);

  if (!current) {
    return {
      currentYear: null,
      lastYear: null,
      errors: [`${filename}: no "Current Year" sheet found in the Nationality report`],
      warnings,
    };
  }

  const currentYear = parseNationalitySheet(current.grid, current.name, block);
  if (!currentYear) {
    errors.push(`${filename}: the "${current.name}" sheet has no ${block} country rows`);
  }
  let lastYear: NationalityYear | null = null;
  if (last) {
    lastYear = parseNationalitySheet(last.grid, last.name, block);
    if (!lastYear) warnings.push(`${filename}: the "${last.name}" sheet has no ${block} country rows`);
  } else {
    warnings.push(`${filename}: no "Last Year" sheet — the comparison columns will be blank`);
  }

  // The Grand Total row is printed by protel; a mismatch means a misread grid.
  for (const year of [currentYear, lastYear]) {
    if (!year?.grandTotal) continue;
    const nights = year.countries.reduce((sum, row) => sum + row.villaNights, 0);
    const revenue = year.countries.reduce((sum, row) => sum + row.revenue, 0);
    if (nights !== year.grandTotal.villaNights) {
      errors.push(
        `${filename} (${year.sheet}): villa nights ${nights} do not match the printed grand total ${year.grandTotal.villaNights}`,
      );
    }
    if (Math.abs(revenue - year.grandTotal.revenue) > 1) {
      errors.push(
        `${filename} (${year.sheet}): revenue ${revenue.toFixed(2)} does not match the printed grand total ${year.grandTotal.revenue.toFixed(2)}`,
      );
    }
  }

  return { currentYear, lastYear, errors, warnings };
}

export interface NationalityReportRow {
  country: string;
  currentNights: number;
  currentRevenue: number;
  priorNights: number;
  priorRevenue: number;
}

/**
 * Builds the published table: countries ranked by current-year revenue with the
 * matching prior-year figures alongside. Countries with no activity in either
 * year are dropped.
 */
export function buildNationalityTable(
  currentYear: NationalityYear | null,
  lastYear: NationalityYear | null,
  limit = 20,
): NationalityReportRow[] {
  const prior = new Map<string, NationalityCountryRow>();
  for (const row of lastYear?.countries ?? []) prior.set(row.country.toLowerCase(), row);

  const rows: NationalityReportRow[] = (currentYear?.countries ?? []).map((row) => {
    const match = prior.get(row.country.toLowerCase());
    prior.delete(row.country.toLowerCase());
    return {
      country: row.country,
      currentNights: row.villaNights,
      currentRevenue: row.revenue,
      priorNights: match?.villaNights ?? 0,
      priorRevenue: match?.revenue ?? 0,
    };
  });

  return rows
    .filter((row) => row.currentRevenue > 0 || row.currentNights > 0)
    .sort((a, b) => b.currentRevenue - a.currentRevenue || b.currentNights - a.currentNights)
    .slice(0, limit);
}
