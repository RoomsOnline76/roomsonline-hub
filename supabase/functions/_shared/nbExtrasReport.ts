// NightsBridge "Extras Report" recogniser.
//
// Properties that sell dinners, drinks and sundries hand in the Extras export
// alongside the bookings ledger. It is a line-item list (one row per charge),
// not a booking ledger, so the ledger reader can never map it and the file used
// to land on the run as `needs_mapping` with nothing read — a false failure the
// reviewer had to explain away every month.
//
// This module recognises the shape and totals it by month, so the run can
// record what the file holds. It never becomes ledger revenue: rooms revenue,
// ADR and occupancy stay the bookings ledger's business.

export interface ExtrasSheetGrid {
  name: string;
  grid: unknown[][];
}

export interface ExtrasCategoryTotal {
  category: string;
  total: number;
  rows: number;
}

export interface ExtrasReportSummary {
  sheet: string;
  /** Period printed on the title row, when present. */
  periodLabel: string | null;
  /** Charge total per `YYYY-MM`, taken from each line's own date. */
  totalsByMonth: Record<string, number>;
  /** Food-and-meal lines only, per `YYYY-MM`. */
  foodByMonth: Record<string, number>;
  categories: ExtrasCategoryTotal[];
  rowCount: number;
  grandTotal: number;
}

const HEADER_HINTS = ["date", "description", "total"] as const;
const FOOD_WORDS = ["meal", "dinner", "breakfast", "lunch", "platter", "picnic", "harvest", "cake"];

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const lower = (value: unknown): string => text(value).toLowerCase();

const num = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = text(value).replace(/[R$€\s,]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

/** `YYYY-MM` from a cell holding a Date or a date-ish string. */
const monthOf = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${`${value.getUTCMonth() + 1}`.padStart(2, "0")}`;
  }
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (dmy) {
    const year = Number(dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]);
    const month = Number(dmy[2]);
    if (year > 2000 && month >= 1 && month <= 12) {
      return `${year}-${`${month}`.padStart(2, "0")}`;
    }
  }
  return null;
};

const isFood = (description: string): boolean => {
  const value = description.toLowerCase();
  return FOOD_WORDS.some((word) => value.includes(word));
};

/** Leading segment of a NightsBridge extras description ("Drinks, Wine, Red"). */
const categoryOf = (description: string): string => description.split(",")[0]!.trim();

interface HeaderMatch {
  row: number;
  date: number;
  description: number;
  total: number;
}

/** Finds the header row and the three columns that matter. */
function findHeader(grid: unknown[][]): HeaderMatch | null {
  const limit = Math.min(grid.length, 12);
  for (let index = 0; index < limit; index += 1) {
    const cells = (grid[index] ?? []).map(lower);
    if (!HEADER_HINTS.every((hint) => cells.some((cell) => cell === hint || cell.includes(hint)))) {
      continue;
    }
    const date = cells.findIndex((cell) => cell === "date" || cell.startsWith("date"));
    const description = cells.findIndex((cell) => cell.includes("description"));
    // "Total" must be the amount column, not "Total Nights" or similar.
    const total = cells.findIndex((cell) => cell === "total" || cell === "total amount");
    if (date >= 0 && description >= 0 && total >= 0) {
      return { row: index, date, description, total };
    }
  }
  return null;
}

const periodLabelOf = (grid: unknown[][], headerRow: number): string | null => {
  for (let index = 0; index < headerRow; index += 1) {
    const first = text((grid[index] ?? [])[0]);
    if (/extras report/i.test(first)) return first;
  }
  return null;
};

/**
 * Reads an extras export. Returns `null` when the sheet is not one — the caller
 * then falls through to the normal bookings-ledger reader.
 */
export function readExtrasReport(sheets: ExtrasSheetGrid[]): ExtrasReportSummary | null {
  for (const sheet of sheets) {
    const header = findHeader(sheet.grid);
    if (!header) continue;

    const titleSaysExtras = /extras report/i.test(text((sheet.grid[0] ?? [])[0]));
    const cells = (sheet.grid[header.row] ?? []).map(lower);
    // A bookings ledger also prints a date and a total; it always prints the
    // booking-level columns as well, so require the extras line shape.
    const looksLikeExtras =
      titleSaysExtras ||
      (cells.some((cell) => cell.includes("quantity")) && cells.some((cell) => cell.includes("price")));
    if (!looksLikeExtras) continue;

    const totalsByMonth: Record<string, number> = {};
    const foodByMonth: Record<string, number> = {};
    const categories = new Map<string, ExtrasCategoryTotal>();
    let rowCount = 0;
    let grandTotal = 0;

    for (const row of sheet.grid.slice(header.row + 1)) {
      const description = text(row?.[header.description]);
      const total = num(row?.[header.total]);
      if (!description || total === null) continue;
      if (/^total/i.test(description)) continue;

      const month = monthOf(row?.[header.date]);
      rowCount += 1;
      grandTotal += total;
      if (month) {
        totalsByMonth[month] = (totalsByMonth[month] ?? 0) + total;
        if (isFood(description)) foodByMonth[month] = (foodByMonth[month] ?? 0) + total;
      }
      const key = categoryOf(description) || "Other";
      const existing = categories.get(key);
      if (existing) {
        existing.total += total;
        existing.rows += 1;
      } else {
        categories.set(key, { category: key, total, rows: 1 });
      }
    }

    if (!rowCount) continue;

    return {
      sheet: sheet.name,
      periodLabel: periodLabelOf(sheet.grid, header.row),
      totalsByMonth,
      foodByMonth,
      categories: [...categories.values()].sort((a, b) => b.total - a.total),
      rowCount,
      grandTotal,
    };
  }
  return null;
}

const money = (value: number): string =>
  value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Reviewer-facing one-liner describing what the extras export holds. */
export function describeExtrasReport(summary: ExtrasReportSummary): string {
  const months = Object.keys(summary.totalsByMonth).sort();
  const perMonth = months
    .map((month) => `${month}: ${money(summary.totalsByMonth[month]!)}`)
    .join(", ");
  const food = months
    .filter((month) => summary.foodByMonth[month])
    .map((month) => `${month}: ${money(summary.foodByMonth[month]!)}`)
    .join(", ");
  return [
    `Extras and F&B charge list — ${summary.rowCount} line(s), ${money(summary.grandTotal)} in total.`,
    perMonth ? `By month — ${perMonth}.` : "",
    food ? `Food and meals only — ${food}.` : "",
    "Rooms revenue, ADR and occupancy come from the bookings export; this file is read for the extras figures only.",
  ]
    .filter(Boolean)
    .join(" ");
}
