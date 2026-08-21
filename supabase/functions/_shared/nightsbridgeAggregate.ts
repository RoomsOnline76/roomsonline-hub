// Shared NightsBridge ledger normalisation + aggregation.
// Pure functions only — reused by the parser and the Excel/PDF generators.

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
}

export interface AggregateResult {
  months: string[]; // ["2026-08", ...]
  otb_revenue: Record<string, number>;
  room_nights: Record<string, number>;
  capacity_days: Record<string, number>;
  adr: Record<string, number>;
  occupancy: Record<string, number>;
  source_breakdown: Record<string, { revenue: number; nights: number }>;
  non_sellable: Record<string, { revenue: number; nights: number; rows: number }>;
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
 */
export function aggregateLedger(rows: LedgerRow[], roomCount: number): AggregateResult {
  const rooms = Number.isFinite(roomCount) && roomCount > 0 ? Math.floor(roomCount) : 1;

  const revenue: Record<string, number> = {};
  const nights: Record<string, number> = {};
  const sources: Record<string, { revenue: number; nights: number }> = {};
  const nonSellable: Record<string, { revenue: number; nights: number; rows: number }> = {};
  const monthSet = new Set<string>();
  let extrasTotal = 0;
  let bookings = 0;
  let nonSellableRows = 0;

  for (const row of rows) {
    if (!row.arrival) continue;
    if (!Number.isFinite(row.revenue) || !Number.isFinite(row.nights)) continue;

    const key = monthKey(row.arrival);
    monthSet.add(key);
    extrasTotal += row.extras || 0;

    if (isNonSellableRoom(row.room_name)) {
      nonSellableRows += 1;
      const bucket = nonSellable[key] ?? { revenue: 0, nights: 0, rows: 0 };
      bucket.revenue += row.revenue;
      bucket.nights += row.nights;
      bucket.rows += 1;
      nonSellable[key] = bucket;
      continue;
    }

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

  return {
    months,
    otb_revenue: revenue,
    room_nights: nights,
    capacity_days: capacity,
    adr,
    occupancy,
    source_breakdown: sources,
    non_sellable: nonSellable,
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
