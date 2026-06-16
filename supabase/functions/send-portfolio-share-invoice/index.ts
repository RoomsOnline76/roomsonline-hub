// Sends a portfolio share invoice as a branded HTML email from the issuing property to the paying property
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) throw new Error("invoice_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: inv, error } = await supabase
      .from("portfolio_share_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();
    if (error) throw error;

    const { data: fromProp } = await supabase
      .from("properties")
      .select("name, owner_email, brand_logo_url, brand_primary_color, address, city, country")
      .eq("id", inv.from_property_id).single();
    const { data: toProp } = await supabase
      .from("properties")
      .select("name, owner_email")
      .eq("id", inv.to_property_id).single();

    const { data: lines } = await supabase
      .from("booking_revenue_attributions")
      .select("booking_id, basis_amount, share_percent, share_amount, origin_type, created_at")
      .eq("invoice_id", invoice_id);

    const primary = fromProp?.brand_primary_color ?? "#1A1A2E";
    const html = `
<!doctype html><html><body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A1A2E;max-width:680px;margin:0 auto;padding:32px;">
  <div style="border-bottom:3px solid ${primary};padding-bottom:16px;margin-bottom:24px;">
    ${fromProp?.brand_logo_url ? `<img src="${fromProp.brand_logo_url}" alt="${fromProp.name}" style="max-height:60px;"/>` : `<h1 style="margin:0;color:${primary}">${fromProp?.name ?? ""}</h1>`}
    <p style="margin:8px 0 0;font-size:12px;color:#666">${[fromProp?.address, fromProp?.city, fromProp?.country].filter(Boolean).join(", ")}</p>
  </div>
  <h2 style="color:${primary};margin:0 0 8px">Cross-Property Booking Share Invoice</h2>
  <p style="font-size:13px;color:#666;margin:0 0 24px">Invoice #${inv.invoice_number} · Period ${inv.period_start} → ${inv.period_end}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:8px 0;font-size:13px;color:#666">Billed to</td><td style="text-align:right"><strong>${toProp?.name}</strong><br/><span style="font-size:12px;color:#666">${toProp?.owner_email ?? ""}</span></td></tr>
    <tr><td style="padding:8px 0;font-size:13px;color:#666">Currency</td><td style="text-align:right"><strong>${inv.currency}</strong></td></tr>
  </table>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee">
    <thead><tr style="background:#f7f7f7"><th style="text-align:left;padding:8px;font-size:11px">Booking</th><th style="text-align:left;padding:8px;font-size:11px">Origin</th><th style="text-align:right;padding:8px;font-size:11px">Basis</th><th style="text-align:right;padding:8px;font-size:11px">%</th><th style="text-align:right;padding:8px;font-size:11px">Share</th></tr></thead>
    <tbody>
      ${(lines ?? []).map(l => `<tr style="border-top:1px solid #eee"><td style="padding:6px 8px;font-size:11px">${l.booking_id.slice(0,8)}</td><td style="padding:6px 8px;font-size:11px">${l.origin_type}</td><td style="text-align:right;padding:6px 8px;font-size:11px">${Number(l.basis_amount).toFixed(2)}</td><td style="text-align:right;padding:6px 8px;font-size:11px">${Number(l.share_percent).toFixed(2)}</td><td style="text-align:right;padding:6px 8px;font-size:11px"><strong>${Number(l.share_amount).toFixed(2)}</strong></td></tr>`).join("")}
    </tbody>
    <tfoot><tr style="border-top:2px solid ${primary}"><td colspan="4" style="text-align:right;padding:12px 8px;font-size:14px"><strong>Total due</strong></td><td style="text-align:right;padding:12px 8px;font-size:14px;color:${primary}"><strong>${inv.currency} ${Number(inv.total).toFixed(2)}</strong></td></tr></tfoot>
  </table>
  <p style="font-size:12px;color:#666;margin-top:32px">Please remit payment to ${fromProp?.name}. Reference invoice #${inv.invoice_number}.</p>
</body></html>`;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey && toProp?.owner_email) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: `${fromProp?.name ?? "RoomsOnline"} <noreply@sleepinafrica.roomsonline.co.za>`,
        to: [toProp.owner_email],
        cc: fromProp?.owner_email ? [fromProp.owner_email] : undefined,
        subject: `Booking share invoice ${inv.invoice_number} — ${inv.currency} ${Number(inv.total).toFixed(2)}`,
        html,
      });
    }

    await supabase
      .from("portfolio_share_invoices")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", invoice_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
