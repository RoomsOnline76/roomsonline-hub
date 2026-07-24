// Generate a branded PDF invoice for a paid subscription_invoice, upload to
// the `invoices` storage bucket, email it to the owner as an attachment, and
// stash the signed URL back on the invoice row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_PINK = rgb(0.914, 0.117, 0.549); // #E91E8C
const BRAND_INK = rgb(0.102, 0.102, 0.180);  // #1A1A2E
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.88, 0.88, 0.90);

const FROM_EMAIL = Deno.env.get("BILLING_FROM_EMAIL") || "Rooms Online <billing@notify.sleepinafrica.roomsonline.co.za>";

interface LineItem {
  kind?: string;
  description: string;
  amount: number;
  quantity?: number;
}

function money(n: number, currency = "ZAR") {
  return `${currency} ${Number(n).toFixed(2)}`;
}

async function buildPdf(input: {
  invoiceNumber: string;
  issueDate: string;
  periodStart: string;
  periodEnd: string;
  entityName: string;
  ownerName: string;
  ownerEmail: string;
  currency: string;
  subscriptionAmount: number;
  onceOffAmount: number;
  total: number;
  lineItems: LineItem[];
  paymentRef?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 in points
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const MARGIN = 50;
  let y = height - MARGIN;

  // Header band
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: BRAND_PINK });

  // Brand
  page.drawText("Rooms Online", { x: MARGIN, y: y - 12, size: 22, font: bold, color: BRAND_INK });
  page.drawText("Tax Invoice", { x: MARGIN, y: y - 32, size: 11, font, color: MUTED });

  // Invoice meta (right)
  const rightX = width - MARGIN - 200;
  page.drawText(`Invoice #`, { x: rightX, y: y - 12, size: 9, font, color: MUTED });
  page.drawText(input.invoiceNumber, { x: rightX + 60, y: y - 12, size: 11, font: bold, color: BRAND_INK });
  page.drawText(`Issued`, { x: rightX, y: y - 28, size: 9, font, color: MUTED });
  page.drawText(input.issueDate, { x: rightX + 60, y: y - 28, size: 10, font, color: BRAND_INK });
  page.drawText(`Period`, { x: rightX, y: y - 44, size: 9, font, color: MUTED });
  page.drawText(`${input.periodStart} → ${input.periodEnd}`, { x: rightX + 60, y: y - 44, size: 10, font, color: BRAND_INK });

  y -= 80;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.5, color: RULE });
  y -= 20;

  // Billed to
  page.drawText("BILLED TO", { x: MARGIN, y, size: 8, font: bold, color: MUTED });
  y -= 14;
  page.drawText(input.entityName, { x: MARGIN, y, size: 12, font: bold, color: BRAND_INK });
  y -= 14;
  if (input.ownerName) { page.drawText(input.ownerName, { x: MARGIN, y, size: 10, font, color: BRAND_INK }); y -= 12; }
  if (input.ownerEmail) { page.drawText(input.ownerEmail, { x: MARGIN, y, size: 10, font, color: MUTED }); y -= 12; }

  y -= 20;
  // Line items header
  page.drawRectangle({ x: MARGIN, y: y - 4, width: width - MARGIN * 2, height: 22, color: rgb(0.97, 0.97, 0.98) });
  page.drawText("DESCRIPTION", { x: MARGIN + 8, y: y + 4, size: 9, font: bold, color: MUTED });
  page.drawText("AMOUNT", { x: width - MARGIN - 80, y: y + 4, size: 9, font: bold, color: MUTED });
  y -= 24;

  // Monthly subscription line
  if (input.subscriptionAmount > 0) {
    page.drawText(`Monthly subscription — ${input.entityName}`, { x: MARGIN + 8, y, size: 10, font, color: BRAND_INK });
    page.drawText(money(input.subscriptionAmount, input.currency), { x: width - MARGIN - 80, y, size: 10, font, color: BRAND_INK });
    y -= 18;
  }

  // Once-off items
  for (const item of input.lineItems) {
    if (item.kind === "monthly_subscription") continue;
    page.drawText(item.description, { x: MARGIN + 8, y, size: 10, font, color: BRAND_INK });
    page.drawText(money(item.amount, input.currency), { x: width - MARGIN - 80, y, size: 10, font, color: BRAND_INK });
    y -= 18;
  }

  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.5, color: RULE });
  y -= 20;

  // Totals
  const totalsX = width - MARGIN - 200;
  if (input.onceOffAmount > 0) {
    page.drawText("Monthly", { x: totalsX, y, size: 10, font, color: MUTED });
    page.drawText(money(input.subscriptionAmount, input.currency), { x: width - MARGIN - 80, y, size: 10, font, color: BRAND_INK });
    y -= 16;
    page.drawText("Once-off", { x: totalsX, y, size: 10, font, color: MUTED });
    page.drawText(money(input.onceOffAmount, input.currency), { x: width - MARGIN - 80, y, size: 10, font, color: BRAND_INK });
    y -= 20;
  }
  page.drawRectangle({ x: totalsX - 8, y: y - 6, width: width - MARGIN - totalsX + 8, height: 26, color: rgb(0.98, 0.94, 0.97) });
  page.drawText("TOTAL PAID", { x: totalsX, y: y + 4, size: 10, font: bold, color: BRAND_PINK });
  page.drawText(money(input.total, input.currency), { x: width - MARGIN - 80, y: y + 4, size: 12, font: bold, color: BRAND_PINK });

  y -= 60;
  page.drawText("Payment received. Thank you for choosing Rooms Online.", { x: MARGIN, y, size: 10, font, color: BRAND_INK });
  if (input.paymentRef) {
    y -= 14;
    page.drawText(`PayFast reference: ${input.paymentRef}`, { x: MARGIN, y, size: 9, font, color: MUTED });
  }

  // Footer
  page.drawLine({ start: { x: MARGIN, y: MARGIN + 30 }, end: { x: width - MARGIN, y: MARGIN + 30 }, thickness: 0.5, color: RULE });
  page.drawText("Rooms Online · sleepinafrica.roomsonline.co.za", { x: MARGIN, y: MARGIN + 16, size: 8, font, color: MUTED });
  page.drawText("Cancel any time from your subscription page — no lock-in.", { x: MARGIN, y: MARGIN + 4, size: 8, font, color: MUTED });

  return await pdf.save();
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) return new Response(JSON.stringify({ error: "invoice_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const { data: inv, error } = await supabase
      .from("subscription_invoices")
      .select("*, properties(name, owner_email, owner_id), property_portfolios(name, owner_id)")
      .eq("id", invoice_id)
      .single();
    if (error || !inv) throw new Error(error?.message || "Invoice not found");
    if (inv.status !== "paid") throw new Error(`Invoice status is ${inv.status}, expected paid`);

    // Assign invoice number if missing
    let invoiceNumber = inv.invoice_number;
    if (!invoiceNumber) {
      const { data: seq } = await supabase.rpc("nextval_subscription_invoice_number");
      const num = Number(seq) || 1000;
      invoiceNumber = `RO-${new Date().getFullYear()}-${String(num).padStart(6, "0")}`;
      await supabase.from("subscription_invoices").update({ invoice_number: invoiceNumber }).eq("id", invoice_id);
    }

    // Resolve owner
    const entityName = (inv.properties as any)?.name || (inv.property_portfolios as any)?.name || "Rooms Online";
    const ownerId = inv.owner_id || (inv.properties as any)?.owner_id || (inv.property_portfolios as any)?.owner_id;
    let ownerEmail = (inv.properties as any)?.owner_email || "";
    let ownerName = "";
    if (ownerId) {
      const { data: prof } = await supabase.from("profiles").select("email, full_name, first_name, last_name").eq("id", ownerId).single();
      if (prof) {
        ownerEmail = ownerEmail || prof.email || "";
        ownerName = (prof as any).full_name || `${(prof as any).first_name || ""} ${(prof as any).last_name || ""}`.trim();
      }
    }

    const lineItems: LineItem[] = Array.isArray(inv.line_items) ? inv.line_items : [];
    const subAmount = Number(inv.subscription_amount) || Number(inv.amount);
    const onceOff = Number(inv.once_off_amount) || 0;
    const total = Number(inv.amount);

    const pdfBytes = await buildPdf({
      invoiceNumber,
      issueDate: (inv.paid_at || inv.updated_at || new Date().toISOString()).slice(0, 10),
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      entityName,
      ownerName,
      ownerEmail,
      currency: inv.currency || "ZAR",
      subscriptionAmount: subAmount,
      onceOffAmount: onceOff,
      total,
      lineItems,
      paymentRef: inv.payfast_payment_id || undefined,
    });

    // Upload to invoices bucket
    const path = `subscriptions/${ownerId || "unassigned"}/${invoiceNumber}.pdf`;
    const { error: upErr } = await supabase.storage.from("invoices").upload(path, pdfBytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24 * 30);
    const pdfUrl = signed?.signedUrl || null;
    await supabase.from("subscription_invoices").update({ pdf_url: pdfUrl }).eq("id", invoice_id);

    // Email owner with attachment
    if (ownerEmail) {
      const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#1A1A2E">
        <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:24px">
          <h2 style="color:#E91E8C;margin-top:0">Thank you — payment received</h2>
          <p>Hi ${ownerName || "there"},</p>
          <p>Your subscription for <strong>${entityName}</strong> has been renewed. Your invoice <strong>${invoiceNumber}</strong> is attached.</p>
          <table style="width:100%;margin:16px 0;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${money(total, inv.currency)}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Period</td><td style="padding:6px 0;text-align:right">${inv.period_start} → ${inv.period_end}</td></tr>
          </table>
          <p style="color:#666;font-size:13px">You can cancel any time from your subscription page — no lock-in.</p>
        </div>
      </body></html>`;
      const send = await resend.emails.send({
        from: FROM_EMAIL,
        to: ownerEmail,
        subject: `Rooms Online invoice ${invoiceNumber} — ${entityName}`,
        html,
        attachments: [{ filename: `${invoiceNumber}.pdf`, content: bytesToBase64(pdfBytes) }],
      });
      await supabase.from("subscription_invoice_events").insert({
        invoice_id, event_type: "email", status: send.error ? "error" : "sent", detail: send.error ? String(send.error) : `to:${ownerEmail}`,
      });
    } else {
      await supabase.from("subscription_invoice_events").insert({
        invoice_id, event_type: "email", status: "skipped", detail: "no owner email",
      });
    }

    return new Response(JSON.stringify({ success: true, invoice_number: invoiceNumber, pdf_url: pdfUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[generate-subscription-invoice-pdf] error:", e);
    return new Response(JSON.stringify({ success: false, error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
