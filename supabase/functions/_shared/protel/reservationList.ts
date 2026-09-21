/**
 * protel "Reservation list" — the created-reservations print, saved as a
 * spreadsheet instead of a PDF.
 *
 * The grid is a plain list, one row per reservation:
 *
 *   Arrival | Departure | Nights | Room | RT | Persons | Res. status | Res. No. |
 *   Linked Profile 1 | Avg. Price
 *
 * followed by a `Total` row carrying the nights and the money total, and a
 * `From:` / `To:` pair in the print's own header block. Confirmed and
 * provisional business is kept apart: most provisionals never confirm, so the
 * `Res. status` column is bucketed and never merged.
 */

import type { DailyMovement, DailyMovementStatus } from "../cheetaplains/dailyDetailed.ts";

type Grid = unknown[][];

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const rowText = (row: unknown[]): string[] => (row ?? []).map(text).filter((cell) => cell.length > 0);

/** `412 776,00R` / `-129 675.00` → a number. */
const money = (raw: string): number | null => {
  const cleaned = raw
    .replace(/[Rr\s\u00a0]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

/** `07.10.27` (and `07.10.2027`) → `2027-10-07`. */
const toIso = (raw: string): string | null => {
  const match = raw.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{2}|\d{4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
};

const STATUS_ORDER = ["Confirmed", "Definite", "Provisional", "Tentative", "Option", "Waitlist"];

const statusLabel = (raw: string): string => {
  const key = raw.toLowerCase().replace(/[-\s]+/g, " ");
  if (key === "wait list") return "Waitlist";
  if (key === "canceled") return "Cancelled";
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const KNOWN_STATUS =
  /^(provisional|confirmed|definite|tentative|waitlist|wait list|option|cancelled|canceled)$/i;

/** True when the grid's header row reads like a protel Reservation list. */
export function isReservationListGrid(grid: Grid): boolean {
  for (const row of grid.slice(0, 40)) {
    const cells = rowText(row).map((cell) => cell.toLowerCase());
    if (!cells.length) continue;
    const has = (word: string) => cells.some((cell) => cell === word || cell.startsWith(word));
    if (has("arrival") && has("departure") && has("nights") && has("res. status")) return true;
  }
  return false;
}

export interface ReservationListResult {
  movement: DailyMovement;
  warnings: string[];
  rowsRead: number;
}

/** Reads the created-reservations grid into the report's movement shape. */
export function parseReservationList(grid: Grid, filename: string): ReservationListResult {
  const warnings: string[] = [];
  let count = 0;
  let nights = 0;
  let value = 0;
  let printedValue: number | null = null;
  let from: string | null = null;
  let to: string | null = null;
  const buckets = new Map<string, DailyMovementStatus>();



  for (const row of grid) {
    const cells = rowText(row);
    if (!cells.length) continue;

    for (const cell of cells) {
      const window = cell.match(/^(From|To):?\s*(\d{2}[.\-/]\d{2}[.\-/]\d{2,4})$/i);
      if (window) {
        const iso = toIso(window[2]);
        if (iso) {
          if (/^from$/i.test(window[1])) from = iso;
          else to = iso;
        }
      }
    }

    if (/^total\b/i.test(cells[0])) {
      const numbers = cells.slice(1);
      for (const cell of numbers) {
        if (/^\d{1,4}$/.test(cell)) printedNights ??= Number(cell);
        else {
          const amount = money(cell);
          if (amount !== null && Math.abs(amount) > 1000) printedValue ??= amount;
        }
      }
      continue;
    }

    const arrival = toIso(cells[0]);
    const departure = cells.length > 1 ? toIso(cells[1]) : null;
    if (!arrival || !departure) continue;

    const rowNights = (() => {
      const explicit = cells.slice(2).find((cell) => /^\d{1,3}$/.test(cell));
      if (explicit) return Number(explicit);
      const span = (Date.parse(departure) - Date.parse(arrival)) / 86_400_000;
      return Number.isFinite(span) && span > 0 ? Math.round(span) : 0;
    })();
    const price = cells
      .map((cell) => money(cell))
      .filter((amount): amount is number => amount !== null && Math.abs(amount) >= 1000)
      .pop();

    count += 1;
    nights += rowNights;
    if (price) value += price;

    const status = cells.find((cell) => KNOWN_STATUS.test(cell));
    if (status) {
      const label = statusLabel(status);
      const bucket = buckets.get(label) ?? { label, count: 0, nights: 0 };
      bucket.count += 1;
      bucket.nights += rowNights;
      buckets.set(label, bucket);
    }
  }

  if (!count) warnings.push(`${filename}: reservation list carried no reservation rows`);
  if (printedNights !== null && printedNights !== nights) {
    warnings.push(
      `${filename}: the print's total of ${printedNights} nights differs from the ${nights} nights read — the listed rows were used`,
    );
  }

  const statuses = [...buckets.values()].sort((left, right) => {
    const rank = (entry: DailyMovementStatus) => {
      const index = STATUS_ORDER.indexOf(entry.label);
      return index === -1 ? STATUS_ORDER.length : index;
    };
    return rank(left) - rank(right) || left.label.localeCompare(right.label);
  });

  return {
    rowsRead: count,
    warnings,
    movement: {
      count,
      value: printedValue ?? (value > 0 ? Math.round(value * 100) / 100 : null),
      nights: count > 0 ? nights : null,
      period: from && to ? { from, to } : null,
      statuses,
    },
  };
}
