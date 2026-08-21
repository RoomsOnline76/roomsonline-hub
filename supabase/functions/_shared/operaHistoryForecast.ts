/**
 * OPERA "History and Forecast" normalisation (Design Brief §11).
 *
 * Oracle OPERA's monthly extract is a PDF daily grid, not a booking list. Every
 * business date carries rooms occupied, comp / house-use rooms, an individual vs
 * group split, occupancy %, room revenue and average rate, followed by
 * History / Forecast subtotals, a month Total row and a filter footer stating
 * the printed date range.
 *
 * This module is pure: it turns positioned PDF text items into daily rows and
 * then into the same `LedgerRow` shape the shared aggregation engine already
 * consumes for NightsBridge. Nothing here touches the database.
 */

import type { LedgerRow } from "./nightsbridgeAggregate.ts";

/** Channel labels used for the individual / group split. */
export const OPERA_SEGMENT_INDIVIDUAL = "Direct / Individual";
export const OPERA_SEGMENT_GROUP = "Group";

/** Positioned text item as produced by pdf.js `getTextContent()`. */
export interface PdfTextItem {
  str: string;
  /** Horizontal position (PDF user space). */
  x: number;
  /** Vertical position (PDF user space). */
  y: number;
}

export interface OperaDay {
  /** YYYY-MM-DD */
  date: string;
  /** Rooms occupied (deduct individual + deduct group). */
  roomsOccupied: number;
  arrivalRooms: number;
  compRooms: number;
  houseUseRooms: number;
  individualRooms: number;
  groupRooms: number;
  /** Printed occupancy percentage as a fraction (0.5 = 50%). */
  occupancy: number;
  roomRevenue: number;
  averageRate: number;
  /** `history` rows are actuals, `forecast` rows are still on the books. */
  block: "history" | "forecast";
}

export interface OperaMonthTotal {
  roomsOccupied: number;
  roomRevenue: number;
  occupancy: number;
}

