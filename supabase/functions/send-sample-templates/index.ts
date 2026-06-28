// One-shot helper: sends every active rolos_message_template for a property
// to a recipient with sample placeholder data, wrapped in the property's
// own branded stationery (logo + colours). Intended for QA/preview only.
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

    // Property branding
    const { data: property } = await supabase
      .from("properties")
      .select("name, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url")
      .eq("id", property_id).single();

    // Portfolio fallback branding (if part of one)
    const { data: portfolioMember } = await supabase
      .from("property_portfolio_members")
      .select("portfolio_id")
      .eq("property_id", property_id)
      .maybeSingle();

    let portfolio: { name?: string | null } | null = null;
    if (portfolioMember?.portfolio_id) {
      const { data } = await supabase
        .from("property_portfolios")
        .select("name")
        .eq("id", portfolioMember.portfolio_id).maybeSingle();
      portfolio = data;
    }

    // Brand kit override (rolos_experience_configs.brand_kit)
    const { data: brandKit } = await supabase
      .from("rolos_experience_configs")
      .select("config")
      .eq("property_id", property_id)
      .eq("experience_type", "brand_kit")
      .maybeSingle();
    const kit = (brandKit?.config || {}) as Record<string, string>;

    const primary = kit.primary_color || property?.brand_primary_color || "#1a1a2e";
    const secondary = kit.secondary_color || property?.brand_secondary_color || "#e8e8e8";
    const fontColor = kit.font_color || property?.brand_font_color || "#333333";
    const logoUrl = kit.logo_url || property?.brand_logo_url || null;
    const propertyName = property?.name || "Sample Property";
    const portfolioName = portfolio?.name || null;
    const displayName = portfolioName || propertyName;

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
      property_name: propertyName,
      check_in: "2026-07-15",
      check_out: "2026-07-18",
      reservation_id: "SAMPLE-RES-0001",
      confirmation_number: "FH-SAMPLE-001",
      total_amount: "R 4,500.00",
      total_price: "R 4,500.00",
      nights: "3",
    };

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
    const results: Array<Record<string, unknown>> = [];

    const year = new Date().getFullYear();

    for (const t of templates || []) {
      const subject = `[SAMPLE] ${resolvePlaceholders(t.subject, sample)}`;
      const bodyHtml = resolvePlaceholders(t.body || "", sample);

      const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:${fontColor};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="background:${primary};padding:20px 24px;text-align:center;">
          ${logoUrl
            ? `<img src="${logoUrl}" alt="${displayName}" style="max-height:60px;max-width:220px;display:inline-block;" />`
            : `<div style="color:#ffffff;font-size:20px;font-weight:bold;">${displayName}</div>`}
        </td></tr>
        <tr><td style="padding:4px 24px 0;">
          <div style="background:${secondary};color:${fontColor};font-size:11px;letter-spacing:0.5px;padding:6px 10px;border-radius:4px;margin-top:12px;display:inline-block;">
            SAMPLE PREVIEW · ${t.name} · ${t.trigger_event}
          </div>
        </td></tr>
        <tr><td style="padding:20px 28px;font-size:14px;line-height:1.6;color:${fontColor};">
          ${bodyHtml}
        </td></tr>
        <tr><td style="border-top:2px solid ${secondary};padding:14px 24px;text-align:center;font-size:11px;color:#888;">
          © ${year} ${displayName}. Sample sent to ${recipient_email}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      const { data, error } = await resend.emails.send({
        from: `${displayName} <noreply@notify.roomsonline.co.za>`,
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

    return new Response(JSON.stringify({
      success: true,
      branding: { primary, secondary, fontColor, logoUrl, displayName },
      count: results.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-sample-templates]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
