import { canonicalPricingModel, stayTotalForModel } from "../_shared/ratePricing.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isRuBooking, modifyRuStay } from "../_shared/ruBookingSync.ts";
import { enqueueJobs, kickWorker } from "../_shared/jobQueue.ts";
import { applyBookingSettlement } from "../_shared/bookingSettlement.ts";

import { addDays, createRateResolver } from "../_shared/rateResolution.ts";
import {
  logRateParity,
  type ParityRow,
} from "../_shared/rateParity.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ModifyRequest {
  booking_id: string;
  modifications: {
    check_in_date?: string;
    check_out_date?: string;
    adults?: number;
    children?: number;
    teens?: number;
    infants?: number;
    rooms?: any[];
    special_requests?: string;
    note?: string;
    /** Operator-set totals (also pushed to RU as ClientPrice / AlreadyPaid). */
    total_price?: number;
    already_paid?: number;
    arrival_time?: string;
  };
  /**
   * Money side of the change. A shorter stay leaves the guest overpaid and a longer one leaves a
   * balance owing — the operator decides in the dialog whether we raise the refund for approval
   * and whether the guest is asked to settle the shortfall.
   */
  settlement?: {
    raise_refund?: boolean;
    request_balance?: boolean;
    /** refund = schedule for approval, credit = retain on account, guest_choice = let the guest pick. */
    overpayment_mode?: "refund" | "credit" | "guest_choice";
  };

  /**
   * The booking's `updated_at` as the operator's screen last saw it. A channel modification
   * (an extended stay pulled from Rentals United) writes a newer row while a dialog is open;
   * saving the stale form would silently undo the channel's change, which is exactly how an
   * extended stay ended up back at its old departure date with the extra nights only blocked.
   */
  expected_updated_at?: string | null;
}




// Calculate number of nights between two date strings
function countNights(checkIn: string, checkOut: string): number {
  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
}