export interface OperaParseResult {
  days: OperaDay[];
  total: OperaMonthTotal | null;
  /** Printed filter range, `{ from, to }` as YYYY-MM-DD. */
  range: { from: string; to: string } | null;
  /** Fatal problems — the file must be rejected. */
  errors: string[];
  /** Non-fatal observations worth surfacing on the run. */
  warnings: string[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Rebuilds visual lines from positioned text items. PDF text order is not
 * reading order, so items are bucketed by baseline and sorted left to right.
 */
export function reconstructLines(items: PdfTextItem[], tolerance = 3): string[] {
  // Clustered rather than rounded: a grid row's cells are printed at baselines
  // that differ by a fraction of a point, and fixed buckets split them at the
  // bucket edge, which loses whole rows.
  const sorted = items
    .filter((item) => typeof item.str === "string" && item.str.trim().length > 0)
    .sort((a, b) => b.y - a.y);

  const rows: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let anchor = Number.NaN;
  for (const item of sorted) {
    if (!current.length || Math.abs(anchor - item.y) <= tolerance) {
      if (!current.length) anchor = item.y;
      current.push(item);
      continue;
    }
    rows.push(current);
    current = [item];
    anchor = item.y;
  }
  if (current.length) rows.push(current);

  return rows
    .map((row) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
}


const num = (raw: string | undefined): number => {
  if (raw === undefined) return NaN;
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-") return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
};

/** `01-08-26` (DD-MM-YY) → `2026-08-01`. */
export function operaDateToIso(raw: string): string | null {
  const match = raw.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yy] = match;
  const day = Number(dd);
  const month = Number(mm);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `20${yy}-${mm}-${dd}`;
}

const DAY_LINE = /^(\d{2}-\d{2}-\d{2})\s+[A-Za-z]{3}\b\s*(.*)$/;

/**
 * Parses the reconstructed lines of one monthly OPERA extract.
 * Subtotal rows are ignored; the Total row is kept for reconciliation only.
 */
export function parseOperaHistoryForecast(lines: string[], filename: string): OperaParseResult {
  const days: OperaDay[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let total: OperaMonthTotal | null = null;
  let range: OperaParseResult["range"] = null;
  let block: OperaDay["block"] = "history";
  let sawHeader = false;
  let malformed = 0;

  for (const line of lines) {
    if (/history\s+and\s+forecast/i.test(line)) {
      sawHeader = true;
      continue;
    }
    if (/^forecast\b/i.test(line)) {
      block = "forecast";
      continue;
    }
    if (/^history\b/i.test(line)) {
      block = "history";
      continue;
    }
    if (/^subtotal\b/i.test(line)) continue;

    if (/^total\b/i.test(line)) {
      const parts = line.split(/\s+/).slice(1);
      const rooms = num(parts[0]);
      const occ = parts.find((part) => part.includes("%"));
      const occIndex = occ ? parts.indexOf(occ) : -1;
      const revenue = occIndex >= 0 ? num(parts[occIndex + 1]) : NaN;
      if (Number.isFinite(rooms) && Number.isFinite(revenue)) {
        total = {
          roomsOccupied: rooms,
          roomRevenue: revenue,
          occupancy: occ ? num(occ) / 100 : 0,
        };
      }
      continue;
    }

    const filter = line.match(
      /from\s+date\s+(\d{2}-\d{2}-\d{2})\s+to\s+date\s+(\d{2}-\d{2}-\d{2})/i,
    );
    if (filter) {
      const from = operaDateToIso(filter[1]);
      const to = operaDateToIso(filter[2]);
      if (from && to) range = { from, to };
      continue;
    }

    const dayMatch = line.match(DAY_LINE);
    if (!dayMatch) continue;

    const date = operaDateToIso(dayMatch[1]);
    if (!date) continue;

    // Fixed left-anchored order: total occ, arrivals, comp, house use,
    // deduct indiv, non-deduct indiv, deduct group, non-deduct group,
    // occupancy %, room revenue, average rate. Trailing columns (departures,
    // day use, no show, OOO, adults & children) are not used and may be blank
    // on forecast rows, so nothing is read positionally after the average rate.
    const parts = mergeNegativeTokens(dayMatch[2].split(/\s+/).filter(Boolean));
    const occIndex = parts.findIndex((part) => part.includes("%"));
    if (occIndex < 8) {
      malformed += 1;
      continue;
    }

    const roomsOccupied = num(parts[0]);
    const arrivalRooms = num(parts[1]);
    const compRooms = num(parts[2]);
    const houseUseRooms = num(parts[3]);
    const dedIndiv = num(parts[4]);
    const nonDedIndiv = num(parts[5]);
    const dedGroup = num(parts[6]);
    const nonDedGroup = num(parts[7]);
    const occupancy = num(parts[occIndex]) / 100;
    const roomRevenue = num(parts[occIndex + 1]);
    const averageRate = num(parts[occIndex + 2]);

    if (!Number.isFinite(roomsOccupied) || !Number.isFinite(roomRevenue)) {
      malformed += 1;
      continue;
    }

    days.push({
      date,
      roomsOccupied,
      arrivalRooms: Number.isFinite(arrivalRooms) ? arrivalRooms : 0,
      compRooms: Number.isFinite(compRooms) ? compRooms : 0,
      houseUseRooms: Number.isFinite(houseUseRooms) ? houseUseRooms : 0,
      individualRooms:
        (Number.isFinite(dedIndiv) ? dedIndiv : 0) + (Number.isFinite(nonDedIndiv) ? nonDedIndiv : 0),
      groupRooms:
        (Number.isFinite(dedGroup) ? dedGroup : 0) + (Number.isFinite(nonDedGroup) ? nonDedGroup : 0),
      occupancy: Number.isFinite(occupancy) ? occupancy : 0,
      roomRevenue,
      averageRate: Number.isFinite(averageRate) ? averageRate : 0,
      block,
    });
  }

  if (!days.length) {
    errors.push(
      sawHeader
        ? `${filename}: no daily rows could be read from the History and Forecast grid`
        : `${filename}: not an OPERA History and Forecast extract (no text layer or wrong report)`,
    );
    return { days, total, range, errors, warnings };
  }

  if (malformed > 0) {
    warnings.push(`${filename}: ${malformed} unreadable grid row(s) ignored`);
  }

  // Reconciliation against the printed Total row — a mismatch means the grid was
  // misread, so the file is rejected rather than silently under-reporting.
  if (total) {
    const revenueSum = round2(days.reduce((sum, day) => sum + day.roomRevenue, 0));
    const nightsSum = days.reduce((sum, day) => sum + day.roomsOccupied, 0);
    if (Math.abs(revenueSum - total.roomRevenue) > 1) {
      errors.push(
        `${filename}: daily room revenue (${revenueSum.toFixed(2)}) does not match the printed total (${total.roomRevenue.toFixed(2)})`,
      );
    }
    if (nightsSum !== total.roomsOccupied) {
      errors.push(
        `${filename}: daily rooms occupied (${nightsSum}) does not match the printed total (${total.roomsOccupied})`,
      );
    }
  } else {
    warnings.push(`${filename}: no Total row found — daily rows could not be reconciled`);
  }

  const months = new Set(days.map((day) => day.date.slice(0, 7)));
  if (months.size > 1) {
    warnings.push(`${filename}: covers more than one month (${[...months].sort().join(", ")})`);
  }

  return { days, total, range, errors, warnings };
}

/**
 * Rooms in the property as implied by the printed occupancy percentages.
 * Used only to sanity-check the configured sellable room count.
 */
export function impliedRoomCount(days: OperaDay[]): number | null {
  const estimates = days
    .filter((day) => day.occupancy > 0 && day.roomsOccupied > 0)
    .map((day) => day.roomsOccupied / day.occupancy);
  if (!estimates.length) return null;
  estimates.sort((a, b) => a - b);
  return Math.round(estimates[Math.floor(estimates.length / 2)]);
}

/**
 * Converts daily rows into the shared ledger shape. One row per segment per day
 * (so the month sums reproduce the printed totals exactly) plus zero-revenue
 * rows for comp and house-use nights, which the aggregator treats as
 * non-sellable and keeps out of ADR.
 */
export function operaDaysToLedger(days: OperaDay[]): LedgerRow[] {
  const rows: LedgerRow[] = [];

  for (const day of days) {
    const individual = Math.max(0, day.individualRooms);
    const group = Math.max(0, day.groupRooms);
    const split = individual + group;
    const nights = day.roomsOccupied > 0 ? day.roomsOccupied : split;

    const base = {
      last_night: day.date,
      extras: 0,
      commission: 0,
      nett: 0,
      status: day.block === "history" ? "Actual" : "On the books",
      type: "OPERA",
      currency: "ZAR",
    };

    if (nights > 0) {
      const segments: Array<{ label: string; nights: number }> =
        split > 0
          ? [
              { label: OPERA_SEGMENT_INDIVIDUAL, nights: individual },
              { label: OPERA_SEGMENT_GROUP, nights: group },
            ]
          : [{ label: OPERA_SEGMENT_INDIVIDUAL, nights }];

      // Revenue follows the segment's share of nights; the last segment takes
      // the rounding remainder so the day total is preserved to the cent.
      let assigned = 0;
      const active = segments.filter((segment) => segment.nights > 0);
      active.forEach((segment, index) => {
        const isLast = index === active.length - 1;
        const share = isLast
          ? round2(day.roomRevenue - assigned)
          : round2((day.roomRevenue * segment.nights) / (split > 0 ? split : nights));
        assigned = round2(assigned + share);
        rows.push({
          ...base,
          booking_id: `${day.date}-${segment.label === OPERA_SEGMENT_GROUP ? "grp" : "ind"}`,
          arrival: day.date,
          nights: segment.nights,
          revenue: share,
          room_name: "Rooms",
          source: segment.label,
        });
      });
    }

    const nonSellable = day.compRooms + day.houseUseRooms;
    if (nonSellable > 0) {
      rows.push({
        ...base,
        booking_id: `${day.date}-comp`,
        arrival: day.date,
        nights: nonSellable,
        revenue: 0,
        room_name: "Room 0 Complimentary / House Use",
        source: "House",
      });
    }
  }

  return rows;
}
