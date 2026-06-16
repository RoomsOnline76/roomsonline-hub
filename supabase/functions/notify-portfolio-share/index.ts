import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  booking_id: z.string().uuid(),
});

const fmt = (n: number, c = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: c }).format(n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { booking_id } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Idempotency — skip if already notified
    const { data: existingBooking } = await supabase
      .from("bookings")
      .select("id, ai_metadata, guest_name, check_in_date, check_out_date, total_price, external_reservation_id")
      .eq("id", booking_id)
      .maybeSingle();
    if (!existingBooking) {
      return new Response(JSON.stringify({ skipped: "booking_not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const meta = (existingBooking.ai_metadata as Record<string, unknown> | null) ?? {};
    if (meta.portfolio_share_notified) {
      return new Response(JSON.stringify({ skipped: "already_notified" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: attrs, error: attrErr } = await supabase
      .from("booking_revenue_attributions")
      .select("*")
      .eq("booking_id", booking_id);
    if (attrErr) throw attrErr;
    if (!attrs || attrs.length === 0) {
      return new Response(JSON.stringify({ skipped: "no_attributions" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const { data: fromRow } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "RESEND_FROM_EMAIL")
      .maybeSingle();
    const fromEmail = fromRow?.key_value || "Rooms Online <bookings@sleepinafrica.roomsonline.co.za>";

    const sent: Array<{ to: string; status: string }> = [];

    for (const a of attrs) {
      // Property owner(s) of the FROM property (the one earning the share)
      const { data: prop } = await supabase
        .from("properties")
        .select("id, name, brand_logo_url, brand_primary_color, slug")
        .eq("id", a.from_property_id)
        .maybeSingle();
      const { data: toProp } = await supabase
        .from("properties")
        .select("name")
        .eq("id", a.to_property_id)
        .maybeSingle();
      const { data: owners } = await supabase
        .from("property_owners")
        .select("email, name")
        .eq("property_id", a.from_property_id);

      const recipients = (owners ?? []).map((o) => o.email).filter(Boolean);
      if (recipients.length === 0) continue;

      const share = Number(a.share_amount);
      const basis = Number(a.basis_amount);
      const cur = a.currency || "ZAR";
      const accent = prop?.brand_primary_color || "#E91E8C";
      const logo = prop?.brand_logo_url
        ? `<img src="${prop.brand_logo_url}" alt="${prop?.name ?? ""}" style="max-height:48px;margin-bottom:16px"/>`
        : "";

      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1A1A2E">
          ${logo}
          <h2 style="margin:0 0 12px;color:${accent}">New cross-property booking</h2>
          <p>A booking originating from <strong>${prop?.name ?? "your property"}</strong> has just been confirmed at <strong>${toProp?.name ?? "a partner property"}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
            <tr><td style="padding:6px 0;color:#666">Guest</td><td style="text-align:right"><strong>${existingBooking.guest_name ?? ""}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#666">Check-in</td><td style="text-align:right">${existingBooking.check_in_date}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Check-out</td><td style="text-align:right">${existingBooking.check_out_date}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Booking ref</td><td style="text-align:right">${existingBooking.external_reservation_id ?? booking_id.slice(0, 8).toUpperCase()}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Booking total</td><td style="text-align:right">${fmt(basis, cur)}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Origin type</td><td style="text-align:right">${a.origin_type === "portfolio_link" ? "Portfolio link" : "Cross-property site"}</td></tr>
          </table>
          <div style="background:${accent};color:#fff;padding:16px;border-radius:8px;text-align:center;margin:16px 0">
            <div style="font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:.05em">Your share (${a.share_percent}%)</div>
            <div style="font-size:28px;font-weight:600;margin-top:4px">${fmt(share, cur)}</div>
          </div>
          <p style="font-size:13px;color:#666">This share will be included in your next monthly portfolio invoice.</p>
        </div>`;

      try {
        await resend.emails.send({
          from: fromEmail,
          to: recipients,
          subject: `New cross-property booking — ${fmt(share, cur)} share earned`,
          html,
        });
        sent.push(...recipients.map((r) => ({ to: r, status: "sent" })));
      } catch (e) {
        sent.push(...recipients.map((r) => ({ to: r, status: `failed: ${(e as Error).message}` })));
      }
    }

    await supabase
      .from("bookings")
      .update({ ai_metadata: { ...meta, portfolio_share_notified: true } })
      .eq("id", booking_id);

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-portfolio-share error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
