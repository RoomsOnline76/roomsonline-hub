/**
 * Daily Detailed Report — the third Cheetah Plains report structure.
 *
 * The monthly revenue review and the bespoke owner pack both look at a month.
 * This one looks at a single business day: the day's villa state and revenue,
 * where the month stands so far, the enquiries on the books and the bookings
 * created or cancelled since the previous pack.
 *
 * Everything here is pure. The day's measured figures come from the protel
 * House State grids (already normalised by `../protel/houseState.ts`), the
 * provisional-booking export and the two movement PDFs. A figure with no
 * source stays `null` and prints as a dash — never as a zero.
 */

import ExcelJS from "npm:exceljs@4.4.0";
import type { ProtelDay } from "../protel/houseState.ts";

export interface DailyMovement {
  /** Reservations counted on the movement PDF. */
  count: number;
  /** Printed money total, when the export carries one. */
  value: number | null;
  /** Nights across the listed reservations, when readable. */
  nights: number | null;
  /** Printed `04.09.2026 - 07.09.2026` window. */
  period: { from: string; to: string } | null;
}

export interface DailyPeriodFigures {
  revenue: number;
  nights: number;
  capacity: number;
  occupancy: number | null;
  adr: number | null;
}

export interface DailyFigures {
  /** `YYYY-MM-DD` business date. */
  date: string;
  villasOccupied: number;
  villasFree: number;
  arrivals: number;
  departures: number;
  occupancy: number | null;
  accommodation: number;
  foodAndBeverage: number;
  extras: number;
  total: number;
  adr: number | null;
  /** 1st of the month through the report day. */
  monthToDate: DailyPeriodFigures;
  /** The whole month as it currently stands on the books. */
  monthOnBooks: DailyPeriodFigures;
  /** Provisional (unconfirmed) business for the report month. */
  enquiries: { revenue: number; nights: number } | null;
  created: DailyMovement | null;
  cancelled: DailyMovement | null;
  villaCount: number | null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

const period = (days: ProtelDay[], villaCount: number | null): DailyPeriodFigures => {
  const revenue = round2(days.reduce((sum, day) => sum + day.accommodation, 0));
  const nights = days.reduce((sum, day) => sum + day.roomsOccupied, 0);
  const capacity = days.reduce(
    (sum, day) => sum + (villaCount ?? day.freeRooms + day.roomsOccupied),
    0,
  );
  return {
    revenue,
    nights,
    capacity,
    occupancy: ratio(nights, capacity),
    adr: nights > 0 ? round2(revenue / nights) : null,
  };
};

export interface DailyFiguresInput {
  /** Every daily row parsed from the run's House State exports. */
  days: ProtelDay[];
  /** The business day the report covers. */
  date: string;
  /** Sellable villas, from the property's report settings when configured. */
  villaCount: number | null;
  /** Provisional revenue/nights keyed `YYYY-MM`. */
  provisionalMonths: Record<string, { revenue: number; nights: number }>;
  created: DailyMovement | null;
  cancelled: DailyMovement | null;
}

/** The day's figures, plus month-to-date and the month as it stands. */
export function buildDailyFigures(input: DailyFiguresInput): DailyFigures | null {
  const month = input.date.slice(0, 7);
  const monthDays = input.days
    .filter((day) => day.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date));
  const today = monthDays.find((day) => day.date === input.date);
  if (!today) return null;

  const inHouse = today.freeRooms + today.roomsOccupied;
  const villaCount = input.villaCount ?? (inHouse > 0 ? inHouse : null);
  const toDate = monthDays.filter((day) => day.date <= input.date);
  const enquiry = input.provisionalMonths[month];

  return {
    date: input.date,
    villasOccupied: today.roomsOccupied,
    villasFree: today.freeRooms,
    arrivals: today.arrivalRooms,
    departures: today.departureRooms,
    occupancy: ratio(today.roomsOccupied, villaCount ?? 0),
    accommodation: round2(today.accommodation),
    foodAndBeverage: round2(today.foodAndBeverage),
    extras: round2(today.extras),
    total: round2(today.total),
    adr: today.roomsOccupied > 0 ? round2(today.accommodation / today.roomsOccupied) : null,
    monthToDate: period(toDate, villaCount),
    monthOnBooks: period(monthDays, villaCount),
    enquiries: enquiry ? { revenue: round2(enquiry.revenue), nights: enquiry.nights } : null,
    created: input.created,
    cancelled: input.cancelled,
    villaCount,
  };
}

