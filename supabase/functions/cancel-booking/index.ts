import { createClient } from "npm:@supabase/supabase-js@2";
import { cancelRuReservation, isRuBooking, isRuLead } from "../_shared/ruBookingSync.ts";
import { releaseChannelBlocksForBooking } from "../_shared/ruReservationParsing.ts";
import { enqueueJobs, kickWorker } from "../_shared/jobQueue.ts";
import { CANCELLATION_REASON_CATEGORIES } from "../_shared/revenueStatuses.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CancelRequest {
  booking_id: string;
  reason: string;
  /** Structured category used for cancellation analytics. */
  reason_category?: string;
  cancel_rooms?: number[]; // Optional: specific room indices to cancel
  /** Per-unit cancellation: ids of `rolos_booking_rooms` lines to drop. */
  cancel_room_line_ids?: string[];
  /** RU CancelTypeID: 1 = property provider (default), 2 = guest. */
  cancel_type_id?: number;
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

    // Validate auth using getClaims
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
    const user = { id: claimsData.claims.sub };

    const body: CancelRequest = await req.json();
    const { booking_id, reason, reason_category, cancel_rooms, cancel_type_id } = body;
    const requestedLineIds = (body.cancel_room_line_ids || []).filter((id) => typeof id === "string" && id);


    if (!booking_id) {
      return new Response(
        JSON.stringify({ code: "INVALID_REQUEST", message: "booking_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!reason || reason.trim().length < 3) {
      return new Response(
        JSON.stringify({ code: "INVALID_REQUEST", message: "A cancellation reason is required (min 3 chars)" }),
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

    // S2: Check if booking can be cancelled
    if (booking.status === "cancelled") {
      return new Response(
        JSON.stringify({ code: "BOOKING_CANCELLED", message: "Booking is already cancelled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // S3: Determine PMS type and check capabilities
    const property = booking.property;
    const externalSystem = property?.external_system || "none";
    const isRolNative = property?.is_rol_property || externalSystem === "none";
    // Per-unit cancellation: only a partial cancel while at least one line survives.
    // Loading the lines first keeps "cancel the last unit" identical to cancelling the stay.
    let activeLines: {
      id: string;
      room_id: string | null;
      room_type_id: string | null;
      adults: number | null;
      children: number | null;
      teens: number | null;
      infants: number | null;
      pets: number | null;
      rate_charged: number | null;
    }[] = [];
    let lineIdsToCancel: string[] = [];
    if (requestedLineIds.length > 0) {
      const { data: lines } = await supabase
        .from("rolos_booking_rooms")
        .select("id, room_id, room_type_id, adults, children, teens, infants, pets, rate_charged, status")
        .eq("booking_id", booking_id);
      activeLines = ((lines || []) as (typeof activeLines[number] & { status: string | null })[])
        .filter((l) => (l.status || "active") !== "cancelled");
      lineIdsToCancel = requestedLineIds.filter((id) => activeLines.some((l) => l.id === id));
      if (lineIdsToCancel.length === 0) {
        return new Response(
          JSON.stringify({
            code: "LINE_NOT_FOUND",
            message: "Those units are not part of this booking (or are already cancelled).",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    const remainingLines = activeLines.filter((l) => !lineIdsToCancel.includes(l.id));
    const isUnitCancel = lineIdsToCancel.length > 0 && remainingLines.length > 0;
    const isPartialCancel = isUnitCancel || (cancel_rooms && cancel_rooms.length > 0);

    // S3a: Rentals United bookings live on ROL'OS-native properties, so they are routed by
    // booking origin, not by the property's PMS. RU must accept the cancel BEFORE we touch
    // the local record — many channels answer status 178 ("cancel it in the sales channel").
    let ruMethod: string | null = null;
    // A channel reservation cannot be partially withdrawn — dropping one unit is a local
    // change only, so never send a full cancel to the channel here.
    if (isRuBooking(booking) && !isUnitCancel) {
      const ruResult = await cancelRuReservation(supabase, booking, {
        reason,
        cancelTypeId: cancel_type_id,
      });

      if (!ruResult.ok) {
        await supabase.from("booking_sync_status").upsert(
          {
            booking_id,
            external_system: "rentalsunited",
            sync_status: "failed",
            last_action: "cancel",
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
              "The Channel Manager rejected the cancellation — the booking was left unchanged.",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      ruMethod = ruResult.method ?? null;
      await supabase.from("booking_sync_status").upsert(
        {
          booking_id,
          external_system: "rentalsunited",
          sync_status: "synced",
          last_action: isRuLead(booking) ? "reject" : "cancel",
          last_action_at: new Date().toISOString(),
          error_message: null,
          last_error_message: null,
        },
        { onConflict: "booking_id,external_system" }
      );
    }



    // For external PMS, attempt to cancel in PMS first
    if (!isRolNative && externalSystem !== "none" && booking.external_reservation_id && !isUnitCancel) {
      // Check PMS tracker for cancel capability
      const { data: tracker } = await supabase
        .from("pms_tracker_status")
        .select("has_cancel")
        .eq("system_type", externalSystem)
        .maybeSingle();

      if (!tracker?.has_cancel) {
        return new Response(
          JSON.stringify({
            code: "CANCELLATION_NOT_SUPPORTED",
            message: `${externalSystem} does not support booking cancellations via API. Please cancel directly in the PMS.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // S4: Call PMS adapter for cancellation
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
              action: "cancel_reservation",
              property_id: booking.property_id,
              reservation_id: booking.external_reservation_id,
              reason: reason,
            }),
          }
        );

        const pmsResult = await pmsResponse.json();

        if (!pmsResult.success) {
          // Log failure
          await supabase.from("booking_sync_status").upsert(
            {
              booking_id,
              external_system: externalSystem,
              sync_status: "failed",
              last_action: "cancel",
              last_action_at: new Date().toISOString(),
              error_message: pmsResult.error?.message || "PMS cancellation failed",
              last_error_message: pmsResult.error?.message,
            },
            { onConflict: "booking_id,external_system" }
          );

          return new Response(
            JSON.stringify({
              code: pmsResult.error?.code || "PMS_ERROR",
              message: pmsResult.error?.message || "PMS cancellation failed",
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (pmsErr) {
        console.error("PMS cancel call failed:", pmsErr);
        return new Response(
          JSON.stringify({
            code: "PMS_UNAVAILABLE",
            message: "Could not reach PMS to cancel booking",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // S5: Update local database
    const updateData: Record<string, any> = {
      cancellation_reason: reason,
      cancellation_reason_category: CANCELLATION_REASON_CATEGORIES.includes(
        String(reason_category)
      )
        ? reason_category
        // RU CancelTypeID 2 means the guest asked; 1 means the property did.
        : cancel_type_id === 2
        ? "guest_request"
        : cancel_type_id === 1
        ? "property_operator"
        : "other",
      last_modified_at: new Date().toISOString(),
      modified_by: user.id,
    };

    if (isUnitCancel) {
      // Drop the chosen unit lines and re-derive the stay from what is left, so pax and
      // total stop reporting the whole party on the remaining units.
      const { error: lineError } = await supabase
        .from("rolos_booking_rooms")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .in("id", lineIdsToCancel);

      if (lineError) {
        return new Response(
          JSON.stringify({
            code: "UNIT_CANCEL_FAILED",
            message: lineError.message || "Could not cancel that unit",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const sum = (key: "adults" | "children" | "teens" | "infants" | "pets") =>
        remainingLines.reduce((t, l) => t + Number(l[key] || 0), 0);
      const remainingPax = sum("adults") + sum("children") + sum("teens") + sum("infants");
      if (remainingPax > 0) {
        updateData.adults = sum("adults");
        updateData.children = sum("children");
        updateData.teens = sum("teens");
        updateData.infants = sum("infants");
        updateData.pets = sum("pets");
      }

      const cancelledValue = activeLines
        .filter((l) => lineIdsToCancel.includes(l.id))
        .reduce((t, l) => t + Number(l.rate_charged || 0), 0);
      if (cancelledValue > 0) {
        updateData.total_price = Math.max(0, Number(booking.total_price || 0) - cancelledValue);
      }

      const cancelledRoomIds = activeLines
        .filter((l) => lineIdsToCancel.includes(l.id))
        .map((l) => l.room_id)
        .filter((id): id is string => !!id);
      const keptRoomIds = (booking.rolos_room_ids || []).filter(
        (id: string) => !cancelledRoomIds.includes(id),
      );
      updateData.rolos_room_ids = keptRoomIds;

      // The stay's headline room type must still point at a live line.
      if (!remainingLines.some((l) => l.room_type_id === booking.room_type_id)) {
        const nextType = remainingLines.find((l) => l.room_type_id)?.room_type_id;
        if (nextType) updateData.room_type_id = nextType;
      }

      const notes = Array.isArray(booking.modification_notes) ? booking.modification_notes : [];
      updateData.modification_notes = [
        ...notes,
        {
          type: "unit_cancelled",
          at: new Date().toISOString(),
          by: user.id,
          reason,
          cancelled_line_ids: lineIdsToCancel,
          cancelled_room_ids: cancelledRoomIds,
          units_remaining: remainingLines.length,
        },
      ];
    } else if (isPartialCancel) {
      // Legacy index-based path kept for callers that still send cancel_rooms.
      updateData.status = booking.status;
    } else {
      // Cancel entire booking
      updateData.status = "cancelled";
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", booking_id);

    if (updateError) {
      console.error("Local cancel update failed:", updateError);
      return new Response(
        JSON.stringify({
          code: "PARTIAL_SUCCESS",
          message: "PMS cancelled but local database update failed",
          details: updateError.message,
        }),
        { status: 207, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // S5b: Money must follow the cancellation. A part-cancel is repriced like any other
    // modification; a full cancel owes nothing further, so the balance is cleared and whatever the
    // guest paid stays visible for the refund register to work against.
    try {
      if (isUnitCancel && updateData.total_price !== undefined) {
        await applyBookingSettlement(supabase, booking, {
          oldTotal: Number(booking.total_price ?? 0),
          newTotal: Number(updateData.total_price ?? 0),
          raiseRefund: false,
          requestBalance: false,
          reasonNote: `Unit cancelled — ${reason}`.slice(0, 400),
          overpaymentMode: "credit",
        });
      } else if (!isPartialCancel) {
        const received = await resolveAmountPaid(
          supabase,
          booking,
          Number(booking.total_price ?? 0),
        );
        await supabase
          .from("bookings")
          .update({
            amount_paid: received.amount,
            amount_paid_source: received.source === "none" ? null : received.source,
            balance_due: 0,
          })
          .eq("id", booking_id);
      }
    } catch (settleErr) {
      console.error("[cancel-booking] settlement failed (non-critical):", settleErr);
    }



    // S6a: Nights a channel reservation closed are stamped with the booking id, not written by
    // the local "manual" restore below. Without releasing them a cancelled channel stay left the
    // dates blocked on the grid, so release them here for the units that were actually cancelled.
    try {
      if (isUnitCancel) {
        const cancelledTypeIds = [
          ...new Set(
            activeLines
              .filter((l) => lineIdsToCancel.includes(l.id))
              .map((l) => l.room_type_id)
              .filter((id): id is string => !!id),
          ),
        ];
        const names: string[] = [];
        for (const typeId of cancelledTypeIds) {
          const { data: rolos } = await supabase
            .from("rolos_room_types")
            .select("name")
            .eq("id", typeId)
            .maybeSingle();
          if (rolos?.name) names.push(rolos.name);
          const { data: mapped } = await supabase
            .from("hostfully_room_types")
            .select("name")
            .eq("id", typeId)
            .maybeSingle();
          if (mapped?.name) names.push(mapped.name);
        }
        if (names.length) {
          await releaseChannelBlocksForBooking(supabase, booking_id, "[cancel-booking]", names);
        }
      } else {
        await releaseChannelBlocksForBooking(supabase, booking_id, "[cancel-booking]");
      }
    } catch (blockErr) {
      console.error("Channel block release failed (non-critical):", blockErr);
    }

    // S6: For ROL-native properties, restore availability
    if (isRolNative && !isPartialCancel) {
      try {
        // Remove stop-sell entries for cancelled booking dates
        const checkIn = new Date(booking.check_in_date);
        const checkOut = new Date(booking.check_out_date);
        const dates: string[] = [];
        for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split("T")[0]);
        }

        if (dates.length > 0) {
          // Set available_units back and remove stop_sell
          for (const date of dates) {
            await supabase
              .from("property_availability")
              .update({ is_stop_sell: false, available_units: 1 })
              .eq("property_id", booking.property_id)
              .eq("date", date)
              .eq("external_system", "manual");
          }
        }
      } catch (availErr) {
        console.error("Failed to restore availability (non-critical):", availErr);
      }
    }

    // S7: Also update pms_reservations if there's a linked external reservation
    if (booking.external_reservation_id) {
      await supabase
        .from("pms_reservations")
        .update({
          status: isPartialCancel ? undefined : "CANCELLED",
          cancellation_reason: reason,
          cancellation_date: new Date().toISOString(),
        })
        .eq("external_reservation_id", booking.external_reservation_id);
    }

    // S8: Sync-status bookkeeping and the freed-nights channel push are follow-up work: the
    // local cancellation and the released availability are already committed, so both go onto the
    // background queue (kicked immediately below) instead of blocking the response.
    await enqueueJobs(supabase, [
      ...(externalSystem !== "none"
        ? [{
            type: "booking_sync_status" as const,
            payload: {
              booking_id,
              external_system: externalSystem,
              sync_status: "synced",
              last_action: "cancel",
            },
            options: { dedupeKey: `sync:${booking_id}:${externalSystem}:cancel` },
          }]
        : []),
      {
        type: "channel_ari_delta" as const,
        payload: { property_id: booking.property_id, trigger: "booking_cancelled", force: true },
        options: { dedupeKey: `ari:${booking.property_id}` },
      },
    ]);



    // S8b: Raise a refund request when the guest has actually paid, so the money
    // returned is registered, approved and executed through the refund register
    // rather than settled off-system.
    if (!isPartialCancel) {
      const paymentStatus = String(booking.payment_status || "").toLowerCase();
      const alreadyRefunded = ["refunded", "partially_refunded"].includes(paymentStatus);
      const hasFunds = ["paid", "settled", "completed", "partially_paid", "deposit_paid"].includes(
        paymentStatus,
      );
      if (hasFunds && !alreadyRefunded) {
        try {
          const { data: existing } = await supabase
            .from("rolos_refunds")
            .select("id")
            .eq("booking_id", booking_id)
            .in("status", ["pending", "approved", "processed"])
            .limit(1);
          if (!existing || existing.length === 0) {
            // Never request more than the guest actually paid — a deposit-only
            // booking would otherwise be rejected by refunds-api (400).
            const { data: txns } = await supabase
              .from("payment_transactions")
              .select("amount, status")
              .eq("booking_id", booking_id);
            const receivedAmount = (txns ?? [])
              .filter((t: { status?: string | null }) =>
                ["complete", "completed", "paid", "success"].includes(
                  String(t.status || "").toLowerCase(),
                ),
              )
              .reduce((s: number, t: { amount?: number | null }) => s + Number(t.amount || 0), 0);
            const requestAmount = receivedAmount > 0
              ? receivedAmount
              : Number(booking.total_price) || 0;
            const res = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/refunds-api`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({
                  action: "request_refund",
                  booking_id,
                  // The policy entitlement is resolved inside refunds-api; the
                  // request starts at the amount received from the guest.
                  amount: requestAmount,

                  reason: `Cancellation: ${reason}`.slice(0, 500),
                  reason_category: updateData.cancellation_reason_category === "guest_request"
                    ? "guest_request"
                    : updateData.cancellation_reason_category === "channel_cancelled"
                    ? "channel_cancelled"
                    : updateData.cancellation_reason_category === "no_show"
                    ? "no_show"
                    : updateData.cancellation_reason_category === "date_change"
                    ? "date_change"
                    : updateData.cancellation_reason_category === "property_operator"
                    ? "property_operator"
                    : "other",
                }),
              },
            );
            if (!res.ok) {
              console.error("[cancel-booking] refund request failed:", res.status, await res.text());
            }
          }
        } catch (refundErr) {
          console.error("[cancel-booking] refund registration failed (non-critical):", refundErr);
        }
      }
    }

    // S9: Cancellation email — queued, so the operator is not held up by the mail round-trip.
    await enqueueJobs(supabase, [
      {
        type: "booking_email" as const,
        payload: {
          booking_id,
          type: "cancellation_confirmation",
          reason,
          partial: isPartialCancel,
          cancelled_rooms: cancel_rooms,
          cancelled_line_ids: lineIdsToCancel,
        },
        options: {
          dedupeKey: isUnitCancel
            ? `email:cancellation:${booking_id}:${lineIdsToCancel.join("-")}`
            : `email:cancellation:${booking_id}`,
        },
      },
    ]);
    kickWorker();


    return new Response(
      JSON.stringify({
        success: true,
        message: isUnitCancel
          ? `Unit cancelled — ${remainingLines.length} unit${remainingLines.length === 1 ? "" : "s"} still booked`
          : isPartialCancel
          ? `${(cancel_rooms || []).length} room(s) cancelled successfully`
          : ruMethod
            ? "Booking cancelled and withdrawn at the Channel Manager"
            : "Booking cancelled successfully",
        booking_id,
        ru_method: ruMethod,
      }),

      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cancel booking error:", error);
    return new Response(
      JSON.stringify({
        code: "INTERNAL_ERROR",
        message: error.message || "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
