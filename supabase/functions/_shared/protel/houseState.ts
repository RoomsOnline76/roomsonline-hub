/**
 * protel "House State" normalisation (Design Brief §11).
 *
 * protel's monthly revenue extract (`HouseState_*.xlsx`) is a daily grid, not a
 * booking list. Every business date carries free / occupied rooms, occupancy and
 * bed percentages, arrivals, departures, in-house counts and the revenue split
 * across accommodation, F&B and extras, followed by a `Sum / Page` row, a
 * printed `Total` row and a parameter footer stating the reporting period.
 *
 * The workbook is a print rendering: every logical row spans three spreadsheet
 * rows and each value sits in its own (sometimes merged) column, so values are
 * located by proximity to the header labels rather than by a fixed column index.
 *
 * This module is pure — it turns a raw cell grid into daily rows and then into
 * the same `LedgerRow` shape the shared aggregation engine already consumes.
 * Nothing here touches the database.
 */

import type { LedgerRow } from "../nightsbridgeAggregate.ts";

/** Default reporting segment — House State carries no channel detail. */
export const PROTEL_SEGMENT_DIRECT = "Direct";

export interface ProtelDay {
  /** YYYY-MM-DD */
  date: string;
  freeRooms: number;
  roomsOccupied: number;
  arrivalRooms: number;
  departureRooms: number;
  accommodation: number;
  foodAndBeverage: number;
  extras: number;
  total: number;
}

export interface ProtelTotals {
  roomsOccupied: number;
  accommodation: number;
  total: number;
}

export interface ProtelParseResult {
  days: ProtelDay[];
  totals: ProtelTotals | null;
  /** Printed reporting period, `{ from, to }` as YYYY-MM-DD. */
  period: { from: string; to: string } | null;
  /** Rooms in the house implied by free + occupied (median across the month). */
  impliedRooms: number | null;
  /** Fatal problems — the file must be rejected. */
  errors: string[];
  /** Non-fatal observations worth surfacing on the run. */
  warnings: string[];
}

type Grid = unknown[][];

const round2 = (n: number): number => Math.round(n * 100) / 100;

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);

const numeric = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
    if (!cleaned || cleaned === "-") return NaN;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

