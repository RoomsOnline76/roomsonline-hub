import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { releaseChannelBlocksForBooking } from "../_shared/ruReservationParsing.ts";
import { enqueueJobs, kickWorker } from "../_shared/jobQueue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  token: z.string().min(10).max(128),
  reason: z.string().min(3).max(1000).optional(),
  cancel_rooms: z.array(z.number().int().min(0)).optional(),
  confirmed: z.boolean().optional(),
  get_alternatives: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const raw = await req.json();
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { token, reason, cancel_rooms, confirmed, get_alternatives } = parsed.data;

    // Validate token
    const { data: tokenRow, error: tokenError } = await supabase
      .from("guest_portal_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired link." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This link has expired. Please request a new one." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tokenRow.used_for === "cancel") {
      return new Response(
        JSON.stringify({ error: "This booking has already been cancelled via this link." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*, property:properties!bookings_property_id_fkey(id, name, external_system, is_rol_property, experience_engine_enabled, slug)")
      .eq("id", tokenRow.booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (booking.status === "cancelled") {
      return new Response(
        JSON.stringify({ error: "This booking is already cancelled." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const property = booking.property as any;

    // Step 1: If get_alternatives, return AI alternatives before confirming
    if (get_alternatives) {
      let alternatives: any = { alternatives: [], save_message: "" };

      if (property?.experience_engine_enabled) {
        try {
          const eeResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/experience-engine`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                property_id: property.id,
                experience_type: "guest_portal",
                payload: {
                  action: "alternatives",
                  booking_id: booking.id,
                  check_in_date: booking.check_in_date,
                  check_out_date: booking.check_out_date,
                  total_price: booking.total_price,
                  guest_name: booking.guest_name,
                },
              }),
            }
          );
          if (eeResponse.ok) {
            const eeData = await eeResponse.json();
            alternatives = eeData?.data || alternatives;
          }
        } catch (e) {
          console.warn("Failed to get AI alternatives:", e);
        }
      }

      return new Response(
        JSON.stringify({ success: true, step: "alternatives", ...alternatives }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Confirmed cancellation
    if (!confirmed) {
      return new Response(
        JSON.stringify({ error: "Cancellation must be confirmed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!reason || reason.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "A cancellation reason is required (min 3 characters)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const externalSystem = property?.external_system || "none";
    const isRolNative = property?.is_rol_property || externalSystem === "none";
    const isPartialCancel = cancel_rooms && cancel_rooms.length > 0;

    // PMS cancellation for external systems
    if (!isRolNative && externalSystem !== "none" && booking.external_reservation_id) {
      const { data: tracker } = await supabase
        .from("pms_tracker_status")
        .select("has_cancel")
        .eq("system_type", externalSystem)
        .maybeSingle();

      if (!tracker?.has_cancel) {
        return new Response(
          JSON.stringify({ error: "Self-service cancellation is not available for this property. Please contact the property directly." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
              reason: reason.trim(),
            }),
          }
        );

        const pmsResult = await pmsResponse.json();
        if (!pmsResult.success) {
          return new Response(
            JSON.stringify({ error: "Unable to cancel this booking at this time. Please contact the property." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (pmsErr) {
        console.error("PMS cancel failed:", pmsErr);
        return new Response(
          JSON.stringify({ error: "Unable to reach the booking system. Please try again later." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update booking
    const updateData: Record<string, any> = {
      cancellation_reason: `[Guest self-service] ${reason.trim()}`,
      // Self-service cancellations are always guest-initiated — categorise them
      // so the Reports cancellation mix is complete.
      cancellation_reason_category: "guest_request",
      last_modified_at: new Date().toISOString(),
    };

    if (isPartialCancel) {
      const rooms = booking.rooms && Array.isArray(booking.rooms) ? [...booking.rooms] : [];
      for (const idx of cancel_rooms) {
        if (rooms[idx]) rooms[idx] = { ...rooms[idx], status: "CANCELLED" };
      }
      updateData.rooms = rooms;
      if (rooms.every((r: any) => r.status === "CANCELLED")) {
        updateData.status = "cancelled";
      }
    } else {
      updateData.status = "cancelled";
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", booking.id);

    if (updateError) {
      console.error("Booking update failed:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update booking. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Nights closed by a channel reservation are stamped with the booking id and are not
    // touched by the "manual" restore below — release them or the dates stay blocked.
    if (!isPartialCancel) {
      try {
        await releaseChannelBlocksForBooking(supabase, booking.id, "[guest-cancel-booking]");
      } catch (e) {
        console.error("Channel block release failed (non-critical):", e);
      }
    }

    // Restore availability for ROL-native
    if (isRolNative && !isPartialCancel) {
      try {
        const checkIn = new Date(booking.check_in_date);
        const checkOut = new Date(booking.check_out_date);
        const dates: string[] = [];
        for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split("T")[0]);
        }
        for (const date of dates) {
          await supabase
            .from("property_availability")
            .update({ is_stop_sell: false, available_units: 1 })
            .eq("property_id", booking.property_id)
            .eq("date", date)
            .eq("external_system", "manual");
        }
      } catch (e) {
        console.error("Availability restore failed (non-critical):", e);
      }
    }

    // Mark token as used
    await supabase
      .from("guest_portal_tokens")
      .update({ used_for: "cancel" })
      .eq("id", tokenRow.id);

    // The freed nights and the cancellation email follow on the background queue so the guest
    // sees the confirmation immediately instead of waiting on the channel round-trip.
    await enqueueJobs(supabase, [
      {
        type: "channel_ari_delta" as const,
        payload: { property_id: booking.property_id, trigger: "guest_cancelled", force: true },
        options: { dedupeKey: `ari:${booking.property_id}` },
      },
      {
        type: "booking_email" as const,
        payload: {
          booking_id: booking.id,
          type: "cancellation_confirmation",
          reason: reason.trim(),
          partial: isPartialCancel,
          cancelled_rooms: cancel_rooms,
        },
        options: { dedupeKey: `email:cancellation:${booking.id}` },
      },
    ]);
    kickWorker();


    return new Response(
      JSON.stringify({
        success: true,
        message: isPartialCancel
          ? `${cancel_rooms.length} room(s) cancelled successfully`
          : "Booking cancelled successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Guest cancel error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
