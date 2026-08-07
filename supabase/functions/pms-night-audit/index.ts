// ============================================================================
// PMS NIGHT AUDIT ENGINE v3.0
// Runs hourly via cron — processes each property when local midnight has passed
// Added: pre-arrival message queuing, reconciliation, audit summary email
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveBreakfastConfig, breakfastPortion, splitAccommodationAmount } from "../_shared/revenueStreams.ts";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      .select("id, name, timezone, owner_email")
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
        // ========================================
        const { data: checkedInBookings } = await supabase
          .from("bookings")
          .select("id, total_price, check_in_date, check_out_date, rolos_folio_id, rolos_rate_plan_id, rolos_room_ids, rooms, adults, children")
          .eq("property_id", property.id)
          .lte("check_in_date", auditDateStr)
          .gt("check_out_date", auditDateStr)
          .in("status", ["confirmed", "checked_in"]);

        if (checkedInBookings?.length) {
          for (const booking of checkedInBookings) {
            if (!booking.rolos_folio_id) continue;

            const { data: existingCharge } = await supabase
              .from("rolos_folio_transactions")
              .select("id")
              .eq("folio_id", booking.rolos_folio_id)
              .eq("transaction_type", "charge")
              .like("description", `%Room charge%${auditDateStr}%`)
              .maybeSingle();

            if (existingCharge) continue;

            const nights = Math.max(1, Math.ceil(
              (new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / 86400000
            ));
            const nightlyRate = Math.round(((booking.total_price || 0) / nights) * 100) / 100;

            if (nightlyRate <= 0) continue;

            // Breakfast / F&B split — resolves to a single accommodation line
            // when the property has no breakfast configuration (legacy behaviour).
            const breakfastConfig = await resolveBreakfastConfig(supabase, booking.id, property.id);
            const guests = (booking.adults || 1) + (booking.children || 0);
            const nightlyBreakfast = breakfastConfig
              ? breakfastPortion(breakfastConfig, { nights: 1, guests, rooms: 1 }) /
                (breakfastConfig.basis === "per_stay" ? Math.max(1, nights) : 1)
              : 0;

            const streamLines = splitAccommodationAmount(nightlyRate, Math.round(nightlyBreakfast * 100) / 100, {
              accommodation: `Room charge — ${auditDateStr}`,
              fnb: `${breakfastConfig?.label || "Breakfast"} — ${auditDateStr}`,
            });

            let chargeErr: unknown = null;
            for (const line of streamLines) {
              const { error } = await supabase
                .from("rolos_folio_transactions")
                .insert({
                  folio_id: booking.rolos_folio_id,
                  transaction_type: "charge",
                  description: line.description,
                  amount: line.amount,
                  revenue_stream: line.stream,
                });
              if (error) chargeErr = error;
            }

            if (!chargeErr) {
              chargesPosted++;
              revenueTotal += nightlyRate;

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
                      transaction_type: "charge",
                      description: `${rule.name} (${rule.rate}%) — ${auditDateStr}`,
                      amount: taxAmount,
                      revenue_stream: "accommodation",
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
        // TASK 3: Calculate Daily Metrics
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

        // ========================================
        // TASK 5: Queue Pre-Arrival Messages
        // Finds bookings arriving tomorrow and queues pre_arrival template
        // ========================================
        const tomorrowDate = new Date(localNow);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

        let preArrivalQueued = 0;
        const { data: arrivingTomorrow } = await supabase
          .from("bookings")
          .select("id, guest_email, guest_name")
          .eq("property_id", property.id)
          .eq("check_in_date", tomorrowStr)
          .in("status", ["confirmed"]);

        if (arrivingTomorrow?.length) {
          const { data: preArrivalTemplates } = await supabase
            .from("rolos_message_templates")
            .select("id, subject, body, channel, send_offset_hours")
            .eq("property_id", property.id)
            .eq("trigger_event", "pre_arrival")
            .eq("is_active", true);

          if (preArrivalTemplates?.length) {
            for (const booking of arrivingTomorrow) {
              for (const tpl of preArrivalTemplates) {
                // Check if already queued
                const { data: existingMsg } = await supabase
                  .from("rolos_message_queue")
                  .select("id")
                  .eq("reservation_id", booking.id)
                  .eq("template_id", tpl.id)
                  .maybeSingle();

                if (!existingMsg) {
                  await supabase.from("rolos_message_queue").insert({
                    property_id: property.id,
                    reservation_id: booking.id,
                    template_id: tpl.id,
                    recipient_email: booking.guest_email,
                    subject: tpl.subject,
                    body: tpl.body,
                    channel: tpl.channel,
                    scheduled_at: new Date().toISOString(),
                    status: "pending",
                  });
                  preArrivalQueued++;
                }
              }
            }
          }
        }
        tasks.push({ task: "queue_pre_arrival", status: "success", count: preArrivalQueued, details: `${arrivingTomorrow?.length || 0} arrivals tomorrow` });

        // ========================================
        // TASK 6: Folio Reconciliation
        // Compare folio balances vs payment totals, flag discrepancies
        // ========================================
        let reconDiscrepancies = 0;
        const { data: allOpenFolios } = await supabase
          .from("rolos_folios")
          .select("id, balance, booking_id")
          .eq("property_id", property.id)
          .eq("status", "open");

        if (allOpenFolios?.length) {
          for (const folio of allOpenFolios) {
            // Sum all transactions
            const { data: txs } = await supabase
              .from("rolos_folio_transactions")
              .select("amount")
              .eq("folio_id", folio.id);

            const calculatedBalance = (txs || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
            const roundedCalc = Math.round(calculatedBalance * 100) / 100;
            const storedBalance = Number(folio.balance) || 0;

            if (Math.abs(roundedCalc - storedBalance) > 0.01) {
              // Fix the discrepancy
              await supabase.from("rolos_folios")
                .update({ balance: roundedCalc })
                .eq("id", folio.id);
              reconDiscrepancies++;
            }
          }
        }
        tasks.push({
          task: "reconcile_folios",
          status: reconDiscrepancies > 0 ? "success" : "success",
          count: reconDiscrepancies,
          details: reconDiscrepancies > 0
            ? `${reconDiscrepancies} balance discrepancies corrected`
            : `${allOpenFolios?.length || 0} folios verified`,
        });

        // ========================================
        // TASK 7: Group block auto-release (+ attrition)
        // Blocks past their release date go back to sellable inventory.
        // ========================================
        try {
          const groupsRes = await fetch(`${supabaseUrl}/functions/v1/pms-groups`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ action: "group_release_due_blocks", property_id: property.id }),
          });
          const groupsData = await groupsRes.json();
          const processed = Number(groupsData?.processed || 0);
          tasks.push({
            task: "release_group_blocks",
            status: groupsRes.ok ? "success" : "failed",
            count: processed,
            details: groupsRes.ok
              ? (processed > 0 ? `${processed} group block(s) released` : "No blocks due for release")
              : `Release sweep failed: ${groupsData?.error || groupsRes.status}`,
          });
        } catch (groupErr) {
          tasks.push({
            task: "release_group_blocks",
            status: "failed",
            count: 0,
            details: `Release sweep error: ${groupErr instanceof Error ? groupErr.message : String(groupErr)}`,
          });
        }

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

        // ========================================
        // TASK 7: Send Audit Summary Email
        // ========================================
        try {
          await sendAuditSummaryEmail(property, auditDateStr, tasks, {
            chargesPosted, taxPosted, foliosClosed, roomsRolled, revenueTotal,
            preArrivalQueued, reconDiscrepancies,
            occupancyRate, adr, revpar,
          });
          tasks.push({ task: "send_audit_email", status: "success" });
        } catch (emailErr) {
          console.error(`[pms-night-audit] Email send failed for ${property.id}:`, emailErr);
          tasks.push({ task: "send_audit_email", status: "error", details: String(emailErr) });
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

// ============================================================================
// Send audit summary email via Resend
// ============================================================================
async function sendAuditSummaryEmail(
  property: { id: string; name: string; owner_email?: string },
  auditDate: string,
  tasks: AuditTask[],
  metrics: {
    chargesPosted: number; taxPosted: number; foliosClosed: number;
    roomsRolled: number; revenueTotal: number; preArrivalQueued: number;
    reconDiscrepancies: number; occupancyRate: number; adr: number; revpar: number;
  }
) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("[pms-night-audit] RESEND_API_KEY not set, skipping email");
    return;
  }

  const recipientEmail = property.owner_email || "info@roomsonline.co.za";
  const failedTasks = tasks.filter(t => t.status === "error");
  const statusEmoji = failedTasks.length > 0 ? "⚠️" : "✅";

  const taskRows = tasks.map(t => {
    const icon = t.status === "success" ? "✅" : t.status === "skipped" ? "⏭️" : "❌";
    const detail = [
      t.count !== undefined ? `Count: ${t.count}` : "",
      t.amount !== undefined ? `Amount: R ${t.amount.toFixed(2)}` : "",
      t.details || "",
    ].filter(Boolean).join(" · ");
    return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${icon} ${t.task.replace(/_/g, " ")}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${t.status}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#666;">${detail}</td></tr>`;
  }).join("");

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:40px;color:#1a1a2e;max-width:700px;margin:0 auto;">
  <h1 style="font-size:22px;margin-bottom:4px;">${statusEmoji} Night Audit Summary</h1>
  <p style="color:#666;margin-top:0;">${property.name} — ${auditDate}</p>

  <div style="display:flex;gap:16px;flex-wrap:wrap;margin:20px 0;">
    <div style="background:#f0fdf4;padding:12px 16px;border-radius:8px;flex:1;min-width:120px;">
      <div style="font-size:24px;font-weight:700;">R ${metrics.revenueTotal.toFixed(2)}</div>
      <div style="font-size:12px;color:#666;">Revenue Posted</div>
    </div>
    <div style="background:#eff6ff;padding:12px 16px;border-radius:8px;flex:1;min-width:120px;">
      <div style="font-size:24px;font-weight:700;">${metrics.occupancyRate.toFixed(1)}%</div>
      <div style="font-size:12px;color:#666;">Occupancy</div>
    </div>
    <div style="background:#fef3c7;padding:12px 16px;border-radius:8px;flex:1;min-width:120px;">
      <div style="font-size:24px;font-weight:700;">R ${metrics.adr.toFixed(2)}</div>
      <div style="font-size:12px;color:#666;">ADR</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <thead><tr style="background:#f8f8f8;">
      <th style="padding:8px 12px;text-align:left;">Task</th>
      <th style="padding:8px 12px;text-align:left;">Status</th>
      <th style="padding:8px 12px;text-align:left;">Details</th>
    </tr></thead>
    <tbody>${taskRows}</tbody>
  </table>

  <div style="margin-top:16px;padding:12px;background:#f8f8f8;border-radius:6px;font-size:13px;color:#666;">
    <strong>Quick Stats:</strong> ${metrics.chargesPosted} charges · R ${metrics.taxPosted.toFixed(2)} tax · ${metrics.foliosClosed} folios closed · ${metrics.roomsRolled} rooms rolled · ${metrics.preArrivalQueued} pre-arrival emails queued${metrics.reconDiscrepancies > 0 ? ` · ⚠️ ${metrics.reconDiscrepancies} recon fixes` : ""}
  </div>

  <p style="margin-top:24px;font-size:11px;color:#999;text-align:center;">
    Generated by ROL'OS Night Audit Engine v3.0
  </p>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "ROL'OS <noreply@notify.roomsonline.co.za>",
      to: [recipientEmail],
      subject: `${statusEmoji} Night Audit — ${property.name} — ${auditDate}`,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error: ${res.status} ${errText}`);
  }
}
