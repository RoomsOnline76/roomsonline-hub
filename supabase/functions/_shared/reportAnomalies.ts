// Deterministic anomaly detection over a revenue-report snapshot.
//
// The maths lives here so every generation of the insights panel quotes the SAME
// numbers: the model is only ever allowed to phrase these facts, never to invent
// or recompute them.

export interface AnomalySnapshot {
  months: string[];
  otb_revenue: Record<string, number>;
  previous_otb_revenue: Record<string, number>;
  last_year_actual: Record<string, number>;
  room_nights: Record<string, number>;
  previous_room_nights: Record<string, number>;
  last_year_room_nights: Record<string, number>;
  capacity_days: Record<string, number>;
  additional_revenue: Record<string, number>;
  adr: Record<string, number>;
  occupancy: Record<string, number>;
  source_breakdown: Record<string, { revenue?: number; nights?: number }>;
  room_count: number;
  totals: Record<string, number | undefined>;
}

export type AnomalySeverity = "high" | "medium" | "low";

export interface AnomalyFlag {
  id: string;
  severity: AnomalySeverity;
  /** ISO month key (YYYY-MM) or null for portfolio-wide facts. */
  month: string | null;
  metric:
    | "pickup"
    | "yoy_revenue"
    | "yoy_room_nights"
    | "adr"
    | "occupancy"
    | "source_mix"
    | "data_quality";
  value: number;
  comparison: number;
  delta: number;
  deltaPct: number | null;
  /** Plain, already-correct sentence of fact. The model may rephrase, not restate. */
  factText: string;
}

/** Single place to tune sensitivity. */
export const ANOMALY_THRESHOLDS = {
  /** Pickup vs previous snapshot must beat this share of the run's average pickup. */
  pickupOutlierFactor: 1.75,
  /** Minimum rand pickup before a month is worth flagging at all. */
  pickupFloor: 25_000,
  /** Year-on-year revenue gap, as a share. */
  yoyRevenue: 0.15,
  /** Year-on-year room-night gap, as a share. */
  yoyRoomNights: 0.15,
  /** ADR movement vs the run's average ADR, as a share. */
  adrSwing: 0.2,
  /** Occupancy considered soft / strong (absolute percentage points, 0-100). */
  occupancyLow: 35,
  occupancyHigh: 85,
  /** Source share movement between this run and the previous, in points. */
  sourceShift: 10,
  /** Cap so the panel stays readable. */
  maxFlags: 8,
} as const;

const SEVERITY_RANK: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2 };

