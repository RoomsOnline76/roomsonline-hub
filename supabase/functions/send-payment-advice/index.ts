import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const bodySchema = z.object({
  property_id: z.string().uuid(),
  property_name: z.string(),
  owner_email: z.string().email(),
  gross_amount: z.number(),
  commission_rate: z.number(),
  commission_amount: z.number(),
  fees: z.number(),
  net_amount: z.number(),
  booking_count: z.number(),
  white_label_fee: z.number().optional().default(0),
  subscription_fee: z.number().optional().default(0),
  // Settlement split — who actually received the guest's money.
  rol_gross: z.number().optional(),
  byo_gross: z.number().optional().default(0),
  rol_commission: z.number().optional(),
  byo_commission: z.number().optional().default(0),
  pf_fee: z.number().optional().default(0),
  pf_fee_rate: z.number().optional().default(0),
  invoiced_amount: z.number().optional().default(0),
  settlement_mode: z.enum(["payout", "invoice", "mixed"]).optional().default("payout"),
});


function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = parsed.data;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendKey);
    const now = new Date();
    const periodLabel = now.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

    const mode = body.settlement_mode;
    const byoGross = body.byo_gross || 0;
    const byoCommission = body.byo_commission || 0;
    const rolGross = body.rol_gross ?? Math.max(0, body.gross_amount - byoGross);
    const rolCommission = body.rol_commission ?? Math.max(0, body.commission_amount - byoCommission);
    const invoiced = body.invoiced_amount || 0;
    const isInvoice = mode === "invoice" || (mode === "mixed" && invoiced > 0 && body.net_amount <= 0);

    const docTitle = mode === "invoice"
      ? "Commission Invoice"
      : mode === "mixed" ? "Settlement Statement" : "Payment Advice";
    const prefix = mode === "invoice" ? "CI" : mode === "mixed" ? "SS" : "PA";
    const refNumber = `${prefix}-${body.property_id.substring(0, 6).toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const row = (label: string, value: string, opts: { color?: string; bold?: boolean } = {}) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:${opts.bold ? "#333" : "#666"};${opts.bold ? "font-weight:600" : ""}">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;${opts.color ? `color:${opts.color};` : ""}${opts.bold ? "font-weight:600" : ""}">${value}</td></tr>`;

    const sectionRow = (label: string) =>
      `<tr style="background:#f9fafb"><td colspan="2" style="padding:8px 12px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#71717a;font-weight:600">${label}</td></tr>`;

    let rows = "";

    if (rolGross > 0) {
      if (mode === "mixed") rows += sectionRow("Collected by RoomsOnline");
      rows += row(
        `Gross collected (${body.booking_count} booking${body.booking_count !== 1 ? "s" : ""})`,
        formatCurrency(rolGross),
        { bold: true },
      );
      rows += row("Commission", `−${formatCurrency(rolCommission)}`, { color: "#dc2626" });
      if ((body.pf_fee || 0) > 0) {
        rows += row(
          `RoomsOnline as payment provider (${body.pf_fee_rate}% of processed value)`,
          `−${formatCurrency(body.pf_fee)}`,
          { color: "#dc2626" },
        );
      }
    }

    if (body.white_label_fee > 0) rows += row("White-label fee", `−${formatCurrency(body.white_label_fee)}`, { color: "#dc2626" });
    if (body.subscription_fee > 0) rows += row("Subscription fee", `−${formatCurrency(body.subscription_fee)}`, { color: "#dc2626" });

    if (byoGross > 0) {
      rows += sectionRow("Settled directly to your own merchant account");
      rows += row("Booking value received by you", formatCurrency(byoGross), { bold: true });
      rows += row("Commission due to RoomsOnline", formatCurrency(byoCommission), { color: "#b45309" });
    }

    let totalRow = "";
    if (body.net_amount > 0) {
      totalRow += `<tr style="background:#f0fdf4"><td style="padding:12px;font-weight:700;font-size:15px">Net Payout to you</td><td style="padding:12px;text-align:right;font-weight:700;font-size:16px;color:#16a34a">${formatCurrency(body.net_amount)}</td></tr>`;
    }
    if (invoiced > 0) {
      totalRow += `<tr style="background:#fffbeb"><td style="padding:12px;font-weight:700;font-size:15px">Payable to RoomsOnline</td><td style="padding:12px;text-align:right;font-weight:700;font-size:16px;color:#b45309">${formatCurrency(invoiced)}</td></tr>`;
    }
    if (!totalRow) {
      totalRow = `<tr style="background:#f4f4f5"><td style="padding:12px;font-weight:700;font-size:15px">Balance</td><td style="padding:12px;text-align:right;font-weight:700;font-size:16px">${formatCurrency(0)}</td></tr>`;
    }

    const intro = mode === "invoice"
      ? `Guest payments for <strong>${body.property_name}</strong> were settled directly into your own payment gateway, so no funds are held by RoomsOnline. The commission due on these bookings is invoiced below.`
      : mode === "mixed"
        ? `Below is a combined statement for <strong>${body.property_name}</strong>. Some bookings were processed through the RoomsOnline gateway, others settled directly into your own payment gateway.`
        : `Please find below a summary of collections and payouts for <strong>${body.property_name}</strong>.`;

    const closing = isInvoice
      ? `Please settle the amount payable to RoomsOnline within 14 days, quoting reference <strong>${refNumber}</strong>. If you have any queries, please contact us at <a href="mailto:info@roomsonline.co.za" style="color:#2563eb">info@roomsonline.co.za</a>.`
      : `Payment will be processed within 14 business days to the bank account on file.${invoiced > 0 ? ` Any amount payable to RoomsOnline is due within 14 days, quoting reference <strong>${refNumber}</strong>.` : ""} If you have any queries, please contact us at <a href="mailto:info@roomsonline.co.za" style="color:#2563eb">info@roomsonline.co.za</a>.`;

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
      <div style="background:#18181b;padding:24px 32px">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600">${docTitle}</h1>
        <p style="margin:4px 0 0;color:#a1a1aa;font-size:13px">${periodLabel} · Ref: ${refNumber}</p>
      </div>
      <div style="padding:32px">
        <p style="margin:0 0 4px;font-size:15px;color:#333">Dear Property Owner,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#666;line-height:1.5">${intro}</p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px">
          <tr style="background:#f9fafb">
            <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e5e7eb">Description</td>
            <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e5e7eb;text-align:right">Amount</td>
          </tr>
          ${rows}
          ${totalRow}
        </table>

        <p style="margin:24px 0 0;font-size:12px;color:#999;line-height:1.5">${closing}</p>
      </div>
      <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
        <p style="margin:0;font-size:11px;color:#999;text-align:center">
          RoomsOnline (Pty) Ltd · This is an automated ${docTitle.toLowerCase()} notification.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const { error: emailError } = await resend.emails.send({
      from: "RoomsOnline <hello@notify.roomsonline.co.za>",
      to: [body.owner_email],
      subject: `${docTitle} — ${body.property_name} — ${periodLabel}`,
      html,
    });

    if (emailError) throw emailError;

    // Log to billing_transactions
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase.from("billing_transactions").insert({
      type: isInvoice ? "commission_invoice_sent" : "payment_advice_sent",
      amount: isInvoice ? invoiced : body.net_amount,
      property_id: body.property_id,
      reference_id: refNumber,
      metadata: {
        gross: body.gross_amount,
        commission: body.commission_amount,
        fees: body.fees,
        rol_gross: rolGross,
        byo_gross: byoGross,
        rol_commission: rolCommission,
        byo_commission: byoCommission,
        payment_provider_fee: body.pf_fee,
        payment_provider_fee_rate: body.pf_fee_rate,
        net_payout: body.net_amount,
        invoiced_amount: invoiced,
        settlement_mode: mode,
        period: periodLabel,
        sent_to: body.owner_email,
      },
    });


    return new Response(JSON.stringify({ success: true, reference: refNumber }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-payment-advice error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
