import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: "invoice_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("owner_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch owner profile
    const { data: owner } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", invoice.owner_id)
      .single();

    if (!owner?.email) {
      return new Response(
        JSON.stringify({ error: "Owner email not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatCurrency = (val: number) =>
      new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val || 0);

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHtml = `
      <h2>RoomsOnline — Monthly Billing Statement</h2>
      <p>Dear ${owner.full_name || 'Property Owner'},</p>
      <p>Your billing statement for the period <strong>${invoice.period_start}</strong> to <strong>${invoice.period_end}</strong> is ready.</p>
      <table style="border-collapse:collapse; width:100%; max-width:500px; margin:20px 0;">
        <tr style="border-bottom:1px solid #ddd;">
          <td style="padding:8px;">Total Commission</td>
          <td style="padding:8px; text-align:right; font-weight:bold;">${formatCurrency(invoice.total_commission)}</td>
        </tr>
        <tr style="border-bottom:1px solid #ddd;">
          <td style="padding:8px;">Total Fees</td>
          <td style="padding:8px; text-align:right; font-weight:bold;">${formatCurrency(invoice.total_fees)}</td>
        </tr>
        <tr style="background:#f9f9f9;">
          <td style="padding:8px; font-weight:bold;">Net Amount</td>
          <td style="padding:8px; text-align:right; font-weight:bold;">${formatCurrency(invoice.net_payout)}</td>
        </tr>
      </table>
      <p>If you have any questions, please contact us at info@roomsonline.co.za.</p>
      <p>Kind regards,<br/>RoomsOnline</p>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "RoomsOnline <noreply@notify.roomsonline.co.za>",
        to: [owner.email],
        subject: `RoomsOnline Billing Statement — ${invoice.period_start} to ${invoice.period_end}`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Resend error:", errBody);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errBody }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update invoice status
    await supabase
      .from("owner_invoices")
      .update({ status: 'sent' })
      .eq("id", invoice_id);

    return new Response(
      JSON.stringify({ success: true, sent_to: owner.email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Send invoice error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
