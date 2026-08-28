// Booking-trend metrics for a revenue report run.
// Pure functions, shared by every source parser (NightsBridge, OPERA, PROTEL).
//
// Average length of stay and arrival weekdays come from data every source
// provides. Booking weekday and lead time need the date the booking was made;
// when the export does not carry one, those blocks stay empty and the report
// prints a short note instead of an estimate.

import { isNonSellableRoom, monthKey, type LedgerRow } from "./nightsbridgeAggregate.ts";

export interface LeadTimeBuckets {
  /** 0–7 days before arrival. */
  d0_7: number;
  /** 8–30 days. */
  d8_30: number;
  /** 31–90 days. */
  d31_90: number;
  /** 91 days or more. */
  d91_plus: number;
}

export interface BookingTrends {
  /** Average length of stay per arrival month (`YYYY-MM` -> nights). */
  alos_by_month: Record<string, number>;
  /** Average length of stay across every counted booking. */
  alos: number;
  /** Bookings counted for the stay metrics. */
  bookings: number;
  /** Arrival weekday counts, Monday first. */
  arrival_weekdays: number[];
  /** Weekday the booking was received, Monday first. Empty when unknown. */
  booked_weekdays: number[];
  /** Bookings that carried a booking-made date. */
  booked_date_rows: number;
  /** Lead-time distribution; zeroed when no booking-made date was found. */
  lead_time_buckets: LeadTimeBuckets;
  /** Average lead time in days, or null when unknown. */
  lead_time_avg: number | null;
  /** Median lead time in days, or null when unknown. */
  lead_time_median: number | null;
  /** True when at least one row carried a booking-made date. */
  has_booked_dates: boolean;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const LEAD_TIME_LABELS: Record<keyof LeadTimeBuckets, string> = {
  d0_7: "0–7 days",
  d8_30: "8–30 days",
  d31_90: "31–90 days",
  d91_plus: "91+ days",
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Monday-first weekday index for an ISO date, or null when unparseable. */
const weekdayIndex = (iso: string): number | null => {
  const time = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(time)) return null;
  return (new Date(time).getUTCDay() + 6) % 7;
};

const dayGap = (from: string, to: string): number | null => {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
};

export const emptyBookingTrends = (): BookingTrends => ({
  alos_by_month: {},
  alos: 0,
  bookings: 0,
  arrival_weekdays: [0, 0, 0, 0, 0, 0, 0],
  booked_weekdays: [0, 0, 0, 0, 0, 0, 0],
  booked_date_rows: 0,
  lead_time_buckets: { d0_7: 0, d8_30: 0, d31_90: 0, d91_plus: 0 },
  lead_time_avg: null,
  lead_time_median: null,
  has_booked_dates: false,
});

/**
 * Builds the trend block from a normalised ledger. Non-sellable rows (Room 0,
 * holding-credit, events) are excluded so the averages describe real stays.
 * When `months` is supplied only arrivals inside those months are counted.
 */
export function buildBookingTrends(
  rows: LedgerRow[],
  months?: readonly string[],
): BookingTrends {
  const scope = months && months.length > 0 ? new Set(months) : null;
  const trends = emptyBookingTrends();

  const nightsByMonth: Record<string, number> = {};
  const staysByMonth: Record<string, number> = {};
  const leadTimes: number[] = [];
  let totalNights = 0;

  for (const row of rows) {
    if (!row.arrival) continue;
    if (!Number.isFinite(row.nights) || row.nights <= 0) continue;
    if (isNonSellableRoom(row.room_name)) continue;
    const key = monthKey(row.arrival);
    if (scope && !scope.has(key)) continue;

    trends.bookings += 1;
    totalNights += row.nights;
    nightsByMonth[key] = (nightsByMonth[key] ?? 0) + row.nights;
    staysByMonth[key] = (staysByMonth[key] ?? 0) + 1;

    const arrivalDay = weekdayIndex(row.arrival);
    if (arrivalDay !== null) trends.arrival_weekdays[arrivalDay] += 1;

    const booked = typeof row.booked_date === "string" ? row.booked_date : null;
    if (!booked) continue;
    const bookedDay = weekdayIndex(booked);
    if (bookedDay === null) continue;
    trends.booked_weekdays[bookedDay] += 1;
    trends.booked_date_rows += 1;

    const gap = dayGap(booked, row.arrival);
    if (gap === null) continue;
    const lead = Math.max(0, gap);
    leadTimes.push(lead);
    if (lead <= 7) trends.lead_time_buckets.d0_7 += 1;
    else if (lead <= 30) trends.lead_time_buckets.d8_30 += 1;
    else if (lead <= 90) trends.lead_time_buckets.d31_90 += 1;
    else trends.lead_time_buckets.d91_plus += 1;
  }

  for (const key of Object.keys(nightsByMonth)) {
    const stays = staysByMonth[key] ?? 0;
    trends.alos_by_month[key] = stays > 0 ? round2(nightsByMonth[key] / stays) : 0;
  }
  trends.alos = trends.bookings > 0 ? round2(totalNights / trends.bookings) : 0;

  if (leadTimes.length > 0) {
    const sum = leadTimes.reduce((total, value) => total + value, 0);
    trends.lead_time_avg = Math.round(sum / leadTimes.length);
    const sorted = [...leadTimes].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    trends.lead_time_median =
      sorted.length % 2 === 0
        ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
        : sorted[middle];
  }
  trends.has_booked_dates = trends.booked_date_rows > 0;

  return trends;
}