/* ── movement PDFs ─────────────────────────────────────────────── */

const money = (raw: string): number | null => {
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? round2(parsed) : null;
};

const PAIR = /(\d{2}\.\d{2}\.\d{2})\s+(\d{2}\.\d{2}\.\d{2})\s+(\d{1,3})\b/g;

/**
 * Reads a protel "Reservations Created" / "Cancelled Reservations" print.
 *
 * The PDF is a merged single text run, so reservations are counted by their
 * arrival/departure/nights triplet rather than by row geometry, and the money
 * total is taken from the printed `…Total` figure when one is present.
 */
export function parseMovementPdf(
  text: string,
): { kind: "created" | "cancelled" | "unknown"; movement: DailyMovement } {
  const flat = text.replace(/\s+/g, " ");
  const kind = /cancelled\s+reservations|reservations\s+cancelled|voided/i.test(flat)
    ? "cancelled"
    : /reservations\s+created/i.test(flat)
      ? "created"
      : "unknown";

  let count = 0;
  let nights = 0;
  for (const match of flat.matchAll(PAIR)) {
    count += 1;
    nights += Number(match[3]) || 0;
  }

  const totalMatch = flat.match(/([\d.]+,\d{2})\s*R?\s*Total\b/i);
  const periodMatch = flat.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
  const toIso = (value: string): string => {
    const [dd, mm, yyyy] = value.split(".");
    return `${yyyy}-${mm}-${dd}`;
  };

  return {
    kind,
    movement: {
      count,
      value: totalMatch ? money(totalMatch[1]) : null,
      nights: count > 0 ? nights : null,
      period: periodMatch
        ? { from: toIso(periodMatch[1]), to: toIso(periodMatch[2]) }
        : null,
    },
  };
}

/* ── pasted email text ─────────────────────────────────────────── */

export interface PastedEmail {
  created: DailyMovement | null;
  cancelled: DailyMovement | null;
  /** The text as pasted, trimmed for printing on the report. */
  note: string | null;
}

const MOVEMENT_WORDS = {
  created: /(created|new bookings?|new reservations?)/i,
  cancelled: /(cancelled|canceled|cancellations?)/i,
};

/**
 * Reads what can be recognised from the day's email text.
 *
 * Only the movement counts and their money totals are taken — anything else is
 * kept as a note and printed verbatim. Values here are fallbacks: the exports
 * always take precedence.
 */
export function parsePastedEmail(raw: string | null | undefined): PastedEmail {
  const text = (raw ?? "").trim();
  if (!text) return { created: null, cancelled: null, note: null };

  const line = (matcher: RegExp): DailyMovement | null => {
    for (const candidate of text.split(/\r?\n/)) {
      if (!matcher.test(candidate)) continue;
      const count = candidate.match(/(?:^|[^\d.,])(\d{1,3})(?!\d)/);
      if (!count) continue;
      const value = candidate.match(/R\s?([\d\s.,]+\d)/i);
      return {
        count: Number(count[1]),
        value: value ? money(value[1]) : null,
        nights: null,
        period: null,
      };
    }
    return null;
  };

  return {
    created: line(MOVEMENT_WORDS.created),
    cancelled: line(MOVEMENT_WORDS.cancelled),
    note: text.slice(0, 1200),
  };
}

/* ── running workbook ──────────────────────────────────────────── */

const MONEY_FORMAT = '#,##0;(#,##0);"-"';
const PERCENT_FORMAT = '0.0%;-0.0%;"-"';

