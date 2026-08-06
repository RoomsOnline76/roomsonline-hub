/**
 * Revenue stream helpers (Breakfast / F&B split).
 *
 * PMS-agnostic: works purely off the unified ROL'OS data model.
 * Non-breaking by design — when a property never configures breakfast every
 * helper resolves to a single accommodation line with the original amount.
 */

export type RevenueStream = "accommodation" | "fnb" | "other";

export function normalizeRevenueStream(value: unknown): RevenueStream {
  return value === "fnb" || value === "other" ? value : "accommodation";
}

export interface BreakfastConfig {
  included: boolean;
  /** Amount per the basis below */
  amount: number;
  basis: "per_person_per_night" | "per_stay";
  label: string;
}

export interface StreamLine {
  stream: RevenueStream;
  amount: number;
  description: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve the breakfast configuration for a booking.
 * Priority: rate plan on the booking rooms → property-level "included in rate" F&B charge.
 * Returns null when nothing is configured (legacy behaviour).
 */
// deno-lint-ignore no-explicit-any
export async function resolveBreakfastConfig(
  supabase: any,
  bookingId: string,
  propertyId: string,
): Promise<BreakfastConfig | null> {
  try {
    const { data: rooms } = await supabase
      .from("rolos_booking_rooms")
      .select("rate_plan_id")
      .eq("booking_id", bookingId);

    const ratePlanIds = [...new Set((rooms || []).map((r: any) => r.rate_plan_id).filter(Boolean))];
    if (ratePlanIds.length) {
      const { data: plans } = await supabase
        .from("rolos_rate_plans")
        .select("name, breakfast_included, breakfast_amount, breakfast_basis")
        .in("id", ratePlanIds)
        .eq("breakfast_included", true);
      const plan = (plans || [])[0];
      if (plan && Number(plan.breakfast_amount) > 0) {
        return {
          included: true,
          amount: Number(plan.breakfast_amount),
          basis: plan.breakfast_basis === "per_stay" ? "per_stay" : "per_person_per_night",
          label: "Breakfast",
        };
      }
    }

    // Fallback: a property charge flagged as F&B and already included in the rate
    const { data: charges } = await supabase
      .from("property_charges")
      .select("name, amount, calculation_method, revenue_stream, is_included_in_rate, is_active")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .eq("revenue_stream", "fnb")
      .eq("is_included_in_rate", true)
      .limit(1);
    const charge = (charges || [])[0];
    if (charge && Number(charge.amount) > 0) {
      return {
        included: true,
        amount: Number(charge.amount),
        basis: charge.calculation_method === "per_person_per_night" ? "per_person_per_night" : "per_stay",
        label: charge.name || "Breakfast",
      };
    }
  } catch (err) {
    console.error("[revenueStreams] resolveBreakfastConfig failed:", err);
  }
  return null;
}

/** Breakfast portion contained in a given number of nights / guests */
export function breakfastPortion(
  config: BreakfastConfig | null,
  opts: { nights: number; guests: number },
): number {
  if (!config?.included || config.amount <= 0) return 0;
  if (config.basis === "per_stay") return round2(config.amount);
  return round2(config.amount * Math.max(1, opts.guests) * Math.max(1, opts.nights));
}

/**
 * Split an accommodation amount into accommodation + F&B lines.
 * The sum of the returned lines always equals `total` — the guest never pays more.
 */
export function splitAccommodationAmount(
  total: number,
  breakfast: number,
  descriptions: { accommodation: string; fnb: string },
): StreamLine[] {
  const fnb = Math.min(round2(Math.max(0, breakfast)), round2(total));
  if (fnb <= 0) {
    return [{ stream: "accommodation", amount: round2(total), description: descriptions.accommodation }];
  }
  const accommodation = round2(total - fnb);
  const lines: StreamLine[] = [];
  if (accommodation > 0) {
    lines.push({ stream: "accommodation", amount: accommodation, description: descriptions.accommodation });
  }
  lines.push({ stream: "fnb", amount: fnb, description: descriptions.fnb });
  return lines;
}
