/**
 * Specials eligibility + price-effect resolver (direct bookings).
 *
 * Given a stay, the booking moment and the rooms/rate plans in the cart, this
 * returns every eligible special with its computed price effect. Consumers:
 *  - exactly one eligible special  -> auto-apply (best price, no guest action)
 *  - two or more eligible specials -> guest picks ONE (non-stackable offers)
 *  - stackable specials remain additive on top of the chosen offer
 */

export type DealType =
  | "basic"
  | "last_minute"
  | "advance_purchase"
  | "long_stay"
  | "rate_grid"
  | "package";

export type SpecialAudience = "everyone" | "subscribers";

export interface StayDateRange {
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd
}

export interface SpecialRecord {
  id: string;
  property_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  deal_type?: DealType | null;
  special_type?: string | null;
  discount_percent?: number | null;
  fixed_amount?: number | null;
  fixed_price?: number | null;
  currency?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  book_from?: string | null;
  book_until?: string | null;
  min_stay?: number | null;
  max_stay?: number | null;
  lead_days_min?: number | null;
  lead_days_max?: number | null;
  lead_hours_max?: number | null;
  dow_mask?: string[] | null;
  stay_date_ranges?: StayDateRange[] | null;
  audience?: SpecialAudience | null;
  is_stackable?: boolean | null;
  priority?: number | null;
  rounding_mode?: string | null;
  price_pointing?: string | null;
  applicable_room_ids?: string[] | null;
  applicable_rate_plan_ids?: string[] | null;
  cancellation_policy_id?: string | null;
  terms?: string | null;
  included_items?: unknown;
  is_active?: boolean | null;
  is_public?: boolean | null;
  age_restricted?: boolean | null;
  min_age?: number | null;
  max_age?: number | null;
  age_label?: string | null;
}

export interface ResolveContext {
  /** Check-in date (yyyy-MM-dd). */
  checkIn: string;
  /** Check-out date (yyyy-MM-dd). */
  checkOut: string;
  /** Gross accommodation subtotal before any special. */
  subtotal: number;
  /** Room type / unit identifiers in the cart (any id shape used by the property). */
  roomIds?: string[];
  /** Rate plan ids in the cart. */
  ratePlanIds?: string[];
  /** Moment the booking is being made. Defaults to now. */
  now?: Date;
  /** True when the guest qualifies for subscriber-only "secret" deals. */
  isSubscriber?: boolean;
  /** Age gate satisfied (for age-restricted specials). */
  ageVerified?: boolean;
}

export interface SpecialOffer {
  special: SpecialRecord;
  /** Absolute currency amount removed from the subtotal (never negative). */
  discountAmount: number;
  /** Subtotal after this special is applied. */
  newSubtotal: number;
  /** Short human label, e.g. "10% off" or "Fixed R1 200". */
  label: string;
  stackable: boolean;
  cancellationPolicyId: string | null;
}

