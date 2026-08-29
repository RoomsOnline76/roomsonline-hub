// Shared NightsBridge ledger normalisation + aggregation.
// Pure functions only — reused by the parser and the Excel/PDF generators.
import {
  classifyRow,
  EMPTY_ROW_RULES,
  REVENUE_BEARING_NON_SELLABLE,
  roomNameKeys,
  type RowClass,
  type RowRules,
} from "./nightsbridgeRowRules.ts";

export interface LedgerRow {
  booking_id: string;
  arrival: string; // YYYY-MM-DD
  last_night: string | null;
  nights: number;
  revenue: number;
  extras: number;
  commission: number;
  nett: number;
  room_name: string;
  source: string;
  status: string;
  type: string;
  currency: string;
  /** Date the booking was made, when the export carries one. */
  booked_date?: string | null;
  /** Guest / company labels, used by the zero-revenue keep and exclude rules. */
  guest_name?: string | null;
  company?: string | null;
  /**
   * Month (YYYY-MM) the export this row came from reports on. A NightsBridge
   * bookingsummary is pulled per month and repeats a stay that started earlier
   * but occupies nights in the reported month, so the file's own period — not
   * the arrival date — decides which month the row belongs to.
   */
  report_month?: string | null;
}

export interface ExcludedRow {
  booking_id: string;
  arrival: string;
  nights: number;
  revenue: number;
  room_name: string;
  guest_name: string;
  company: string;
  source: string;
  reason: RowClass;
  matched: string | null;
}

export interface DerivedInputs {
  dinner_by_month: Record<string, number>;
  room0_by_month: Record<string, number>;
  comp_rns_by_month: Record<string, number>;
}

export type NonSellableBucket = { revenue: number; nights: number; rows: number };

export interface AggregateResult {
  months: string[]; // ["2026-08", ...]
  otb_revenue: Record<string, number>;
  room_nights: Record<string, number>;
  capacity_days: Record<string, number>;
  adr: Record<string, number>;
  occupancy: Record<string, number>;
  source_breakdown: Record<string, { revenue: number; nights: number }>;
  /** Combined non-sellable totals per month (kept for backwards compatibility). */
  non_sellable: Record<string, NonSellableBucket>;
  /** The same figures split by why the rows were set aside. */
  non_sellable_by_reason: Partial<Record<RowClass, Record<string, NonSellableBucket>>>;
  /** Rows set aside, per month, so a reviewer can audit the filter. */
  excluded_rows: Record<string, ExcludedRow[]>;
  /** Figures calculated from the ledger that used to be typed in by hand. */
  derived_inputs: DerivedInputs;
  /** Zero-revenue rows rescued by the property's keep-list. */
  kept_zero_revenue: { rows: number; nights: number; patterns: Record<string, number> };
  totals: {
    revenue: number;
    nights: number;
    capacity_days: number;
    adr: number;
    occupancy: number;
    extras: number;
    bookings: number;
    non_sellable_rows: number;
  };
}

/** Most rows a single month keeps in the audit list, to bound the payload. */
const EXCLUDED_ROW_CAP = 250;


const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Normalises a NightsBridge "Source" value into a reporting channel. */
export function normaliseSource(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "Other";
  const lower = value.toLowerCase();
  if (lower.includes("booking.com")) return "Booking.com";
  if (lower.includes("expedia") || lower.includes("hotels.com") || lower.includes("travelo")) {
    return "Expedia";
  }
  if (lower.includes("lekkeslaap")) return "LekkeSlaap";
  if (lower.includes("airbnb")) return "Airbnb";
  if (
    lower.includes("roomsonline") ||
    lower.includes("own booking") ||
    lower.includes("own web") ||
    lower.includes("website") ||
    lower.includes("walk in") ||
    lower.includes("walk-in") ||
    lower.includes("telephone") ||
    lower.includes("email")
  ) {
    return "Own";
  }
  if (lower.includes("nightsbridge")) return "NightsBridge";
  return value;
}

