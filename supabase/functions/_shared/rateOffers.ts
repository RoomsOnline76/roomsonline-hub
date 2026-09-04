/**
 * Rate-plan offer eligibility (pure).
 *
 * A guest searching N nights may only be shown the rate plans that accept an
 * N-night stay. The rule mirrors how the channel behaves: a 1-night search sees
 * only the plans with no minimum, a 2-night search additionally sees the
 * 2-night plans, a 3-night search sees everything up to a 3-night minimum.
 *
 * The effective minimum for a plan is the strictest of
 *   • the plan's own `min_stay`, and
 *   • any dated LOS window (event weekend) that overlaps the stay and either
 *     applies to every unit or to the unit being priced.
 *
 * No database access here — the loader hands the snapshot in.
 */

export interface OfferWindow {
  /** Inclusive first night of the window (null = not dated). */
  start_date: string | null;
  /** Inclusive last night of the window. */
  end_date: string | null;
  /** Optional unit scope; null = every unit the plan sells. */
  room_type_id?: string | null;
  /** Minimum nights this window demands. */
  min_stay_nights?: number | null;
  /** Maximum nights this window allows. */
  max_stay_nights?: number | null;
  /** No arrivals inside the window. */
  closed_to_arrival?: boolean | null;
  /** No departures inside the window. */
  closed_to_departure?: boolean | null;
}

export interface OfferPlan {
  rate_plan_id: string;
  name: string | null;
  min_stay?: number | null;
  max_stay?: number | null;
  /** ROL'OS room type ids this plan is linked to. */
  room_type_ids: string[];
  windows?: OfferWindow[];
}

export interface OfferStay {
  /** First night (ISO date). */
  from: string;
  /** Last night (ISO date, inclusive). */
  to: string;
  nights: number;
  /** ROL'OS room type id being priced. */
  room_type_id: string;
}

export interface OfferEligibility {
  eligible: boolean;
  min_stay: number;
  max_stay: number | null;
  reason?: "unit" | "min_stay" | "max_stay" | "closed_to_arrival" | "closed_to_departure";
}

/**
 * One row of the operator's Minimum Stay Entry form, as stored in
 * `rolos_stay_restrictions`.
 */
export interface StayRule {
  start_date: string | null;
  end_date: string | null;
  room_type_id?: string | null;
  min_stay?: number | null;
  max_stay?: number | null;
  /** Minimum for the arrival weekdays listed below. */
  days_of_week?: number[] | null;
  /** Minimum that applies when the arrival weekday is not listed. */
  other_days_min_stay?: number | null;
  /** Stop applying the rule when arrival is this close (in days). */
  ignore_within_days?: number | null;
  closed_to_arrival?: boolean | null;
  closed_to_departure?: boolean | null;
  is_active?: boolean | null;
}

/** UTC weekday of an ISO date, 0 = Sunday (matches the form's checkboxes). */
const isoWeekday = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

/**
 * Turn a saved stay rule into the offer window that applies to this stay, or
 * null when the rule is off, out of range, or ignored this close to arrival.
 */
export function stayRuleWindow(rule: StayRule, stay: OfferStay, todayIso: string): OfferWindow | null {
  if (rule.is_active === false) return null;
  const ignoreWithin = Number(rule.ignore_within_days ?? 0);
  if (ignoreWithin > 0 && daysBetween(todayIso, stay.from) < ignoreWithin) return null;
  const window: OfferWindow = {
    start_date: rule.start_date ?? null,
    end_date: rule.end_date ?? null,
    room_type_id: rule.room_type_id ?? null,
    closed_to_arrival: rule.closed_to_arrival ?? false,
    closed_to_departure: rule.closed_to_departure ?? false,
    max_stay_nights: rule.max_stay ?? null,
  };
  if (!windowOverlapsStay(window, stay)) return null;
  const days = rule.days_of_week ?? [];
  const arrivalListed = days.length === 0 || days.includes(isoWeekday(stay.from));
  window.min_stay_nights = arrivalListed ? (rule.min_stay ?? null) : (rule.other_days_min_stay ?? null);
  return window;
}


const positive = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** Does a dated window overlap the stay's nights? */
export function windowOverlapsStay(window: OfferWindow, stay: OfferStay): boolean {
  if (!window.start_date || !window.end_date) return false;
  return window.start_date <= stay.to && window.end_date >= stay.from;
}

/** Strictest minimum nights the plan demands for this stay/unit. */
export function effectiveMinStay(plan: OfferPlan, stay: OfferStay): number {
  let min = positive(plan.min_stay) ?? 1;
  for (const window of plan.windows ?? []) {
    const windowMin = positive(window.min_stay_nights);
    if (!windowMin) continue;
    if (window.room_type_id && String(window.room_type_id) !== String(stay.room_type_id)) continue;
    if (!windowOverlapsStay(window, stay)) continue;
    if (windowMin > min) min = windowMin;
  }
  return min;
}