const COLUMNS: { header: string; width: number; format?: string }[] = [
  { header: "Date", width: 12 },
  { header: "Villas occupied", width: 15 },
  { header: "Villas free", width: 12 },
  { header: "Arrivals", width: 10 },
  { header: "Departures", width: 11 },
  { header: "Occupancy", width: 11, format: PERCENT_FORMAT },
  { header: "Accommodation (R)", width: 17, format: MONEY_FORMAT },
  { header: "F&B (R)", width: 12, format: MONEY_FORMAT },
  { header: "Extras (R)", width: 12, format: MONEY_FORMAT },
  { header: "Total (R)", width: 14, format: MONEY_FORMAT },
  { header: "ADR (R)", width: 13, format: MONEY_FORMAT },
  { header: "MTD revenue (R)", width: 16, format: MONEY_FORMAT },
  { header: "MTD nights", width: 12 },
  { header: "MTD occupancy", width: 14, format: PERCENT_FORMAT },
  { header: "MTD ADR (R)", width: 14, format: MONEY_FORMAT },
  { header: "Month on books (R)", width: 18, format: MONEY_FORMAT },
  { header: "Active enquiries (R)", width: 19, format: MONEY_FORMAT },
  { header: "Bookings created", width: 16 },
  { header: "Created value (R)", width: 17, format: MONEY_FORMAT },
  { header: "Bookings cancelled", width: 17 },
];

const FONT = "Arial";

/**
 * The running Daily Detailed workbook: one row per day the property has ever
 * had a daily run for, newest day last, with the derived columns written as
 * real Excel formulas so the revenue team can keep editing the file.
 */
export async function buildDailyWorkbook(
  propertyName: string,
  rows: DailyFigures[],
  primary = "1A1A2E",
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RoomsOnline";
  const sheet = workbook.addWorksheet("Daily Detail", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  sheet.getCell("A1").value = `${propertyName} — Daily Detailed Report`;
  sheet.getCell("A1").font = { name: FONT, size: 13, bold: true };
  sheet.getCell("A2").value = "One row per business day. Derived columns are live formulas.";
  sheet.getCell("A2").font = { name: FONT, size: 9, italic: true, color: { argb: "FF6B7280" } };

  COLUMNS.forEach((column, index) => {
    const cell = sheet.getRow(3).getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${primary}` } };
    cell.alignment = { vertical: "middle", wrapText: true };
    sheet.getColumn(index + 1).width = column.width;
    if (column.format) sheet.getColumn(index + 1).numFmt = column.format;
  });

  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  ordered.forEach((figures, index) => {
    const r = 4 + index;
    const row = sheet.getRow(r);
    row.getCell(1).value = figures.date;
    row.getCell(2).value = figures.villasOccupied;
    row.getCell(3).value = figures.villasFree;
    row.getCell(4).value = figures.arrivals;
    row.getCell(5).value = figures.departures;
    // Occupancy, ADR and the MTD ratios stay editable formulas.
    row.getCell(6).value = { formula: `IF((B${r}+C${r})=0,"",B${r}/(B${r}+C${r}))` };
    row.getCell(7).value = figures.accommodation;
    row.getCell(8).value = figures.foodAndBeverage;
    row.getCell(9).value = figures.extras;
    row.getCell(10).value = { formula: `G${r}+H${r}+I${r}` };
    row.getCell(11).value = { formula: `IF(B${r}=0,"",G${r}/B${r})` };
    row.getCell(12).value = figures.monthToDate.revenue;
    row.getCell(13).value = figures.monthToDate.nights;
    row.getCell(14).value =
      figures.monthToDate.capacity > 0
        ? { formula: `IF(${figures.monthToDate.capacity}=0,"",M${r}/${figures.monthToDate.capacity})` }
        : null;
    row.getCell(15).value = { formula: `IF(M${r}=0,"",L${r}/M${r})` };
    row.getCell(16).value = figures.monthOnBooks.revenue;
    row.getCell(17).value = figures.enquiries ? figures.enquiries.revenue : null;
    row.getCell(18).value = figures.created ? figures.created.count : null;
    row.getCell(19).value = figures.created?.value ?? null;
    row.getCell(20).value = figures.cancelled ? figures.cancelled.count : null;
    row.font = { name: FONT, size: 10 };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
