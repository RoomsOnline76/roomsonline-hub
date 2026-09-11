/**
 * Reads the Cheetah Plains "Provisional Bookings" export.
 *
 * Despite the filename this is the sales pipeline tracker, not a reservation
 * list: three sheets — `Current provisional bookings`, `Confirmed bookings` and
 * `Cancellations` — each row holding a booking date, a travel date written the
 * way the agent wrote it (`15 - 19 Dec 26`), the agency, the booking name and a
 * rand value.
 *
 * The daily report uses it for the enquiries on the books and for the business
 * confirmed and lost, month by month. Nothing is derived from a row that has no
 * readable travel month or value.
 */

export type PipelineRole = "provisional" | "confirmed" | "cancelled";

export interface PipelineMonth {
  month: string;
  count: number;
  value: number;
}

export interface PipelineParseResult {
  role: PipelineRole;
  months: Record<string, PipelineMonth>;
  count: number;
  value: number;
  rowsRead: number;
  warnings: string[];
}

type Grid = unknown[][];

const MONTH_WORDS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);

const money = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = text(value).replace(/[^\d.,-]/g, "").replace(/\s/g, "");
  // `1 081 080` and `627 421.50` both appear; thousands separators are dropped.
  const normalised = cleaned.includes(".")
    ? cleaned.replace(/,/g, "")
    : cleaned.replace(/[,.]/g, "");
  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** `15 - 19 Dec 26`, `03 -07 Jan 27`, an Excel serial or an ISO date → `YYYY-MM`. */
export function travelMonth(value: unknown): string | null {
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
  }
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const worded = raw.match(/([A-Za-z]{3,9})\s*'?\s*(\d{2,4})/);
  if (worded) {
    const month = MONTH_WORDS[worded[1].slice(0, 3).toLowerCase()];
    if (month) {
      const year = worded[2].length === 2 ? 2000 + Number(worded[2]) : Number(worded[2]);
      return `${year}-${`${month}`.padStart(2, "0")}`;
    }
  }
  return null;
}

interface Columns {
  travel: number;
  value: number;
  headerRow: number;
}

const findColumns = (grid: Grid): Columns | null => {
  for (let r = 0; r < Math.min(grid.length, 15); r += 1) {
    const row = grid[r] ?? [];
    let travel = -1;
    let value = -1;
    for (let c = 0; c < row.length; c += 1) {
      const label = text(row[c]).toLowerCase();
      if (travel < 0 && /travel\s*date/.test(label)) travel = c;
      if (value < 0 && /^value$/.test(label)) value = c;
    }
    if (travel >= 0 && value >= 0) return { travel, value, headerRow: r };
  }
  return null;
};

/** The pipeline tracker is recognisable by its travel-date and value headers. */
export const isPipelineGrid = (grid: Grid): boolean => findColumns(grid) !== null;

/** Filenames the daily folder uses for the tracker. */
export const PIPELINE_FILENAME = /provisional|enquir/i;

export const pipelineRole = (sheetName: string): PipelineRole =>
  /cancel/i.test(sheetName) ? "cancelled" : /confirm/i.test(sheetName) ? "confirmed" : "provisional";

export function parsePipelineGrid(
  grid: Grid,
  sheetName: string,
  filename: string,
): PipelineParseResult {
  const role = pipelineRole(sheetName);
  const columns = findColumns(grid);
  if (!columns) {
    return {
      role,
      months: {},
      count: 0,
      value: 0,
      rowsRead: 0,
      warnings: [`${filename} (${sheetName}): no travel-date and value columns found`],
    };
  }

  const months: Record<string, PipelineMonth> = {};
  const warnings: string[] = [];
  let count = 0;
  let value = 0;
  let unreadable = 0;

  for (let r = columns.headerRow + 1; r < grid.length; r += 1) {
    const row = grid[r] ?? [];
    const amount = money(row[columns.value]);
    const month = travelMonth(row[columns.travel]);
    if (!amount && !month) continue; // blank and spacer rows
    if (!month) {
      unreadable += 1;
      continue;
    }
    const bucket = months[month] ?? { month, count: 0, value: 0 };
    bucket.count += 1;
    bucket.value += amount;
    months[month] = bucket;
    count += 1;
    value += amount;
  }

  if (unreadable) {
    warnings.push(`${filename} (${sheetName}): ${unreadable} row(s) had no readable travel month`);
  }

  return {
    role,
    months,
    count,
    value: Math.round(value * 100) / 100,
    rowsRead: count,
    warnings,
  };
}