// Generate array of date strings for a range [checkIn, checkOut)
function dateRange(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const d = new Date(checkIn);
  const end = new Date(checkOut);
  while (d < end) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

interface ResolvedPlan {
  id: string;
  pricing_model: string | null;
  base_rate: number | null;
}

/**
 * The rate plan that prices this stay.
 *
 * A stay created before Rate Plans owned pricing (or by a surface that never stamped the plan)
 * carries no `rolos_rate_plan_id`. Silently skipping the recalculation in that case froze the
 * total across every date change, so the plan is resolved from the unit's own plan links —
 * primary-sell first, then sell priority — and stamped back onto the booking by the caller.
 */
async function resolveBookingRatePlan(supabase: any, booking: any): Promise<ResolvedPlan | null> {
  if (booking.rolos_rate_plan_id) {
    const { data } = await supabase
      .from("rolos_rate_plans")
      .select("id, pricing_model, base_rate")
      .eq("id", booking.rolos_rate_plan_id)
      .maybeSingle();
    if (data) return data as ResolvedPlan;
  }

  if (!booking.property_id) return null;

  const { data: plans } = await supabase
    .from("rolos_rate_plans")
    .select("id, pricing_model, base_rate, is_primary_sell, sell_priority")
    .eq("property_id", booking.property_id)
    .eq("is_active", true)
    .is("deleted_at", null);

  const candidates = (plans ?? []) as any[];
  if (candidates.length === 0) return null;

  let allowed = candidates;
  const roomTypeId = booking.room_type_id ? String(booking.room_type_id) : null;
  if (roomTypeId) {
    const { data: links } = await supabase
      .from("rolos_rate_plan_room_types")
      .select("rate_plan_id, is_active")
      .eq("room_type_id", roomTypeId);
    const linked = new Set(
      ((links ?? []) as any[]).filter((l) => l.is_active !== false).map((l) => String(l.rate_plan_id)),
    );
    const scoped = candidates.filter((p) => linked.has(String(p.id)));
    if (scoped.length > 0) allowed = scoped;
  }

  allowed.sort((a, b) => {
    if (!!a.is_primary_sell !== !!b.is_primary_sell) return a.is_primary_sell ? -1 : 1;
    return (Number(a.sell_priority) || 999) - (Number(b.sell_priority) || 999);
  });

  const chosen = allowed[0];
  return chosen ? { id: String(chosen.id), pricing_model: chosen.pricing_model, base_rate: chosen.base_rate } : null;
}

/**
 * Reprice a ROL'OS-native stay from the authoritative Rate Plans hierarchy.
 *
 * Nights are resolved one by one (daily override → plan season rate → calendar season →
 * relational season → rack), so a stay that spans a season boundary is priced correctly instead
 * of taking a single season's rate for the whole stay.
 */
async function recalculateRolPrice(
  supabase: any,
  booking: any,
  modifications: ModifyRequest["modifications"]
): Promise<{ total: number; rate_plan_id: string; nightly: number | null; source: string | null } | null> {
  const plan = await resolveBookingRatePlan(supabase, booking);
  if (!plan) return null;

  const checkIn = modifications.check_in_date || booking.check_in_date;
  const checkOut = modifications.check_out_date || booking.check_out_date;
  const nights = countNights(checkIn, checkOut);
  const adults = modifications.adults ?? booking.adults ?? 1;
  const children = modifications.children ?? (booking.children || 0);
  const teens = modifications.teens ?? (booking.teens || 0);
  const model = canonicalPricingModel(plan.pricing_model);
  const baseRate = Number(plan.base_rate) || 0;
  const roomTypeId = booking.room_type_id ? String(booking.room_type_id) : null;
  const roomCount = Array.isArray(booking.rooms) && booking.rooms.length > 0 ? booking.rooms.length : 1;

  let nightlyRates: number[] = [];
  let extraAdultRate: number | undefined;
  let source: string | null = null;

  if (booking.property_id) {
    try {
      const resolver = await createRateResolver(supabase, booking.property_id, {
        window: { from: checkIn, to: checkOut },
      });
      const unit =
        resolver.units.find((u) => roomTypeId && String(u.linked_rolos_id ?? "") === roomTypeId) ??
        resolver.units.find((u) => roomTypeId && String(u.id) === roomTypeId) ??
        resolver.units[0];
      if (unit) {
        const days = resolver.resolveDays(unit, checkIn, addDays(checkOut, -1));
        const priced = days.filter((d) => Number(d.price) > 0);
        if (priced.length > 0) {
          nightlyRates = days.map((d) => (Number(d.price) > 0 ? Number(d.price) : baseRate));
          extraAdultRate = days[0]?.extra_guest_price ?? undefined;
          source = days[0]?.source ?? null;
        }
      }
    } catch (e) {
      console.warn("[modify-booking] rate resolve failed:", (e as Error).message);
    }
  }

  if (nightlyRates.length !== nights) {
    // Nothing seasonal covers the stay — the plan's rack rate is the authority.
    nightlyRates = Array.from({ length: nights }, () => baseRate);
    source = source ?? "rack_rate";
  }

  if (nightlyRates.every((r) => !(r > 0))) return null;

  const total = stayTotalForModel(model, {
    nightlyRates,
    adults,
    teens,
    children,
    units: roomCount,
    extraAdultRate,
  });

  const rounded = Math.round((Number(total) || 0) * 100) / 100;
  if (!(rounded > 0)) return null;

  const nightly = nights > 0 ? Math.round((rounded / nights) * 100) / 100 : null;

  try {
    const parityRows: ParityRow[] = [{
      property_id: booking.property_id,
      room_type_id: roomTypeId,
      rate_plan_id: plan.id,
      stay_date: checkIn,
      resolved_rate: rounded,
      resolved_tier: source,
      legacy_rate: Number(booking.total_price ?? 0),
      legacy_tier: "modify_booking_previous_total",
      notes: { nights, pricing_model: model, metric: "stay_total" },
    }];
    await logRateParity(supabase, "modify-booking", parityRows);
  } catch (_e) {
    // Parity logging must never block a reprice.
  }

  return { total: rounded, rate_plan_id: plan.id, nightly, source };
}


// Update property_availability when dates change (release old dates, block new dates)
async function updateAvailabilityBlockout(
  supabase: any,
  propertyId: string,
  roomTypeId: string | null,
  oldCheckIn: string,
  oldCheckOut: string,
  newCheckIn: string,
  newCheckOut: string,
  externalSystem: string
) {
  const roomType = roomTypeId || "default";

  // 1. Release old dates that are NOT in the new range
  const oldDates = dateRange(oldCheckIn, oldCheckOut);
  const newDates = dateRange(newCheckIn, newCheckOut);
  const datesToRelease = oldDates.filter((d) => !newDates.includes(d));
  const datesToBlock = newDates.filter((d) => !oldDates.includes(d));

  // Release: increment available_units for old dates no longer booked
  for (const date of datesToRelease) {
    await supabase.rpc("increment_availability", {
      p_property_id: propertyId,
      p_room_type: roomType,
      p_date: date,
    }).then(() => {}).catch(() => {
      // If RPC doesn't exist, do direct update
      return supabase
        .from("property_availability")
        .update({ available_units: 1, is_stop_sell: false })
        .eq("property_id", propertyId)
        .eq("room_type", roomType)
        .eq("date", date);
    });
  }

  // Block: decrement available_units / set stop_sell for new dates
  for (const date of datesToBlock) {
    // Upsert with 0 available units
    await supabase
      .from("property_availability")
      .upsert(
        {
          property_id: propertyId,
          room_type: roomType,
          date,
          external_system: externalSystem || "rolos",
          available_units: 0,
          is_stop_sell: true,
        },
        { onConflict: "property_id,room_type,date,external_system" }
      );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ code: "AUTH_FAILED", message: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ code: "AUTH_FAILED", message: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = claimsData.claims.sub;

    const body: ModifyRequest = await req.json();
    const { booking_id, modifications, settlement } = body;

    if (!booking_id || !modifications) {
      return new Response(
        JSON.stringify({ code: "INVALID_REQUEST", message: "booking_id and modifications required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // S1: Fetch booking with property info
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*, property:properties!bookings_property_id_fkey(id, name, external_system, benson_property_code, is_rol_property)")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ code: "NOT_FOUND", message: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // S1b: Refuse a stale save. The channel writes modifications straight into the booking, so a
    // form opened before that write would push the old dates back and leave the extra nights
    // blocked without the stay covering them. The operator reloads and decides again.
    const expected = body.expected_updated_at ? String(body.expected_updated_at) : null;
    if (expected && booking.updated_at && new Date(booking.updated_at).getTime() > new Date(expected).getTime() + 1000) {
      return new Response(
        JSON.stringify({
          code: "STALE_BOOKING",
          success: false,
          message:
            "This reservation changed after you opened it (most likely a Channel Manager modification). Reload and try again.",
          current_check_in_date: booking.check_in_date,
          current_check_out_date: booking.check_out_date,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // S2: Check if booking can be modified
    if (booking.status === "cancelled") {
      return new Response(
        JSON.stringify({ code: "BOOKING_CANCELLED", message: "Cannot modify a cancelled booking" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // S3: Determine PMS type and check capabilities
    const property = booking.property;
    const externalSystem = property?.external_system || "none";
    const isRolNative = property?.is_rol_property || externalSystem === "none";

    // For external PMS, check if modification is supported
    if (!isRolNative && externalSystem !== "none") {
      const { data: tracker } = await supabase
        .from("pms_tracker_status")
        .select("has_modify")
        .eq("system_type", externalSystem)
        .maybeSingle();

      if (!tracker?.has_modify) {
        return new Response(
          JSON.stringify({
            code: "MODIFICATION_NOT_SUPPORTED",
            message: `${externalSystem} does not support booking modifications`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // S4: For PMS-managed properties, verify live availability
      if (modifications.check_in_date || modifications.check_out_date) {
        try {
          const availResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/${externalSystem}-api`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                action: "fetch_availability",
                property_id: booking.property_id,
                start_date: modifications.check_in_date || booking.check_in_date,
                end_date: modifications.check_out_date || booking.check_out_date,
              }),
            }
          );

          const availData = await availResponse.json();
          if (!availData.success) {
            return new Response(
              JSON.stringify({
                code: "AVAILABILITY_CHANGED",
                message: "Could not verify availability for new dates",
                details: availData.error,
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (availErr) {
          console.error("Availability check failed:", availErr);
        }
      }

      // S5: Call PMS adapter for modification
      if (booking.external_reservation_id) {
        try {
          const pmsResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/${externalSystem}-api`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                action: "modify_reservation",
                property_id: booking.property_id,
                reservation_id: booking.external_reservation_id,
                modifications: {
                  check_in_date: modifications.check_in_date,
                  check_out_date: modifications.check_out_date,
                  rooms: modifications.rooms,
                  adults: modifications.adults,
                  children: modifications.children,
                  teens: modifications.teens,
                  infants: modifications.infants,
                  note: modifications.note,
                },
              }),
            }
          );

          const pmsResult = await pmsResponse.json();

          if (!pmsResult.success) {
            await supabase.from("booking_sync_status").upsert(
              {
                booking_id,
                external_system: externalSystem,
                sync_status: "failed",
                last_action: "modify",
                last_action_at: new Date().toISOString(),
                error_message: pmsResult.error?.message || "PMS modification failed",
                last_error_message: pmsResult.error?.message,
              },
              { onConflict: "booking_id,external_system" }
            );

            return new Response(
              JSON.stringify({
                code: pmsResult.error?.code || "PMS_ERROR",
                message: pmsResult.error?.message || "PMS modification failed",
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (pmsErr) {
          console.error("PMS modify call failed:", pmsErr);
          return new Response(
            JSON.stringify({
              code: "PMS_UNAVAILABLE",
              message: "Could not reach PMS to apply modification",
            }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // S6: Recalculate total_price for ROL-native properties when pax or dates change
    const paxOrDatesChanged =
      modifications.adults !== undefined ||
      modifications.children !== undefined ||
      modifications.teens !== undefined ||
      modifications.check_in_date !== undefined ||
      modifications.check_out_date !== undefined;

    let newTotalPrice: number | null = null;
    let repricedPlanId: string | null = null;
    let repricedNightly: number | null = null;

    if (isRolNative && paxOrDatesChanged) {
      const repriced = await recalculateRolPrice(supabase, booking, modifications);
      if (repriced) {
        newTotalPrice = repriced.total;
        repricedPlanId = repriced.rate_plan_id;
        repricedNightly = repriced.nightly;
        console.log(
          `[modify-booking] repriced ${booking.id}: ${booking.total_price} → ${repriced.total} (plan ${repriced.rate_plan_id}, tier ${repriced.source})`,
        );
      } else if (modifications.total_price === undefined) {
        // No plan and no operator price means we would leave a stale total behind — refuse
        // rather than silently keeping the old amount on a stay of a different length.
        return new Response(
          JSON.stringify({
            code: "NO_RATE_FOR_STAY",
            message:
              "No active rate plan prices this unit, so the stay cannot be repriced. Author a rate in ROL'OS Rate Plans or set the total manually.",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }


    // S6b: Rentals United bookings must be accepted by RU before we touch the local record.
    // RU only allows Push_ModifyStay_RQ on confirmed reservations.
    let ruModified = false;
    let ruRequestAccepted = false;
    if (isRuBooking(booking)) {
      const guests =
        (modifications.adults ?? booking.adults ?? 0) +
        (modifications.children ?? booking.children ?? 0) +
        (modifications.teens ?? booking.teens ?? 0);

      const ruResult = await modifyRuStay(supabase, booking, {
        date_from: modifications.check_in_date ?? null,
        date_to: modifications.check_out_date ?? null,
        number_of_guests: guests > 0 ? guests : null,
        client_price: modifications.total_price ?? newTotalPrice ?? null,
        already_paid: modifications.already_paid ?? null,
        arrival_time: modifications.arrival_time ?? null,
      });

      if (!ruResult.ok) {
        await supabase.from("booking_sync_status").upsert(
          {
            booking_id,
            external_system: "rentalsunited",
            sync_status: "failed",
            last_action: "modify",
            last_action_at: new Date().toISOString(),
            error_message: ruResult.message,
            last_error_message: ruResult.message,
          },
          { onConflict: "booking_id,external_system" }
        );

        return new Response(
          JSON.stringify({
            code: ruResult.code || "RU_ERROR",
            message: ruResult.message ||
              "The Channel Manager rejected the modification — the booking was left unchanged.",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      ruModified = true;
      ruRequestAccepted = ruResult.confirmedLead === true;
      await supabase.from("booking_sync_status").upsert(
        {
          booking_id,
          external_system: "rentalsunited",
          sync_status: "synced",
          last_action: "modify",
          last_action_at: new Date().toISOString(),
          error_message: null,
          last_error_message: null,
        },
        { onConflict: "booking_id,external_system" }
      );
    }

    // S7: Update availability blockout when dates change

    const datesChanged = modifications.check_in_date || modifications.check_out_date;
    if (datesChanged) {
      const newCheckIn = modifications.check_in_date || booking.check_in_date;
      const newCheckOut = modifications.check_out_date || booking.check_out_date;

      try {
        await updateAvailabilityBlockout(
          supabase,
          booking.property_id,
          booking.room_type_id,
          booking.check_in_date,
          booking.check_out_date,
          newCheckIn,
          newCheckOut,
          isRolNative ? "rolos" : externalSystem
        );
        console.log("Updated availability blockout for date change");
      } catch (err) {
        console.error("Availability blockout update failed (non-critical):", err);
      }
    }

    // S8: Update local database
    const updateData: Record<string, any> = {
      last_modified_at: new Date().toISOString(),
      modified_by: userId,
    };

    if (modifications.check_in_date) updateData.check_in_date = modifications.check_in_date;
    if (modifications.check_out_date) updateData.check_out_date = modifications.check_out_date;
    if (modifications.adults !== undefined) updateData.adults = modifications.adults;
    if (modifications.children !== undefined) updateData.children = modifications.children;
    if (modifications.teens !== undefined) updateData.teens = modifications.teens;
    if (modifications.infants !== undefined) updateData.infants = modifications.infants;
    if (modifications.rooms) updateData.rooms = modifications.rooms;
    if (modifications.special_requests !== undefined) updateData.special_requests = modifications.special_requests;

    // Update total_price if recalculated or explicitly set by the operator
    if (modifications.total_price !== undefined) {
      updateData.total_price = modifications.total_price;
    } else if (newTotalPrice !== null) {
      updateData.total_price = newTotalPrice;
    }
    // Stamp the plan that priced the stay so the next modification does not have to guess again.
    if (repricedPlanId && !booking.rolos_rate_plan_id) {
      updateData.rolos_rate_plan_id = repricedPlanId;
    }




    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", booking_id);

    if (updateError) {
      console.error("Local update failed:", updateError);
      return new Response(
        JSON.stringify({
          code: "PARTIAL_SUCCESS",
          message: "PMS updated but local database update failed",
          details: updateError.message,
        }),
        { status: 207, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The booking card reads the room line, so a reprice that only moved the booking total would
    // leave the line contradicting it. Single-room stays are kept in step here.
    const effectiveNewTotal = updateData.total_price ?? null;
    if (effectiveNewTotal !== null) {
      const { data: lines } = await supabase
        .from("rolos_booking_rooms")
        .select("id")
        .eq("booking_id", booking_id);
      if (Array.isArray(lines) && lines.length === 1) {
        const nights = countNights(
          modifications.check_in_date || booking.check_in_date,
          modifications.check_out_date || booking.check_out_date,
        );
        await supabase
          .from("rolos_booking_rooms")
          .update({
            rate_charged: Number(effectiveNewTotal),
            nightly_rate: repricedNightly ??
              (nights > 0 ? Math.round((Number(effectiveNewTotal) / nights) * 100) / 100 : null),
          })
          .eq("id", lines[0].id);
      }
    }



    // S8b: Price/date/pax changes move the revenue figure — recalculate the
    // commission so pulse, reports and payouts follow the new total instead of
    // keeping the pre-modification amount.
    const priceAffected =
      updateData.total_price !== undefined ||
      modifications.check_in_date !== undefined ||
      modifications.check_out_date !== undefined ||
      modifications.adults !== undefined ||
      modifications.children !== undefined ||
      modifications.teens !== undefined ||
      modifications.infants !== undefined;

    // S8c: Settle the money. The new total is compared with what was actually received, the
    // difference is written to the booking (paid, balance, credit and payment status in one go),
    // and the overpayment becomes a scheduled refund, credit retained on account, or a guest choice.
    const effectiveTotal = Number(updateData.total_price ?? booking.total_price ?? 0);
    const settlementOutcome = await applyBookingSettlement(supabase, booking, {
      oldTotal: Number(booking.total_price ?? 0),
      newTotal: effectiveTotal,
      raiseRefund: settlement?.raise_refund !== false,
      requestBalance: settlement?.request_balance !== false,
      reasonNote: modifications.note ?? null,
      overpaymentMode: settlement?.overpayment_mode ??
        (settlement?.raise_refund === false ? "credit" : "guest_choice"),
    });


    // The booking row and the availability blocks are now correct, so the operator can be
    // released. Commission, the channel ARI delta, the sync-status write and the guest email
    // only have to *follow* — they go onto the durable background queue and the worker is kicked
    // immediately, so the dialog no longer waits on a multi-second channel round-trip.
    await enqueueJobs(supabase, [

      ...(priceAffected
        ? [{
            type: "recalculate_commission" as const,
            payload: { booking_id },
            options: { dedupeKey: `commission:${booking_id}` },
          }]
        : []),
      ...(externalSystem !== "none"
        ? [{
            type: "booking_sync_status" as const,
            payload: {
              booking_id,
              external_system: externalSystem,
              sync_status: "synced",
              last_action: "modify",
            },
            options: { dedupeKey: `sync:${booking_id}:${externalSystem}:modify` },
          }]
        : []),
      {
        // Shifted dates change both the old and the new nights: the channel window must be
        // refreshed. One job per property collapses a burst of edits into a single push.
        type: "channel_ari_delta" as const,
        payload: { property_id: booking.property_id, trigger: "booking_modified", force: true },
        options: { dedupeKey: `ari:${booking.property_id}` },
      },
      {
        type: "booking_email" as const,
        payload: {
          booking_id,
          type: "modification_confirmation",
          old_data: {
            check_in: booking.check_in_date,
            check_out: booking.check_out_date,
            adults: booking.adults,
            rooms: booking.rooms,
            total_price: booking.total_price,
          },
          new_data: {
            ...modifications,
            total_price: newTotalPrice ?? booking.total_price,
          },
          note: modifications.note,
        },
        options: { dedupeKey: `email:modification:${booking_id}` },
      },
      ...(settlementOutcome?.balance_requested && settlementOutcome.balance_token
        ? [{
            type: "booking_balance_request" as const,
            payload: {
              booking_id,
              token: settlementOutcome.balance_token,
              amount: settlementOutcome.balance_due,
              note: modifications.note ?? null,
            },
            options: { dedupeKey: `balance:${booking_id}` },
          }]
        : []),
      ...(settlementOutcome?.credit_requested && settlementOutcome.credit_token
        ? [{
            // The guest chooses: hold the difference as credit for the stay, or be refunded now.
            type: "booking_balance_request" as const,
            payload: {
              booking_id,
              token: settlementOutcome.credit_token,
              amount: settlementOutcome.refund_amount,
              direction: "credit",
              note: modifications.note ?? null,
            },
            options: { dedupeKey: `credit:${booking_id}` },
          }]
        : []),
    ]);
    kickWorker();


    return new Response(
      JSON.stringify({
        success: true,
        message: ruModified
          ? (ruRequestAccepted
            ? "Request accepted at the Channel Manager and the change pushed"
            : "Booking modified and pushed to the Channel Manager")
          : "Booking modified successfully",
        booking_id,
        ru_modified: ruModified,
        ru_request_accepted: ruRequestAccepted,
        new_total_price: updateData.total_price ?? booking.total_price,
        old_total_price: booking.total_price,
        settlement: settlementOutcome,
      }),


      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Modify booking error:", error);
    return new Response(
      JSON.stringify({
        code: "INTERNAL_ERROR",
        message: (error as Error)?.message || "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
