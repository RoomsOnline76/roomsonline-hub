// ============================================================================
// PMS MESSAGE DISPATCHER v1.0
// Processes message queue, resolves template placeholders, sends via Resend
// Supports: template CRUD, queue processing, manual send, message log
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { getCaller, canAccessProperty, isPlatformAdmin } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getServiceSupabase() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey);
}

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Error("UNAUTHORIZED");
  }
  return data.claims.sub as string;
}

/** Resolve {{placeholders}} in text */
function resolvePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/** Build placeholder map from reservation + guest data */
function buildPlaceholderMap(reservation: any, guest: any, property: any): Record<string, string> {
  return {
    guest_name: guest?.full_name || guest?.first_name || "Guest",
    guest_first_name: guest?.first_name || "Guest",
    guest_email: guest?.email || "",
    property_name: property?.name || "",
    check_in: reservation?.check_in_date || "",
    check_out: reservation?.check_out_date || "",
    reservation_id: reservation?.id || "",
    confirmation_number: reservation?.rol_reference || reservation?.confirmation_number || reservation?.rol_reference_legacy || reservation?.external_reservation_id || "",
    total_amount: reservation?.total_amount ? Number(reservation.total_amount).toFixed(2) : "0.00",
    nights: reservation?.check_in_date && reservation?.check_out_date
      ? String(Math.ceil((new Date(reservation.check_out_date).getTime() - new Date(reservation.check_in_date).getTime()) / 86400000))
      : "0",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate: internal callers (service role / scheduled job) or a signed-in user.
    const caller = await getCaller(req);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const forbidden = () => new Response(JSON.stringify({ error: "Not allowed" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const supabase = getServiceSupabase();
    const body = await req.json();
    const { action, property_id } = body;

    // Queue processing is a system task; every other action is scoped to a
    // property the signed-in caller manages.
    if (caller.kind === "user") {
      if (action === "process_queue") {
        if (!(await isPlatformAdmin(caller.userId))) return forbidden();
      } else if (!(await canAccessProperty(caller.userId, property_id))) {
        return forbidden();
      }
    }

    /** Recipient must be the guest on a reservation of this property, or the caller. */
    const recipientAllowed = async (email: string | null | undefined, reservationId: string | null | undefined): Promise<boolean> => {
      if (!email) return false;
      const target = String(email).trim().toLowerCase();
      if (caller.kind !== "user") return true;
      if (caller.email && caller.email.toLowerCase() === target) return true;
      if (!reservationId) return false;
      const { data: res } = await supabase.from("rolos_reservations").select("*").eq("id", reservationId).maybeSingle();
      if (!res || res.property_id !== property_id) return false;
      const emails = [res.guest_email, res.email].filter(Boolean).map((e: string) => String(e).toLowerCase());
      if (res.guest_profile_id) {
        const { data: g } = await supabase.from("rolos_guest_profiles").select("email").eq("id", res.guest_profile_id).maybeSingle();
        if (g?.email) emails.push(String(g.email).toLowerCase());
      }
      return emails.includes(target);
    };

    // ── Template CRUD ────────────────────────────────────────────────
    if (action === "list_templates") {
      const { data, error } = await supabase
        .from("rolos_message_templates")
        .select("*")
        .eq("property_id", property_id)
        .order("trigger_event");
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "upsert_template") {
      const { template } = body;
      const t = (template ?? {}) as Record<string, unknown>;
      // Only editable template fields; ownership columns are never taken from the caller.
      const payload: Record<string, unknown> = { property_id };
      for (const k of ["name", "trigger_event", "subject", "body", "channel", "is_active", "send_offset_hours"]) {
        if (k in t) payload[k] = t[k];
      }
      let result;
      if (t.id) {
        const { data, error } = await supabase.from("rolos_message_templates").update(payload).eq("id", t.id as string).eq("property_id", property_id).select().single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase.from("rolos_message_templates").insert(payload).select().single();
        if (error) throw error;
        result = data;
      }
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_template") {
      const { template_id } = body;
      const { error } = await supabase.from("rolos_message_templates").delete().eq("id", template_id).eq("property_id", property_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Queue a message ──────────────────────────────────────────────
    if (action === "queue_message") {
      const { reservation_id, template_id, recipient_email, recipient_phone, subject, body: msgBody, channel, scheduled_at } = body;
      if (recipient_email && !(await recipientAllowed(recipient_email, reservation_id))) return forbidden();
      if (!recipient_email && caller.kind === "user") return forbidden();
      const { data, error } = await supabase.from("rolos_message_queue").insert({
        property_id, reservation_id, template_id,
        recipient_email, recipient_phone,
        subject: subject || "", body: msgBody || "",
        channel: channel || "email",
        scheduled_at: scheduled_at || new Date().toISOString(),
        status: "pending",
      }).select().single();
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Send a single message immediately (manual send / test) ───────
    if (action === "send_message") {
      const { recipient_email, subject, body: msgBody, reservation_id, template_id } = body;
      if (!recipient_email || !subject) throw new Error("recipient_email and subject required");
      if (!(await recipientAllowed(recipient_email, reservation_id))) return forbidden();

      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) throw new Error("RESEND_API_KEY not configured");
      const resend = new Resend(resendKey);

      // Get property name for From
      const { data: prop } = await supabase.from("properties").select("name").eq("id", property_id).single();
      const fromName = prop?.name || "ROL'OS PMS";

      const { error: sendErr } = await resend.emails.send({
        from: `${fromName} <noreply@notify.roomsonline.co.za>`,
        to: [recipient_email],
        subject,
        html: msgBody || "<p>No content</p>",
      });

      const logStatus = sendErr ? "failed" : "sent";
      await supabase.from("rolos_message_log").insert({
        property_id, reservation_id, template_id,
        recipient_email, channel: "email", subject,
        status: logStatus,
        error_message: sendErr ? JSON.stringify(sendErr) : null,
      });

      if (sendErr) throw sendErr;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Process queue (called by cron or manually) ───────────────────
    if (action === "process_queue") {
      const now = new Date().toISOString();
      const { data: pending, error: fetchErr } = await supabase
        .from("rolos_message_queue")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_at", now)
        .order("scheduled_at")
        .limit(50);
      if (fetchErr) throw fetchErr;

      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) throw new Error("RESEND_API_KEY not configured");
      const resend = new Resend(resendKey);

      let sent = 0, failed = 0;

      for (const msg of (pending || [])) {
        // Mark processing
        await supabase.from("rolos_message_queue").update({ status: "processing" }).eq("id", msg.id);

        try {
          // Get property name
          const { data: prop } = await supabase.from("properties").select("name").eq("id", msg.property_id).single();

          // Resolve placeholders if reservation exists
          let finalSubject = msg.subject;
          let finalBody = msg.body;

          if (msg.reservation_id) {
            const { data: res } = await supabase.from("rolos_reservations").select("*").eq("id", msg.reservation_id).single();
            const { data: guest } = res?.guest_profile_id
              ? await supabase.from("rolos_guest_profiles").select("*").eq("id", res.guest_profile_id).single()
              : { data: null };
            const vars = buildPlaceholderMap(res, guest, prop);
            finalSubject = resolvePlaceholders(finalSubject, vars);
            finalBody = resolvePlaceholders(finalBody, vars);
          }

          if (msg.channel === "email" && msg.recipient_email) {
            const { error: sendErr } = await resend.emails.send({
              from: `${prop?.name || "ROL'OS PMS"} <noreply@notify.roomsonline.co.za>`,
              to: [msg.recipient_email],
              subject: finalSubject,
              html: finalBody || "<p>No content</p>",
            });
            if (sendErr) throw sendErr;
          }

          // Mark sent
          await supabase.from("rolos_message_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", msg.id);
          await supabase.from("rolos_message_log").insert({
            property_id: msg.property_id, reservation_id: msg.reservation_id,
            template_id: msg.template_id, recipient_email: msg.recipient_email,
            channel: msg.channel, subject: finalSubject, status: "sent",
          });
          sent++;
        } catch (err) {
          await supabase.from("rolos_message_queue").update({ status: "failed", error_message: String(err) }).eq("id", msg.id);
          await supabase.from("rolos_message_log").insert({
            property_id: msg.property_id, reservation_id: msg.reservation_id,
            template_id: msg.template_id, recipient_email: msg.recipient_email,
            channel: msg.channel, subject: msg.subject, status: "failed",
            error_message: String(err),
          });
          failed++;
        }
      }

      return new Response(JSON.stringify({ processed: (pending || []).length, sent, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Get message log ──────────────────────────────────────────────
    if (action === "get_message_log") {
      const limit = body.limit || 100;
      const { data, error } = await supabase
        .from("rolos_message_log")
        .select("*")
        .eq("property_id", property_id)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Get queue ────────────────────────────────────────────────────
    if (action === "get_queue") {
      const { data, error } = await supabase
        .from("rolos_message_queue")
        .select("*")
        .eq("property_id", property_id)
        .order("scheduled_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    console.error("pms-message-dispatcher error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
