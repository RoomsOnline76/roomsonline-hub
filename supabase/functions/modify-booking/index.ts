import { canonicalPricingModel, stayTotalForModel } from "../_shared/ratePricing.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isRuBooking, modifyRuStay } from "../_shared/ruBookingSync.ts";
import { enqueueJobs, kickWorker } from "../_shared/jobQueue.ts";
import { addDays, createRateResolver } from "../_shared/rateResolution.ts";
import {
  getRateResolutionMode,
  logRateParity,
  pickServedRate,
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

// Recalculate total price for ROL-native bookings based on rate plan pricing model
async function recalculateRolPrice(
  supabase: any,
  booking: any,
  modifications: ModifyRequest["modifications"]
): Promise<number | null> {
  const ratePlanId = booking.rolos_rate_plan_id;
  if (!ratePlanId) return null;

  // Fetch rate plan
  const { data: ratePlan } = await supabase
    .from("rolos_rate_plans")
    .select("pricing_model, base_rate")
    .eq("id", ratePlanId)
    .single();

  if (!ratePlan) return null;

  const checkIn = modifications.check_in_date || booking.check_in_date;
  const checkOut = modifications.check_out_date || booking.check_out_date;
  const nights = countNights(checkIn, checkOut);
  const adults = modifications.adults ?? booking.adults;
  const children = modifications.children ?? (booking.children || 0);
  const teens = modifications.teens ?? (booking.teens || 0);
  const baseRate = ratePlan.base_rate || 0;

  // Try to get season-specific pricing
  const roomTypeId = booking.room_type_id;
  let seasonRate = baseRate;
  let extraAdultRate = 0;
  let extraChildRate = 0;

  if (roomTypeId) {
    const { data: seasonPrices } = await supabase
      .from("rolos_rate_prices")
      .select("base_rate, extra_adult_rate, extra_child_rate, season:rolos_rate_seasons!inner(start_date, end_date, day_of_week_multipliers)")
      .eq("room_type_id", roomTypeId)
      .lte("season.start_date", checkIn)
      .gte("season.end_date", checkOut);

    if (seasonPrices && seasonPrices.length > 0) {
      seasonRate = seasonPrices[0].base_rate || baseRate;
      extraAdultRate = seasonPrices[0].extra_adult_rate || 0;
      extraChildRate = seasonPrices[0].extra_child_rate || 0;
    }
  }

  const model = canonicalPricingModel(ratePlan.pricing_model);

  const legacyTotal = ((): number => {
    switch (model) {
      case "per_person": {
        // base_rate is per person per night
        const totalPax = adults + teens; // teens typically charged as adults
        const childPax = children; // children at child rate or same rate
        const perNight = (totalPax * seasonRate) + (childPax * (extraChildRate || seasonRate));
        return perNight * nights;
      }
      case "per_person_sharing": {
        // base covers 2 guests; additional adults at the extra-adult rate
        return stayTotalForModel("per_person_sharing", {
          nightlyRates: Array.from({ length: nights }, () => seasonRate),
          adults,
          teens,
          children,
          extraAdultRate: extraAdultRate || undefined,
          childRate: extraChildRate || undefined,
        });
      }
      case "per_room":
      case "per_unit": {
        // base_rate is per room/unit per night
        const roomCount = booking.rooms?.length || 1;
        return seasonRate * nights * roomCount;
      }
      default: {
        // Fallback: per_person if we can't determine
        return seasonRate * adults * nights;
      }
    }
  })();

  // ── Shared-resolver parity (additive) ──────────────────────────────────
  // The legacy figure above stays the served value unless this property has
  // been flipped to `unified`. The comparison is always recorded.
  let unifiedTotal: number | null = null;
  let unifiedTier: string | null = null;
  const propertyId = booking.property_id;
  let mode: Awaited<ReturnType<typeof getRateResolutionMode>> = "legacy";

  if (propertyId) {
    try {
      mode = await getRateResolutionMode(supabase, propertyId);
      const resolver = await createRateResolver(supabase, propertyId, {
        window: { from: checkIn, to: checkOut },
      });
      const unit = resolver.units.find(
        (u) => u.linked_rolos_id && String(u.linked_rolos_id) === String(roomTypeId),
      ) ?? resolver.units[0];

      if (unit) {
        const days = resolver.resolveDays(unit, checkIn, addDays(checkOut, -1));
        if (days.length > 0) {
          const roomCount = booking.rooms?.length || 1;
          unifiedTotal = stayTotalForModel(model, {
            nightlyRates: days.map((d) => d.price),
            adults,
            teens,
            children,
            units: roomCount,
            extraAdultRate: days[0]?.extra_guest_price ?? extraAdultRate ?? undefined,
            childRate: extraChildRate || undefined,
          });
          unifiedTier = days[0].source;
        }
      }

      const parityRows: ParityRow[] = [{
        property_id: propertyId,
        room_type_id: roomTypeId ?? null,
        rate_plan_id: ratePlanId,
        stay_date: checkIn,
        resolved_rate: unifiedTotal,
        resolved_tier: unifiedTier,
        legacy_rate: legacyTotal,
        legacy_tier: "modify_booking_legacy",
        notes: { nights, pricing_model: model, metric: "stay_total" },
      }];
      await logRateParity(supabase, "modify-booking", parityRows);
    } catch (e) {
      console.warn("[modify-booking] parity resolve failed:", (e as Error).message);
    }
  }

  return pickServedRate(mode, legacyTotal, unifiedTotal ?? legacyTotal);
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
    const { booking_id, modifications } = body;

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

    if (isRolNative && paxOrDatesChanged) {
      newTotalPrice = await recalculateRolPrice(supabase, booking, modifications);
      console.log("Recalculated ROL price:", newTotalPrice, "from old:", booking.total_price);
    }

    // S6b: Rentals United bookings must be accepted by RU before we touch the local record.
    // RU only allows Push_ModifyStay_RQ on confirmed reservations.
    let ruModified = false;
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

    if (priceAffected) {
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/calculate-commission`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ booking_id }),
        });
      } catch (commissionErr) {
        console.error("Commission recalculation failed (non-critical):", commissionErr);
      }
    }

    // S9: Update sync status
    if (externalSystem !== "none") {
      await supabase.from("booking_sync_status").upsert(
        {
          booking_id,
          external_system: externalSystem,
          sync_status: "synced",
          last_action: "modify",
          last_action_at: new Date().toISOString(),
          error_message: null,
          last_error_message: null,
        },
        { onConflict: "booking_id,external_system" }
      );
    }

    // Shifted dates change both the old and new nights: refresh the RU window now.
    await queueRuAriDelta(supabase, booking.property_id, "booking_modified", { force: true });


    // S10: Send modification email
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-booking-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          booking_id,
          bookingId: booking_id,
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
        }),
      });
    } catch (emailErr) {
      console.error("Email send failed (non-critical):", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: ruModified
          ? "Booking modified and pushed to the Channel Manager"
          : "Booking modified successfully",
        booking_id,
        ru_modified: ruModified,
        new_total_price: updateData.total_price ?? booking.total_price,
        old_total_price: booking.total_price,
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
