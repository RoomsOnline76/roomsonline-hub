import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cancelRuReservation, isRuBooking, isRuLead } from "../_shared/ruBookingSync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CancelRequest {
  booking_id: string;
  reason: string;
  cancel_rooms?: number[]; // Optional: specific room indices to cancel
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
    const { booking_id, reason, cancel_rooms, cancel_type_id } = body;


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
    const isPartialCancel = cancel_rooms && cancel_rooms.length > 0;

    // S3a: Rentals United bookings live on ROL'OS-native properties, so they are routed by
    // booking origin, not by the property's PMS. RU must accept the cancel BEFORE we touch
    // the local record — many channels answer status 178 ("cancel it in the sales channel").
    let ruMethod: string | null = null;
    if (isRuBooking(booking)) {
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
              "Rentals United rejected the cancellation — the booking was left unchanged.",
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
    if (!isRolNative && externalSystem !== "none" && booking.external_reservation_id) {
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
      last_modified_at: new Date().toISOString(),
      modified_by: user.id,
    };

    if (isPartialCancel) {
      // Cancel specific rooms only
      const rooms = booking.rooms && Array.isArray(booking.rooms) ? [...booking.rooms] : [];
      for (const idx of cancel_rooms) {
        if (rooms[idx]) {
          rooms[idx] = { ...rooms[idx], status: "CANCELLED" };
        }
      }
      const allCancelled = rooms.every((r: any) => r.status === "CANCELLED");
      updateData.rooms = rooms;
      if (allCancelled) {
        updateData.status = "cancelled";
      }
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

    // S8: Update sync status
    if (externalSystem !== "none") {
      await supabase.from("booking_sync_status").upsert(
        {
          booking_id,
          external_system: externalSystem,
          sync_status: "synced",
          last_action: "cancel",
          last_action_at: new Date().toISOString(),
          error_message: null,
          last_error_message: null,
        },
        { onConflict: "booking_id,external_system" }
      );
    }

    // S9: Send cancellation email
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
          type: "cancellation_confirmation",
          reason,
          partial: isPartialCancel,
          cancelled_rooms: cancel_rooms,
        }),
      });
    } catch (emailErr) {
      console.error("Email send failed (non-critical):", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: isPartialCancel
          ? `${cancel_rooms.length} room(s) cancelled successfully`
          : ruMethod
            ? "Booking cancelled and withdrawn at Rentals United"
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
