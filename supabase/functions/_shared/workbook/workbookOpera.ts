// OPERA consolidated workbook — mirrors the reference "History and Forecast"
// consolidated file: an OTB RR sheet carrying Target / Target-vs-LY /
// Actual-vs-LY comparisons plus prior-review pickup, a Fin Year sheet with
// targets, room nights, occupancy and ADR, and the multi-year Historical sheet.
import {
  buildHistoricalSheet,
  bodyCell,
  capacityLegend,
  chartOrDataBlock,
  colLetter,
  commentaryBlock,
  DEFAULT_UPLIFT,
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
  normaliseExtras,
  noteCell,
  PERCENT,
  sheetTitle,
  type WorkbookOptions,
} from "./shared.ts";

const pad = (n: number) => `${n}`.padStart(2, "0");

export async function buildOperaWorkbook(options: WorkbookOptions): Promise<Uint8Array> {
  const { snapshot, inputs } = options;
  const months = snapshot.months ?? [];
  const rooms = snapshot.room_count > 0 ? snapshot.room_count : 1;
  const accent = hex(options.brandPrimary) ?? "FFE91E8C";
  const extras = normaliseExtras(options.extras);
  const uplift = extras.targetUplift ?? DEFAULT_UPLIFT;
  const upliftFactor = 1 + uplift;

  const workbook = newWorkbook();
  const otbCurrent = `OTB @ ${formatDate(options.asOfDate)}`;
  const otbPrevious = `OTB @ ${formatDate(options.previousAsOfDate)}`;
  const pickupLabel = `${formatDate(options.asOfDate)} vs ${formatDate(options.previousAsOfDate)}`;

  const sheet = workbook.addWorksheet("OTB RR", { views: [{ state: "frozen", ySplit: 3 }] });
  sheet.properties.defaultRowHeight = 16;
  sheetTitle(sheet, `${options.propertyName} | ${formatDate(options.asOfDate)}`);
  sheet.mergeCells(1, 1, 1, 6);

  const capacityOf = (key: string) => snapshot.capacity_days[key] ?? rooms * 30;
  const number = (map: Record<string, number>, key: string): number | null => {
    const value = Number(map?.[key]);
    return Number.isFinite(value) ? value : null;
  };

  /* ── Revenue block ───────────────────────────────────────── */
  labelCell(sheet, 2, 1, "Revenue", 11);
  const revHeader = 3;
  const revFirst = 4;
  const revenueHeaders = [
    otbCurrent,
    "Target",
    "Last Year Actual",
    "OTB vs Target",
    "%",
    "Target vs Last Year",
    "%",
    "Actual vs Last Year",
    "%",
    otbPrevious,
    pickupLabel,
  ];
  revenueHeaders.forEach((text, i) => headerCell(sheet, revHeader, i + 2, text, accent));

  months.forEach((key, i) => {
    const row = revFirst + i;
    labelCell(sheet, row, 1, monthLabel(key));
    bodyCell(sheet, row, 2, snapshot.otb_revenue[key] ?? 0, MONEY);
    const explicitTarget = number(extras.targets, key);
    bodyCell(
      sheet,
      row,
      3,
      extras.targetUplift !== null || explicitTarget === null
        ? { formula: `D${row}*${upliftFactor}` }
        : explicitTarget,
      MONEY,
    );
    bodyCell(sheet, row, 4, snapshot.last_year_actual[key] ?? 0, MONEY);
    bodyCell(sheet, row, 5, { formula: `B${row}-C${row}` }, MONEY);
    bodyCell(sheet, row, 6, { formula: `IF(C${row}=0,"",(B${row}-C${row})/C${row})` }, PERCENT);
    bodyCell(sheet, row, 7, { formula: `C${row}-D${row}` }, MONEY);
    bodyCell(sheet, row, 8, { formula: `IF(D${row}=0,"",(C${row}-D${row})/D${row})` }, PERCENT);
    bodyCell(sheet, row, 9, { formula: `B${row}-D${row}` }, MONEY);
    bodyCell(sheet, row, 10, { formula: `IF(D${row}=0,"",(B${row}-D${row})/D${row})` }, PERCENT);
    bodyCell(sheet, row, 11, snapshot.previous_otb_revenue[key] ?? 0, MONEY);
    bodyCell(sheet, row, 12, { formula: `B${row}-K${row}` }, MONEY);
  });

  const revLast = revFirst + Math.max(months.length - 1, 0);
  const revTotal = revFirst + months.length;
  labelCell(sheet, revTotal, 1, "TOTAL");
  const totalFormulas: Record<number, string> = {
    2: `SUM(B${revFirst}:B${revLast})`,
    3: `D${revTotal}*${upliftFactor}`,
    4: `SUM(D${revFirst}:D${revLast})`,
    5: `B${revTotal}-C${revTotal}`,
    6: `IF(C${revTotal}=0,"",(B${revTotal}-C${revTotal})/C${revTotal})`,
    7: `C${revTotal}-D${revTotal}`,
    8: `IF(D${revTotal}=0,"",(C${revTotal}-D${revTotal})/D${revTotal})`,
    9: `B${revTotal}-D${revTotal}`,
    10: `IF(D${revTotal}=0,"",(B${revTotal}-D${revTotal})/D${revTotal})`,
    11: `SUM(K${revFirst}:K${revLast})`,
    12: `SUM(L${revFirst}:L${revLast})`,
  };
  for (const [col, formula] of Object.entries(totalFormulas)) {
    const index = Number(col);
    const cell = bodyCell(
      sheet,
      revTotal,
      index,
      { formula },
      index === 6 || index === 8 || index === 10 ? PERCENT : MONEY,
    );
    cell.font = { name: FONT, bold: true, size: 10 };
    cell.border = { top: { style: "thin" } };
  }

  /* ── Room occupancy block ────────────────────────────────── */
  const occHeading = revTotal + 2;
  labelCell(sheet, occHeading, 1, "Room Occupancy", 11);
  const occHeader = occHeading + 1;
  const occFirst = occHeader + 1;
  [
    otbCurrent,
    `RN ${formatDate(options.asOfDate)}`,
    "Last Year Actual",
    "RN Last Year",
    "",
    "OTB vs LY",
    "RN vs LY",
    "",
    "",
    otbPrevious,
    pickupLabel,
  ].forEach((text, i) => headerCell(sheet, occHeader, i + 2, text, accent));

  months.forEach((key, i) => {
    const row = occFirst + i;
    const capacity = capacityOf(key);
    labelCell(sheet, row, 1, monthLabel(key));
    bodyCell(sheet, row, 2, { formula: `IF(C${row}=0,"",C${row}/${capacity})` }, PERCENT);
    bodyCell(sheet, row, 3, snapshot.room_nights[key] ?? 0, INTEGER);
    const lyOcc = number(extras.lastYearOccupancy, key);
    bodyCell(
      sheet,
      row,
      4,
      lyOcc !== null ? lyOcc : { formula: `IF(E${row}=0,"",E${row}/${capacity})` },
      PERCENT,
    );
    bodyCell(sheet, row, 5, snapshot.last_year_room_nights[key] ?? 0, INTEGER);
    bodyCell(sheet, row, 7, { formula: `B${row}-D${row}` }, PERCENT);
    bodyCell(sheet, row, 8, { formula: `C${row}-E${row}` }, INTEGER);
    const prevOcc = number(extras.previousOccupancy, key);
    const prevNights = snapshot.previous_room_nights[key] ?? 0;
    bodyCell(
      sheet,
      row,
      11,
      prevOcc !== null ? prevOcc : capacity > 0 ? prevNights / capacity : 0,
      PERCENT,
    );
    bodyCell(sheet, row, 12, { formula: `B${row}-K${row}` }, PERCENT);
  });

  capacityLegend(sheet, occFirst, 14, rooms);

  /* ── Average daily rate block ────────────────────────────── */
  const adrHeading = occFirst + months.length + 1;
  labelCell(sheet, adrHeading, 1, "Average Daily Rate", 11);
  const adrHeader = adrHeading + 1;
  const adrFirst = adrHeader + 1;
  [otbCurrent, "", "Last Year Actual", "", "OTB vs LY", "%", "", "", "", otbPrevious, pickupLabel]
    .forEach((text, i) => headerCell(sheet, adrHeader, i + 2, text, accent));

  months.forEach((key, i) => {
    const row = adrFirst + i;
    const revRow = revFirst + i;
    const occRow = occFirst + i;
    labelCell(sheet, row, 1, monthLabel(key));
    bodyCell(sheet, row, 2, { formula: `IF(C${occRow}=0,"",B${revRow}/C${occRow})` }, MONEY_DEC);
    bodyCell(sheet, row, 4, { formula: `IF(E${occRow}=0,"",D${revRow}/E${occRow})` }, MONEY_DEC);
    bodyCell(sheet, row, 6, { formula: `IF(N(D${row})=0,"",B${row}-D${row})` }, MONEY_DEC);
    bodyCell(
      sheet,
      row,
      7,
      { formula: `IF(N(D${row})=0,"",(B${row}-D${row})/D${row})` },
      PERCENT,
    );
    const prevNights = snapshot.previous_room_nights[key] ?? 0;
    const prevRevenue = snapshot.previous_otb_revenue[key] ?? 0;
    bodyCell(sheet, row, 11, prevNights > 0 ? prevRevenue / prevNights : 0, MONEY_DEC);
    bodyCell(sheet, row, 12, { formula: `IF(N(K${row})=0,"",B${row}-K${row})` }, MONEY_DEC);
  });

  const notes = [
    "OTB - On The Books",
    "LY - Last Year",
    `Target - Last Year Actual +${Math.round(uplift * 1000) / 10}%${
      extras.targetUplift !== null ? " (as per the property's own workbook)" : ""
    }`,
    "",
    "Provisional bookings are included in the Revenue Reports",
  ];
  notes.forEach((text, i) => noteCell(sheet, adrFirst + months.length + 1 + i, 1, text));
  commentaryBlock(sheet, adrFirst, 14, inputs);

  sheet.getColumn(1).width = 12;
  for (let col = 2; col <= 12; col += 1) sheet.getColumn(col).width = 16;
  sheet.getColumn(14).width = 16;

  const chartRow = adrFirst + months.length + 8;
  const categories = months.map(monthLabel);
  chartOrDataBlock(sheet, {
    title: "Revenue | OTB vs Target vs LY",
    anchorRow: chartRow,
    anchorCol: 1,
    categories,
    series: [
      { name: otbCurrent, values: months.map((k) => snapshot.otb_revenue[k] ?? 0), numFmt: MONEY },
      {
        name: "Target",
        values: months.map((k) => (snapshot.last_year_actual[k] ?? 0) * upliftFactor),
        numFmt: MONEY,
      },
      {
        name: "Last Year Actual",
        values: months.map((k) => snapshot.last_year_actual[k] ?? 0),
        numFmt: MONEY,
      },
    ],
  });
  chartOrDataBlock(sheet, {
    title: "Occupancy | OTB vs LY",
    anchorRow: chartRow,
    anchorCol: 6,
    categories,
    series: [
      {
        name: otbCurrent,
        values: months.map((k) => {
          const capacity = capacityOf(k);
          return capacity > 0 ? (snapshot.room_nights[k] ?? 0) / capacity : 0;
        }),
        numFmt: PERCENT,
      },
      {
        name: "Last Year",
        values: months.map((k) => {
          const imported = number(extras.lastYearOccupancy, k);
          if (imported !== null) return imported;
          const capacity = capacityOf(k);
          return capacity > 0 ? (snapshot.last_year_room_nights[k] ?? 0) / capacity : 0;
        }),
        numFmt: PERCENT,
      },
    ],
  });
  chartOrDataBlock(sheet, {
    title: "ADR | OTB vs LY",
    anchorRow: chartRow,
    anchorCol: 11,
    categories,
    series: [
      {
        name: otbCurrent,
        values: months.map((k) => {
          const nights = snapshot.room_nights[k] ?? 0;
          return nights > 0 ? (snapshot.otb_revenue[k] ?? 0) / nights : 0;
        }),
        numFmt: MONEY_DEC,
      },
      {
        name: "Last Year",
        values: months.map((k) => {
          const nights = snapshot.last_year_room_nights[k] ?? 0;
          return nights > 0 ? (snapshot.last_year_actual[k] ?? 0) / nights : 0;
        }),
        numFmt: MONEY_DEC,
      },
    ],
  });

  /* ── Fin Year sheet ─────────────────────────────────────── */
  const asOfYear = Number(options.asOfDate.slice(0, 4));
  const fin = workbook.addWorksheet("Fin Year");
  sheetTitle(fin, `${options.propertyName} | Financial Year`);
  const baseline = options.historicalBaseline ?? {};
  const baseRevenue = baseline.revenue ?? {};
  const baseNights = baseline.room_nights ?? {};
  const baseOccupancy = { ...(baseline.occupancy ?? {}), ...extras.historicalOccupancy };

  const yearValue = (
    map: Record<string, number>,
    fallback: Record<string, number>,
    year: number,
    monthIndex: number,
  ): number | null => {
    const key = `${year}-${pad(monthIndex + 1)}`;
    const value = map[key] ?? fallback[key];
    return Number.isFinite(value) ? Number(value) : null;
  };

  // Revenue with target columns (B..H), rows 3-14, total row 15.
  const revHeadRow = 2;
  const revStart = 3;
  [
    `${asOfYear}`,
    `${asOfYear - 1}`,
    `${asOfYear} vs ${asOfYear - 1}`,
    "%",
    `Target (+${Math.round(uplift * 1000) / 10}%)`,
    `${asOfYear} vs Target`,
    "%",
  ].forEach((text, i) => headerCell(fin, revHeadRow, i + 2, text, accent));
  MONTH_LABELS.forEach((label, i) => {
    const row = revStart + i;
    labelCell(fin, row, 1, label);
    bodyCell(fin, row, 2, yearValue(baseRevenue, snapshot.otb_revenue ?? {}, asOfYear, i), MONEY);
    bodyCell(fin, row, 3, yearValue(baseRevenue, {}, asOfYear - 1, i), MONEY);
    bodyCell(fin, row, 4, { formula: `B${row}-C${row}` }, MONEY);
    bodyCell(fin, row, 5, { formula: `IF(N(C${row})=0,"",(B${row}-C${row})/C${row})` }, PERCENT);
    bodyCell(fin, row, 6, { formula: `C${row}*${upliftFactor}` }, MONEY);
    bodyCell(fin, row, 7, { formula: `B${row}-F${row}` }, MONEY);
    bodyCell(fin, row, 8, { formula: `IF(N(F${row})=0,"",(B${row}-F${row})/F${row})` }, PERCENT);
  });
  const revYearTotal = revStart + 12;
  labelCell(fin, revYearTotal, 1, "TOTAL");
  for (const col of [2, 3, 6]) {
    const letter = colLetter(col);
    bodyCell(
      fin,
      revYearTotal,
      col,
      { formula: `SUM(${letter}${revStart}:${letter}${revStart + 11})` },
      MONEY,
    ).font = { name: FONT, bold: true, size: 10 };
  }
  bodyCell(fin, revYearTotal, 4, { formula: `B${revYearTotal}-C${revYearTotal}` }, MONEY);
  bodyCell(
    fin,
    revYearTotal,
    5,
    { formula: `IF(N(C${revYearTotal})=0,"",(B${revYearTotal}-C${revYearTotal})/C${revYearTotal})` },
    PERCENT,
  );
  bodyCell(fin, revYearTotal, 7, { formula: `B${revYearTotal}-F${revYearTotal}` }, MONEY);
  bodyCell(
    fin,
    revYearTotal,
    8,
    { formula: `IF(N(F${revYearTotal})=0,"",(B${revYearTotal}-F${revYearTotal})/F${revYearTotal})` },
    PERCENT,
  );

  // Room Nights (B..D) beside Occupancy (F..H).
  const rnHeading = revYearTotal + 1;
  labelCell(fin, rnHeading, 1, "Room Nights", 11);
  labelCell(fin, rnHeading, 6, "Occupancy", 11);
  const rnHeadRow = rnHeading + 1;
  [`${asOfYear}`, `${asOfYear - 1}`, `${asOfYear} vs ${asOfYear - 1}`].forEach((text, i) =>
    headerCell(fin, rnHeadRow, i + 2, text, accent),
  );
  [`${asOfYear}`, `${asOfYear - 1}`, `${asOfYear} vs ${asOfYear - 1}`].forEach((text, i) =>
    headerCell(fin, rnHeadRow, i + 6, text, accent),
  );
  const rnStart = rnHeadRow + 1;
  MONTH_LABELS.forEach((label, i) => {
    const row = rnStart + i;
    labelCell(fin, row, 1, label);
    bodyCell(fin, row, 2, yearValue(baseNights, snapshot.room_nights ?? {}, asOfYear, i), INTEGER);
    bodyCell(fin, row, 3, yearValue(baseNights, {}, asOfYear - 1, i), INTEGER);
    bodyCell(fin, row, 4, { formula: `B${row}-C${row}` }, INTEGER);
    bodyCell(fin, row, 6, yearValue(baseOccupancy, {}, asOfYear, i), PERCENT);
    bodyCell(fin, row, 7, yearValue(baseOccupancy, {}, asOfYear - 1, i), PERCENT);
    bodyCell(fin, row, 8, { formula: `F${row}-G${row}` }, PERCENT);
  });
  const rnYearTotal = rnStart + 12;
  labelCell(fin, rnYearTotal, 1, "TOTAL");
  for (const col of [2, 3]) {
    const letter = colLetter(col);
    bodyCell(
      fin,
      rnYearTotal,
      col,
      { formula: `SUM(${letter}${rnStart}:${letter}${rnStart + 11})` },
      INTEGER,
    ).font = { name: FONT, bold: true, size: 10 };
  }
  bodyCell(fin, rnYearTotal, 4, { formula: `B${rnYearTotal}-C${rnYearTotal}` }, INTEGER);

  // ADR derived from the two blocks above.
  const adrYearHeading = rnYearTotal + 1;
  labelCell(fin, adrYearHeading, 1, "ADR", 11);
  const adrYearHeadRow = adrYearHeading + 1;
  [`${asOfYear}`, `${asOfYear - 1}`, `${asOfYear} vs ${asOfYear - 1}`, "%"].forEach((text, i) =>
    headerCell(fin, adrYearHeadRow, i + 2, text, accent),
  );
  const adrYearStart = adrYearHeadRow + 1;
  MONTH_LABELS.forEach((label, i) => {
    const row = adrYearStart + i;
    labelCell(fin, row, 1, label);
    const revRow = revStart + i;
    const rnRow = rnStart + i;
    bodyCell(fin, row, 2, { formula: `IF(N(B${rnRow})=0,"",B${revRow}/B${rnRow})` }, MONEY_DEC);
    bodyCell(fin, row, 3, { formula: `IF(N(C${rnRow})=0,"",C${revRow}/C${rnRow})` }, MONEY_DEC);
    bodyCell(fin, row, 4, { formula: `IF(N(C${row})=0,"",B${row}-C${row})` }, MONEY_DEC);
    bodyCell(fin, row, 5, { formula: `IF(N(C${row})=0,"",(B${row}-C${row})/C${row})` }, PERCENT);
  });

  fin.getColumn(1).width = 12;
  for (let col = 2; col <= 8; col += 1) fin.getColumn(col).width = 16;

  buildHistoricalSheet(workbook, options, accent);
  return finishWorkbook(workbook);
}
