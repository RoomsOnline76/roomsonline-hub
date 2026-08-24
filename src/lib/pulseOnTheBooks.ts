/**
 * On-the-books (OTB) maths for Property Pulse.
 *
 * The dashboard used to zero every future period, so business already sold —
 * confirmed, deposit-paid, fully paid — was invisible and the forecast was a
 * blind extrapolation of the past. These helpers turn held business into a
 * first-class series and turn the forecast into "what we hold + what history
 * says still arrives".
 *
 * Nothing in here touches the network: callers pass the bookings they already
 * fetched (native bookings and normalised PMS reservations share one shape).
 */

export interface PulseBookingLike {
  check_in_date?: string | null;
  check_out_date?: string | null;
  created_at?: string | null;
  total_price?: number | string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_paid?: number | string | null;
  deposit_amount?: number | string | null;
  balance_due?: number | string | null;
}

/** Statuses that represent business we can bank on. */
const FIRM_STATUSES = new Set(["confirmed", "checked_in", "checked_out", "completed"]);
/** Statuses that never count towards OTB. */
const DEAD_STATUSES = new Set(["cancelled", "failed", "declined", "expired", "no_show", "rejected"]);

const num = (value: number | string | null | undefined): number => {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? Number(n) : 0;
};

export const isDeadBooking = (b: PulseBookingLike): boolean =>
  DEAD_STATUSES.has((b.status || "").toLowerCase());

export const isFirmBooking = (b: PulseBookingLike): boolean =>
  FIRM_STATUSES.has((b.status || "").toLowerCase());

export interface OtbSplit {
  /** Live (non-cancelled) bookings counted. */
  bookings: number;
  /** Live bookings whose status is firm. */
  firmBookings: number;
  /** Live bookings still provisional (pending / on hold). */
  provisionalBookings: number;
  /** Total value of live bookings. */
  revenue: number;
  /** Value of firm bookings only. */
  firmRevenue: number;
  /** Value of provisional bookings only. */
  provisionalRevenue: number;
  /** Cash actually received. */
  paid: number;
  /** Received cash that is only a deposit (balance still outstanding). */
  deposit: number;
  /** Value still to be collected. */
  outstanding: number;
  /** Nights held (check-out minus check-in, min 1). */
  nights: number;
}

export const emptyOtbSplit = (): OtbSplit => ({
  bookings: 0,
  firmBookings: 0,
  provisionalBookings: 0,
  revenue: 0,
  firmRevenue: 0,
  provisionalRevenue: 0,
  paid: 0,
  deposit: 0,
  outstanding: 0,
  nights: 0,
});

const nightsOf = (b: PulseBookingLike): number => {
  if (!b.check_in_date || !b.check_out_date) return 1;
  const inMs = new Date(b.check_in_date).getTime();
  const outMs = new Date(b.check_out_date).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return 1;
  return Math.max(1, Math.round((outMs - inMs) / 86_400_000));
};

/**
 * Fold one booking into a running split. Cash is read from the payment fields
 * so a deposit-only booking is never presented as fully banked: `paid` is what
 * actually arrived, `deposit` the part of it that still has a balance behind it.
 */
export const addToOtbSplit = (split: OtbSplit, b: PulseBookingLike): OtbSplit => {
  if (isDeadBooking(b)) return split;

  const value = num(b.total_price);
  const firm = isFirmBooking(b);
  const paidRaw = num(b.amount_paid);
  const balance = num(b.balance_due);
  // Some rows carry no amount_paid but a payment_status of paid (channel-settled
  // and legacy imports), so fall back to the booking value in that case.
  const paid =
    paidRaw > 0
      ? paidRaw
      : (b.payment_status || "").toLowerCase() === "paid"
        ? value
        : 0;
  const partOnly = paid > 0 && (balance > 0 || paid + 0.01 < value);

  split.bookings += 1;
  split.revenue += value;
  split.nights += nightsOf(b);
  if (firm) {
    split.firmBookings += 1;
    split.firmRevenue += value;
  } else {
    split.provisionalBookings += 1;
    split.provisionalRevenue += value;
  }
  split.paid += paid;
  if (partOnly) split.deposit += paid;
  split.outstanding += Math.max(0, value - paid);
  return split;
};

export const summariseOtb = (bookings: PulseBookingLike[]): OtbSplit =>
  bookings.reduce((acc, b) => addToOtbSplit(acc, b), emptyOtbSplit());

/**
 * Share of provisional (pending) business that historically converted rather
 * than falling away. Used to haircut held-but-not-firm business inside the
 * forecast so a wall of unconfirmed enquiries can't inflate the outlook.
 */
export const provisionalRealisationRate = (history: PulseBookingLike[]): number => {
  let firm = 0;
  let dead = 0;
  for (const b of history) {
    if (isFirmBooking(b)) firm += 1;
    else if (isDeadBooking(b)) dead += 1;
  }
  const decided = firm + dead;
  // With too little history to judge, assume most held business sticks: the
  // guest has already chosen us, they just haven't paid yet.
  if (decided < 10) return 0.75;
  return Math.min(1, Math.max(0.1, firm / decided));
};

