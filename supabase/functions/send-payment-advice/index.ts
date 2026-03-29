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
    const refNumber = `PA-${body.property_id.substring(0, 6).toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Build fee breakdown rows
    let feeRows = "";
    if (body.white_label_fee > 0) {
      feeRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">White-label fee</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#dc2626">−${formatCurrency(body.white_label_fee)}</td></tr>`;
    }
    if (body.subscription_fee > 0) {
      feeRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">Subscription fee</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#dc2626">−${formatCurrency(body.subscription_fee)}</td></tr>`;
    }
    if (body.fees > 0 && body.white_label_fee === 0 && body.subscription_fee === 0) {
      feeRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">Additional fees</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#dc2626">−${formatCurrency(body.fees)}</td></tr>`;
    }

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
      <div style="background:#18181b;padding:24px 32px">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600">Payment Advice</h1>
        <p style="margin:4px 0 0;color:#a1a1aa;font-size:13px">${periodLabel} · Ref: ${refNumber}</p>
      </div>
      <div style="padding:32px">
        <p style="margin:0 0 4px;font-size:15px;color:#333">Dear Property Owner,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#666;line-height:1.5">
          Please find below a summary of collections and payouts for <strong>${body.property_name}</strong>.
        </p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px">
          <tr style="background:#f9fafb">
            <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e5e7eb">Description</td>
            <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #e5e7eb;text-align:right">Amount</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#333">Gross Collected (${body.booking_count} booking${body.booking_count !== 1 ? "s" : ""})</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${formatCurrency(body.gross_amount)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">Commission (${body.commission_rate}%)</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#dc2626">−${formatCurrency(body.commission_amount)}</td>
          </tr>
          ${feeRows}
          <tr style="background:#f0fdf4">
            <td style="padding:12px;font-weight:700;font-size:15px">Net Payout</td>
            <td style="padding:12px;text-align:right;font-weight:700;font-size:16px;color:#16a34a">${formatCurrency(body.net_amount)}</td>
          </tr>
        </table>

        <p style="margin:24px 0 0;font-size:12px;color:#999;line-height:1.5">
          Payment will be processed within 14 business days to the bank account on file. If you have any queries, please contact us at <a href="mailto:info@roomsonline.co.za" style="color:#2563eb">info@roomsonline.co.za</a>.
        </p>
      </div>
      <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
        <p style="margin:0;font-size:11px;color:#999;text-align:center">
          RoomsOnline (Pty) Ltd · This is an automated payment advice notification.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const { error: emailError } = await resend.emails.send({
      from: "RoomsOnline <hello@notify.roomsonline.co.za>",
      to: [body.owner_email],
      subject: `Payment Advice — ${body.property_name} — ${periodLabel}`,
      html,
    });

    if (emailError) throw emailError;

    // Log to billing_transactions
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase.from("billing_transactions").insert({
      type: "payment_advice_sent",
      amount: body.net_amount,
      property_id: body.property_id,
      reference_id: refNumber,
      metadata: {
        gross: body.gross_amount,
        commission: body.commission_amount,
        fees: body.fees,
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