/** Room labels that must never inflate the sellable room-night denominator. */
export function isNonSellableRoom(roomName: string): boolean {
  const lower = (roomName ?? "").trim().toLowerCase();
  if (!lower) return false;
  return (
    /^room\s*0\b/.test(lower) ||
    lower.includes("holding in credit") ||
    lower.includes("holding credit") ||
    lower.startsWith("event")
  );
}

export const monthKey = (isoDate: string): string => isoDate.slice(0, 7);

export function daysInMonth(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Aggregates a normalised ledger by arrival month.
 * Occupancy uses roomCount × days-in-month as the denominator.
 *
 * Rows that are not sold nights (zero-revenue blocks, Room 0, events, holding in
 * credit, property exclude-list matches) are set aside per reason and never enter
 * revenue, room nights, ADR or occupancy.
 */
export function aggregateLedger(
  rows: LedgerRow[],
  roomCount: number,
  rules: RowRules = EMPTY_ROW_RULES,
): AggregateResult {
  const rooms = Number.isFinite(roomCount) && roomCount > 0 ? Math.floor(roomCount) : 1;

  const revenue: Record<string, number> = {};
  const nights: Record<string, number> = {};
  const sources: Record<string, { revenue: number; nights: number }> = {};
  const nonSellable: Record<string, NonSellableBucket> = {};
  const byReason: Partial<Record<RowClass, Record<string, NonSellableBucket>>> = {};
  const excludedRows: Record<string, ExcludedRow[]> = {};
  const dinner: Record<string, number> = {};
  const roomZero: Record<string, number> = {};
  const compNights: Record<string, number> = {};
  const keptPatterns: Record<string, number> = {};
  const monthSet = new Set<string>();
  let extrasTotal = 0;
  let bookings = 0;
  let nonSellableRows = 0;
  let keptRows = 0;
  let keptNights = 0;

  // Room labels are needed up front: an occupant field holding a unit's own
  // name is a hold, not a guest.
  const roomNames = roomNameKeys(rows);

  for (const row of rows) {
    if (!row.arrival) continue;
    if (!Number.isFinite(row.revenue) || !Number.isFinite(row.nights)) continue;

    // The export's own reporting period wins over the arrival date.
    const stamped = String(row.report_month ?? "").slice(0, 7);
    const key = /^\d{4}-\d{2}$/.test(stamped) ? stamped : monthKey(row.arrival);
    monthSet.add(key);
    extrasTotal += row.extras || 0;

    const { klass, matched } = classifyRow(row, rules, roomNames);

    // Dinner is the extras billed against guest rooms. Function-room (Events),
    // Room 0 and holding-in-credit extras are other revenue streams.
    if (klass !== "room_zero" && klass !== "event" && klass !== "holding_credit") {
      dinner[key] = (dinner[key] ?? 0) + (row.extras || 0);
    }


    if (klass !== "sellable") {
      nonSellableRows += 1;

      const bucket = nonSellable[key] ?? { revenue: 0, nights: 0, rows: 0 };
      bucket.revenue += row.revenue;
      bucket.nights += row.nights;
      bucket.rows += 1;
      nonSellable[key] = bucket;

      const reasonMonths = byReason[klass] ?? {};
      const reasonBucket = reasonMonths[key] ?? { revenue: 0, nights: 0, rows: 0 };
      reasonBucket.revenue += row.revenue;
      reasonBucket.nights += row.nights;
      reasonBucket.rows += 1;
      reasonMonths[key] = reasonBucket;
      byReason[klass] = reasonMonths;

      if (klass === "room_zero") {
        roomZero[key] = (roomZero[key] ?? 0) + row.revenue;
      }
      // Money on a blocked / excluded line is still accommodation revenue —
      // only its nights are not sellable room nights.
      if (REVENUE_BEARING_NON_SELLABLE.includes(klass) && row.revenue) {
        revenue[key] = (revenue[key] ?? 0) + row.revenue;
      }

      const list = excludedRows[key] ?? [];
      if (list.length < EXCLUDED_ROW_CAP) {
        list.push({
          booking_id: row.booking_id,
          arrival: row.arrival,
          nights: row.nights,
          revenue: round2(row.revenue),
          room_name: row.room_name,
          guest_name: row.guest_name ?? "",
          company: row.company ?? "",
          source: row.source,
          reason: klass,
          matched,
        });
      }
      excludedRows[key] = list;
      continue;
    }

    if (matched) {
      // A zero-revenue row the property's keep-list rescued.
      keptRows += 1;
      keptNights += row.nights;
      keptPatterns[matched] = (keptPatterns[matched] ?? 0) + 1;
    }

    // Occupied at no charge: counted as room nights (the room was not sellable)
    // and reported so the reviewer can see what is dragging ADR down.
    if (!row.revenue) compNights[key] = (compNights[key] ?? 0) + row.nights;

    bookings += 1;
    revenue[key] = (revenue[key] ?? 0) + row.revenue;
    nights[key] = (nights[key] ?? 0) + row.nights;

    const channel = normaliseSource(row.source);
    const agg = sources[channel] ?? { revenue: 0, nights: 0 };
    agg.revenue += row.revenue;
    agg.nights += row.nights;
    sources[channel] = agg;
  }

  const months = [...monthSet].sort();
  const capacity: Record<string, number> = {};
  const adr: Record<string, number> = {};
  const occupancy: Record<string, number> = {};

  let totalRevenue = 0;
  let totalNights = 0;
  let totalCapacity = 0;

  for (const key of months) {
    const monthRevenue = round2(revenue[key] ?? 0);
    const monthNights = nights[key] ?? 0;
    const monthCapacity = rooms * daysInMonth(key);

    revenue[key] = monthRevenue;
    nights[key] = monthNights;
    capacity[key] = monthCapacity;
    adr[key] = monthNights > 0 ? round2(monthRevenue / monthNights) : 0;
    occupancy[key] = monthCapacity > 0 ? monthNights / monthCapacity : 0;

    dinner[key] = round2(dinner[key] ?? 0);
    roomZero[key] = round2(roomZero[key] ?? 0);
    compNights[key] = compNights[key] ?? 0;

    totalRevenue += monthRevenue;
    totalNights += monthNights;
    totalCapacity += monthCapacity;
  }

  for (const key of Object.keys(sources)) {
    sources[key].revenue = round2(sources[key].revenue);
  }
  for (const key of Object.keys(nonSellable)) {
    nonSellable[key].revenue = round2(nonSellable[key].revenue);
  }
  for (const reason of Object.keys(byReason) as RowClass[]) {
    const buckets = byReason[reason];
    if (!buckets) continue;
    for (const key of Object.keys(buckets)) {
      buckets[key].revenue = round2(buckets[key].revenue);
    }
  }

  return {
    months,
    otb_revenue: revenue,
    room_nights: nights,
    capacity_days: capacity,
    adr,
    occupancy,
    source_breakdown: sources,
    non_sellable: nonSellable,
    non_sellable_by_reason: byReason,
    excluded_rows: excludedRows,
    derived_inputs: {
      dinner_by_month: dinner,
      room0_by_month: roomZero,
      comp_rns_by_month: compNights,
    },
    kept_zero_revenue: { rows: keptRows, nights: keptNights, patterns: keptPatterns },
    totals: {
      revenue: round2(totalRevenue),
      nights: totalNights,
      capacity_days: totalCapacity,
      adr: totalNights > 0 ? round2(totalRevenue / totalNights) : 0,
      occupancy: totalCapacity > 0 ? totalNights / totalCapacity : 0,
      extras: round2(extrasTotal),
      bookings,
      non_sellable_rows: nonSellableRows,
    },
  };
}
