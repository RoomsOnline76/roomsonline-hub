// Branded balance request.
//
// A modification that leaves the guest owing money is only useful if the guest can settle it in
// one tap. This sends the Ivory-and-Charcoal request with a tokenised link to the balance page.

import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2";
import { resolvePropertySender } from "../_shared/email-sender.ts";
import { renderContactFooterHtml } from "../_shared/email-footer.ts";
import { displayBookingReference } from "../_shared/bookingReference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://sleepinafrica.roomsonline.co.za";
const INK = "#1A1A2E";
const PINK = "#E91E8C";

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
    if (!bookingId || !token) return json({ error: "booking_id and token are required" }, 400);

    const { data: booking } = await supabase
      .from("bookings")
      .select(
        "id, property_id, guest_name, guest_email, check_in_date, check_out_date, total_price, amount_paid, balance_due, rol_reference, rol_reference_legacy, external_reservation_id",
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return json({ error: "Booking not found" }, 404);

    const amountDue = Number(body.amount ?? booking.balance_due ?? 0);
    if (amountDue <= 0.01) return json({ success: true, skipped: "no balance outstanding" });

    const email = (booking.guest_email ?? "").trim();
    if (!email.includes("@")) return json({ success: true, skipped: "no guest email" });

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "Email is not configured" }, 500);

    const sender = await resolvePropertySender(supabase, booking.property_id);
    const reference = displayBookingReference(booking);
    const payUrl = `${SITE}/booking-balance/${token}`;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#FBF9F6;">
  <div style="max-width:560px;margin:0 auto;background:#FFFDFA;border:1px solid #EFE9E1;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <div style="padding:26px 28px 8px;">
      <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8C8677;">${esc(sender.propertyName)}</p>
      <h1 style="margin:8px 0 0;font-size:26px;font-weight:400;">A balance is outstanding on your stay</h1>
    </div>
    <div style="padding:8px 28px 4px;font-size:14px;line-height:1.65;">
      <p style="margin:12px 0;">Dear ${esc(booking.guest_name || "Guest")},</p>
      <p style="margin:12px 0;">
        Your reservation <strong>${esc(reference)}</strong> has been updated, and the new total leaves an
        amount still to settle. ${note ? esc(note) : ""}
      </p>
    </div>
    <div style="margin:16px 28px;border:1px solid #EFE9E1;border-radius:8px;">
      <div style="display:block;padding:12px 16px;border-bottom:1px solid #F4EFE8;font-size:13px;">
        <span style="color:#8C8677;">Stay</span>
        <span style="float:right;">${esc(booking.check_in_date)} &rarr; ${esc(booking.check_out_date)}</span>
      </div>
      <div style="display:block;padding:12px 16px;border-bottom:1px solid #F4EFE8;font-size:13px;">
        <span style="color:#8C8677;">Updated total</span>
        <span style="float:right;">${money(Number(booking.total_price ?? 0))}</span>
      </div>
      <div style="display:block;padding:12px 16px;border-bottom:1px solid #F4EFE8;font-size:13px;">
        <span style="color:#8C8677;">Already received</span>
        <span style="float:right;">${money(Number(booking.amount_paid ?? 0))}</span>
      </div>
      <div style="display:block;padding:14px 16px;font-size:16px;">
        <strong>Amount due</strong>
        <strong style="float:right;color:${PINK};">${money(amountDue)}</strong>
      </div>
    </div>
    <div style="padding:4px 28px 26px;text-align:center;">
      <a href="${payUrl}" style="display:inline-block;background:${PINK};color:#FFFFFF;padding:13px 30px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">Settle ${money(amountDue)}</a>
      <p style="margin:14px 0 0;font-size:11px;color:#8C8677;">
        Secure card and EFT payment. This link is personal to your reservation and stays valid for 30 days.
      </p>
    </div>
    ${renderContactFooterHtml({
      propertyName: sender.propertyName,
      contactEmail: sender.contactEmail,
      contactPhone: sender.contactPhone,
      websiteUrl: sender.websiteUrl,
    })}
  </div>
</body></html>`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: sender.from,
      to: [email],
      ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
      subject: `${money(amountDue)} outstanding on ${reference}`,
      html,
    });
    if (error) throw new Error(typeof error === "string" ? error : JSON.stringify(error));

    await supabase.from("sync_logs").insert({
      booking_id: bookingId,
      property_id: booking.property_id,
      external_system: "email",
      sync_type: "balance_request_email",
      status: "success",
      message: `Balance request for ${money(amountDue)} sent to ${email}`,
    });

    return json({ success: true, amount_due: amountDue });
  } catch (err) {
    console.error("[send-balance-request]", err);
    return json({ error: err instanceof Error ? err.message : "Failed to send balance request" }, 500);
  }
});
