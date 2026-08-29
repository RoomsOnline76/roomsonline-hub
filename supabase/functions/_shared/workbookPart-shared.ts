// Shared primitives for the consolidated revenue-report workbook builders.
// Every derived figure is written as a real Excel formula so the download stays
// editable by the revenue team after production.
import ExcelJS from "npm:exceljs@4.4.0";

export interface WorkbookSnapshot {
  months: string[];
  otb_revenue: Record<string, number>;
  previous_otb_revenue: Record<string, number>;
  last_year_actual: Record<string, number>;
  room_nights: Record<string, number>;
  previous_room_nights: Record<string, number>;
  last_year_room_nights: Record<string, number>;
  capacity_days: Record<string, number>;
  room_count: number;
}

export interface WorkbookInputs {
  dinner_by_month: Record<string, number>;
  room0_by_month: Record<string, number>;
  comp_rns_by_month: Record<string, number>;
  min_stay_notes?: string | null;
  promotions_notes?: string | null;
  rate_override_notes?: string | null;
  free_commentary?: string | null;
}

export interface HistoricalBaseline {
  years?: number[];
  revenue?: Record<string, number>; // "2024-07": 123
  room_nights?: Record<string, number>;
  occupancy?: Record<string, number>;
}

/** A carried-forward sheet: raw cell grid, written back verbatim. */
export type CarryForwardSheets = Record<string, Array<Array<string | number | null>>>;

/**
 * Figures absorbed from the client's own seed workbook that the pipeline cannot
 * derive itself — targets (and the uplift basis they were built on), last-year
 * and prior-review occupancy, and the extra sheets the team fills in by hand.
 */
export interface WorkbookExtras {
  sourceType: string;
  /** Uplift recovered from the seed workbook's Target formula, e.g. 0.1. */
  targetUplift: number | null;
  targets: Record<string, number>;
  lastYearOccupancy: Record<string, number>;
  previousOccupancy: Record<string, number>;
  historicalOccupancy: Record<string, number>;
  carryForward: CarryForwardSheets;
  cadence?: string | null;
}

export interface WorkbookOptions {
  propertyName: string;
  asOfDate: string; // YYYY-MM-DD
  previousAsOfDate: string | null;
  snapshot: WorkbookSnapshot;
  inputs: WorkbookInputs;
  historicalBaseline: HistoricalBaseline;
  brandPrimary?: string | null;
  extras?: Partial<WorkbookExtras>;
}

export const FONT = "Arial";
export const MONEY = 'R#,##0;(R#,##0);"-"';
export const MONEY_DEC = 'R#,##0.00;(R#,##0.00);"-"';
export const PERCENT = '0.0%;(0.0%);"-"';
export const INTEGER = '#,##0;(#,##0);"-"';
export const TEXT_FMT = "@";

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const DEFAULT_UPLIFT = 0.1;

export const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_LABELS[month - 1]} ${`${year}`.slice(2)}`;
};

export const formatDate = (iso: string | null): string => {
  if (!iso) return "n/a";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTH_LABELS[m - 1]} ${`${y}`.slice(2)}`;
};

export const hex = (value?: string | null): string | null => {
  if (!value) return null;
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `FF${match[1].toUpperCase()}` : null;
};

/** Whole days between two ISO dates, or null when either is missing. */
export const dayGap = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null;
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(Math.abs(b - a) / 86_400_000);
};

export const normaliseExtras = (extras?: Partial<WorkbookExtras>): WorkbookExtras => ({
  sourceType: extras?.sourceType ?? "nightsbridge",
  targetUplift:
    typeof extras?.targetUplift === "number" && Number.isFinite(extras.targetUplift)
      ? extras.targetUplift
      : null,
  targets: extras?.targets ?? {},
  lastYearOccupancy: extras?.lastYearOccupancy ?? {},
  previousOccupancy: extras?.previousOccupancy ?? {},
  historicalOccupancy: extras?.historicalOccupancy ?? {},
  carryForward: extras?.carryForward ?? {},
  cadence: extras?.cadence ?? null,
  comparisons: extras?.comparisons ?? [],
});

export type Sheet = ExcelJS.Worksheet;

export const newWorkbook = (): ExcelJS.Workbook => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rooms Online Revenue Reports";
  workbook.created = new Date();
  return workbook;
};

/** Coloured, wrapped column heading. */
export const headerCell = (sheet: Sheet, row: number, col: number, text: string, accent: string) => {
  const cell = sheet.getCell(row, col);
  cell.value = text;
  cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  return cell;
};

export const labelCell = (sheet: Sheet, row: number, col: number, text: string, size = 10) => {
  const cell = sheet.getCell(row, col);
  cell.value = text;
  cell.font = { name: FONT, bold: true, size };
  return cell;
};

export const bodyCell = (
  sheet: Sheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  numFmt: string,
) => {
  const cell = sheet.getCell(row, col);
  cell.value = value;
  cell.numFmt = numFmt;
  cell.font = { name: FONT, size: 10 };
  return cell;
};

