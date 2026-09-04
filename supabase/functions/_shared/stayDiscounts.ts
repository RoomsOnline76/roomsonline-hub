/**
 * Stay discounts — packages and specials, decided by the engine (Phase 3).
 *
 * The booking page used to evaluate packages and specials in the browser, so
 * the discount the guest saw was never the discount the server could prove.
 * This module holds that arithmetic as pure functions with no database and no
 * DOM, and mirrors the live selection rules exactly:
 *
 *   1. at most ONE package applies (the first whose window covers the stay)
 *   2. specials are then evaluated on the post-package basis
 *   3. non-stackable specials are mutually exclusive — best guest value wins,
 *      unless the guest explicitly chose one
 *   4. stackable specials always add on top
 *
 * Nothing here reduces a stay below zero.
 */

const DOW_KEYS = ["su", "mo", "tu", "we", "th", "fr", "sa"] as const;

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const round2 = (n: number) => Math.round(n * 100) / 100;
const dayOnly = (v: unknown): string => String(v ?? "").split("T")[0];

export const nightsBetween = (checkIn: string, checkOut: string): number =>
  Math.max(0, Math.round((toDate(checkOut).getTime() - toDate(checkIn).getTime()) / 86400000));

export interface DiscountStay {
  checkIn: string;
  checkOut: string;
  /** Accommodation subtotal the discounts bite into. */
  subtotal: number;
  rooms?: number;
  roomIds?: (string | number)[];
  ratePlanIds?: string[];
  ageVerified?: boolean;
  isSubscriber?: boolean;
  now?: Date;
}

// deno-lint-ignore no-explicit-any
export type PackageRow = Record<string, any>;
// deno-lint-ignore no-explicit-any
export type SpecialRow = Record<string, any>;

export interface DiscountLine {
  id: string | null;
  name: string;
  kind: "package" | "special";
  discount: number;
  stackable: boolean;
  age_restricted: boolean;
  cancellation_policy_id: string | null;
}

export interface StayDiscountResult {
  lines: DiscountLine[];
  /** Every special that qualified, whether or not it was applied. */
  eligible_specials: DiscountLine[];
  discount_total: number;
  net_total: number;
}

/** The one package that applies to this stay, if any. */
export function eligiblePackage(packages: PackageRow[], stay: DiscountStay): DiscountLine | null {
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  for (const pkg of packages || []) {
    if (pkg?.is_active === false) continue;
    const start = dayOnly(pkg?.periodFrom ?? pkg?.valid_from ?? pkg?.start_date);
    const end = dayOnly(pkg?.periodTo ?? pkg?.valid_to ?? pkg?.end_date);
    if (!start || !end) continue;
    if (!(stay.checkIn >= start && stay.checkOut <= end)) continue;

    const minStay = Number(pkg?.minimumStay ?? pkg?.min_nights ?? pkg?.min_stay ?? 0) || 0;
    if (minStay > 0 && nights < minStay) continue;

    const name = String(pkg?.name || "Package Deal");
    const fixed = Number(pkg?.package_price ?? 0);
    if (fixed > 0) {
      const discount = round2(stay.subtotal - fixed);
      if (discount > 0) {
        return { id: pkg?.id ? String(pkg.id) : null, name, kind: "package", discount, stackable: true, age_restricted: false, cancellation_policy_id: null };
      }
      return null;
    }

    const pct = Number(pkg?.discount_percentage ?? pkg?.discountPercent ?? 0) || 0;
    if (pct > 0) {
      const discount = Math.round(stay.subtotal * (pct / 100));
      if (discount > 0) {
        return { id: pkg?.id ? String(pkg.id) : null, name: `${name} (-${pct}%)`, kind: "package", discount, stackable: true, age_restricted: false, cancellation_policy_id: null };
      }
    }
    return null;
  }
  return null;
}

