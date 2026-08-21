// Consolidated revenue-report workbook builder.
// Mirrors the layout of the reference Torburnlea "Revenue Report" workbook and keeps
// every derived figure as a real Excel formula so the download stays editable.
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

export interface WorkbookOptions {
  propertyName: string;
  asOfDate: string; // YYYY-MM-DD
  previousAsOfDate: string | null;
  snapshot: WorkbookSnapshot;
  inputs: WorkbookInputs;
  historicalBaseline: HistoricalBaseline;
  brandPrimary?: string | null;
}

export interface HistoricalBaseline {
  years?: number[];
  revenue?: Record<string, number>; // "2024-07": 123
  room_nights?: Record<string, number>;
}

const FONT = "Arial";
const MONEY = 'R#,##0;(R#,##0);"-"';
const MONEY_DEC = 'R#,##0.00;(R#,##0.00);"-"';
const PERCENT = '0.0%;(0.0%);"-"';
const INTEGER = '#,##0;(#,##0);"-"';

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_LABELS[month - 1]} ${`${year}`.slice(2)}`;
};

const formatDate = (iso: string | null): string => {
  if (!iso) return "n/a";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTH_LABELS[m - 1]} ${`${y}`.slice(2)}`;
};

const hex = (value?: string | null): string | null => {
  if (!value) return null;
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `FF${match[1].toUpperCase()}` : null;
};

/** Row/column map shared with later phases (PDF + Canva pack). */
export function buildLayout(monthCount: number) {
  const revHeader = 2;
  const revFirst = 3;
  const revTotal = revFirst + monthCount;
  const rnHeading = revTotal + 1;
  const rnHeader = rnHeading + 1;
  const rnFirst = rnHeader + 1;
  const adrHeading = rnFirst + monthCount;
  const adrHeader = adrHeading + 1;
  const adrFirst = adrHeader + 1;
  return { revHeader, revFirst, revTotal, rnHeading, rnHeader, rnFirst, adrHeading, adrHeader, adrFirst };
}

export type ReportLayout = ReturnType<typeof buildLayout>;

