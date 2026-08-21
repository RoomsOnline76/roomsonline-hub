// Historical baseline (last-year actuals) helpers for the Revenue Reports subdomain.
// Shape stored in property_report_settings.historical_baseline:
//   { years: [2024, 2025], revenue: { "2024-07": 343388.91 }, room_nights: { "2024-07": 145 },
//     sources: { "2024-07": "run" | "manual" } }

export type BaselineSource = "run" | "manual";

export interface HistoricalBaseline {
  years?: number[];
  revenue?: Record<string, number>;
  room_nights?: Record<string, number>;
  sources?: Record<string, BaselineSource>;
}

export interface BaselineRow {
  key: string; // YYYY-MM
  revenue: number | null;
  roomNights: number | null;
}

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const monthKey = (year: number, month: number): string =>
  `${year}-${`${month}`.padStart(2, "0")}`;

export const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_LABELS[month - 1] ?? key} ${`${year}`.slice(2)}`;
};

const parseMonth = (raw: string): number | null => {
  const trimmed = raw.trim();
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  const index = MONTH_LABELS.findIndex(
    (label) => label.toLowerCase() === trimmed.slice(0, 3).toLowerCase(),
  );
  return index >= 0 ? index + 1 : null;
};

const parseAmount = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[R$€\s,]/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

/** Sorted list of years present in a baseline. */
export function baselineYears(baseline: HistoricalBaseline): number[] {
  const fromKeys = Object.keys({ ...baseline.revenue, ...baseline.room_nights }).map((key) =>
    Number(key.slice(0, 4)),
  );
  const all = [...(baseline.years ?? []), ...fromKeys].filter((year) =>
    Number.isFinite(year) && year > 1900,
  );
  return [...new Set(all)].sort((a, b) => a - b);
}

/**
 * Parses `year,month,revenue,room_nights` rows. Tolerates a header line,
 * semicolons or tabs as separators, month names, and currency symbols.
 */
export function parseBaselineCsv(text: string): { rows: BaselineRow[]; errors: string[] } {
  const rows: BaselineRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  lines.forEach((line, index) => {
    const cells = line.split(/[,;\t]/).map((cell) => cell.trim());
    if (cells.length < 3) {
      errors.push(`Line ${index + 1}: expected year, month, revenue[, room nights]`);
      return;
    }
    const year = Number(cells[0]);
    const month = parseMonth(cells[1] ?? "");
    if (!Number.isInteger(year) || year < 1900 || month === null) {
      // Silently skip a header row, complain about anything else.
      if (index > 0 || !/year/i.test(cells[0] ?? "")) {
        errors.push(`Line ${index + 1}: could not read year / month`);
      }
      return;
    }
    rows.push({
      key: monthKey(year, month),
      revenue: parseAmount(cells[2]),
      roomNights: parseAmount(cells[3]),
    });
  });

  return { rows, errors };
}

/** Serialises a baseline back to CSV for offline editing. */
export function baselineToCsv(baseline: HistoricalBaseline): string {
  const keys = [...new Set(Object.keys({ ...baseline.revenue, ...baseline.room_nights }))].sort();
  const lines = ["year,month,revenue,room_nights"];
  for (const key of keys) {
    const [year, month] = key.split("-");
    lines.push(
      [year, month, baseline.revenue?.[key] ?? "", baseline.room_nights?.[key] ?? ""].join(","),
    );
  }
  return lines.join("\n");
}

/** Applies parsed rows onto a baseline. `replace` clears existing months first. */
export function mergeBaselineRows(
  baseline: HistoricalBaseline,
  rows: BaselineRow[],
  mode: "merge" | "replace",
): HistoricalBaseline {
  const revenue = mode === "replace" ? {} : { ...(baseline.revenue ?? {}) };
  const nights = mode === "replace" ? {} : { ...(baseline.room_nights ?? {}) };
  const sources = mode === "replace" ? {} : { ...(baseline.sources ?? {}) };

  for (const row of rows) {
    if (row.revenue !== null) revenue[row.key] = row.revenue;
    if (row.roomNights !== null) nights[row.key] = row.roomNights;
    sources[row.key] = "manual";
  }

  const next: HistoricalBaseline = { revenue, room_nights: nights, sources };
  next.years = baselineYears(next);
  return next;
}

/** Sets (or clears) a single month value without touching the rest. */
export function setBaselineCell(
  baseline: HistoricalBaseline,
  key: string,
  field: "revenue" | "room_nights",
  value: number | null,
): HistoricalBaseline {
  const next: HistoricalBaseline = {
    revenue: { ...(baseline.revenue ?? {}) },
    room_nights: { ...(baseline.room_nights ?? {}) },
    sources: { ...(baseline.sources ?? {}) },
    years: baseline.years,
  };
  const map = field === "revenue" ? next.revenue! : next.room_nights!;
  if (value === null) delete map[key];
  else map[key] = value;
  next.sources![key] = "manual";
  next.years = baselineYears(next);
  return next;
}

/** Adds an empty year so the grid can be filled in by hand. */
export function addBaselineYear(baseline: HistoricalBaseline, year: number): HistoricalBaseline {
  const years = [...new Set([...baselineYears(baseline), year])].sort((a, b) => a - b);
  return { ...baseline, years };
}

/** Removes a year and every month value it owns. */
export function removeBaselineYear(baseline: HistoricalBaseline, year: number): HistoricalBaseline {
  const strip = (map: Record<string, number | BaselineSource> | undefined) => {
    const out: Record<string, never> = {} as Record<string, never>;
    for (const [key, value] of Object.entries(map ?? {})) {
      if (Number(key.slice(0, 4)) !== year) (out as Record<string, unknown>)[key] = value;
    }
    return out;
  };
  const next: HistoricalBaseline = {
    revenue: strip(baseline.revenue) as unknown as Record<string, number>,
    room_nights: strip(baseline.room_nights) as unknown as Record<string, number>,
    sources: strip(baseline.sources) as unknown as Record<string, BaselineSource>,
    years: baselineYears(baseline).filter((y) => y !== year),
  };
  return next;
}
