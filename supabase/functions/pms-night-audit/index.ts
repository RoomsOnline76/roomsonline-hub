// ============================================================================
// PMS NIGHT AUDIT ENGINE v2.0
// Runs hourly via cron — processes each property when local midnight has passed
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AuditTask {
  task: string;
  status: "success" | "skipped" | "error";
  details?: string;
  count?: number;
  amount?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Support manual trigger with specific property_id
  let manualPropertyId: string | null = null;
  let forceRun = false;
  try {
    const body = await req.json();
    manualPropertyId = body?.property_id || null;
    forceRun = body?.force === true;
  } catch { /* cron sends empty body */ }

  const todayStr = new Date().toISOString().split("T")[0];

  try {
    // Get all active ROL properties with timezone
    const { data: properties, error: propErr } = await supabase
      .from("properties")
      .select("id, name, timezone")
      .eq("is_rol_property", true)
      .eq("is_active", true);

    if (propErr || !properties?.length) {
      return new Response(JSON.stringify({ success: true, message: "No active ROL properties" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetProperties = manualPropertyId
      ? properties.filter((p: any) => p.id === manualPropertyId)
      : properties;

    const results: Record<string, unknown> = {};
    let processedCount = 0;

    for (const property of targetProperties) {
      const tz = property.timezone || "Africa/Johannesburg";

      // Determine the property's current local date/time
      const now = new Date();
      const localTimeStr = now.toLocaleString("en-US", { timeZone: tz });
      const localNow = new Date(localTimeStr);
      const localHour = localNow.getHours();

      // Only run between midnight and 1am local time (or if forced/manual)
      if (!forceRun && !manualPropertyId && (localHour < 0 || localHour >= 1)) {
        continue;
      }

      // Determine audit date (yesterday in property's local timezone)
      const localYesterday = new Date(localNow);
      localYesterday.setDate(localYesterday.getDate() - 1);
      const auditDateStr = localYesterday.toISOString().split("T")[0];

      // Check if already audited today
      if (!forceRun) {
        const { data: existing } = await supabase
          .from("rolos_night_audit_log")
          .select("id")
          .eq("property_id", property.id)
          .eq("audit_date", auditDateStr)
          .eq("status", "completed")
          .maybeSingle();

        if (existing) continue;
      }

      // Create audit log entry
      const { data: auditLog } = await supabase
        .from("rolos_night_audit_log")
        .upsert({
          property_id: property.id,
          audit_date: auditDateStr,
          status: "running",
          started_at: new Date().toISOString(),
        }, { onConflict: "property_id,audit_date" })
        .select()
        .single();

      const auditLogId = auditLog?.id;
      const tasks: AuditTask[] = [];
      let chargesPosted = 0;
      let taxPosted = 0;
      let foliosClosed = 0;
      let roomsRolled = 0;
      let revenueTotal = 0;

      try {
        // ========================================
        // TASK 1: Auto-post Room Charges to Folios
        // For each checked-in booking, post nightly room rate
        // ========================================
        const { data: checkedInBookings } = await supabase
          .from("bookings")
          .select("id, total_price, check_in_date, check_out_date, rolos_folio_id, rolos_rate_plan_id, rolos_room_ids, rooms")
          .eq("property_id", property.id)
          .lte("check_in_date", auditDateStr)
          .gt("check_out_date", auditDateStr)
          .in("status", ["confirmed", "checked_in"]);

        if (checkedInBookings?.length) {
          for (const booking of checkedInBookings) {
            if (!booking.rolos_folio_id) continue;

            // Check if charge already posted for this date
            const { data: existingCharge } = await supabase
              .from("rolos_folio_transactions")
              .select("id")
              .eq("folio_id", booking.rolos_folio_id)
              .eq("type", "charge")
              .like("description", `%Room charge%${auditDateStr}%`)
              .maybeSingle();

            if (existingCharge) continue;

            // Calculate nightly rate
            const nights = Math.max(1, Math.ceil(
              (new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / 86400000
            ));
            const nightlyRate = Math.round(((booking.total_price || 0) / nights) * 100) / 100;

            if (nightlyRate <= 0) continue;

            // Post room charge to folio
            const { error: chargeErr } = await supabase
              .from("rolos_folio_transactions")
              .insert({
                folio_id: booking.rolos_folio_id,
                type: "charge",
                description: `Room charge — ${auditDateStr}`,
                amount: nightlyRate,
              });

            if (!chargeErr) {
              chargesPosted++;
              revenueTotal += nightlyRate;

              // TASK 1b: Auto-post tax on room charge
              const { data: taxRules } = await supabase
                .from("rolos_tax_rules")
                .select("name, rate")
                .eq("property_id", property.id)
                .eq("is_active", true);

              if (taxRules?.length) {
                for (const rule of taxRules) {
                  const taxAmount = Math.round((nightlyRate * Number(rule.rate) / 100) * 100) / 100;
                  if (taxAmount > 0) {
                    await supabase.from("rolos_folio_transactions").insert({
                      folio_id: booking.rolos_folio_id,
                      type: "charge",
                      description: `${rule.name} (${rule.rate}%) — ${auditDateStr}`,
                      amount: taxAmount,
                    });
                    taxPosted += taxAmount;
                  }
                }
              }
            }
          }
          tasks.push({ task: "post_room_charges", status: "success", count: chargesPosted, amount: revenueTotal });
          tasks.push({ task: "post_taxes", status: "success", amount: Math.round(taxPosted * 100) / 100 });
        } else {
          tasks.push({ task: "post_room_charges", status: "skipped", details: "No active bookings" });
        }

        // ========================================
        // TASK 2: Roll Housekeeping States
        // ========================================
        const { data: occupiedRooms } = await supabase
          .from("rolos_rooms")
          .select("id, room_number")
          .eq("property_id", property.id)
          .eq("status", "occupied");

        if (occupiedRooms?.length) {
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
              roomsRolled++;

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
        tasks.push({ task: "roll_housekeeping", status: "success", count: roomsRolled });

        // ========================================
        // TASK 3: Calculate Daily Metrics (ADR/RevPAR/Occupancy)
        // ========================================
        const activeBookings = checkedInBookings || [];
        const { count: totalRooms } = await supabase
          .from("rolos_rooms")
          .select("id", { count: "exact", head: true })
          .eq("property_id", property.id);

        const roomCount = totalRooms || 1;
        const dailyRevenue = revenueTotal || activeBookings.reduce((sum: number, b: any) => {
          const nights = Math.max(1, Math.ceil(
            (new Date(b.check_out_date || auditDateStr).getTime() - new Date(b.check_in_date || auditDateStr).getTime()) / 86400000
          ));
          return sum + ((b.total_price || 0) / nights);
        }, 0);

        const occupiedCount = activeBookings.length;
        const occupancyRate = roomCount > 0 ? (occupiedCount / roomCount) * 100 : 0;
        const adr = occupiedCount > 0 ? dailyRevenue / occupiedCount : 0;
        const revpar = roomCount > 0 ? dailyRevenue / roomCount : 0;

        await supabase.from("rolos_daily_metrics").upsert({
          property_id: property.id,
          date: auditDateStr,
          total_rooms: roomCount,
          occupied_rooms: occupiedCount,
          occupancy_rate: Math.round(occupancyRate * 100) / 100,
          adr: Math.round(adr * 100) / 100,
          revpar: Math.round(revpar * 100) / 100,
          total_revenue: Math.round(dailyRevenue * 100) / 100,
          bookings_count: activeBookings.length,
        }, { onConflict: "property_id,date" });

        tasks.push({ task: "calculate_metrics", status: "success", details: `Occ: ${occupancyRate.toFixed(1)}%, ADR: ${adr.toFixed(2)}, RevPAR: ${revpar.toFixed(2)}` });

        // ========================================
        // TASK 4: Close Balanced Folios
        // ========================================
        const { data: openFolios } = await supabase
          .from("rolos_folios")
          .select("id, booking_id, balance")
          .eq("status", "open")
          .not("booking_id", "is", null);

        if (openFolios?.length) {
          for (const folio of openFolios) {
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
              foliosClosed++;
            }
          }
        }
        tasks.push({ task: "close_folios", status: "success", count: foliosClosed });

        // Update audit log as completed
        if (auditLogId) {
          await supabase.from("rolos_night_audit_log").update({
            status: "completed",
            tasks_json: tasks,
            charges_posted: chargesPosted,
            tax_posted: Math.round(taxPosted * 100) / 100,
            folios_closed: foliosClosed,
            rooms_rolled: roomsRolled,
            revenue_total: Math.round(revenueTotal * 100) / 100,
            completed_at: new Date().toISOString(),
          }).eq("id", auditLogId);
        }

      } catch (err) {
        console.error(`[pms-night-audit] Error for property ${property.id}:`, err);
        tasks.push({ task: "fatal", status: "error", details: String(err) });

        if (auditLogId) {
          await supabase.from("rolos_night_audit_log").update({
            status: "failed",
            tasks_json: tasks,
            error_message: String(err),
            completed_at: new Date().toISOString(),
          }).eq("id", auditLogId);
        }
      }

      results[property.id] = { name: property.name, tasks, chargesPosted, taxPosted, foliosClosed, roomsRolled };
      processedCount++;
    }

    console.log(`[pms-night-audit] Processed ${processedCount} properties`);

    return new Response(
      JSON.stringify({ success: true, properties_processed: processedCount, results }),
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
