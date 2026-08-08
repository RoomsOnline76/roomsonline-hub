/**
 * send-commission-statement — emails a referral partner their monthly paysheet.
 *
 * The email carries the same numbers as the PDF: per-property commission, the
 * rate applied, adjustments, and the net payable with its payment reference.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const bodySchema = z.object({
  statement_id: z.string().uuid(),
  /** Override the recipient (defaults to the partner's account email). */
  to: z.string().email().optional(),
});

const fmt = (n: unknown) =>
  `R ${(Number(n) || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin-only: this discloses partner earnings and banking references.
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ success: false, error: "Missing authorization header" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ success: false, error: "Invalid token" }, 401);
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ["admin", "dev", "fearless_leader"].includes(r))) {
      return json({ success: false, error: "Requires admin, dev or fearless_leader role" }, 403);
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ success: false, error: "Email service not configured" }, 500);

    const { data: statement, error: statementError } = await supabase
      .from("rep_commission_reports")
      .select("*, sales_reps(display_name, rep_code, email)")
      .eq("id", parsed.data.statement_id)
      .single();
    if (statementError || !statement) return json({ success: false, error: "Statement not found" }, 404);
    if (["draft", "pending_approval"].includes(statement.status)) {
      return json({ success: false, error: "Approve the statement before emailing it" }, 409);
    }

    const recipient = parsed.data.to || statement.sales_reps?.email;
    if (!recipient) return json({ success: false, error: "No email address on file for this partner" }, 400);

    const { data: lines } = await supabase
      .from("rep_commission_entries")
      .select("*, properties(name)")
      .eq("report_id", statement.id)
      .order("amount", { ascending: false });

    // deno-lint-ignore no-explicit-any
    const rows = (lines || []) as any[];
    const commissionRows = rows.filter((l) => (l.line_kind || "commission") === "commission");
    const adjustmentRows = rows.filter((l) => (l.line_kind || "commission") !== "commission");

    const propertyRows = commissionRows
      .map(
        (l) => `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eee">${l.properties?.name || "Unallocated"}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(l.base_revenue)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${Number(l.rate_applied) || 0}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(l.amount)}</td>
        </tr>`,
      )
      .join("");

    const adjustmentBlock = adjustmentRows.length
      ? `<h3 style="margin:24px 0 8px;font-size:13px;color:#1A1A2E">Adjustments</h3>
         <table style="width:100%;border-collapse:collapse;font-size:12px">
           ${adjustmentRows
             .map(
               (l) => `<tr>
                 <td style="padding:8px 10px;border-bottom:1px solid #eee">${l.description || l.clawback_reason || "Adjustment"}</td>
                 <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(l.amount)}</td>
               </tr>`,
             )
             .join("")}
         </table>`
      : "";

    const reference = statement.paid_reference || statement.statement_reference || "—";
    const period = monthLabel(statement.period_month);

    const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#f6f6f8;font-family:Arial,Helvetica,sans-serif;color:#1A1A2E">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="padding:24px 28px;border-bottom:1px solid #eee">
        <p style="margin:0;font-size:11px;letter-spacing:1px;color:#E91E8C;font-weight:700">ROOMSONLINE</p>
        <h1 style="margin:6px 0 0;font-size:18px">Commission statement — ${period}</h1>
        <p style="margin:6px 0 0;font-size:12px;color:#6e6e7d">
          ${statement.sales_reps?.display_name || "Referral partner"}
          ${statement.sales_reps?.rep_code ? ` · ${statement.sales_reps.rep_code}` : ""}
          · Reference <strong style="font-family:monospace">${reference}</strong>
        </p>
      </div>
      <div style="padding:24px 28px">
        <h3 style="margin:0 0 8px;font-size:13px">Commission per referred property</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr style="background:#f9fafb">
            <td style="padding:8px 10px;font-weight:600">Property</td>
            <td style="padding:8px 10px;font-weight:600;text-align:right">ROL revenue</td>
            <td style="padding:8px 10px;font-weight:600;text-align:right">Rate</td>
            <td style="padding:8px 10px;font-weight:600;text-align:right">Commission</td>
          </tr>
          ${propertyRows || `<tr><td colspan="4" style="padding:12px 10px;color:#6e6e7d">No commission lines.</td></tr>`}
        </table>
        ${adjustmentBlock}
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:20px">
          <tr><td style="padding:6px 10px;color:#6e6e7d">Gross commission</td><td style="padding:6px 10px;text-align:right">${fmt(statement.gross_commission)}</td></tr>
          <tr><td style="padding:6px 10px;color:#6e6e7d">Adjustments</td><td style="padding:6px 10px;text-align:right">${fmt(statement.adjustments_total)}</td></tr>
          <tr style="background:#1A1A2E;color:#fff">
            <td style="padding:10px;font-weight:700">Net payable</td>
            <td style="padding:10px;text-align:right;font-weight:700">${fmt(statement.net_payable ?? statement.total_amount)}</td>
          </tr>
        </table>
        <p style="margin:18px 0 0;font-size:11px;color:#6e6e7d;line-height:1.6">
          Commission is earned on ROL net revenue only — guest payments, payment-gateway fees, facilitator
          surcharges and other pass-through costs are excluded. Payment is made to the bank account on
          file and will show the reference above on your statement.
        </p>
      </div>
      <div style="background:#f9fafb;padding:14px 28px;border-top:1px solid #eee">
        <p style="margin:0;font-size:11px;color:#999;text-align:center">RoomsOnline (Pty) Ltd · Automated commission statement</p>
      </div>
    </div>
  </div>
</body></html>`;

    const resend = new Resend(resendKey);
    const { error: emailError } = await resend.emails.send({
      from: "RoomsOnline <hello@notify.roomsonline.co.za>",
      to: [recipient],
      subject: `Commission statement — ${period} — ${reference}`,
      html,
    });
    if (emailError) throw emailError;

    await supabase
      .from("rep_commission_reports")
      .update({ emailed_at: new Date().toISOString(), emailed_to: recipient })
      .eq("id", statement.id);

    return json({ success: true, sent_to: recipient });
  } catch (error: unknown) {
    console.error("[send-commission-statement] failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
});
