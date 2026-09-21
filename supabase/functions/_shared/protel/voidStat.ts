/**
 * protel "Cancellations" (VoidStat) print — the day's voided charges.
 *
 * The print is blocked by booking date. Each block lists the voided charges
 * with a reservation number (`RE_7079`), the invoice text, a negative single
 * and total amount, the room and category, the guest/source and an
 * arrival/departure pair that may sit on the charge's own row or on the row
 * directly beneath it, followed by a void reason.
 *
 * Only accommodation charges are cancellations of business; the print also
 * carries shop items, conservation contributions and balancing entries, which
 * must never be counted as cancelled reservations. A reservation can be voided
 * more than once across booking dates, so lines are kept once per reservation,
 * stay and amount.
 */

import type { DailyMovement } from "../cheetaplains/dailyDetailed.ts";

type Grid = unknown[][];

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const rowText = (row: unknown[]): string[] => (row ?? []).map(text).filter((cell) => cell.length > 0);

const RES_NO = /^RE[_\s-]?(\d{3,8})$/i;
const DATE = /^(\d{2})[-.\/](\d{2})[-.\/](\d{4})$/;

const toIso = (raw: string): string | null => {
  const match = raw.match(DATE);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const amount = (raw: string): number | null => {
  const cleaned = raw
    .replace(/[Rr\s\u00a0]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

/** True when the grid reads like a protel Cancellations print. */
export function isVoidStatGrid(grid: Grid): boolean {
  let header = false;
  let reservation = false;
  for (const row of grid.slice(0, 60)) {
    for (const cell of rowText(row)) {
      if (/^cancellations$/i.test(cell) || /^void[-\s]?type:?$/i.test(cell)) header = true;
      if (RES_NO.test(cell)) reservation = true;
    }
  }
  return header && reservation;
}

export interface VoidStatResult {
  movement: DailyMovement;
  warnings: string[];
  rowsRead: number;
}

/** Reads the Cancellations print into the report's movement shape. */
export function parseVoidStat(grid: Grid, filename: string): VoidStatResult {
  const warnings: string[] = [];
  const seen = new Set<string>();
  let count = 0;
  let nights = 0;
  let value = 0;
  let skippedOther = 0;
  let from: string | null = null;
  let to: string | null = null;

  const rows = grid.map(rowText);

  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index];
    if (!cells.length) continue;

    for (const cell of cells) {
      const iso = toIso(cell);
      if (!iso) continue;
      if (!from || iso < from) from = iso;
      if (!to || iso > to) to = iso;
    }

    const reservation = cells.find((cell) => RES_NO.test(cell));
    if (!reservation) continue;

    const accommodation = cells.some((cell) => /accommodation/i.test(cell));
    const total = cells
      .map((cell) => amount(cell))
      .filter((money): money is number => money !== null && money < 0)
      .sort((left, right) => left - right)[0];
    if (total === undefined) continue;
    if (!accommodation) {
      skippedOther += 1;
      continue;
    }

    // The stay may print on this row or on the one beneath it.
    const dates = [...cells, ...(rows[index + 1] ?? [])]
      .map((cell) => toIso(cell))
      .filter((iso): iso is string => iso !== null)
      .sort();
    const arrival = dates[0] ?? null;
    const departure = dates.length > 1 ? dates[dates.length - 1] : null;

    const key = `${reservation}|${arrival ?? ""}|${departure ?? ""}|${total}`;
    if (seen.has(key)) continue;
    seen.add(key);

    count += 1;
    value += Math.abs(total);
    if (arrival && departure) {
      const span = (Date.parse(departure) - Date.parse(arrival)) / 86_400_000;
      if (Number.isFinite(span) && span > 0) nights += Math.round(span);
    }
  }

  if (!count) warnings.push(`${filename}: cancellations print carried no accommodation voids`);
  if (skippedOther) {
    warnings.push(
      `${filename}: ${skippedOther} non-accommodation void line(s) (shop, contributions, balancing) were not counted as cancellations`,
    );
  }

  return {
    rowsRead: count,
    warnings,
    movement: {
      count,
      value: value > 0 ? Math.round(value * 100) / 100 : null,
      nights: nights > 0 ? nights : null,
      period: from && to ? { from, to } : null,
      statuses: [],
    },
  };
}