/** `01-08-2026` (DD-MM-YYYY) → `2026-08-01`. */
export function protelDateToIso(raw: string): string | null {
  const match = raw.trim().match(/^(\d{2})[-.](\d{2})[-.](\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Column anchors and how far from the label a value may sit. */
const ANCHORS = {
  free: { pattern: /^free$/i, tolerance: 3 },
  occupied: { pattern: /^occupied$/i, tolerance: 3 },
  arrivals: { pattern: /^arrivals$/i, tolerance: 3 },
  departures: { pattern: /^departures$/i, tolerance: 3 },
  accommodation: { pattern: /^accom\.?$/i, tolerance: 1 },
  foodAndBeverage: { pattern: /^f\s*&\s*b$/i, tolerance: 1 },
  extras: { pattern: /^extras$/i, tolerance: 1 },
  total: { pattern: /^total$/i, tolerance: 1 },
} as const;

type AnchorKey = keyof typeof ANCHORS;

/** Locates the header label columns in the first rows of the sheet. */
export function findAnchors(grid: Grid, headerRows = 14): Partial<Record<AnchorKey, number>> {
  const anchors: Partial<Record<AnchorKey, number>> = {};
  for (let r = 0; r < Math.min(grid.length, headerRows); r += 1) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const label = text(row[c]);
      if (!label) continue;
      for (const [key, { pattern }] of Object.entries(ANCHORS) as [
        AnchorKey,
        { pattern: RegExp },
      ][]) {
        // `Ø Accom.` and the F&B/Extras/Total labels each appear once in the
        // header band; the first match wins so later body text cannot move it.
        if (anchors[key] === undefined && pattern.test(label)) anchors[key] = c;
      }
    }
  }
  return anchors;
}

/** Closest numeric cell to `anchor`, within `tolerance` columns. */
function nearestNumber(row: unknown[], anchor: number | undefined, tolerance: number): number {
  if (anchor === undefined) return NaN;
  let best = NaN;
  let bestDistance = Number.POSITIVE_INFINITY;
  const from = Math.max(0, anchor - tolerance);
  const to = anchor + tolerance;
  for (let c = from; c <= to; c += 1) {
    const value = numeric(row[c]);
    if (!Number.isFinite(value)) continue;
    const distance = Math.abs(c - anchor);
    if (distance < bestDistance) {
      best = value;
      bestDistance = distance;
    }
  }
  return best;
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Cells on a row that look like a `DD-MM-YYYY` date. */
const dateCells = (row: unknown[]): string[] => {
  const found: string[] = [];
  for (const cell of row) {
    const iso = protelDateToIso(text(cell));
    if (iso) found.push(iso);
  }
  return found;
};

/** True when the workbook looks like a protel House State export. */
export function isHouseStateGrid(grid: Grid): boolean {
  const anchors = findAnchors(grid);
  const hasCounts = anchors.free !== undefined && anchors.occupied !== undefined;
  const hasMoney = anchors.accommodation !== undefined && anchors.total !== undefined;
  return hasCounts && hasMoney;
}

/**
 * Parses one House State export. The `Sum / Page` row is ignored; the printed
 * `Total` row is kept for reconciliation only.
 */
export function parseHouseState(grid: Grid, filename: string): ProtelParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const days: ProtelDay[] = [];
  let totals: ProtelTotals | null = null;
  let period: ProtelParseResult["period"] = null;

  const anchors = findAnchors(grid);
  if (!isHouseStateGrid(grid)) {
    return {
      days,
      totals,
      period,
      impliedRooms: null,
      errors: [`${filename}: not a protel House State export (header labels not found)`],
      warnings,
    };
  }

  const read = (row: unknown[], key: AnchorKey): number =>
    nearestNumber(row, anchors[key], ANCHORS[key].tolerance);

  let seenTotalRow = false;

  for (const raw of grid) {
    const row = raw ?? [];
    const labels = row.map((cell) => text(cell).toLowerCase());

    if (labels.some((label) => label === "reporting period:")) {
      const dates = dateCells(row);
      if (dates.length >= 2) period = { from: dates[0], to: dates[dates.length - 1] };
      continue;
    }
    if (labels.some((label) => label.startsWith("sum / page"))) continue;
    if (!seenTotalRow && labels.some((label) => label === "total") && dateCells(row).length === 0) {
      const occupied = read(row, "occupied");
      const accommodation = read(row, "accommodation");
      if (Number.isFinite(occupied) && Number.isFinite(accommodation)) {
        totals = {
          roomsOccupied: occupied,
          accommodation,
          total: Number.isFinite(read(row, "total")) ? read(row, "total") : 0,
        };
        seenTotalRow = true;
      }
      continue;
    }

    const dates = dateCells(row);
    // The parameter footer prints the period as two dates on one row.
    if (dates.length !== 1) continue;

    const occupied = read(row, "occupied");
    const free = read(row, "free");
    if (!Number.isFinite(occupied) || !Number.isFinite(free)) continue;

    const accommodation = read(row, "accommodation");
    const foodAndBeverage = read(row, "foodAndBeverage");
    const extras = read(row, "extras");
    const total = read(row, "total");

    days.push({
      date: dates[0],
      freeRooms: free,
      roomsOccupied: occupied,
      arrivalRooms: Number.isFinite(read(row, "arrivals")) ? read(row, "arrivals") : 0,
      departureRooms: Number.isFinite(read(row, "departures")) ? read(row, "departures") : 0,
      accommodation: Number.isFinite(accommodation) ? accommodation : 0,
      foodAndBeverage: Number.isFinite(foodAndBeverage) ? foodAndBeverage : 0,
      extras: Number.isFinite(extras) ? extras : 0,
      total: Number.isFinite(total) ? total : 0,
    });
  }

  if (!days.length) {
    errors.push(`${filename}: no daily rows could be read from the House State grid`);
    return { days, totals, period, impliedRooms: null, errors, warnings };
  }

  // Reconciliation against the printed Total row — a mismatch means the grid was
  // misread, so the file is rejected rather than silently under-reporting.
  if (totals) {
    const nightsSum = days.reduce((sum, day) => sum + day.roomsOccupied, 0);
    const accommodationSum = round2(days.reduce((sum, day) => sum + day.accommodation, 0));
    if (nightsSum !== totals.roomsOccupied) {
      errors.push(
        `${filename}: daily rooms occupied (${nightsSum}) does not match the printed total (${totals.roomsOccupied})`,
      );
    }
    if (Math.abs(accommodationSum - totals.accommodation) > 1) {
      errors.push(
        `${filename}: daily accommodation revenue (${accommodationSum.toFixed(2)}) does not match the printed total (${totals.accommodation.toFixed(2)})`,
      );
    }
  } else {
    warnings.push(`${filename}: no Total row found — daily rows could not be reconciled`);
  }

  const months = new Set(days.map((day) => day.date.slice(0, 7)));
  if (months.size > 1) {
    warnings.push(`${filename}: covers more than one month (${[...months].sort().join(", ")})`);
  }

  const impliedRooms = median(
    days.map((day) => day.freeRooms + day.roomsOccupied).filter((value) => value > 0),
  );

  return { days, totals, period, impliedRooms, errors, warnings };
}

/** A revenue segment share used to split otherwise undifferentiated nights. */
export interface ProtelSegmentShare {
  label: string;
  /** 0..1, shares across all segments must sum to 1. */
  share: number;
}

/**
 * Converts daily rows into the shared ledger shape. One row per segment per day
 * so the month sums reproduce the printed totals exactly; F&B and extras ride
 * along in `extras`, which the aggregator keeps out of ADR and occupancy.
 */
export function protelDaysToLedger(
  days: ProtelDay[],
  segments: ProtelSegmentShare[] = [],
): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const active = segments.filter((segment) => segment.share > 0);
  const mix: ProtelSegmentShare[] = active.length
    ? active
    : [{ label: PROTEL_SEGMENT_DIRECT, share: 1 }];

  for (const day of days) {
    const nights = Math.max(0, day.roomsOccupied);
    const base = {
      last_night: day.date,
      commission: 0,
      nett: 0,
      status: "On the books",
      type: "protel",
      currency: "ZAR",
      room_name: "Rooms",
    };

    if (nights <= 0) {
      // Revenue can land on a zero-occupancy day (late charges); keep it so the
      // month still reconciles to the printed total.
      if (day.accommodation !== 0 || day.foodAndBeverage !== 0 || day.extras !== 0) {
        rows.push({
          ...base,
          booking_id: `${day.date}-late`,
          arrival: day.date,
          nights: 0,
          revenue: round2(day.accommodation),
          extras: round2(day.foodAndBeverage + day.extras),
          source: mix[0].label,
        });
      }
      continue;
    }

    let assignedNights = 0;
    let assignedRevenue = 0;
    let assignedExtras = 0;
    const nonAccommodation = day.foodAndBeverage + day.extras;

    mix.forEach((segment, index) => {
      const isLast = index === mix.length - 1;
      const segmentNights = isLast
        ? nights - assignedNights
        : Math.round(nights * segment.share);
      const revenue = isLast
        ? round2(day.accommodation - assignedRevenue)
        : round2(day.accommodation * segment.share);
      const extras = isLast
        ? round2(nonAccommodation - assignedExtras)
        : round2(nonAccommodation * segment.share);
      assignedNights += segmentNights;
      assignedRevenue = round2(assignedRevenue + revenue);
      assignedExtras = round2(assignedExtras + extras);
      if (segmentNights <= 0 && revenue === 0 && extras === 0) return;
      rows.push({
        ...base,
        booking_id: `${day.date}-${index}`,
        arrival: day.date,
        nights: Math.max(0, segmentNights),
        revenue,
        extras,
        source: segment.label,
      });
    });
  }

  return rows;
}
