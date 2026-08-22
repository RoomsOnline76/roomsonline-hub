// NightsBridge consolidated workbook: the original Torburnlea layout —
// OTB RR (revenue with Dinner / Room 0 / Comp RNs, room nights, occupancy, ADR),
// Fin Year and Historical.
import {
  buildHistoricalSheet,
  bodyCell,
  capacityLegend,
  chartOrDataBlock,
  colLetter,
  commentaryBlock,
  finishWorkbook,
  FONT,
  formatDate,
  headerCell,
  hex,
  INTEGER,
  labelCell,
  MONEY,
  MONEY_DEC,
  MONTH_LABELS,
  monthLabel,
  newWorkbook,
  noteCell,
  PERCENT,
  sheetTitle,
  type WorkbookOptions,
} from "./shared.ts";

/** Row/column map shared with the PDF draft and Canva pack. */
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
  return {
    revHeader, revFirst, revTotal,
    rnHeading, rnHeader, rnFirst,
    adrHeading, adrHeader, adrFirst,
  };
}

export type ReportLayout = ReturnType<typeof buildLayout>;

export async function buildNightsbridgeWorkbook(options: WorkbookOptions): Promise<Uint8Array> {
  const { snapshot, inputs } = options;
  const months = snapshot.months ?? [];
  const layout = buildLayout(months.length);
  const rooms = snapshot.room_count > 0 ? snapshot.room_count : 1;
  const accent = hex(options.brandPrimary) ?? "FFE91E8C";

  const workbook = newWorkbook();
  const otbCurrent = `OTB @ ${formatDate(options.asOfDate)}`;
  const otbPrevious = `OTB @ ${formatDate(options.previousAsOfDate)}`;

  const sheet = workbook.addWorksheet("OTB RR", { views: [{ state: "frozen", ySplit: 2 }] });
  sheet.properties.defaultRowHeight = 16;
  sheetTitle(sheet, `${options.propertyName} | ${formatDate(options.asOfDate)}`);
  sheet.mergeCells(1, 1, 1, 6);

  const revenueHeaders = [
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
  revenueHeaders.forEach((text, i) => headerCell(sheet, layout.revHeader, i + 2, text, accent));

  months.forEach((key, i) => {
    const row = layout.revFirst + i;
    labelCell(sheet, row, 1, monthLabel(key));
    bodyCell(sheet, row, 2, snapshot.otb_revenue[key] ?? 0, MONEY);
    bodyCell(sheet, row, 3, snapshot.previous_otb_revenue[key] ?? 0, MONEY);
    bodyCell(sheet, row, 4, { formula: `B${row}-C${row}` }, MONEY);
    bodyCell(sheet, row, 5, snapshot.last_year_actual[key] ?? 0, MONEY);
    bodyCell(sheet, row, 6, { formula: `B${row}-E${row}` }, MONEY);
    bodyCell(sheet, row, 7, Number(inputs.dinner_by_month[key]) || 0, MONEY);
    bodyCell(sheet, row, 8, Number(inputs.room0_by_month[key]) || 0, MONEY);
    bodyCell(sheet, row, 9, Number(inputs.comp_rns_by_month[key]) || 0, INTEGER);
    bodyCell(sheet, row, 10, { formula: `G${row}+H${row}` }, MONEY);
    bodyCell(sheet, row, 11, { formula: `B${row}+J${row}` }, MONEY);
  });

  const totalRow = layout.revTotal;
  labelCell(sheet, totalRow, 1, "TOTAL");
  const first = layout.revFirst;
  const last = layout.revFirst + Math.max(months.length - 1, 0);
  for (let col = 2; col <= 11; col += 1) {
    const letter = colLetter(col);
    const cell = bodyCell(
      sheet,
      totalRow,
      col,
      col === 6
        ? { formula: `B${totalRow}-E${totalRow}` }
        : { formula: `SUM(${letter}${first}:${letter}${last})` },
      col === 9 ? INTEGER : MONEY,
    );
    cell.font = { name: FONT, bold: true, size: 10 };
    cell.border = { top: { style: "thin" } };
  }

  labelCell(sheet, layout.rnHeading, 1, "Room Nights", 11);
  labelCell(sheet, layout.rnHeading, 7, "Occupancy", 11);
  labelCell(sheet, layout.rnHeading, 17, "Revenue Comparison Review", 11);

  const comparisonHeaders = [otbCurrent, otbPrevious, "Variance", "Last Year Actual", "OTB vs LY"];
  comparisonHeaders.forEach((text, i) => headerCell(sheet, layout.rnHeader, i + 2, text, accent));
  comparisonHeaders.forEach((text, i) => headerCell(sheet, layout.rnHeader, i + 7, text, accent));
  headerCell(sheet, layout.rnHeader, 17, "", accent);
  headerCell(sheet, layout.rnHeader, 18, "Revenue | OTB vs LY", accent);
  headerCell(sheet, layout.rnHeader, 19, "%", accent);
  headerCell(sheet, layout.rnHeader, 20, "ADR | OTB vs LY", accent);
  headerCell(sheet, layout.rnHeader, 21, "%", accent);

  months.forEach((key, i) => {
    const row = layout.rnFirst + i;
    const revRow = layout.revFirst + i;
    const adrRow = layout.adrFirst + i;
    const capacity = snapshot.capacity_days[key] ?? rooms * 30;

    labelCell(sheet, row, 1, monthLabel(key));
    bodyCell(sheet, row, 2, snapshot.room_nights[key] ?? 0, INTEGER);
    bodyCell(sheet, row, 3, snapshot.previous_room_nights[key] ?? 0, INTEGER);
    bodyCell(sheet, row, 4, { formula: `B${row}-C${row}` }, INTEGER);
    bodyCell(sheet, row, 5, snapshot.last_year_room_nights[key] ?? 0, INTEGER);
    bodyCell(sheet, row, 6, { formula: `B${row}-E${row}` }, INTEGER);

    bodyCell(sheet, row, 7, { formula: `B${row}/${capacity}` }, PERCENT);
    bodyCell(sheet, row, 8, { formula: `C${row}/${capacity}` }, PERCENT);
    bodyCell(sheet, row, 9, { formula: `G${row}-H${row}` }, PERCENT);
    bodyCell(sheet, row, 10, { formula: `E${row}/${capacity}` }, PERCENT);
    bodyCell(sheet, row, 11, { formula: `G${row}-J${row}` }, PERCENT);

    labelCell(sheet, row, 17, monthLabel(key));
    bodyCell(sheet, row, 18, { formula: `F${revRow}` }, MONEY);
    bodyCell(
      sheet,
      row,
      19,
      { formula: `IF(E${revRow}=0,"",(B${revRow}-E${revRow})/E${revRow})` },
      PERCENT,
    );
    bodyCell(sheet, row, 20, { formula: `F${adrRow}` }, MONEY_DEC);
    bodyCell(
      sheet,
      row,
      21,
      { formula: `IF(E${adrRow}=0,"",(B${adrRow}-E${adrRow})/E${adrRow})` },
      PERCENT,
    );
  });

  capacityLegend(sheet, layout.rnFirst, 13, rooms);

  labelCell(sheet, layout.adrHeading, 1, "ADR", 11);
  comparisonHeaders.forEach((text, i) => headerCell(sheet, layout.adrHeader, i + 2, text, accent));

  months.forEach((key, i) => {
    const row = layout.adrFirst + i;
    const revRow = layout.revFirst + i;
    const rnRow = layout.rnFirst + i;
    labelCell(sheet, row, 1, monthLabel(key));
    bodyCell(sheet, row, 2, { formula: `IF(B${rnRow}=0,0,B${revRow}/B${rnRow})` }, MONEY_DEC);
    bodyCell(sheet, row, 3, { formula: `IF(C${rnRow}=0,0,C${revRow}/C${rnRow})` }, MONEY_DEC);
    bodyCell(sheet, row, 4, { formula: `B${row}-C${row}` }, MONEY_DEC);
    bodyCell(sheet, row, 5, { formula: `IF(E${rnRow}=0,0,E${revRow}/E${rnRow})` }, MONEY_DEC);
    bodyCell(sheet, row, 6, { formula: `B${row}-E${row}` }, MONEY_DEC);
  });

  const notes = [
    "OTB - On The Books",
    "LY - Last Year",
    "",
    "Please note that all provisional bookings",
    "are included in the Revenue Reports",
    "(Comp RNs exclude Room 0 nights)",
  ];
  notes.forEach((text, i) => noteCell(sheet, layout.adrFirst + i, 8, text));
  commentaryBlock(sheet, layout.adrFirst, 13, inputs);

  sheet.getColumn(1).width = 12;
  for (let col = 2; col <= 11; col += 1) sheet.getColumn(col).width = 16;
  sheet.getColumn(13).width = 14;
  sheet.getColumn(17).width = 12;
  for (let col = 18; col <= 21; col += 1) sheet.getColumn(col).width = 16;

  const chartRow = layout.adrFirst + months.length + 3;
  chartOrDataBlock(sheet, {
    title: "Revenue | OTB vs LY",
    anchorRow: chartRow,
    anchorCol: 1,
    categories: months.map(monthLabel),
    series: [
      { name: otbCurrent, values: months.map((k) => snapshot.otb_revenue[k] ?? 0), numFmt: MONEY },
      {
        name: "Last Year Actual",
        values: months.map((k) => snapshot.last_year_actual[k] ?? 0),
        numFmt: MONEY,
      },
    ],
  });

  // ── Fin Year
  const asOfYear = Number(options.asOfDate.slice(0, 4));
  const fin = workbook.addWorksheet("Fin Year");
  sheetTitle(fin, `${options.propertyName} | Financial Year`);
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
    if (heading) labelCell(fin, startRow, 1, heading, 11);
    const headerRow = startRow + (heading ? 1 : 0);
    [`${asOfYear}`, `${asOfYear - 1}`, `${asOfYear} vs ${asOfYear - 1}`, "%"].forEach((text, i) =>
      headerCell(fin, headerRow, i + 2, text, accent),
    );
    const firstRow = headerRow + 1;
    MONTH_LABELS.forEach((label, i) => {
      const row = firstRow + i;
      labelCell(fin, row, 1, label);
      if (withAdr) {
        const revRow = 3 + i;
        const rnRow = 20 + i;
        bodyCell(fin, row, 2, { formula: `IF(B${rnRow}=0,0,B${revRow}/B${rnRow})` }, numFmt);
        bodyCell(fin, row, 3, { formula: `IF(C${rnRow}=0,0,C${revRow}/C${rnRow})` }, numFmt);
      } else if (values) {
        bodyCell(fin, row, 2, finValue(values.map, values.fallback, asOfYear, i), numFmt);
        bodyCell(fin, row, 3, finValue(values.map, {}, asOfYear - 1, i), numFmt);
      }
      bodyCell(fin, row, 4, { formula: `B${row}-C${row}` }, numFmt);
      bodyCell(fin, row, 5, { formula: `IF(C${row}=0,"",(B${row}-C${row})/C${row})` }, PERCENT);
    });
    return { headerRow, firstRow, lastRow: firstRow + 11 };
  };

  const revenueBlock = finBlock(2, "", MONEY, false, {
    map: finRevenue,
    fallback: snapshot.otb_revenue ?? {},
  });
  const revTotalRow = revenueBlock.lastRow + 1;
  labelCell(fin, revTotalRow, 1, "TOTAL");
  for (const col of [2, 3]) {
    const letter = colLetter(col);
    bodyCell(
      fin,
      revTotalRow,
      col,
      { formula: `SUM(${letter}${revenueBlock.firstRow}:${letter}${revenueBlock.lastRow})` },
      MONEY,
    ).font = { name: FONT, bold: true, size: 10 };
  }
  bodyCell(fin, revTotalRow, 4, { formula: `B${revTotalRow}-C${revTotalRow}` }, MONEY);
  bodyCell(
    fin,
    revTotalRow,
    5,
    { formula: `IF(C${revTotalRow}=0,"",(B${revTotalRow}-C${revTotalRow})/C${revTotalRow})` },
    PERCENT,
  );

  finBlock(revTotalRow + 1, "Room Nights", INTEGER, false, {
    map: finNights,
    fallback: snapshot.room_nights ?? {},
  });
  finBlock(revTotalRow + 15, "ADR", MONEY_DEC, true);

  fin.getColumn(1).width = 12;
  for (let col = 2; col <= 5; col += 1) fin.getColumn(col).width = 16;

  buildHistoricalSheet(workbook, options, accent);
  return finishWorkbook(workbook);
}