const num = (map: Record<string, number> | undefined, key: string): number => {
  const value = map?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const share = (value: number, base: number): number | null =>
  base > 0 ? (value - base) / base : null;

const zar = (value: number): string =>
  `R${Math.round(Math.abs(value)).toLocaleString("en-ZA")}`;

const monthName = (key: string): string => {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${names[index] ?? key} ${year ?? ""}`.trim();
};

const pct = (value: number): string => `${Math.abs(value * 100).toFixed(1)}%`;

const severityFor = (magnitude: number, medium: number, high: number): AnomalySeverity =>
  magnitude >= high ? "high" : magnitude >= medium ? "medium" : "low";

/**
 * Compute every notable movement in the snapshot, strongest first, capped at
 * ANOMALY_THRESHOLDS.maxFlags.
 */
export function detectAnomalies(snapshot: AnomalySnapshot): AnomalyFlag[] {
  const months = Array.isArray(snapshot.months) ? snapshot.months.filter(Boolean) : [];
  if (months.length === 0) return [];

  const flags: AnomalyFlag[] = [];
  const t = ANOMALY_THRESHOLDS;

  // --- Pickup vs the previous snapshot -------------------------------------
  const pickups = months.map((month) => ({
    month,
    pickup: num(snapshot.otb_revenue, month) - num(snapshot.previous_otb_revenue, month),
    hasPrevious: num(snapshot.previous_otb_revenue, month) > 0,
  }));
  const comparablePickups = pickups.filter((row) => row.hasPrevious);
  const positive = comparablePickups.filter((row) => row.pickup > 0);
  const averagePickup =
    positive.length > 0
      ? positive.reduce((sum, row) => sum + row.pickup, 0) / positive.length
      : 0;

  for (const row of comparablePickups) {
    if (row.pickup >= Math.max(t.pickupFloor, averagePickup * t.pickupOutlierFactor)) {
      const ratio = averagePickup > 0 ? row.pickup / averagePickup : t.pickupOutlierFactor;
      flags.push({
        id: `pickup-high-${row.month}`,
        severity: severityFor(ratio, t.pickupOutlierFactor, t.pickupOutlierFactor * 1.6),
        month: row.month,
        metric: "pickup",
        value: row.pickup,
        comparison: averagePickup,
        delta: row.pickup - averagePickup,
        deltaPct: share(row.pickup, averagePickup),
        factText: `${monthName(row.month)} picked up ${zar(row.pickup)} since the previous snapshot, against an average pickup of ${zar(averagePickup)} across the comparable months.`,
      });
      continue;
    }
    if (row.pickup < 0 && Math.abs(row.pickup) >= t.pickupFloor) {
      flags.push({
        id: `pickup-negative-${row.month}`,
        severity: "high",
        month: row.month,
        metric: "pickup",
        value: row.pickup,
        comparison: 0,
        delta: row.pickup,
        deltaPct: share(
          num(snapshot.otb_revenue, row.month),
          num(snapshot.previous_otb_revenue, row.month),
        ),
        factText: `${monthName(row.month)} lost ${zar(row.pickup)} of on-the-books revenue since the previous snapshot — cancellations outran new business.`,
      });
    }
  }

  // --- Year-on-year revenue and room nights -------------------------------
  for (const month of months) {
    const otb = num(snapshot.otb_revenue, month);
    const lastYear = num(snapshot.last_year_actual, month);
    const gap = share(otb, lastYear);
    if (lastYear > 0 && gap !== null && Math.abs(gap) >= t.yoyRevenue) {
      flags.push({
        id: `yoy-revenue-${month}`,
        severity: severityFor(Math.abs(gap), t.yoyRevenue, t.yoyRevenue * 2),
        month,
        metric: "yoy_revenue",
        value: otb,
        comparison: lastYear,
        delta: otb - lastYear,
        deltaPct: gap,
        factText: `${monthName(month)} on-the-books revenue of ${zar(otb)} is ${pct(gap)} ${gap > 0 ? "ahead of" : "behind"} last year's ${zar(lastYear)}.`,
      });
    }

    const nights = num(snapshot.room_nights, month);
    const lastYearNights = num(snapshot.last_year_room_nights, month);
    const nightsGap = share(nights, lastYearNights);
    if (lastYearNights > 0 && nightsGap !== null && Math.abs(nightsGap) >= t.yoyRoomNights) {
      flags.push({
        id: `yoy-nights-${month}`,
        severity: severityFor(Math.abs(nightsGap), t.yoyRoomNights, t.yoyRoomNights * 2),
        month,
        metric: "yoy_room_nights",
        value: nights,
        comparison: lastYearNights,
        delta: nights - lastYearNights,
        deltaPct: nightsGap,
        factText: `${monthName(month)} has ${Math.round(nights)} room nights against ${Math.round(lastYearNights)} last year (${pct(nightsGap)} ${nightsGap > 0 ? "up" : "down"}).`,
      });
    }
  }

  // --- ADR swings vs the run's own average --------------------------------
  const adrValues = months.map((month) => num(snapshot.adr, month)).filter((value) => value > 0);
  const averageAdr =
    adrValues.length > 0 ? adrValues.reduce((sum, value) => sum + value, 0) / adrValues.length : 0;
  if (averageAdr > 0) {
    for (const month of months) {
      const adr = num(snapshot.adr, month);
      if (adr <= 0) continue;
      const swing = share(adr, averageAdr);
      if (swing !== null && Math.abs(swing) >= t.adrSwing) {
        flags.push({
          id: `adr-${month}`,
          severity: severityFor(Math.abs(swing), t.adrSwing, t.adrSwing * 2),
          month,
          metric: "adr",
          value: adr,
          comparison: averageAdr,
          delta: adr - averageAdr,
          deltaPct: swing,
          factText: `${monthName(month)} ADR of ${zar(adr)} sits ${pct(swing)} ${swing > 0 ? "above" : "below"} the ${zar(averageAdr)} average for this outlook.`,
        });
      }
    }
  }

  // --- Occupancy bands ----------------------------------------------------
  for (const month of months) {
    const occupancy = num(snapshot.occupancy, month);
    const capacity = num(snapshot.capacity_days, month);
    if (capacity <= 0) continue;
    if (occupancy >= t.occupancyHigh) {
      flags.push({
        id: `occ-high-${month}`,
        severity: "medium",
        month,
        metric: "occupancy",
        value: occupancy,
        comparison: t.occupancyHigh,
        delta: occupancy - t.occupancyHigh,
        deltaPct: null,
        factText: `${monthName(month)} is already at ${occupancy.toFixed(1)}% occupancy — close to sold out, so remaining inventory can carry a higher rate.`,
      });
    } else if (occupancy > 0 && occupancy <= t.occupancyLow) {
      flags.push({
        id: `occ-low-${month}`,
        severity: "medium",
        month,
        metric: "occupancy",
        value: occupancy,
        comparison: t.occupancyLow,
        delta: occupancy - t.occupancyLow,
        deltaPct: null,
        factText: `${monthName(month)} is soft at ${occupancy.toFixed(1)}% occupancy against ${Math.round(capacity)} sellable room nights.`,
      });
    } else if (occupancy === 0) {
      flags.push({
        id: `occ-zero-${month}`,
        severity: "high",
        month,
        metric: "data_quality",
        value: 0,
        comparison: capacity,
        delta: -capacity,
        deltaPct: null,
        factText: `${monthName(month)} shows no room nights on the books at all — either genuinely empty or the source file is incomplete for that month.`,
      });
    }
  }

  // --- Source mix ---------------------------------------------------------
  const sources = Object.entries(snapshot.source_breakdown ?? {}).map(([name, value]) => ({
    name,
    revenue: Number(value?.revenue ?? 0) || 0,
  }));
  const sourceTotal = sources.reduce((sum, row) => sum + row.revenue, 0);
  if (sourceTotal > 0) {
    const ranked = [...sources].sort((a, b) => b.revenue - a.revenue);
    const leader = ranked[0];
    const leaderShare = (leader.revenue / sourceTotal) * 100;
    if (leaderShare >= 100 - t.sourceShift) {
      flags.push({
        id: "source-concentration",
        severity: "medium",
        month: null,
        metric: "source_mix",
        value: leaderShare,
        comparison: 100,
        delta: leaderShare - 100,
        deltaPct: null,
        factText: `${leader.name} carries ${leaderShare.toFixed(1)}% of on-the-books revenue — the mix is highly concentrated on one channel.`,
      });
    }
    const trailing = ranked.slice(1).filter((row) => row.revenue > 0);
    if (trailing.length > 0) {
      const runnerUp = trailing[0];
      const runnerShare = (runnerUp.revenue / sourceTotal) * 100;
      flags.push({
        id: "source-runner-up",
        severity: "low",
        month: null,
        metric: "source_mix",
        value: runnerShare,
        comparison: leaderShare,
        delta: runnerShare - leaderShare,
        deltaPct: null,
        factText: `${runnerUp.name} is the second-largest source at ${runnerShare.toFixed(1)}% of revenue (${zar(runnerUp.revenue)}).`,
      });
    }
  }

  // --- Data quality -------------------------------------------------------
  const missingCapacity = months.filter((month) => num(snapshot.capacity_days, month) <= 0);
  if (missingCapacity.length > 0) {
    flags.push({
      id: "capacity-missing",
      severity: "high",
      month: null,
      metric: "data_quality",
      value: missingCapacity.length,
      comparison: months.length,
      delta: missingCapacity.length,
      deltaPct: null,
      factText: `${missingCapacity.length} of ${months.length} months have no sellable capacity recorded, so occupancy cannot be calculated for them — check the room count in the property's report settings.`,
    });
  }

  return flags
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return Math.abs(b.delta) - Math.abs(a.delta);
    })
    .slice(0, t.maxFlags);
}

/** Compact, model-friendly digest of the run's headline figures. */
export function summariseSnapshot(snapshot: AnomalySnapshot): Record<string, unknown> {
  const months = Array.isArray(snapshot.months) ? snapshot.months : [];
  return {
    room_count: snapshot.room_count,
    months: months.map((month) => ({
      month,
      otb_revenue: num(snapshot.otb_revenue, month),
      previous_otb_revenue: num(snapshot.previous_otb_revenue, month),
      last_year_actual: num(snapshot.last_year_actual, month),
      room_nights: num(snapshot.room_nights, month),
      last_year_room_nights: num(snapshot.last_year_room_nights, month),
      capacity_days: num(snapshot.capacity_days, month),
      adr: num(snapshot.adr, month),
      occupancy: num(snapshot.occupancy, month),
      additional_revenue: num(snapshot.additional_revenue, month),
    })),
    source_breakdown: snapshot.source_breakdown ?? {},
    totals: snapshot.totals ?? {},
  };
}