export const noteCell = (sheet: Sheet, row: number, col: number, text: string) => {
  const cell = sheet.getCell(row, col);
  cell.value = text;
  cell.font = { name: FONT, size: 9, italic: true };
  return cell;
};

export const sheetTitle = (sheet: Sheet, text: string) => {
  const cell = sheet.getCell(1, 1);
  cell.value = text;
  cell.font = { name: FONT, bold: true, size: 14 };
  return cell;
};

/** Column letter for a 1-based index (A, B, … AA). */
export const colLetter = (index: number): string => {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/** Capacity legend printed beside the room-night block. */
export const capacityLegend = (sheet: Sheet, firstRow: number, col: number, rooms: number) => {
  const lines = [
    `${rooms} Rooms`,
    `28 = ${rooms * 28}`,
    `29 = ${rooms * 29}`,
    `30 = ${rooms * 30}`,
    `31 = ${rooms * 31}`,
  ];
  lines.forEach((text, i) => {
    const cell = sheet.getCell(firstRow + i, col);
    cell.value = text;
    cell.font = { name: FONT, size: 9, italic: i > 0 };
  });
};

/** Reviewer commentary block; returns the row after the block. */
export const commentaryBlock = (
  sheet: Sheet,
  startRow: number,
  labelCol: number,
  inputs: WorkbookInputs,
): number => {
  const entries: Array<[string, string | null | undefined]> = [
    ["Minimum stay", inputs.min_stay_notes],
    ["Promotions", inputs.promotions_notes],
    ["Rate overrides", inputs.rate_override_notes],
    ["Commentary", inputs.free_commentary],
  ];
  let row = startRow;
  for (const [label, value] of entries) {
    if (!value) continue;
    labelCell(sheet, row, labelCol, label, 9).font = { name: FONT, bold: true, size: 9 };
    const body = sheet.getCell(row, labelCol + 1);
    body.value = value;
    body.font = { name: FONT, size: 9 };
    body.alignment = { wrapText: true, vertical: "top" };
    sheet.mergeCells(row, labelCol + 1, row, labelCol + 4);
    row += 2;
  }
  sheet.getColumn(labelCol + 1).width = 40;
  return row;
};

/**
 * Clustered column chart on `sheet`. ExcelJS has never shipped chart writing;
 * when the pinned build has no `addChart`, the series are written as a plainly
 * formatted data block instead of failing the download.
 */
export const chartOrDataBlock = (
  sheet: Sheet,
  spec: {
    title: string;
    anchorRow: number;
    anchorCol: number;
    categories: string[];
    series: Array<{ name: string; values: Array<number | null>; numFmt: string }>;
  },
) => {
  const anySheet = sheet as unknown as { addChart?: (options: unknown) => void };
  if (typeof anySheet.addChart === "function") {
    try {
      anySheet.addChart({
        type: "bar",
        subType: "clustered",
        title: { name: spec.title },
        tl: { col: spec.anchorCol - 1, row: spec.anchorRow - 1 },
        br: { col: spec.anchorCol + 7, row: spec.anchorRow + 15 },
        categories: spec.categories,
        series: spec.series.map((s) => ({ name: s.name, values: s.values })),
      });
      return;
    } catch (_error) {
      // fall through to the data block
    }
  }

  labelCell(sheet, spec.anchorRow, spec.anchorCol, spec.title, 11);
  spec.series.forEach((s, i) => {
    const cell = sheet.getCell(spec.anchorRow + 1, spec.anchorCol + 1 + i);
    cell.value = s.name;
    cell.font = { name: FONT, bold: true, size: 9 };
    cell.alignment = { horizontal: "center", wrapText: true };
  });
  spec.categories.forEach((category, r) => {
    labelCell(sheet, spec.anchorRow + 2 + r, spec.anchorCol, category);
    spec.series.forEach((s, i) => {
      bodyCell(
        sheet,
        spec.anchorRow + 2 + r,
        spec.anchorCol + 1 + i,
        s.values[r] ?? null,
        s.numFmt,
      );
    });
  });
  noteCell(
    sheet,
    spec.anchorRow + 2 + spec.categories.length,
    spec.anchorCol,
    "Chart data — insert a clustered column chart over this block.",
  );
};

/**
 * Multi-year "years across, months down" sheet: revenue, room nights,
 * occupancy and derived ADR for every year the baseline provides, each block
 * closed with a total row and a latest-vs-prior variance column.
 */
export const buildHistoricalSheet = (
  workbook: ExcelJS.Workbook,
  options: WorkbookOptions,
  accent: string,
  sheetName = "Historical",
  adrLabel = "ADR",
): Sheet => {
  const baseline = options.historicalBaseline ?? {};
  const extras = normaliseExtras(options.extras);
  const revenueMap = baseline.revenue ?? {};
  const nightsMap = baseline.room_nights ?? {};
  const occupancyMap = { ...(baseline.occupancy ?? {}), ...extras.historicalOccupancy };

  const sheet = workbook.addWorksheet(sheetName);
  sheetTitle(sheet, `${options.propertyName} | ${sheetName}`);

  const years = (
    baseline.years?.length
      ? [...baseline.years]
      : [
          ...new Set(
            Object.keys({ ...revenueMap, ...nightsMap, ...occupancyMap }).map((k) =>
              Number(k.slice(0, 4)),
            ),
          ),
        ]
  )
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);

  if (years.length === 0) {
    noteCell(sheet, 3, 1, "No historical baseline captured for this property yet.");
    sheet.getColumn(1).width = 12;
    return sheet;
  }

  const varianceCol = years.length + 2;
  const yearCol = (index: number) => index + 2;

  const block = (
    startRow: number,
    heading: string,
    map: Record<string, number> | null,
    numFmt: string,
    derived?: (yearIndex: number, monthIndex: number, row: number) => ExcelJS.CellValue,
  ) => {
    labelCell(sheet, startRow, 1, heading, 11);
    years.forEach((year, i) => headerCell(sheet, startRow, yearCol(i), `${year}`, accent));
    if (years.length >= 2) {
      headerCell(
        sheet,
        startRow,
        varianceCol,
        `${years[years.length - 1]} vs ${years[years.length - 2]}`,
        accent,
      );
    }
    MONTH_LABELS.forEach((label, m) => {
      const row = startRow + 1 + m;
      labelCell(sheet, row, 1, label);
      years.forEach((year, i) => {
        if (derived) {
          bodyCell(sheet, row, yearCol(i), derived(i, m, row), numFmt);
          return;
        }
        const value = map?.[`${year}-${`${m + 1}`.padStart(2, "0")}`];
        bodyCell(sheet, row, yearCol(i), value === undefined ? null : value, numFmt);
      });
      if (years.length >= 2) {
        const latest = colLetter(yearCol(years.length - 1));
        const prior = colLetter(yearCol(years.length - 2));
        bodyCell(sheet, row, varianceCol, { formula: `${latest}${row}-${prior}${row}` }, numFmt);
      }
    });
    const totalRow = startRow + 13;
    labelCell(sheet, totalRow, 1, "TOTAL");
    if (!derived) {
      years.forEach((_, i) => {
        const letter = colLetter(yearCol(i));
        const cell = bodyCell(
          sheet,
          totalRow,
          yearCol(i),
          { formula: `SUM(${letter}${startRow + 1}:${letter}${startRow + 12})` },
          numFmt,
        );
        cell.font = { name: FONT, bold: true, size: 10 };
        cell.border = { top: { style: "thin" } };
      });
      if (years.length >= 2) {
        const latest = colLetter(yearCol(years.length - 1));
        const prior = colLetter(yearCol(years.length - 2));
        bodyCell(
          sheet,
          totalRow,
          varianceCol,
          { formula: `${latest}${totalRow}-${prior}${totalRow}` },
          numFmt,
        ).font = { name: FONT, bold: true, size: 10 };
      }
    }
    return { firstRow: startRow + 1, totalRow };
  };

  const revenue = block(3, "Revenue", revenueMap, MONEY);
  const nights = block(revenue.totalRow + 2, "Room Nights", nightsMap, INTEGER);
  const occupancyHasData = Object.keys(occupancyMap).length > 0;
  const occupancy = occupancyHasData
    ? block(nights.totalRow + 2, "Occupancy", occupancyMap, PERCENT)
    : null;

  const adrStart = (occupancy ?? nights).totalRow + 2;
  block(adrStart, adrLabel, null, MONEY_DEC, (yearIndex, monthIndex) => {
    const letter = colLetter(yearCol(yearIndex));
    const revRow = revenue.firstRow + monthIndex;
    const rnRow = nights.firstRow + monthIndex;
    return { formula: `IF(N(${letter}${rnRow})=0,"",${letter}${revRow}/${letter}${rnRow})` };
  });

  sheet.getColumn(1).width = 12;
  for (let col = 2; col <= varianceCol + 1; col += 1) sheet.getColumn(col).width = 14;
  return sheet;
};

/** Writes carried-forward sheets (PROTEL Online Res / Web Comparison) verbatim. */
export const writeCarryForwardSheets = (
  workbook: ExcelJS.Workbook,
  sheets: CarryForwardSheets,
  names: string[],
  accent: string,
) => {
  for (const name of names) {
    const grid = sheets[name];
    const sheet = workbook.addWorksheet(name);
    if (!grid || !grid.length) {
      noteCell(
        sheet,
        1,
        1,
        `${name} — fill this sheet in after download; the next report carries it forward automatically.`,
      );
      sheet.getColumn(1).width = 70;
      continue;
    }
    grid.forEach((row, r) => {
      (row ?? []).forEach((value, c) => {
        const cell = sheet.getCell(r + 1, c + 1);
        cell.value = value ?? null;
        if (r === 0) {
          cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
        } else {
          cell.font = { name: FONT, size: 10 };
        }
      });
    });
    sheet.getColumn(1).width = 22;
    const width = Math.max(...grid.map((row) => row?.length ?? 0), 1);
    for (let col = 2; col <= width; col += 1) sheet.getColumn(col).width = 16;
  }
};

export const finishWorkbook = async (workbook: ExcelJS.Workbook): Promise<Uint8Array> => {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
};
