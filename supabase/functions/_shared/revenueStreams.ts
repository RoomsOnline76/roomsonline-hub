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

/** Single source of truth for the breakfast basis values. */
export const BREAKFAST_BASES = ["per_person_per_night", "per_room_per_night", "per_stay"] as const;
export type BreakfastBasis = typeof BREAKFAST_BASES[number];

export function normalizeBreakfastBasis(value: unknown): BreakfastBasis {
  return (BREAKFAST_BASES as readonly string[]).includes(String(value))
    ? (value as BreakfastBasis)
    : "per_person_per_night";
}

export interface BreakfastConfig {
  included: boolean;
  /** Amount per the basis below */
  amount: number;
  basis: BreakfastBasis;
  label: string;
  /** Where the config came from — for logging / diagnostics */
  source: "charge_link" | "rate_plan" | "room_type_rate_plan" | "property_charge";
}

export interface StreamLine {
  stream: RevenueStream;
  amount: number;
  description: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// deno-lint-ignore no-explicit-any
function configFromCharge(charge: any, source: BreakfastConfig["source"]): BreakfastConfig | null {
  if (!charge || Number(charge.amount) <= 0) return null;
  const method = String(charge.calculation_method || "");
  const basis: BreakfastBasis = method === "per_person_per_night"
    ? "per_person_per_night"
    : method === "per_room_per_night" || method === "per_night"
      ? "per_room_per_night"
      : "per_stay";
  return {
    included: true,
    amount: Number(charge.amount),
    basis,
    label: charge.name || "Breakfast",
    source,
  };
}

// deno-lint-ignore no-explicit-any
async function configFromRatePlans(supabase: any, ratePlanIds: string[], source: BreakfastConfig["source"]): Promise<BreakfastConfig | null> {
  if (!ratePlanIds.length) return null;
  const { data: plans } = await supabase
    .from("rolos_rate_plans")
    .select("name, breakfast_included, breakfast_amount, breakfast_basis, breakfast_charge_id")
    .in("id", ratePlanIds)
    .eq("breakfast_included", true);
  const plan = (plans || [])[0];
  if (!plan) return null;

  // A linked property charge is the canonical F&B definition when present.
  if (plan.breakfast_charge_id) {
    const { data: linked } = await supabase
      .from("property_charges")
      .select("name, amount, calculation_method")
      .eq("id", plan.breakfast_charge_id)
      .maybeSingle();
    const fromLink = configFromCharge(linked, "charge_link");
    if (fromLink) return fromLink;
  }

  if (Number(plan.breakfast_amount) > 0) {
    return {
      included: true,
      amount: Number(plan.breakfast_amount),
      basis: normalizeBreakfastBasis(plan.breakfast_basis),
      label: "Breakfast",
      source,
    };
  }
  return null;
}

/**
 * Resolve the breakfast configuration for a booking.
 * Priority: rate plan on the booking rooms (or its linked charge) → rate plans
 * linked to the booked room types → property-level "included in rate" F&B charge.
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
      .select("rate_plan_id, room_type_id")
      .eq("booking_id", bookingId);

    // 1. Explicit rate plan on the booking rooms
    const ratePlanIds = [...new Set((rooms || []).map((r: any) => r.rate_plan_id).filter(Boolean))];
    const fromPlan = await configFromRatePlans(supabase, ratePlanIds as string[], "rate_plan");
    if (fromPlan) return fromPlan;

    // 2. Rate plans linked to the booked room types (booking rooms often carry
    //    the room type but no rate plan — especially for channel-sourced stays)
    const roomTypeIds = [...new Set((rooms || []).map((r: any) => r.room_type_id).filter(Boolean))];
    if (roomTypeIds.length) {
      const { data: links } = await supabase
        .from("rolos_rate_plan_room_types")
        .select("rate_plan_id")
        .in("room_type_id", roomTypeIds as string[]);
      const linkedPlanIds = [...new Set((links || []).map((l: any) => l.rate_plan_id).filter(Boolean))];
      const fromRoomType = await configFromRatePlans(supabase, linkedPlanIds as string[], "room_type_rate_plan");
      if (fromRoomType) return fromRoomType;
    }

    // 3. Fallback: a property charge flagged as F&B and already included in the rate
    const { data: charges } = await supabase
      .from("property_charges")
      .select("name, amount, calculation_method, revenue_stream, is_included_in_rate, is_active")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .eq("revenue_stream", "fnb")
      .eq("is_included_in_rate", true)
      .limit(1);
    const fromCharge = configFromCharge((charges || [])[0], "property_charge");
    if (fromCharge) return fromCharge;

    console.log(`[revenueStreams] No breakfast config resolved for booking ${bookingId} (property ${propertyId})`);
  } catch (err) {
    console.error("[revenueStreams] resolveBreakfastConfig failed:", err);
  }
  return null;
}

/** Breakfast portion contained in a given number of nights / guests / rooms */
export function breakfastPortion(
  config: BreakfastConfig | null,
  opts: { nights: number; guests: number; rooms?: number },
): number {
  if (!config?.included || config.amount <= 0) return 0;
  const nights = Math.max(1, opts.nights);
  const guests = Math.max(1, opts.guests);
  const rooms = Math.max(1, opts.rooms ?? 1);
  if (config.basis === "per_stay") return round2(config.amount);
  if (config.basis === "per_room_per_night") return round2(config.amount * rooms * nights);
  return round2(config.amount * guests * nights);
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

export interface SplitPostResult {
  posted: boolean;
  reason?: string;
  lines?: StreamLine[];
}

/**
 * Post the accommodation / F&B split for a booking's room revenue onto its folio.
 * Idempotent: skips when the folio already carries an accommodation room line or
 * any F&B line. Safe to call from create, apply-charges, night audit and backfill.
 */
// deno-lint-ignore no-explicit-any
export async function postBookingStreamSplit(
  supabase: any,
  args: {
    bookingId: string;
    propertyId: string;
    folioId: string;
    nights: number;
    guests: number;
    rooms?: number;
    total: number;
    config?: BreakfastConfig | null;
  },
): Promise<SplitPostResult> {
  const { bookingId, propertyId, folioId, nights, guests, rooms, total } = args;
  if (!folioId || total <= 0) return { posted: false, reason: "no_folio_or_total" };

  const config = args.config !== undefined
    ? args.config
    : await resolveBreakfastConfig(supabase, bookingId, propertyId);
  if (!config) return { posted: false, reason: "no_breakfast_config" };

  const { data: existing } = await supabase
    .from("rolos_folio_transactions")
    .select("id, description, revenue_stream")
    .eq("folio_id", folioId)
    .eq("transaction_type", "charge");
  const alreadySplit = (existing || []).some((t: any) =>
    normalizeRevenueStream(t.revenue_stream) === "fnb" || String(t.description || "").startsWith("Accommodation")
  );
  if (alreadySplit) return { posted: false, reason: "already_split" };

  const fnbPortion = breakfastPortion(config, { nights, guests, rooms });
  const lines = splitAccommodationAmount(total, fnbPortion, {
    accommodation: `Accommodation (${nights} night${nights === 1 ? "" : "s"})`,
    fnb: `${config.label} (included in rate)`,
  });
  if (lines.length < 2) return { posted: false, reason: "nothing_to_split" };

  for (const line of lines) {
    await supabase.from("rolos_folio_transactions").insert({
      folio_id: folioId,
      transaction_type: "charge",
      description: line.description,
      amount: line.amount,
      revenue_stream: line.stream,
    });
  }
  return { posted: true, lines };
}
