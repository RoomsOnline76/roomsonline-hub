/**
 * The Cheetah Plains financial form, built from the database instead of a
 * spreadsheet.
 *
 * Revenue on the books and occupancy per month are written by each daily run
 * from the day's House State exports. Budget, same-time-last-year and last year
 * are seeded once from the team's consolidated workbook and then stay put. A
 * month with no figure prints a dash.
 *
 * The fiscal year runs March to February, so `Mar 2026 … Feb 2027` is labelled
 * `2026/2027`.
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface DailyGridRow {
  label: string;
  kind: "month" | "quarter" | "total";
  /** Revenue on the books as at the day. */
  bob: number | null;
  occupancy: number | null;
  budget: number | null;
  /** Same time last year. */
  stly: number | null;
  stlyOccupancy: number | null;
  lastYear: number | null;
  lastYearOccupancy: number | null;
}

export interface DailyYearGrid {
  /** `2026/2027`, as the team labels the financial year. */
  label: string;
  rows: DailyGridRow[];
}

/** One stored month of comparison figures. */
export interface ComparisonMonthRow {
  /** `YYYY-MM-DD`, always the first of the month. */
  month: string;
  bob: number | null;
  occupancy: number | null;
  budget: number | null;
  stly: number | null;
  stly_occupancy: number | null;
  last_year: number | null;
  last_year_occupancy: number | null;
}

/** `2026-04` → `2026/2027` (fiscal year starts in March). */
export function fiscalYearLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const start = monthNumber >= 3 ? year : year - 1;
  return `${start}/${start + 1}`;
}

const monthName = (month: string): string =>
  `${MONTH_LABELS[Number(month.slice(5, 7)) - 1] ?? "?"} ${month.slice(0, 4)}`;

const NUMERIC_KEYS = [
  "bob",
  "occupancy",
  "budget",
  "stly",
  "stlyOccupancy",
  "lastYear",
  "lastYearOccupancy",
] as const;

const emptyRow = (label: string, kind: DailyGridRow["kind"]): DailyGridRow => ({
  label,
  kind,
  bob: null,
  occupancy: null,
  budget: null,
  stly: null,
  stlyOccupancy: null,
  lastYear: null,
  lastYearOccupancy: null,
});

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Money columns add up; occupancy columns average over the months that carry one. */
const summarise = (
  label: string,
  kind: DailyGridRow["kind"],
  months: DailyGridRow[],
): DailyGridRow => {
  const row = emptyRow(label, kind);
  for (const key of NUMERIC_KEYS) {
    const values = months.map((entry) => entry[key]).filter((value): value is number => value !== null);
    if (!values.length) continue;
    const total = values.reduce((sum, value) => sum + value, 0);
    row[key] = /occupancy/i.test(key) ? total / values.length : total;
  }
  return row;
};

/** Every financial-year block the stored months cover, newest last. */
export function buildYearGrids(rows: ComparisonMonthRow[]): DailyYearGrid[] {
  const byYear = new Map<string, Map<string, ComparisonMonthRow>>();
  for (const row of rows) {
    const month = String(row.month).slice(0, 7);
    const label = fiscalYearLabel(month);
    const bucket = byYear.get(label) ?? new Map<string, ComparisonMonthRow>();
    bucket.set(month, row);
    byYear.set(label, bucket);
  }

  const grids: DailyYearGrid[] = [];
  for (const label of [...byYear.keys()].sort()) {
    const bucket = byYear.get(label)!;
    const startYear = Number(label.slice(0, 4));
    const monthRows: DailyGridRow[] = [];
    for (let offset = 0; offset < 12; offset += 1) {
      const monthNumber = ((2 + offset) % 12) + 1;
      const year = startYear + (monthNumber >= 3 ? 0 : 1);
      const key = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const stored = bucket.get(key);
      const row = emptyRow(monthName(key), "month");
      if (stored) {
        row.bob = toNumber(stored.bob);
        row.occupancy = toNumber(stored.occupancy);
        row.budget = toNumber(stored.budget);
        row.stly = toNumber(stored.stly);
        row.stlyOccupancy = toNumber(stored.stly_occupancy);
        row.lastYear = toNumber(stored.last_year);
        row.lastYearOccupancy = toNumber(stored.last_year_occupancy);
      }
      monthRows.push(row);
    }

    const rowsOut: DailyGridRow[] = [];
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const slice = monthRows.slice(quarter * 3, quarter * 3 + 3);
      rowsOut.push(...slice, summarise(`Q${quarter + 1}`, "quarter", slice));
    }
    rowsOut.push(summarise("Total", "total", monthRows));
    grids.push({ label, rows: rowsOut });
  }
  return grids;
}

/* ── reading the consolidated workbook once ───────────────────────── */

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

/** Excel serial or date-ish cell → `YYYY-MM`. */
const monthKey = (value: unknown): string | null => {
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(SERIAL_EPOCH + Math.round(value) * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const text = typeof value === "string" ? value.trim() : "";
  const named = text.match(/^([A-Za-z]{3})[a-z]*[\s-]+(\d{4})$/);
  if (named) {
    const index = MONTH_LABELS.findIndex(
      (label) => label.toLowerCase() === named[1].toLowerCase(),
    );
    if (index >= 0) return `${named[2]}-${String(index + 1).padStart(2, "0")}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}` : null;
};

/**
 * Reads every month of the team's consolidated day sheet, taking the columns the
 * financial form uses: A month, B revenue on the books, D occupancy, H budget,
 * M same time last year, N its occupancy, O last year, P its occupancy.
 */
export function readComparisonRowsFromGrid(grid: unknown[][]): ComparisonMonthRow[] {
  const byMonth = new Map<string, ComparisonMonthRow>();
  for (const row of grid) {
    if (!row) continue;
    const month = monthKey(row[0]);
    if (!month) continue;
    const entry: ComparisonMonthRow = {
      month: `${month}-01`,
      bob: toNumber(row[1]),
      occupancy: toNumber(row[3]),
      budget: toNumber(row[7]),
      stly: toNumber(row[12]),
      stly_occupancy: toNumber(row[13]),
      last_year: toNumber(row[14]),
      last_year_occupancy: toNumber(row[15]),
    };
    const carries = NUMERIC_KEYS.some(() => false) ||
      [entry.bob, entry.budget, entry.stly, entry.last_year].some((value) => value !== null);
    if (!carries) continue;
    const existing = byMonth.get(month);
    if (!existing) {
      byMonth.set(month, entry);
      continue;
    }
    // A later sheet may carry a figure an earlier one left as a formula.
    existing.bob ??= entry.bob;
    existing.occupancy ??= entry.occupancy;
    existing.budget ??= entry.budget;
    existing.stly ??= entry.stly;
    existing.stly_occupancy ??= entry.stly_occupancy;
    existing.last_year ??= entry.last_year;
    existing.last_year_occupancy ??= entry.last_year_occupancy;
  }
  return [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month));
}