/**
 * Booking curve: for each lead time (days between booking and arrival), the
 * share of a period's eventual demand that is already on the books that far out.
 *
 * Built from bookings that have already arrived, so it reflects how this
 * portfolio actually sells rather than a generic assumption.
 */
export interface BookingCurve {
  /** Share of final demand on the books `daysOut` before arrival (0-1]. */
  onBooksShare: (daysOut: number) => number;
  /** How many historical bookings the curve was derived from. */
  sample: number;
}

export const buildBookingCurve = (history: PulseBookingLike[]): BookingCurve => {
  const leadTimes: number[] = [];
  for (const b of history) {
    if (isDeadBooking(b)) continue;
    if (!b.check_in_date || !b.created_at) continue;
    const arrival = new Date(b.check_in_date).getTime();
    const booked = new Date(b.created_at).getTime();
    if (!Number.isFinite(arrival) || !Number.isFinite(booked)) continue;
    leadTimes.push(Math.max(0, Math.round((arrival - booked) / 86_400_000)));
  }

  const sample = leadTimes.length;
  if (sample < 12) {
    // Not enough history for a curve. Fall back to a gentle generic shape:
    // roughly half of demand for a period two months out is still to come.
    return {
      sample,
      onBooksShare: (daysOut: number) => {
        if (daysOut <= 0) return 1;
        return Math.min(1, Math.max(0.2, 1 / (1 + daysOut / 60)));
      },
    };
  }

  leadTimes.sort((a, b) => a - b);
  return {
    sample,
    onBooksShare: (daysOut: number) => {
      if (daysOut <= 0) return 1;
      // A booking is on the books `daysOut` before arrival when its lead time
      // is at least `daysOut`.
      let atOrAbove = 0;
      for (let i = leadTimes.length - 1; i >= 0; i -= 1) {
        if (leadTimes[i] >= daysOut) atOrAbove += 1;
        else break;
      }
      // Never claim the books are empty; a 5% floor keeps the pickup multiplier
      // finite for very distant periods.
      return Math.min(1, Math.max(0.05, atOrAbove / leadTimes.length));
    },
  };
};

export interface PickupInput {
  /** Value (or count) already held for the period. */
  otb: number;
  /** Firm portion of `otb` — the forecast can never fall below this. */
  firm: number;
  /** Days between today and the period's arrival date. */
  daysOut: number;
  curve: BookingCurve;
  /** Conversion rate applied to the provisional portion of `otb`. */
  realisation: number;
  /** Statistical (trend) view of the period, used when nothing is held yet. */
  trend?: number | null;
}

export interface PickupResult {
  /** OTB after haircutting provisional business. */
  expectedOtb: number;
  /** Additional business history says still arrives. */
  pickup: number;
  /** expectedOtb + pickup. */
  forecast: number;
  /** Floor for confidence bands: business already firm. */
  floor: number;
}

/**
 * Forecast a future period as held business plus expected remaining pickup.
 *
 * Uncertainty belongs to the pickup component only — what is already sold is
 * not a guess — so callers widen their bands around `pickup`, never below
 * `floor`.
 */
export const forecastWithPickup = ({
  otb,
  firm,
  daysOut,
  curve,
  realisation,
  trend,
}: PickupInput): PickupResult => {
  const provisional = Math.max(0, otb - firm);
  const expectedOtb = firm + provisional * realisation;
  const share = curve.onBooksShare(Math.max(0, daysOut));
  // Pickup multiplier: holding 40% of a period's usual demand implies 1.5x more
  // still to come. Capped so a near-empty distant period can't explode.
  const multiplier = Math.min(9, Math.max(0, 1 / share - 1));
  let pickup = expectedOtb * multiplier;

  // With nothing on the books yet the multiplier has nothing to scale, so lean
  // on the statistical trend for the portion of the period still open to sell.
  if (expectedOtb <= 0 && trend && trend > 0) {
    pickup = trend * (1 - share);
  }

  const forecast = expectedOtb + pickup;
  return { expectedOtb, pickup, forecast, floor: firm };
};

/**
 * Same-time-last-year cut-off: the point in the prior year's booking cycle that
 * matches where we stand today. Prior-year bookings created after this instant
 * had not yet been sold at the equivalent moment, so they are excluded from a
 * pace comparison.
 */
export const stlyCutoff = (asAt: Date = new Date()): Date => {
  const cutoff = new Date(asAt);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  cutoff.setHours(23, 59, 59, 999);
  return cutoff;
};

/** True when a prior-year booking was already on the books at the STLY cut-off. */
export const wasOnBooksAt = (b: PulseBookingLike, cutoff: Date): boolean => {
  if (!b.created_at) return true; // No capture date: treat as long-held business.
  const booked = new Date(b.created_at).getTime();
  if (!Number.isFinite(booked)) return true;
  return booked <= cutoff.getTime();
};

export const daysBetween = (from: Date, to: Date): number =>
  Math.round((to.getTime() - from.getTime()) / 86_400_000);