/** Windows that apply to this stay and unit. */
const applicableWindows = (plan: OfferPlan, stay: OfferStay): OfferWindow[] =>
  (plan.windows ?? []).filter((w) =>
    (!w.room_type_id || String(w.room_type_id) === String(stay.room_type_id)) && windowOverlapsStay(w, stay)
  );

export function offerEligibility(plan: OfferPlan, stay: OfferStay): OfferEligibility {
  const min = effectiveMinStay(plan, stay);
  const windows = applicableWindows(plan, stay);
  // Window maxima are stricter than the plan's own ceiling.
  const windowMax = windows
    .map((w) => positive(w.max_stay_nights))
    .filter((n): n is number => n !== null);
  const max = [positive(plan.max_stay), ...windowMax]
    .filter((n): n is number => n !== null)
    .reduce<number | null>((acc, n) => (acc === null || n < acc ? n : acc), null);
  const sellsUnit = plan.room_type_ids.some((id) => String(id) === String(stay.room_type_id));
  if (!sellsUnit) return { eligible: false, min_stay: min, max_stay: max, reason: "unit" };
  if (windows.some((w) => w.closed_to_arrival && (!w.start_date || w.start_date <= stay.from) && (!w.end_date || w.end_date >= stay.from))) {
    return { eligible: false, min_stay: min, max_stay: max, reason: "closed_to_arrival" };
  }
  if (windows.some((w) => w.closed_to_departure && (!w.start_date || w.start_date <= stay.to) && (!w.end_date || w.end_date >= stay.to))) {
    return { eligible: false, min_stay: min, max_stay: max, reason: "closed_to_departure" };
  }
  if (stay.nights < min) return { eligible: false, min_stay: min, max_stay: max, reason: "min_stay" };
  if (max !== null && stay.nights > max) return { eligible: false, min_stay: min, max_stay: max, reason: "max_stay" };
  return { eligible: true, min_stay: min, max_stay: max };
}

/** The plans a guest may be offered for this stay, in the order given. */
export function eligibleOffers(plans: OfferPlan[], stay: OfferStay): OfferPlan[] {
  return plans.filter((plan) => offerEligibility(plan, stay).eligible);
}

export interface OfferVerdict {
  plan: OfferPlan;
  eligibility: OfferEligibility;
}

/**
 * Every plan with its verdict, kept in the order given. The caller publishes the
 * eligible ones as bookable rates and the rest as "why not" rows, so a guest is
 * never left with an empty list and no explanation.
 */
export function offerVerdicts(plans: OfferPlan[], stay: OfferStay): OfferVerdict[] {
  return plans.map((plan) => ({ plan, eligibility: offerEligibility(plan, stay) }));
}

/** Guest-facing sentence for a rejection reason. */
export function offerReasonText(v: OfferEligibility): string | null {
  switch (v.reason) {
    case "min_stay":
      return `Needs at least ${v.min_stay} night${v.min_stay === 1 ? "" : "s"}`;
    case "max_stay":
      return v.max_stay ? `Allows at most ${v.max_stay} night${v.max_stay === 1 ? "" : "s"}` : "Stay is too long";
    case "closed_to_arrival":
      return "No arrivals on this date";
    case "closed_to_departure":
      return "No departures on this date";
    case "unit":
      return "Not sold for this room";
    default:
      return null;
  }
}

const eachDate = (fromIso: string, toIso: string): string[] => {
  const out: string[] = [];
  const end = Date.parse(`${toIso}T00:00:00Z`);
  for (let t = Date.parse(`${fromIso}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};

const clampedWindowDates = (w: OfferWindow, fromIso: string, toIso: string): string[] => {
  const start = w.start_date && w.start_date > fromIso ? w.start_date : fromIso;
  const end = w.end_date && w.end_date < toIso ? w.end_date : toIso;
  if (start > end) return [];
  return eachDate(start, end);
};

/**
 * Dates inside [from, to] on which a guest may not arrive / depart, for the
 * windows that apply to this unit. Lets the date picker grey them out instead of
 * silently dropping the offer.
 */
export function closedDates(
  windows: OfferWindow[],
  unitId: string | null,
  fromIso: string,
  toIso: string,
): { arrival: string[]; departure: string[] } {
  const arrival = new Set<string>();
  const departure = new Set<string>();
  for (const w of windows) {
    if (w.room_type_id && unitId && String(w.room_type_id) !== String(unitId)) continue;
    if (!w.closed_to_arrival && !w.closed_to_departure) continue;
    for (const d of clampedWindowDates(w, fromIso, toIso)) {
      if (w.closed_to_arrival) arrival.add(d);
      if (w.closed_to_departure) departure.add(d);
    }
  }
  return { arrival: [...arrival].sort(), departure: [...departure].sort() };
}

