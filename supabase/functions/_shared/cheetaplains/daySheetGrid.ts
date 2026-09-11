/**
 * Reads the financial form off a day sheet of the Cheetah Plains "Daily
 * Detailed Report" workbook, so the day's PDF can print the same figures and
 * the same three graphs the team looks at in Excel.
 *
 * A day sheet carries three financial-year blocks. Each block starts at a
 * `MONTH` header row and runs month rows, quarter sub-totals and a `TOTAL`
 * line, with these columns:
 *
 *   A month (Excel serial)   B revenue on the books, current day   D occupancy
 *   H budget                 M same time last year   N its occupancy
 *   O last year              P its occupancy
 *
 * The freshly appended sheet has had its stale formula caches dropped, so a
 * value that only exists as a formula result is taken from the sheet the day
 * was copied from — budget and last-year columns do not move day to day.
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

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
  /** `2026/2027` as the workbook labels it. */
  label: string;
  rows: DailyGridRow[];
}

interface RawCell {
  attrs: string;
  inner: string;
}

const cellMap = (xml: string): Map<string, RawCell> => {
  const cells = new Map<string, RawCell>();
  const pattern = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    cells.set(match[1], { attrs: match[2] ?? "", inner: match[3] ?? "" });
  }
  return cells;
};

const numberAt = (cell: RawCell | undefined): number | null => {
  if (!cell) return null;
  if (/t="(s|inlineStr|str|b|e)"/.test(cell.attrs)) return null;
  const value = cell.inner.match(/<v>([^<]*)<\/v>/);
  if (!value) return null;
  const parsed = Number(value[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const textAt = (cell: RawCell | undefined, shared: string[]): string | null => {
  if (!cell) return null;
  const value = cell.inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? null;
  if (/t="s"/.test(cell.attrs)) {
    const index = Number(value);
    return Number.isInteger(index) ? (shared[index] ?? null) : null;
  }
  if (/t="(inlineStr|str)"/.test(cell.attrs)) {
    return cell.inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? value;
  }
  return null;
};

const monthLabel = (serial: number | null): string | null => {
  if (serial === null || serial < 20000 || serial > 80000) return null;
  const date = new Date(SERIAL_EPOCH + Math.round(serial) * 86400000);
  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

/**
 * Pulls every financial-year block off one day sheet.
 *
 * `templateXml` is the sheet the day was copied from and is only consulted for
 * values the appended sheet no longer caches.
 */
export function readYearGrids(
  sheetXml: string,
  templateXml: string | null,
  sharedStrings: string[],
): DailyYearGrid[] {
  const current = cellMap(sheetXml);
  const fallback = templateXml ? cellMap(templateXml) : new Map<string, RawCell>();

  const value = (column: string, rowNumber: number): number | null => {
    const ref = `${column}${rowNumber}`;
    return numberAt(current.get(ref)) ?? numberAt(fallback.get(ref));
  };
  const label = (rowNumber: number): string | null =>
    textAt(current.get(`A${rowNumber}`), sharedStrings) ??
    textAt(fallback.get(`A${rowNumber}`), sharedStrings);

  const lastRow = Math.max(
    0,
    ...[...current.keys()].map((ref) => Number(ref.replace(/[A-Z]+/g, ""))),
  );

  const grids: DailyYearGrid[] = [];
  let pendingLabel: string | null = null;

  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const text = label(rowNumber);
    if (text && /^\d{4}\s*\/\s*\d{4}$/.test(text.trim())) {
      pendingLabel = text.trim().replace(/\s+/g, "");
      continue;
    }
    if (!text || text.trim().toUpperCase() !== "MONTH") continue;

    const rows: DailyGridRow[] = [];
    let cursor = rowNumber + 1;
    let stop = cursor + 40;
    while (cursor <= lastRow && cursor <= stop) {
      const rowLabel = label(cursor);
      const flag = rowLabel?.trim().toUpperCase() ?? "";
      if (flag === "TOTAL" || /^Q[1-4]$/.test(flag)) {
        rows.push(readRow(flag === "TOTAL" ? "Total" : flag, flag === "TOTAL" ? "total" : "quarter", cursor, value));
        if (flag === "TOTAL") break;
        cursor += 1;
        continue;
      }
      const month = monthLabel(value("A", cursor));
      if (month) rows.push(readRow(month, "month", cursor, value));
      cursor += 1;
      if (month) stop = Math.max(stop, cursor + 6);
    }

    const monthCount = rows.filter((entry) => entry.kind === "month").length;
    if (monthCount >= 6) {
      const first = rows.find((entry) => entry.kind === "month")?.label ?? "";
      const derived = first.match(/(\d{4})$/)?.[1];
      grids.push({
        label: pendingLabel ?? (derived ? `${derived}/${Number(derived) + 1}` : "Financial year"),
        rows,
      });
    }
    pendingLabel = null;
    rowNumber = cursor;
  }

  return grids;
}

const readRow = (
  label: string,
  kind: DailyGridRow["kind"],
  rowNumber: number,
  value: (column: string, row: number) => number | null,
): DailyGridRow => ({
  label,
  kind,
  bob: value("B", rowNumber),
  occupancy: value("D", rowNumber),
  budget: value("H", rowNumber),
  stly: value("M", rowNumber),
  stlyOccupancy: value("N", rowNumber),
  lastYear: value("O", rowNumber),
  lastYearOccupancy: value("P", rowNumber),
});
