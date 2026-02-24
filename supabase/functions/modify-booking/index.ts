import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  };
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
      // Check PMS tracker for modify capability
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
          // Continue with modification - availability check is best-effort for modify
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
            // Log failure to sync status
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

    // S6: Update local database
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

    // S7: Update sync status
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

    // S8: Send modification email
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
          },
          new_data: modifications,
          note: modifications.note,
        }),
      });
    } catch (emailErr) {
      console.error("Email send failed (non-critical):", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Booking modified successfully",
        booking_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Modify booking error:", error);
    return new Response(
      JSON.stringify({
        code: "INTERNAL_ERROR",
        message: error.message || "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
