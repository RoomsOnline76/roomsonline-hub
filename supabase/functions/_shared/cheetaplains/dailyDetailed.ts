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

import type { ProtelDay } from "../protel/houseState.ts";

/** One reservation-status bucket on a movement print. */
export interface DailyMovementStatus {
  /** As printed: `Confirmed`, `Provisional`, `Waitlist`, … */
  label: string;
  count: number;
  nights: number;
}

export interface DailyMovement {
  /** Reservations counted on the movement PDF. */
  count: number;
  /** Printed money total, when the export carries one. */
  value: number | null;
  /** Nights across the listed reservations, when readable. */
  nights: number | null;
  /** Printed `04.09.2026 - 07.09.2026` window. */
  period: { from: string; to: string } | null;
  /**
   * Split by the print's `Res. status` column. Confirmed and provisional
   * business is never merged: most provisionals never confirm.
   */
  statuses: DailyMovementStatus[];
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
  /**
   * The day as it reads on the provisional (Optional / Tentative) prints. Never
   * part of revenue on the books — it prints as its own line.
   */
  provisionalDay: { villasOccupied: number; accommodation: number; total: number } | null;
  /** The whole month on the provisional prints. */
  provisionalMonth: DailyPeriodFigures | null;
  created: DailyMovement | null;
  cancelled: DailyMovement | null;
  villaCount: number | null;
  /** Full monthly confirmed BOB as it stood when this daily report was built. */
  comparisonSnapshot?: Record<string, { bob: number; occupancy: number | null }>;
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
  /** Daily rows from the confirmed House State exports. */
  days: ProtelDay[];
  /**
   * Daily rows from the provisional (Optional / Tentative) House State exports.
   * Reported separately and never added to revenue on the books.
   */
  provisionalDays?: ProtelDay[];
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

  const tentativeDays = (input.provisionalDays ?? []).filter(
    (day) => day.date.slice(0, 7) === month,
  );
  const tentativeToday = tentativeDays.find((day) => day.date === input.date);

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
    provisionalDay: tentativeToday
      ? {
        villasOccupied: tentativeToday.roomsOccupied,
        accommodation: round2(tentativeToday.accommodation),
        total: round2(tentativeToday.total),
      }
      : null,
    provisionalMonth: tentativeDays.length ? period(tentativeDays, villaCount) : null,
    created: input.created,
    cancelled: input.cancelled,
    villaCount,
  };
}

/** Revenue, nights and capacity per `YYYY-MM` across every House State row. */
export function monthlyOnBooks(
  days: ProtelDay[],
  villaCount: number | null,
): Record<string, DailyPeriodFigures> {
  const byMonth = new Map<string, ProtelDay[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);

    const bucket = byMonth.get(key);
    if (bucket) bucket.push(day);
    else byMonth.set(key, [day]);
  }
  const out: Record<string, DailyPeriodFigures> = {};
  for (const [month, rows] of byMonth) out[month] = period(rows, villaCount);
  return out;
}

/* ── movement PDFs ─────────────────────────────────────────────── */

const money = (raw: string): number | null => {
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? round2(parsed) : null;
};

/**
 * A reservation row: arrival, departure, nights and — on the created print —
 * the `Res. status` word that follows them. Cancelled prints put a reservation
 * number between the nights and the status, so that column is optional too.
 */
const PAIR =
  /(\d{2}\.\d{2}\.\d{2})\s+(\d{2}\.\d{2}\.\d{2})\s+(\d{1,3})\b(?:\s+\d{2,6})?\s*(Provisional|Confirmed|Definite|Tentative|Waitlist|Wait list|Option|Cancelled|Canceled|No[- ]?show|Checked[- ]?in|Checked[- ]?out)?/gi;

/** Print casing varies; the report always uses one spelling per status. */
const statusLabel = (raw: string): string => {
  const key = raw.toLowerCase().replace(/[-\s]+/g, " ");
  if (key === "wait list") return "Waitlist";
  if (key === "canceled") return "Cancelled";
  if (key === "no show") return "No show";
  if (key === "checked in") return "Checked in";
  if (key === "checked out") return "Checked out";
  return key.charAt(0).toUpperCase() + key.slice(1);
};

/** Confirmed first, then provisional business, then anything else. */
const STATUS_ORDER = ["Confirmed", "Definite", "Provisional", "Tentative", "Option", "Waitlist"];

/**
 * Reads a protel "Reservations Created" / "Cancelled Reservations" print.
 *
 * The PDF is a merged single text run, so reservations are counted by their
 * arrival/departure/nights triplet rather than by row geometry, and the money
 * total is taken from the printed `…Total` figure when one is present. Each
 * row's reservation status is kept so confirmed and provisional business can
 * be reported apart.
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
  const buckets = new Map<string, DailyMovementStatus>();
  for (const match of flat.matchAll(PAIR)) {
    count += 1;
    const rowNights = Number(match[3]) || 0;
    nights += rowNights;
    if (!match[4]) continue;
    const label = statusLabel(match[4]);
    const bucket = buckets.get(label) ?? { label, count: 0, nights: 0 };
    bucket.count += 1;
    bucket.nights += rowNights;
    buckets.set(label, bucket);
  }
  const statuses = [...buckets.values()].sort((a, b) => {
    const rank = (s: DailyMovementStatus) => {
      const index = STATUS_ORDER.indexOf(s.label);
      return index === -1 ? STATUS_ORDER.length : index;
    };
    return rank(a) - rank(b) || a.label.localeCompare(b.label);
  });


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
      statuses,
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
        statuses: [],
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
