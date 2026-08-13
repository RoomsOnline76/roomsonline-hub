// Adjusted booking value email — both directions.
//
// A modification changes what the stay costs. This email states the difference between what was
// received and the new total, and gives the guest a single action:
//   owing  → settle the balance now
//   credit → choose whether the money is held as credit for the stay, or refunded now
//
// When branding is switched on (or the property is white-label) the email wears the property's
// colours, logo and sign-off, and links resolve to the white-label domain.

import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2";
import { resolvePropertySender } from "../_shared/email-sender.ts";
import {
  renderBrandedFooterHtml,
  renderBrandedHeaderHtml,
  resolveEmailBrand,
} from "../_shared/emailBrand.ts";
import { displayBookingReference } from "../_shared/bookingReference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const money = (n: number) => `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const bookingId = typeof body.booking_id === "string" ? body.booking_id : null;
    const token = typeof body.token === "string" ? body.token : null;
    const direction = body.direction === "credit" ? "credit" : "owing";
    if (!bookingId || !token) return json({ error: "booking_id and token are required" }, 400);

    const { data: booking } = await supabase
      .from("bookings")
      .select(
        "id, property_id, guest_name, guest_email, check_in_date, check_out_date, total_price, amount_paid, balance_due, rol_reference, rol_reference_legacy, external_reservation_id",
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return json({ error: "Booking not found" }, 404);

    const fallbackAmount = direction === "credit"
      ? Math.max(0, Number(booking.amount_paid ?? 0) - Number(booking.total_price ?? 0))
      : Number(booking.balance_due ?? 0);
    const amount = Number(body.amount ?? fallbackAmount);
    if (amount <= 0.01) {
      return json({ success: true, skipped: direction === "credit" ? "no credit due" : "no balance outstanding" });
    }

    const email = (booking.guest_email ?? "").trim();
    if (!email.includes("@")) return json({ success: true, skipped: "no guest email" });

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "Email is not configured" }, 500);

    const sender = await resolvePropertySender(supabase, booking.property_id);
    const brand = await resolveEmailBrand(supabase, booking.property_id);
    const reference = displayBookingReference(booking);
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    const owing = direction === "owing";
    const actionUrl = owing
      ? `${brand.siteBaseUrl}/booking-balance/${token}`
      : `${brand.siteBaseUrl}/booking-credit/${token}`;

    const title = owing
      ? "A balance is outstanding on your stay"
      : "An amount is due back to you";

    const intro = owing
      ? `Your reservation <strong>${esc(reference)}</strong> has been updated. The balance below is the
         difference between what we have already received and the new total for your stay.`
      : `Your reservation <strong>${esc(reference)}</strong> has been updated, and the new total is less than
         the amount we received. The difference is due back to you — you can keep it as credit towards your
         stay, or have it refunded now.`;

    const row = (label: string, value: string, last = false) => `
      <div style="display:block;padding:${last ? "14px" : "12px"} 16px;${last ? "" : `border-bottom:1px solid ${brand.hairline};`}font-size:${last ? "16px" : "13px"};">
        <span style="color:${last ? brand.fontColor : brand.muted};${last ? "font-weight:bold;" : ""}">${esc(label)}</span>
        <span style="float:right;${last ? `color:${brand.accent};font-weight:bold;` : `color:${brand.fontColor};`}">${value}</span>
      </div>`;

    const actions = owing
      ? `<a href="${actionUrl}" style="display:inline-block;background:${brand.accent};color:#FFFFFF;padding:13px 30px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">Settle ${money(amount)}</a>
         <p style="margin:14px 0 0;font-size:11px;color:${brand.muted};">
           Secure card and EFT payment. This link is personal to your reservation and stays valid for 30 days.
         </p>`
      : `<a href="${actionUrl}?choice=credit" style="display:inline-block;background:${brand.accent};color:#FFFFFF;padding:13px 26px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;margin:0 6px 10px;">Hold ${money(amount)} as credit</a>
         <a href="${actionUrl}?choice=refund" style="display:inline-block;background:transparent;color:${brand.fontColor};border:1px solid ${brand.hairline};padding:12px 26px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;margin:0 6px 10px;">Refund me now</a>
         <p style="margin:10px 0 0;font-size:11px;color:${brand.muted};">
           Credit is held against this reservation and settled at check-out. A refund is released to
           ${esc(brand.propertyName)} for approval and paid back to the original payment method.
         </p>`;

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:${brand.pageBg};">
  <div style="max-width:560px;margin:0 auto;background:${brand.paper};border:1px solid ${brand.hairline};border-radius:10px;overflow:hidden;font-family:${brand.bodyFont};color:${brand.fontColor};">
    ${renderBrandedHeaderHtml(brand, title)}
    <div style="padding:8px 28px 4px;font-size:14px;line-height:1.65;">
      <p style="margin:12px 0;">Dear ${esc(booking.guest_name || "Guest")},</p>
      <p style="margin:12px 0;">${intro}${note ? ` ${esc(note)}` : ""}</p>
    </div>
    <div style="margin:16px 28px;border:1px solid ${brand.hairline};border-radius:8px;">
      ${row("Stay", `${esc(booking.check_in_date)} &rarr; ${esc(booking.check_out_date)}`)}
      ${row("Updated total", money(Number(booking.total_price ?? 0)))}
      ${row("Already received", money(Number(booking.amount_paid ?? 0)))}
      ${row(owing ? "Amount due" : "Due back to you", money(amount), true)}
    </div>
    <div style="padding:4px 28px 26px;text-align:center;">
      ${actions}
    </div>
    ${renderBrandedFooterHtml(brand)}
  </div>
</body></html>`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: sender.from,
      to: [email],
      ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
      subject: owing
        ? `${money(amount)} outstanding on ${reference}`
        : `${money(amount)} due back to you on ${reference}`,
      html,
    });
    if (error) throw new Error(typeof error === "string" ? error : JSON.stringify(error));

    await supabase.from("sync_logs").insert({
      booking_id: bookingId,
      property_id: booking.property_id,
      external_system: "email",
      sync_type: owing ? "balance_request_email" : "credit_choice_email",
      status: "success",
      message: `${owing ? "Balance request" : "Credit choice"} for ${money(amount)} sent to ${email}`,
    });

    return json({ success: true, direction, amount });
  } catch (err) {
    console.error("[send-balance-request]", err);
    return json({ error: err instanceof Error ? err.message : "Failed to send settlement email" }, 500);
  }
});