/** Is this special eligible for the stay and the booking moment? */
export function specialIsEligible(special: SpecialRow, stay: DiscountStay): boolean {
  if (special?.is_active === false) return false;
  const now = stay.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);

  if (special.book_from && today < dayOnly(special.book_from)) return false;
  if (special.book_until && today > dayOnly(special.book_until)) return false;
  if (special.valid_from && stay.checkOut < dayOnly(special.valid_from)) return false;
  if (special.valid_to && stay.checkIn > dayOnly(special.valid_to)) return false;

  const ranges = Array.isArray(special.stay_date_ranges) ? special.stay_date_ranges : [];
  if (ranges.length > 0) {
    // deno-lint-ignore no-explicit-any
    const hit = ranges.some((r: any) => r?.start && r?.end && stay.checkIn <= dayOnly(r.end) && stay.checkOut >= dayOnly(r.start));
    if (!hit) return false;
  }

  const minStay = Number(special.min_stay ?? 0) || 0;
  const maxStay = Number(special.max_stay ?? 0) || 0;
  if (minStay > 0 && nights < minStay) return false;
  if (maxStay > 0 && nights > maxStay) return false;

  const hours = (toDate(stay.checkIn).getTime() - now.getTime()) / 3600000;
  const days = hours / 24;
  if (special.lead_days_min != null && days < Number(special.lead_days_min)) return false;
  if (special.lead_days_max != null && days > Number(special.lead_days_max)) return false;
  if (special.lead_hours_max != null && hours > Number(special.lead_hours_max)) return false;

  const mask: string[] | null = Array.isArray(special.dow_mask) ? special.dow_mask : null;
  if (mask && mask.length > 0 && mask.length < 7) {
    let covered = false;
    for (let i = 0; i < Math.max(1, nights); i++) {
      const d = new Date(toDate(stay.checkIn).getTime() + i * 86400000);
      if (mask.includes(DOW_KEYS[d.getUTCDay()])) { covered = true; break; }
    }
    if (!covered) return false;
  }

  if (special.audience === "subscribers" && !stay.isSubscriber) return false;
  if (special.age_restricted && !stay.ageVerified) return false;

  const rooms = special.applicable_room_ids;
  if (Array.isArray(rooms) && rooms.length > 0 && (stay.roomIds?.length ?? 0) > 0) {
    const hit = stay.roomIds!.some((r) => rooms.includes(r) || rooms.includes(String(r)) || rooms.includes(Number(r)));
    if (!hit) return false;
  }
  const plans = special.applicable_rate_plan_ids;
  if (Array.isArray(plans) && plans.length > 0 && (stay.ratePlanIds?.length ?? 0) > 0) {
    const hit = stay.ratePlanIds!.some((p) => plans.includes(p));
    if (!hit) return false;
  }
  return true;
}

/** What this special takes off the given basis. */
export function specialDiscount(special: SpecialRow, basis: number): number {
  const type = String(special.special_type || special.discount_type || "discount");
  if (type === "discount" || type === "percentage") {
    const pct = Number(special.discount_percent ?? special.discount_value ?? 0) || 0;
    return pct > 0 ? Math.round(basis * (pct / 100)) : 0;
  }
  if (type === "fixed_amount" || type === "fixed_off") {
    const amt = Number(special.fixed_amount ?? special.discount_value ?? 0) || 0;
    return amt > 0 ? Math.min(basis, amt) : 0;
  }
  if (type === "fixed_price") {
    const price = Number(special.fixed_price ?? special.discount_value ?? 0) || 0;
    return price > 0 ? Math.max(0, basis - price) : 0;
  }
  return 0;
}

export function specialLine(special: SpecialRow, basis: number): DiscountLine | null {
  const discount = specialDiscount(special, basis);
  if (!(discount > 0)) return null;
  return {
    id: special.id ? String(special.id) : null,
    name: String(special.title || special.name || "Special Offer"),
    kind: "special",
    discount: round2(discount),
    stackable: special.is_stackable === true,
    age_restricted: special.age_restricted === true,
    cancellation_policy_id: special.cancellation_policy_id ? String(special.cancellation_policy_id) : null,
  };
}

/**
 * Full discount picture for a stay: one package, then the specials that stand
 * on top of it. `selectedSpecialId` honours a guest's one-of-N choice.
 */
export function stayDiscounts(
  stay: DiscountStay,
  packages: PackageRow[],
  specials: SpecialRow[],
  selectedSpecialId?: string | null,
): StayDiscountResult {
  const lines: DiscountLine[] = [];
  if (!(stay.subtotal > 0)) {
    return { lines, eligible_specials: [], discount_total: 0, net_total: round2(Math.max(0, stay.subtotal)) };
  }

  const pkg = eligiblePackage(packages || [], stay);
  if (pkg) lines.push(pkg);

  const basis = Math.max(0, round2(stay.subtotal - (pkg?.discount ?? 0)));
  const eligible: DiscountLine[] = [];
  for (const special of specials || []) {
    if (!specialIsEligible(special, stay)) continue;
    const line = specialLine(special, basis);
    if (line) eligible.push(line);
  }

  const stackable = eligible.filter((l) => l.stackable);
  const exclusive = eligible.filter((l) => !l.stackable);
  const chosen = selectedSpecialId
    ? exclusive.find((l) => l.id === String(selectedSpecialId))
    : undefined;
  const best = chosen ?? [...exclusive].sort((a, b) => b.discount - a.discount)[0];
  if (best) lines.push(best);
  lines.push(...stackable);

  const raw = lines.reduce((s, l) => s + l.discount, 0);
  const discount_total = round2(Math.min(stay.subtotal, raw));
  return {
    lines,
    eligible_specials: eligible,
    discount_total,
    net_total: round2(Math.max(0, stay.subtotal - discount_total)),
  };
}