export async function buildRevenueWorkbook(options: WorkbookOptions): Promise<Uint8Array> {
  const { snapshot, inputs } = options;
  const months = snapshot.months ?? [];
  const layout = buildLayout(months.length);
  const rooms = snapshot.room_count > 0 ? snapshot.room_count : 1;
  const accent = hex(options.brandPrimary) ?? "FFE91E8C";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rooms Online Revenue Reports";
  workbook.created = new Date();

  const otbCurrent = `OTB @ ${formatDate(options.asOfDate)}`;
  const otbPrevious = `OTB @ ${formatDate(options.previousAsOfDate)}`;

  // ─────────────────────────────── Sheet 1: OTB RR
  const sheet = workbook.addWorksheet("OTB RR", { views: [{ state: "frozen", ySplit: 2 }] });
  sheet.properties.defaultRowHeight = 16;

  const setHeader = (row: number, col: number, text: string) => {
    const cell = sheet.getCell(row, col);
    cell.value = text;
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  };

  const title = sheet.getCell(1, 1);
  title.value = `${options.propertyName} | ${formatDate(options.asOfDate)}`;
  title.font = { name: FONT, bold: true, size: 14 };
  sheet.mergeCells(1, 1, 1, 6);

  const revenueHeaders = [
    "",
    otbCurrent,
    otbPrevious,
    "Variance",
    "Last Year Actual",
    "OTB vs LY",
    "Dinner",
    "Room 0",
    "Comp RNs",
    "Additional Revenue",
    "Total Combined",
  ];
  revenueHeaders.forEach((text, i) => {
    if (i === 0) return;
    setHeader(layout.revHeader, i + 1, text);
  });

  months.forEach((key, i) => {
    const row = layout.revFirst + i;
    const label = sheet.getCell(row, 1);
    label.value = monthLabel(key);
    label.font = { name: FONT, bold: true, size: 10 };

    sheet.getCell(row, 2).value = snapshot.otb_revenue[key] ?? 0;
    sheet.getCell(row, 3).value = snapshot.previous_otb_revenue[key] ?? 0;
    sheet.getCell(row, 4).value = { formula: `B${row}-C${row}` };
    sheet.getCell(row, 5).value = snapshot.last_year_actual[key] ?? 0;
    sheet.getCell(row, 6).value = { formula: `B${row}-E${row}` };
    sheet.getCell(row, 7).value = Number(inputs.dinner_by_month[key]) || 0;
    sheet.getCell(row, 8).value = Number(inputs.room0_by_month[key]) || 0;
    sheet.getCell(row, 9).value = Number(inputs.comp_rns_by_month[key]) || 0;
    sheet.getCell(row, 10).value = { formula: `G${row}+H${row}` };
    sheet.getCell(row, 11).value = { formula: `B${row}+J${row}` };

    for (let col = 2; col <= 11; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.font = { name: FONT, size: 10 };
      cell.numFmt = col === 9 ? INTEGER : MONEY;
    }
  });

  const totalRow = layout.revTotal;
  const totalLabel = sheet.getCell(totalRow, 1);
  totalLabel.value = "TOTAL";
  totalLabel.font = { name: FONT, bold: true, size: 10 };
  const first = layout.revFirst;
  const last = layout.revFirst + Math.max(months.length - 1, 0);
  for (let col = 2; col <= 11; col += 1) {
    const letter = sheet.getColumn(col).letter;
    const cell = sheet.getCell(totalRow, col);
    cell.value =
      col === 6
        ? { formula: `B${totalRow}-E${totalRow}` }
        : { formula: `SUM(${letter}${first}:${letter}${last})` };
    cell.font = { name: FONT, bold: true, size: 10 };
    cell.numFmt = col === 9 ? INTEGER : MONEY;
    cell.border = { top: { style: "thin" } };
  }

  // Room nights + occupancy headings
  const rnHeading = sheet.getCell(layout.rnHeading, 1);
  rnHeading.value = "Room Nights";
  rnHeading.font = { name: FONT, bold: true, size: 11 };
  const occHeading = sheet.getCell(layout.rnHeading, 7);
  occHeading.value = "Occupancy";
  occHeading.font = { name: FONT, bold: true, size: 11 };
  const cmpHeading = sheet.getCell(layout.rnHeading, 17);
  cmpHeading.value = "Revenue Comparison Review";
  cmpHeading.font = { name: FONT, bold: true, size: 11 };

  const comparisonHeaders = [otbCurrent, otbPrevious, "Variance", "Last Year Actual", "OTB vs LY"];
  comparisonHeaders.forEach((text, i) => setHeader(layout.rnHeader, i + 2, text));
  comparisonHeaders.forEach((text, i) => setHeader(layout.rnHeader, i + 7, text));
  setHeader(layout.rnHeader, 17, "");
  setHeader(layout.rnHeader, 18, "Revenue | OTB vs LY");
  setHeader(layout.rnHeader, 19, "%");
  setHeader(layout.rnHeader, 20, "ADR | OTB vs LY");
  setHeader(layout.rnHeader, 21, "%");

  months.forEach((key, i) => {
    const row = layout.rnFirst + i;
    const revRow = layout.revFirst + i;
    const adrRow = layout.adrFirst + i;
    const capacity = snapshot.capacity_days[key] ?? rooms * 30;

    const label = sheet.getCell(row, 1);
    label.value = monthLabel(key);
    label.font = { name: FONT, bold: true, size: 10 };

    sheet.getCell(row, 2).value = snapshot.room_nights[key] ?? 0;
    sheet.getCell(row, 3).value = snapshot.previous_room_nights[key] ?? 0;
    sheet.getCell(row, 4).value = { formula: `B${row}-C${row}` };
    sheet.getCell(row, 5).value = snapshot.last_year_room_nights[key] ?? 0;
    sheet.getCell(row, 6).value = { formula: `B${row}-E${row}` };
    for (let col = 2; col <= 6; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.font = { name: FONT, size: 10 };
      cell.numFmt = INTEGER;
    }

    // Occupancy mirrors the room-night block over the month's capacity days.
    sheet.getCell(row, 7).value = { formula: `B${row}/${capacity}` };
    sheet.getCell(row, 8).value = { formula: `C${row}/${capacity}` };
    sheet.getCell(row, 9).value = { formula: `G${row}-H${row}` };
    sheet.getCell(row, 10).value = { formula: `E${row}/${capacity}` };
    sheet.getCell(row, 11).value = { formula: `G${row}-J${row}` };
    for (let col = 7; col <= 11; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.font = { name: FONT, size: 10 };
      cell.numFmt = PERCENT;
    }

    // Comparison review panel
    const monthCell = sheet.getCell(row, 17);
    monthCell.value = monthLabel(key);
    monthCell.font = { name: FONT, bold: true, size: 10 };
    const revVariance = sheet.getCell(row, 18);
    revVariance.value = { formula: `F${revRow}` };
    revVariance.numFmt = MONEY;
    revVariance.font = { name: FONT, size: 10 };
    const revPercent = sheet.getCell(row, 19);
    revPercent.value = { formula: `IF(E${revRow}=0,"",(B${revRow}-E${revRow})/E${revRow})` };
    revPercent.numFmt = PERCENT;
    revPercent.font = { name: FONT, size: 10 };
    const adrVariance = sheet.getCell(row, 20);
    adrVariance.value = { formula: `F${adrRow}` };
    adrVariance.numFmt = MONEY_DEC;
    adrVariance.font = { name: FONT, size: 10 };
    const adrPercent = sheet.getCell(row, 21);
    adrPercent.value = { formula: `IF(E${adrRow}=0,"",(B${adrRow}-E${adrRow})/E${adrRow})` };
    adrPercent.numFmt = PERCENT;
    adrPercent.font = { name: FONT, size: 10 };
  });

  // Capacity legend
  const legend = [
    `${rooms} Rooms`,
    `28 = ${rooms * 28}`,
    `29 = ${rooms * 29}`,
    `30 = ${rooms * 30}`,
    `31 = ${rooms * 31}`,
  ];
  legend.forEach((text, i) => {
    const cell = sheet.getCell(layout.rnFirst + i, 13);
    cell.value = text;
    cell.font = { name: FONT, size: 9, italic: i > 0 };
  });

  // ADR block
  const adrHeading = sheet.getCell(layout.adrHeading, 1);
  adrHeading.value = "ADR";
  adrHeading.font = { name: FONT, bold: true, size: 11 };
  comparisonHeaders.forEach((text, i) => setHeader(layout.adrHeader, i + 2, text));

  months.forEach((key, i) => {
    const row = layout.adrFirst + i;
    const revRow = layout.revFirst + i;
    const rnRow = layout.rnFirst + i;

    const label = sheet.getCell(row, 1);
    label.value = monthLabel(key);
    label.font = { name: FONT, bold: true, size: 10 };

    sheet.getCell(row, 2).value = { formula: `IF(B${rnRow}=0,0,B${revRow}/B${rnRow})` };
    sheet.getCell(row, 3).value = { formula: `IF(C${rnRow}=0,0,C${revRow}/C${rnRow})` };
    sheet.getCell(row, 4).value = { formula: `B${row}-C${row}` };
    sheet.getCell(row, 5).value = { formula: `IF(E${rnRow}=0,0,E${revRow}/E${rnRow})` };
    sheet.getCell(row, 6).value = { formula: `B${row}-E${row}` };
    for (let col = 2; col <= 6; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.font = { name: FONT, size: 10 };
      cell.numFmt = MONEY_DEC;
    }
  });

  // Notes footer
  const notes = [
    "OTB - On The Books",
    "LY - Last Year",
    "",
    "Please note that all provisional bookings",
    "are included in the Revenue Reports",
    "(Comp RNs exclude Room 0 nights)",
  ];
  notes.forEach((text, i) => {
    const cell = sheet.getCell(layout.adrFirst + i, 8);
    cell.value = text;
    cell.font = { name: FONT, size: 9, italic: true };
  });

  // Reviewer commentary block, to the right of the notes footer.
  const commentary: Array<[string, string | null | undefined]> = [
    ["Minimum stay", inputs.min_stay_notes],
    ["Promotions", inputs.promotions_notes],
    ["Rate overrides", inputs.rate_override_notes],
    ["Commentary", inputs.free_commentary],
  ];
  let commentaryRow = layout.adrFirst;
  for (const [label, value] of commentary) {
    if (!value) continue;
    const heading = sheet.getCell(commentaryRow, 13);
    heading.value = label;
    heading.font = { name: FONT, bold: true, size: 9 };
    const body = sheet.getCell(commentaryRow, 14);
    body.value = value;
    body.font = { name: FONT, size: 9 };
    body.alignment = { wrapText: true, vertical: "top" };
    sheet.mergeCells(commentaryRow, 14, commentaryRow, 17);
    commentaryRow += 2;
  }
  sheet.getColumn(14).width = 40;

  sheet.getColumn(1).width = 12;
  for (let col = 2; col <= 11; col += 1) sheet.getColumn(col).width = 16;
  sheet.getColumn(13).width = 14;
  sheet.getColumn(17).width = 12;
  for (let col = 18; col <= 21; col += 1) sheet.getColumn(col).width = 16;

  // ─────────────────────────────── Sheet 2: Fin Year (skeleton with live formulas)
  const asOfYear = Number(options.asOfDate.slice(0, 4));
  const fin = workbook.addWorksheet("Fin Year");
  const finTitle = fin.getCell(1, 1);
  finTitle.value = `${options.propertyName} | Financial Year`;
  finTitle.font = { name: FONT, bold: true, size: 14 };

  // Values come from the property's historical baseline (imported or built up by
  // earlier runs); the running year falls back to this run's own OTB figures so
  // the sheet is never blank when a baseline month is still open.
  const finBaseline = options.historicalBaseline ?? {};
  const finRevenue = finBaseline.revenue ?? {};
  const finNights = finBaseline.room_nights ?? {};
  const finValue = (
    map: Record<string, number>,
    fallback: Record<string, number>,
    year: number,
    monthIndex: number,
  ): number | null => {
    const key = `${year}-${`${monthIndex + 1}`.padStart(2, "0")}`;
    const value = map[key] ?? fallback[key];
    return Number.isFinite(value) ? Number(value) : null;
  };

  const finBlock = (
    startRow: number,
    heading: string,
    numFmt: string,
    withAdr = false,
    values?: { map: Record<string, number>; fallback: Record<string, number> },
  ) => {
    if (heading) {
      const cell = fin.getCell(startRow, 1);
      cell.value = heading;
      cell.font = { name: FONT, bold: true, size: 11 };
    }
    const headerRow = startRow + (heading ? 1 : 0);
    [`${asOfYear}`, `${asOfYear - 1}`, `${asOfYear} vs ${asOfYear - 1}`, "%"].forEach((text, i) =>
      setFinHeader(headerRow, i + 2, text),
    );
    const firstRow = headerRow + 1;
    MONTH_LABELS.forEach((label, i) => {
      const row = firstRow + i;
      const cell = fin.getCell(row, 1);
      cell.value = label;
      cell.font = { name: FONT, bold: true, size: 10 };
      if (withAdr) {
        const revRow = 3 + i;
        const rnRow = 20 + i;
        fin.getCell(row, 2).value = { formula: `IF(B${rnRow}=0,0,B${revRow}/B${rnRow})` };
        fin.getCell(row, 3).value = { formula: `IF(C${rnRow}=0,0,C${revRow}/C${rnRow})` };
      } else if (values) {
        fin.getCell(row, 2).value = finValue(values.map, values.fallback, asOfYear, i);
        fin.getCell(row, 3).value = finValue(values.map, {}, asOfYear - 1, i);
      }
      fin.getCell(row, 4).value = { formula: `B${row}-C${row}` };
      fin.getCell(row, 5).value = { formula: `IF(C${row}=0,"",(B${row}-C${row})/C${row})` };
      for (let col = 2; col <= 4; col += 1) {
        const c = fin.getCell(row, col);
        c.font = { name: FONT, size: 10 };
        c.numFmt = numFmt;
      }
      const pct = fin.getCell(row, 5);
      pct.numFmt = PERCENT;
      pct.font = { name: FONT, size: 10 };
    });
    return { headerRow, firstRow, lastRow: firstRow + 11 };
  };

  function setFinHeader(row: number, col: number, text: string) {
    const cell = fin.getCell(row, col);
    cell.value = text;
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
    cell.alignment = { horizontal: "center" };
  }

  const revenueBlock = finBlock(2, "", MONEY, false, {
    map: finRevenue,
    fallback: snapshot.otb_revenue ?? {},
  });
  const revTotalRow = revenueBlock.lastRow + 1;
  const finTotal = fin.getCell(revTotalRow, 1);
  finTotal.value = "TOTAL";
  finTotal.font = { name: FONT, bold: true, size: 10 };
  for (const col of [2, 3]) {
    const letter = fin.getColumn(col).letter;
    const cell = fin.getCell(revTotalRow, col);
    cell.value = { formula: `SUM(${letter}${revenueBlock.firstRow}:${letter}${revenueBlock.lastRow})` };
    cell.numFmt = MONEY;
    cell.font = { name: FONT, bold: true, size: 10 };
  }
  fin.getCell(revTotalRow, 4).value = { formula: `B${revTotalRow}-C${revTotalRow}` };
  fin.getCell(revTotalRow, 4).numFmt = MONEY;
  fin.getCell(revTotalRow, 5).value = {
    formula: `IF(C${revTotalRow}=0,"",(B${revTotalRow}-C${revTotalRow})/C${revTotalRow})`,
  };
  fin.getCell(revTotalRow, 5).numFmt = PERCENT;

  finBlock(revTotalRow + 1, "Room Nights", INTEGER, false, {
    map: finNights,
    fallback: snapshot.room_nights ?? {},
  });
  finBlock(revTotalRow + 15, "ADR", MONEY_DEC, true);


  fin.getColumn(1).width = 12;
  for (let col = 2; col <= 5; col += 1) fin.getColumn(col).width = 16;

  // ─────────────────────────────── Sheet 3: Historical
  const historical = workbook.addWorksheet("Historical");
  const baseline = options.historicalBaseline ?? {};
  const revenueMap = baseline.revenue ?? {};
  const nightsMap = baseline.room_nights ?? {};
  const years = (baseline.years?.length
    ? [...baseline.years]
    : [...new Set(Object.keys(revenueMap).map((k) => Number(k.slice(0, 4))))]
  )
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);

  const histTitle = historical.getCell(1, 1);
  histTitle.value = `${options.propertyName} | Historical`;
  histTitle.font = { name: FONT, bold: true, size: 14 };

  if (years.length === 0) {
    const empty = historical.getCell(3, 1);
    empty.value = "No historical baseline captured for this property yet.";
    empty.font = { name: FONT, size: 10, italic: true };
  } else {
    const histBlock = (startRow: number, heading: string, map: Record<string, number>, numFmt: string) => {
      const headingCell = historical.getCell(startRow, 1);
      headingCell.value = heading;
      headingCell.font = { name: FONT, bold: true, size: 11 };
      years.forEach((year, i) => {
        const cell = historical.getCell(startRow, i + 2);
        cell.value = `${year}`;
        cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
        cell.alignment = { horizontal: "center" };
      });
      const varianceCol = years.length + 2;
      if (years.length >= 2) {
        const cell = historical.getCell(startRow, varianceCol);
        cell.value = `${years[years.length - 2]} vs ${years[years.length - 1]}`;
        cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
        cell.alignment = { horizontal: "center" };
      }
      MONTH_LABELS.forEach((label, m) => {
        const row = startRow + 1 + m;
        const monthCell = historical.getCell(row, 1);
        monthCell.value = label;
        monthCell.font = { name: FONT, bold: true, size: 10 };
        years.forEach((year, i) => {
          const key = `${year}-${`${m + 1}`.padStart(2, "0")}`;
          const cell = historical.getCell(row, i + 2);
          const value = map[key];
          cell.value = value === undefined ? null : value;
          cell.numFmt = numFmt;
          cell.font = { name: FONT, size: 10 };
        });
        if (years.length >= 2) {
          const prev = historical.getColumn(years.length).letter;
          const latest = historical.getColumn(years.length + 1).letter;
          const cell = historical.getCell(row, varianceCol);
          cell.value = { formula: `${latest}${row}-${prev}${row}` };
          cell.numFmt = numFmt;
          cell.font = { name: FONT, size: 10 };
        }
      });
      return startRow + 13;
    };

    const afterRevenue = histBlock(3, "Revenue", revenueMap, MONEY);
    const afterNights = histBlock(afterRevenue + 1, "Room Nights", nightsMap, INTEGER);

    // ADR grid derived from the two blocks above.
    const adrStart = afterNights + 1;
    const adrHeadingCell = historical.getCell(adrStart, 1);
    adrHeadingCell.value = "ADR";
    adrHeadingCell.font = { name: FONT, bold: true, size: 11 };
    years.forEach((year, i) => {
      const cell = historical.getCell(adrStart, i + 2);
      cell.value = `${year}`;
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
      cell.alignment = { horizontal: "center" };
    });
    MONTH_LABELS.forEach((label, m) => {
      const row = adrStart + 1 + m;
      const monthCell = historical.getCell(row, 1);
      monthCell.value = label;
      monthCell.font = { name: FONT, bold: true, size: 10 };
      years.forEach((_, i) => {
        const letter = historical.getColumn(i + 2).letter;
        const revRow = 4 + m;
        const rnRow = afterRevenue + 2 + m;
        const cell = historical.getCell(row, i + 2);
        cell.value = {
          formula: `IF(N(${letter}${rnRow})=0,"",${letter}${revRow}/${letter}${rnRow})`,
        };
        cell.numFmt = MONEY_DEC;
        cell.font = { name: FONT, size: 10 };
      });
    });
  }

  historical.getColumn(1).width = 12;
  for (let col = 2; col <= years.length + 3; col += 1) historical.getColumn(col).width = 14;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
