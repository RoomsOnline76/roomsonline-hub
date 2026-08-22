// PROTEL consolidated workbook — keeps the client's own vocabulary (AVR, Occ %,
// "vrs", "Variance last N days"), the Fin Year total row inside the grid, the
// ten-year Historical Stats sheet, and the Online Res / Web Comparison sheets
// carried forward from the previous review.
import {
  buildHistoricalSheet,
  bodyCell,
  capacityLegend,
  chartOrDataBlock,
  commentaryBlock,
  dayGap,
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
  monthLabel,
  newWorkbook,
  normaliseExtras,
  noteCell,
  PERCENT,
  sheetTitle,
  writeCarryForwardSheets,
  type WorkbookOptions,
} from "./workbookPart-shared.ts";

export const PROTEL_CARRY_FORWARD_SHEETS = ["Online Res", "Web Comparison"];

export async function buildProtelWorkbook(options: WorkbookOptions): Promise<Uint8Array> {
  const { snapshot, inputs } = options;
  const months = snapshot.months ?? [];
  const rooms = snapshot.room_count > 0 ? snapshot.room_count : 1;
  const accent = hex(options.brandPrimary) ?? "FFE91E8C";
  const extras = normaliseExtras(options.extras);
  const uplift = extras.targetUplift ?? DEFAULT_UPLIFT;
  const upliftFactor = 1 + uplift;

  const workbook = newWorkbook();
  const asAtCurrent = `as @ ${formatDate(options.asOfDate)}`;
  const asAtPrevious = `as @ ${formatDate(options.previousAsOfDate)}`;
  const gap = dayGap(options.previousAsOfDate, options.asOfDate);
  const pickupLabel = gap ? `Variance last ${gap} days` : "Variance since last review";

  // Kept as "OTB RR" so the next review can re-import this workbook.
  const sheet = workbook.addWorksheet("OTB RR", { views: [{ state: "frozen", ySplit: 3 }] });
  sheet.properties.defaultRowHeight = 16;
  sheetTitle(sheet, `${options.propertyName} | As at ${formatDate(options.asOfDate)}`);
  sheet.mergeCells(1, 1, 1, 6);

  const capacityOf = (key: string) => snapshot.capacity_days[key] ?? rooms * 30;
  const number = (map: Record<string, number>, key: string): number | null => {
    const value = Number(map?.[key]);
    return Number.isFinite(value) ? value : null;
  };
  const finRow = (label: string, row: number, cols: Array<[number, string, string]>) => {
    labelCell(sheet, row, 1, label);
    for (const [col, formula, fmt] of cols) {
      const cell = bodyCell(sheet, row, col, { formula }, fmt);
      cell.font = { name: FONT, bold: true, size: 10 };
      cell.border = { top: { style: "thin" } };
    }
  };

  /* ── Revenue ─────────────────────────────────────────────── */
  labelCell(sheet, 2, 1, "Revenue", 11);
  const revHeader = 3;
  const revFirst = 4;
  [
    asAtCurrent,
    "Target",
    "LY Actual",
    `${formatDate(options.asOfDate)} vrs Target`,
    "%",
    "Target vrs LY",
    "%",
    pickupLabel,
    asAtPrevious,
    "Actual vrs LY",
    "%",
  ].forEach((text, i) => headerCell(sheet, revHeader, i + 2, text, accent));

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
        ? { formula: `(D${row}*${upliftFactor})` }
        : explicitTarget,
      MONEY,
    );
    bodyCell(sheet, row, 4, snapshot.last_year_actual[key] ?? 0, MONEY);
    bodyCell(sheet, row, 5, { formula: `B${row}-C${row}` }, MONEY);
    bodyCell(sheet, row, 6, { formula: `IF(B${row}=0,"",(B${row}-C${row})/B${row})` }, PERCENT);
    bodyCell(sheet, row, 7, { formula: `C${row}-D${row}` }, MONEY);
    bodyCell(sheet, row, 8, { formula: `IF(N(D${row})=0,"",(C${row}-D${row})/D${row})` }, PERCENT);
    bodyCell(sheet, row, 9, { formula: `B${row}-J${row}` }, MONEY);
    bodyCell(sheet, row, 10, snapshot.previous_otb_revenue[key] ?? 0, MONEY);
    bodyCell(sheet, row, 11, { formula: `B${row}-D${row}` }, MONEY);
    bodyCell(sheet, row, 12, { formula: `IF(B${row}=0,"",(B${row}-D${row})/B${row})` }, PERCENT);
  });

  const revLast = revFirst + Math.max(months.length - 1, 0);
  const revFin = revFirst + months.length;
  finRow("Fin Year", revFin, [
    [2, `SUM(B${revFirst}:B${revLast})`, MONEY],
    [3, `(D${revFin}*${upliftFactor})`, MONEY],
    [4, `SUM(D${revFirst}:D${revLast})`, MONEY],
    [5, `B${revFin}-C${revFin}`, MONEY],
    [6, `IF(B${revFin}=0,"",(B${revFin}-C${revFin})/B${revFin})`, PERCENT],
    [7, `C${revFin}-D${revFin}`, MONEY],
    [8, `IF(N(D${revFin})=0,"",(C${revFin}-D${revFin})/D${revFin})`, PERCENT],
    [9, `SUM(I${revFirst}:I${revLast})`, MONEY],
    [10, `SUM(J${revFirst}:J${revLast})`, MONEY],
    [11, `B${revFin}-D${revFin}`, MONEY],
    [12, `IF(B${revFin}=0,"",(B${revFin}-D${revFin})/B${revFin})`, PERCENT],
  ]);

  /* ── Room Nights (nights beside Occ %) ───────────────────── */
  const rnHeading = revFin + 2;
  labelCell(sheet, rnHeading, 1, "Room Nights", 11);
  const rnHeader = rnHeading + 1;
  const rnFirst = rnHeader + 1;
  [
    asAtCurrent,
    "Occ %",
    "LY Actual",
    "LY Occ %",
    `${formatDate(options.asOfDate)} vrs LY`,
    "%",
    pickupLabel,
    asAtPrevious,
    "Prev Occ %",
  ].forEach((text, i) => headerCell(sheet, rnHeader, i + 2, text, accent));

  months.forEach((key, i) => {
    const row = rnFirst + i;
    const capacity = capacityOf(key);
    labelCell(sheet, row, 1, monthLabel(key));
    bodyCell(sheet, row, 2, snapshot.room_nights[key] ?? 0, INTEGER);
    bodyCell(sheet, row, 3, { formula: `IF(B${row}=0,"",B${row}/${capacity})` }, PERCENT);
    bodyCell(sheet, row, 4, snapshot.last_year_room_nights[key] ?? 0, INTEGER);
    const lyOcc = number(extras.lastYearOccupancy, key);
    bodyCell(
      sheet,
      row,
      5,
      lyOcc !== null ? lyOcc : { formula: `IF(D${row}=0,"",D${row}/${capacity})` },
      PERCENT,
    );
    bodyCell(sheet, row, 6, { formula: `B${row}-D${row}` }, INTEGER);
    bodyCell(sheet, row, 7, { formula: `IF(B${row}=0,"",(B${row}-D${row})/B${row})` }, PERCENT);
    bodyCell(sheet, row, 8, { formula: `B${row}-I${row}` }, INTEGER);
    bodyCell(sheet, row, 9, snapshot.previous_room_nights[key] ?? 0, INTEGER);
    const prevOcc = number(extras.previousOccupancy, key);
    bodyCell(
      sheet,
      row,
      10,
      prevOcc !== null ? prevOcc : { formula: `IF(I${row}=0,"",I${row}/${capacity})` },
      PERCENT,
    );
  });

  const rnLast = rnFirst + Math.max(months.length - 1, 0);
  const rnFin = rnFirst + months.length;
  finRow("Fin Year", rnFin, [
    [2, `SUM(B${rnFirst}:B${rnLast})`, INTEGER],
    [4, `SUM(D${rnFirst}:D${rnLast})`, INTEGER],
    [6, `B${rnFin}-D${rnFin}`, INTEGER],
    [7, `IF(B${rnFin}=0,"",(B${rnFin}-D${rnFin})/B${rnFin})`, PERCENT],
    [8, `SUM(H${rnFirst}:H${rnLast})`, INTEGER],
    [9, `SUM(I${rnFirst}:I${rnLast})`, INTEGER],
  ]);
  capacityLegend(sheet, rnFirst, 12, rooms);

  /* ── AVR ─────────────────────────────────────────────────── */
  const avrHeading = rnFin + 2;
  labelCell(sheet, avrHeading, 1, "AVR", 11);
  const avrHeader = avrHeading + 1;
  const avrFirst = avrHeader + 1;
  [
    asAtCurrent,
    "LY Actual",
    `${formatDate(options.asOfDate)} vrs LY`,
    "%",
    pickupLabel,
    asAtPrevious,
  ].forEach((text, i) => headerCell(sheet, avrHeader, i + 2, text, accent));

  months.forEach((key, i) => {
    const row = avrFirst + i;
    const revRow = revFirst + i;
    const rnRow = rnFirst + i;
    labelCell(sheet, row, 1, monthLabel(key));
    bodyCell(sheet, row, 2, { formula: `IF(N(B${rnRow})=0,"",B${revRow}/B${rnRow})` }, MONEY_DEC);
    bodyCell(sheet, row, 3, { formula: `IF(N(D${rnRow})=0,"",D${revRow}/D${rnRow})` }, MONEY_DEC);
    bodyCell(sheet, row, 4, { formula: `IF(N(C${row})=0,"",B${row}-C${row})` }, MONEY_DEC);
    bodyCell(sheet, row, 5, { formula: `IF(N(B${row})=0,"",(B${row}-C${row})/B${row})` }, PERCENT);
    bodyCell(sheet, row, 6, { formula: `IF(N(G${row})=0,"",B${row}-G${row})` }, MONEY_DEC);
    bodyCell(sheet, row, 7, { formula: `IF(N(I${rnRow})=0,"",J${revRow}/I${rnRow})` }, MONEY_DEC);
  });

  const avrFin = avrFirst + months.length;
  finRow("Fin Year", avrFin, [
    [2, `IF(N(B${rnFin})=0,"",B${revFin}/B${rnFin})`, MONEY_DEC],
    [3, `IF(N(D${rnFin})=0,"",D${revFin}/D${rnFin})`, MONEY_DEC],
    [4, `IF(N(C${avrFin})=0,"",B${avrFin}-C${avrFin})`, MONEY_DEC],
    [5, `IF(N(B${avrFin})=0,"",(B${avrFin}-C${avrFin})/B${avrFin})`, PERCENT],
  ]);

  const notes = [
    "OTB - On The Books",
    "LY - Last Year",
    `Target - LY Actual +${Math.round(uplift * 1000) / 10}%${
      extras.targetUplift !== null ? " (as per the property's own workbook)" : ""
    }`,
    gap ? `${pickupLabel} - pickup since the review of ${formatDate(options.previousAsOfDate)}` : "",
    "Provisional bookings are included in the Revenue Reports",
  ];
  notes.forEach((text, i) => {
    if (text) noteCell(sheet, avrFin + 2 + i, 1, text);
  });
  commentaryBlock(sheet, avrFirst, 12, inputs);

  sheet.getColumn(1).width = 12;
  for (let col = 2; col <= 12; col += 1) sheet.getColumn(col).width = 16;

  const categories = months.map(monthLabel);
  const chartRow = avrFin + 8;
  chartOrDataBlock(sheet, {
    title: "Revenue | Current vrs Target vrs LY",
    anchorRow: chartRow,
    anchorCol: 1,
    categories,
    series: [
      { name: asAtCurrent, values: months.map((k) => snapshot.otb_revenue[k] ?? 0), numFmt: MONEY },
      {
        name: "Target",
        values: months.map((k) => (snapshot.last_year_actual[k] ?? 0) * upliftFactor),
        numFmt: MONEY,
      },
      {
        name: "LY Actual",
        values: months.map((k) => snapshot.last_year_actual[k] ?? 0),
        numFmt: MONEY,
      },
    ],
  });
  chartOrDataBlock(sheet, {
    title: "Occ % | Current vrs LY",
    anchorRow: chartRow,
    anchorCol: 6,
    categories,
    series: [
      {
        name: asAtCurrent,
        values: months.map((k) => {
          const capacity = capacityOf(k);
          return capacity > 0 ? (snapshot.room_nights[k] ?? 0) / capacity : 0;
        }),
        numFmt: PERCENT,
      },
      {
        name: "LY",
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
    title: "AVR | Current vrs LY",
    anchorRow: chartRow,
    anchorCol: 11,
    categories,
    series: [
      {
        name: asAtCurrent,
        values: months.map((k) => {
          const nights = snapshot.room_nights[k] ?? 0;
          return nights > 0 ? (snapshot.otb_revenue[k] ?? 0) / nights : 0;
        }),
        numFmt: MONEY_DEC,
      },
      {
        name: "LY",
        values: months.map((k) => {
          const nights = snapshot.last_year_room_nights[k] ?? 0;
          return nights > 0 ? (snapshot.last_year_actual[k] ?? 0) / nights : 0;
        }),
        numFmt: MONEY_DEC,
      },
    ],
  });

  // Multi-year sheet keeps the client's own name and AVR wording.
  buildHistoricalSheet(workbook, options, accent, "Historical Stats", "AVR");
  writeCarryForwardSheets(workbook, extras.carryForward, PROTEL_CARRY_FORWARD_SHEETS, accent);

  return finishWorkbook(workbook);
}