const DOW_KEYS = ["su", "mo", "tu", "we", "th", "fr", "sa"] as const;

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00`);

export const nightsBetween = (checkIn: string, checkOut: string): number => {
  const ms = toDate(checkOut).getTime() - toDate(checkIn).getTime();
  return Math.max(0, Math.round(ms / 86400000));
};

/** Hours between the booking moment and check-in (can be negative for past stays). */
export const hoursUntilCheckIn = (checkIn: string, now: Date): number =>
  (toDate(checkIn).getTime() - now.getTime()) / 3600000;

const stayDates = (checkIn: string, checkOut: string): Date[] => {
  const out: Date[] = [];
  const start = toDate(checkIn);
  const total = nightsBetween(checkIn, checkOut) || 1;
  for (let i = 0; i < total; i++) out.push(new Date(start.getTime() + i * 86400000));
  return out;
};

const withinRanges = (ranges: StayDateRange[], checkIn: string, checkOut: string): boolean => {
  if (!ranges.length) return true;
  return ranges.some((r) => {
    if (!r?.start || !r?.end) return false;
    return checkIn <= r.end && checkOut >= r.start;
  });
};

/**
 * `mode` = round to the nearest N (e.g. "1", "5", "10", "100").
 * `pointing` = cents/units ending, e.g. "0.99" or "0.95" ("none" to skip).
 */
const roundPrice = (value: number, mode?: string | null, pointing?: string | null): number => {
  let out = value;
  const step = mode && mode !== "none" ? Number(mode) : NaN;
  if (Number.isFinite(step) && step > 0) out = Math.round(out / step) * step;
  if (pointing && pointing !== "none") {
    const ending = Number(pointing);
    if (Number.isFinite(ending) && ending >= 0 && ending < 1) {
      out = Math.max(0, Math.floor(out) - (out >= 1 ? 1 : 0) + ending);
    }
  }
  return Math.max(0, Math.round(out * 100) / 100);
};

/** Compute the discount amount a special removes from the given subtotal. */
export function specialDiscountAmount(special: SpecialRecord, subtotal: number, nights: number): number {
  const type = special.special_type ?? "discount";
  if (type === "discount" || type === "percentage") {
    const pct = Number(special.discount_percent ?? 0);
    if (!pct) return 0;
    return Math.max(0, (subtotal * pct) / 100);
  }
  if (type === "fixed_off") {
    return Math.min(subtotal, Math.max(0, Number(special.fixed_amount ?? 0)));
  }
  if (type === "fixed_price") {
    const price = Number(special.fixed_price ?? 0);
    if (!price) return 0;
    // Fixed price is per night when a nightly figure makes sense, else total.
    const target = price * Math.max(1, nights);
    return Math.max(0, subtotal - Math.min(subtotal, target));
  }
  return 0;
}

export function specialLabel(special: SpecialRecord): string {
  const type = special.special_type ?? "discount";
  if (type === "discount" || type === "percentage") return `${special.discount_percent ?? 0}% off`;
  if (type === "fixed_off") return `${special.fixed_amount ?? 0} off`;
  if (type === "fixed_price") return `Fixed rate ${special.fixed_price ?? 0}`;
  if (type === "package") return "Package";
  return "Special";
}

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  basic: "Basic",
  last_minute: "Last minute",
  advance_purchase: "Advance purchase",
  long_stay: "Long stay",
  rate_grid: "Rate grid",
  package: "Package",
};

/** Is this special eligible for the given stay/booking moment? */
export function isSpecialEligible(special: SpecialRecord, ctx: ResolveContext): boolean {
  if (special.is_active === false) return false;
  const now = ctx.now ?? new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nights = nightsBetween(ctx.checkIn, ctx.checkOut);

  // Booking window (when the guest may book)
  if (special.book_from && todayStr < special.book_from) return false;
  if (special.book_until && todayStr > special.book_until) return false;

  // Stay validity window
  if (special.valid_from && ctx.checkOut < special.valid_from) return false;
  if (special.valid_to && ctx.checkIn > special.valid_to) return false;
  if (!withinRanges(special.stay_date_ranges ?? [], ctx.checkIn, ctx.checkOut)) return false;

  // Stay length
  if (special.min_stay && nights < special.min_stay) return false;
  if (special.max_stay && nights > special.max_stay) return false;

  // Lead time rules
  const hours = hoursUntilCheckIn(ctx.checkIn, now);
  const days = hours / 24;
  if (special.lead_days_min != null && days < special.lead_days_min) return false;
  if (special.lead_days_max != null && days > special.lead_days_max) return false;
  if (special.lead_hours_max != null && hours > special.lead_hours_max) return false;

  // Stay weekdays
  const mask = special.dow_mask ?? null;
  if (mask && mask.length && mask.length < 7) {
    const covered = stayDates(ctx.checkIn, ctx.checkOut).some((d) => mask.includes(DOW_KEYS[d.getDay()]));
    if (!covered) return false;
  }

  // Audience
  if (special.audience === "subscribers" && !ctx.isSubscriber) return false;

  // Age gate
  if (special.age_restricted && !ctx.ageVerified) return false;

  // Room / rate-plan scoping
  const rooms = special.applicable_room_ids ?? null;
  if (rooms && rooms.length && ctx.roomIds?.length) {
    const hit = ctx.roomIds.some((r) => rooms.includes(r) || rooms.includes(String(r)));
    if (!hit) return false;
  }
  const plans = special.applicable_rate_plan_ids ?? null;
  if (plans && plans.length && ctx.ratePlanIds?.length) {
    const hit = ctx.ratePlanIds.some((p) => plans.includes(p));
    if (!hit) return false;
  }

  return true;
}

/**
 * Resolve all eligible specials as offers, best guest value first.
 * Non-stackable offers are mutually exclusive (guest picks one).
 */
export function resolveSpecialOffers(specials: SpecialRecord[], ctx: ResolveContext): SpecialOffer[] {
  const nights = nightsBetween(ctx.checkIn, ctx.checkOut);
  const offers: SpecialOffer[] = [];
  for (const special of specials) {
    if (!isSpecialEligible(special, ctx)) continue;
    const raw = specialDiscountAmount(special, ctx.subtotal, nights);
    if (raw <= 0 && (special.special_type ?? "discount") !== "package") continue;
    const newSubtotal = roundPrice(ctx.subtotal - raw, special.rounding_mode, special.price_pointing);
    const discountAmount = Math.max(0, Math.round((ctx.subtotal - newSubtotal) * 100) / 100);
    offers.push({
      special,
      discountAmount,
      newSubtotal,
      label: specialLabel(special),
      stackable: special.is_stackable === true,
      cancellationPolicyId: special.cancellation_policy_id ?? null,
    });
  }
  return offers.sort(
    (a, b) => b.discountAmount - a.discountAmount || (b.special.priority ?? 0) - (a.special.priority ?? 0),
  );
}

/** Offers the guest must choose between (one-of-N). */
export const exclusiveOffers = (offers: SpecialOffer[]): SpecialOffer[] => offers.filter((o) => !o.stackable);

/** Offers that always apply alongside the chosen one. */
export const stackableOffers = (offers: SpecialOffer[]): SpecialOffer[] => offers.filter((o) => o.stackable);
