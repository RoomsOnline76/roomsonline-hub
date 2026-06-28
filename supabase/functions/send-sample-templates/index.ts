// One-shot helper: sends every active rolos_message_template for a property
// to a recipient with sample placeholder data. Intended for QA/preview only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function resolvePlaceholders(text: string, vars: Record<string, string>): string {
  return (text || "").replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { property_id, recipient_email } = await req.json();
    if (!property_id || !recipient_email) {
      return new Response(JSON.stringify({ error: "property_id and recipient_email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: property } = await supabase
      .from("properties").select("name").eq("id", property_id).single();
    const fromName = property?.name || "ROL'OS PMS";

    const { data: templates, error: tplErr } = await supabase
      .from("rolos_message_templates")
      .select("*")
      .eq("property_id", property_id)
      .eq("is_active", true)
      .order("trigger_event");
    if (tplErr) throw tplErr;

    const sample = {
      guest_name: "Dawie Sample",
      guest_first_name: "Dawie",
      guest_email: recipient_email,
      property_name: property?.name || "Sample Property",
      check_in: "2026-07-15",
      check_out: "2026-07-18",
      reservation_id: "SAMPLE-RES-0001",
      confirmation_number: "FH-SAMPLE-001",
      total_amount: "4500.00",
      nights: "3",
    };

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
    const results: Array<Record<string, unknown>> = [];

    for (const t of templates || []) {
      const subject = `[SAMPLE] ${resolvePlaceholders(t.subject, sample)}`;
      const html = `
        <div style="font-family:Arial,sans-serif;color:#1a1a2e;">
          <div style="background:#E91E8C;color:#fff;padding:10px 16px;font-size:12px;border-radius:6px 6px 0 0;">
            SAMPLE TEMPLATE PREVIEW · ${t.name} · ${t.trigger_event}
          </div>
          <div style="border:1px solid #eee;border-top:none;padding:16px;border-radius:0 0 6px 6px;">
            ${resolvePlaceholders(t.body || "", sample)}
          </div>
          <p style="font-size:11px;color:#888;margin-top:12px;">
            This is a sample rendering for ${fromName} sent to ${recipient_email}.
          </p>
        </div>`;

      const { data, error } = await resend.emails.send({
        from: `${fromName} <noreply@notify.roomsonline.co.za>`,
        to: [recipient_email],
        subject,
        html,
      });

      results.push({
        template: t.name,
        trigger_event: t.trigger_event,
        status: error ? "failed" : "sent",
        id: data?.id ?? null,
        error: error ? String(error.message || error) : null,
      });

      await supabase.from("rolos_message_log").insert({
        property_id, template_id: t.id, recipient_email,
        channel: "email", subject,
        status: error ? "failed" : "sent",
        error_message: error ? JSON.stringify(error) : null,
      });
    }

    return new Response(JSON.stringify({ success: true, count: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-sample-templates]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
