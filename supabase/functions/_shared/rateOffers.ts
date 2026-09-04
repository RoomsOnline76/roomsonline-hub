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
  reason?: "unit" | "min_stay" | "max_stay";
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

export function offerEligibility(plan: OfferPlan, stay: OfferStay): OfferEligibility {
  const min = effectiveMinStay(plan, stay);
  const max = positive(plan.max_stay);
  const sellsUnit = plan.room_type_ids.some((id) => String(id) === String(stay.room_type_id));
  if (!sellsUnit) return { eligible: false, min_stay: min, max_stay: max, reason: "unit" };
  if (stay.nights < min) return { eligible: false, min_stay: min, max_stay: max, reason: "min_stay" };
  if (max !== null && stay.nights > max) return { eligible: false, min_stay: min, max_stay: max, reason: "max_stay" };
  return { eligible: true, min_stay: min, max_stay: max };
}

/** The plans a guest may be offered for this stay, in the order given. */
export function eligibleOffers(plans: OfferPlan[], stay: OfferStay): OfferPlan[] {
  return plans.filter((plan) => offerEligibility(plan, stay).eligible);
}
