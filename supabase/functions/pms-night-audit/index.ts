// ============================================================================
// PMS NIGHT AUDIT ENGINE
// Scheduled daily at midnight UTC (02:00 SAST)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Record<string, unknown> = {};
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const todayStr = new Date().toISOString().split("T")[0];

  try {
    console.log(`[pms-night-audit] Starting night audit for ${yesterdayStr}`);

    // Get all ROL properties
    const { data: properties, error: propErr } = await supabase
      .from("properties")
      .select("id, name")
      .eq("is_rol_property", true)
      .eq("is_active", true);

    if (propErr || !properties?.length) {
      console.log("[pms-night-audit] No active ROL properties found");
      return new Response(JSON.stringify({ success: true, message: "No ROL properties to audit" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[pms-night-audit] Processing ${properties.length} properties`);

    for (const property of properties) {
      const propertyResults: Record<string, unknown> = {};

      try {
        // ========================================
        // TASK 1: Roll Housekeeping States
        // Rooms with checked-out bookings yesterday → dirty
        // ========================================
        const { data: occupiedRooms } = await supabase
          .from("rolos_rooms")
          .select("id, room_number")
          .eq("property_id", property.id)
          .eq("status", "occupied");

        if (occupiedRooms?.length) {
          // Check if any of these rooms have bookings that checked out yesterday
          for (const room of occupiedRooms) {
            const { data: checkouts } = await supabase
              .from("bookings")
              .select("id")
              .eq("property_id", property.id)
              .contains("rolos_room_ids", [room.id])
              .eq("check_out_date", todayStr)
              .in("status", ["confirmed", "checked_in"]);

            if (checkouts?.length) {
              await supabase.from("rolos_rooms").update({ status: "dirty" }).eq("id", room.id);

              // Create housekeeping task if none exists
              const { data: existingTask } = await supabase
                .from("rolos_housekeeping_tasks")
                .select("id")
                .eq("room_id", room.id)
                .eq("status", "pending")
                .eq("task_type", "clean")
                .maybeSingle();

              if (!existingTask) {
                await supabase.from("rolos_housekeeping_tasks").insert({
                  room_id: room.id,
                  task_type: "clean",
                  priority: "normal",
                  status: "pending",
                  scheduled_date: todayStr,
                });
              }
            }
          }
        }
        propertyResults.housekeeping_rolled = true;

        // ========================================
        // TASK 2: Calculate ADR/RevPAR/Occupancy
        // ========================================
        const { data: yesterdayBookings } = await supabase
          .from("bookings")
          .select("total_price, rooms, rolos_room_ids")
          .eq("property_id", property.id)
          .lte("check_in_date", yesterdayStr)
          .gt("check_out_date", yesterdayStr)
          .in("status", ["confirmed", "checked_in"]);

        const { count: totalRooms } = await supabase
          .from("rolos_rooms")
          .select("id", { count: "exact", head: true })
          .eq("property_id", property.id);

        const activeBookings = yesterdayBookings || [];
        const roomCount = totalRooms || 1;
        const totalRevenue = activeBookings.reduce((sum, b) => {
          const nights = Math.max(1, Math.ceil(
            (new Date(b.check_out_date || yesterdayStr).getTime() - new Date(b.check_in_date || yesterdayStr).getTime()) / 86400000
          ));
          return sum + ((b.total_price || 0) / nights);
        }, 0);

        const occupiedCount = activeBookings.length;
        const occupancyRate = roomCount > 0 ? (occupiedCount / roomCount) * 100 : 0;
        const adr = occupiedCount > 0 ? totalRevenue / occupiedCount : 0;
        const revpar = roomCount > 0 ? totalRevenue / roomCount : 0;

        // Upsert daily metrics
        await supabase.from("rolos_daily_metrics").upsert({
          property_id: property.id,
          date: yesterdayStr,
          total_rooms: roomCount,
          occupied_rooms: occupiedCount,
          occupancy_rate: Math.round(occupancyRate * 100) / 100,
          adr: Math.round(adr * 100) / 100,
          revpar: Math.round(revpar * 100) / 100,
          total_revenue: Math.round(totalRevenue * 100) / 100,
          bookings_count: activeBookings.length,
        }, { onConflict: "property_id,date" });

        propertyResults.metrics = { occupancy: occupancyRate, adr, revpar, revenue: totalRevenue };

        // ========================================
        // TASK 3: Close Balanced Folios
        // ========================================
        const { data: openFolios } = await supabase
          .from("rolos_folios")
          .select("id, booking_id, balance")
          .eq("status", "open")
          .not("booking_id", "is", null);

        if (openFolios?.length) {
          for (const folio of openFolios) {
            // Check if booking checked out yesterday
            const { data: booking } = await supabase
              .from("bookings")
              .select("check_out_date, status")
              .eq("id", folio.booking_id)
              .eq("property_id", property.id)
              .single();

            if (booking && booking.check_out_date <= todayStr && (folio.balance === 0 || folio.balance === null)) {
              await supabase.from("rolos_folios").update({
                status: "closed",
                closed_at: new Date().toISOString(),
              }).eq("id", folio.id);
            }
          }
        }
        propertyResults.folios_processed = true;

      } catch (err) {
        console.error(`[pms-night-audit] Error processing property ${property.id}:`, err);
        propertyResults.error = String(err);
      }

      results[property.id] = propertyResults;
    }

    console.log("[pms-night-audit] Night audit completed:", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, audit_date: yesterdayStr, properties_processed: properties.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[pms-night-audit] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
