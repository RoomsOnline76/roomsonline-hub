/**
 * Reads the CheetaPlains "Provisional Bookings" export.
 *
 * The daily protel folder keeps provisional (unconfirmed) business in its own
 * file, so a run's House State exports only carry confirmed stays. The owner
 * pack prints that provisional business in its "Active Enquiries on the books"
 * column, month by month, which is what this reader produces.
 *
 * Rows are spread across the nights they occupy: a stay from 28 Sep to 3 Oct
 * puts two nights of revenue in September and three in October, the same way the
 * confirmed daily grid does. Nothing is invented — a row without dates or value
 * is reported as a warning and skipped.
 */

export interface ProvisionalMonth {
  /** `YYYY-MM`. */
  month: string;
  nights: number;
  revenue: number;
}

export interface ProvisionalParseResult {
  months: Record<string, ProvisionalMonth>;
  rowsRead: number;
  /** Printed `From:` / `To:` period, when the export carries one. */
  period: { from: string; to: string } | null;
  errors: string[];
  warnings: string[];
}

type Grid = unknown[][];

const text = (value: unknown): string =>
  typeof value === "string"
    ? value.trim()
    : value === null || value === undefined
      ? ""
      : String(value);

const numeric = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = text(value).replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Excel serial dates, `28.09.2026`, `28/09/26` and ISO all appear in exports. */
const isoDate = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 80000) {
    const millis = Math.round((value - 25569) * 86400000);
    return new Date(millis).toISOString().slice(0, 10);
  }
  const trimmed = text(value);
  const dotted = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})$/);
  if (dotted) {
    const [, dd, mm, yy] = dotted;
    if (Number(mm) < 1 || Number(mm) > 12) return null;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    return `${year}-${`${mm}`.padStart(2, "0")}-${`${dd}`.padStart(2, "0")}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};

const HEADERS = {
  arrival: /^(arrival|arrival date|check[\s-]?in|from)$/i,
  departure: /^(departure|departure date|check[\s-]?out|to)$/i,
  nights: /^(nights|rns|room nights|villa nights)$/i,
  total: /^(total|total revenue|revenue|value|amount)$/i,
  status: /^(res\.? status|status|reservation status)$/i,
} as const;

type HeaderKey = keyof typeof HEADERS;

function findColumns(grid: Grid): { columns: Partial<Record<HeaderKey, number>>; headerRow: number } {
  for (let r = 0; r < Math.min(grid.length, 40); r += 1) {
    const row = grid[r] ?? [];
    const columns: Partial<Record<HeaderKey, number>> = {};
    for (let c = 0; c < row.length; c += 1) {
      const label = text(row[c]);
      if (!label) continue;
      for (const [key, pattern] of Object.entries(HEADERS) as [HeaderKey, RegExp][]) {
        if (columns[key] === undefined && pattern.test(label)) columns[key] = c;
      }
    }
    const hasStay =
      columns.arrival !== undefined && (columns.departure !== undefined || columns.nights !== undefined);
    if (hasStay && columns.total !== undefined) return { columns, headerRow: r };
  }
  return { columns: {}, headerRow: -1 };
}

/** A provisional list is recognisable by its stay dates and a value column. */
export function isProvisionalGrid(grid: Grid): boolean {
  return findColumns(grid).headerRow >= 0;
}

/** Filenames the daily folder uses for the provisional export. */
export const PROVISIONAL_FILENAME = /provisional|enquir|tentative|option/i;

const EXCLUDED_STATUS = /cancel|no.?show|check.?out|confirm/i;

const addNight = (
  months: Record<string, ProvisionalMonth>,
  iso: string,
  revenue: number,
) => {
  const key = iso.slice(0, 7);
  const bucket = months[key] ?? { month: key, nights: 0, revenue: 0 };
  bucket.nights += 1;
  bucket.revenue += revenue;
  months[key] = bucket;
};

export function parseProvisionalGrid(grid: Grid, filename: string): ProvisionalParseResult {
  const { columns, headerRow } = findColumns(grid);
  if (headerRow < 0) {
    return {
      months: {},
      rowsRead: 0,
      period: null,
      errors: [
        `${filename}: not a provisional-bookings list (needs an arrival column plus nights or departure, and a value column)`,
      ],
      warnings: [],
    };
  }

  const months: Record<string, ProvisionalMonth> = {};
  const warnings: string[] = [];
  let rowsRead = 0;
  let from: string | null = null;
  let to: string | null = null;
  let skipped = 0;

  for (let r = 0; r < grid.length; r += 1) {
    const row = grid[r] ?? [];

    if (r < headerRow) {
      for (const cell of row) {
        const value = text(cell);
        const fromMatch = value.match(/from:\s*(\S+)/i);
        const toMatch = value.match(/to:\s*(\S+)/i);
        if (fromMatch) from = isoDate(fromMatch[1]) ?? from;
        if (toMatch) to = isoDate(toMatch[1]) ?? to;
      }
      continue;
    }
    if (r === headerRow) continue;

    const arrival = columns.arrival !== undefined ? isoDate(row[columns.arrival]) : null;
    if (!arrival) continue; // print headers, blank rows and the printed Total row

    const status = columns.status !== undefined ? text(row[columns.status]) : "";
    if (status && EXCLUDED_STATUS.test(status)) {
      skipped += 1;
      continue;
    }

    const departure = columns.departure !== undefined ? isoDate(row[columns.departure]) : null;
    let nights = columns.nights !== undefined ? Math.round(numeric(row[columns.nights])) : 0;
    if ((!nights || nights < 1) && departure) {
      nights = Math.round(
        (Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86400000,
      );
    }
    if (!Number.isFinite(nights) || nights < 1) {
      warnings.push(`${filename}: a provisional row has no stay length and was skipped`);
      continue;
    }

    const total = numeric(row[columns.total!]);
    const perNight = total / nights;
    const start = Date.parse(`${arrival}T00:00:00Z`);
    for (let night = 0; night < nights; night += 1) {
      addNight(months, new Date(start + night * 86400000).toISOString().slice(0, 10), perNight);
    }
    rowsRead += 1;
  }

  if (skipped) warnings.push(`${filename}: ${skipped} confirmed/cancelled row(s) excluded`);
  if (!rowsRead) {
    return {
      months,
      rowsRead,
      period: from && to ? { from, to } : null,
      errors: [`${filename}: no provisional rows found`],
      warnings,
    };
  }

  return { months, rowsRead, period: from && to ? { from, to } : null, errors: [], warnings };
}

/** Revenue per month, rounded to the cent, for the Active Enquiries column. */
export function provisionalRevenueByMonth(
  result: ProvisionalParseResult,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [month, bucket] of Object.entries(result.months)) {
    out[month] = Math.round(bucket.revenue * 100) / 100;
  }
  return out;
}
