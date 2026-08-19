// ============================================================================
// CRON: DEPARTURE FEEDBACK
//
// Runs daily. For every stay that departed yesterday it creates one native
// feedback task, and — only for properties that opted in — sends the branded
// survey email. Guest lifecycle (new / repeat / lapsed) is refreshed at the
// same time and projected onto HubSpot when the owner add-on is on.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2";
import { resolvePropertySender } from "../_shared/email-sender.ts";
import {
  renderBrandedFooterHtml,
  renderBrandedHeaderHtml,
  resolveEmailBrand,
} from "../_shared/emailBrand.ts";
import { projectToHubspot } from "../_shared/hubspotProjection.ts";
import { normaliseEmail } from "../_shared/guestStats.ts";
import { displayBookingReference } from "../_shared/bookingReference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Lifecycle marker from the guest's own stay history. */
function lifecycleFrom(stays: number, lastStay: string | null): "new" | "repeat" | "lapsed" {
  if (stays <= 1) return "new";
  if (lastStay && (Date.now() - new Date(lastStay).getTime()) / 86_400_000 > 540) return "lapsed";
  return "repeat";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dry_run === true;
    const lookbackDays = Math.min(Number(body.lookback_days ?? 1) || 1, 14);

    const today = new Date();
    const from = new Date(today.getTime() - lookbackDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const to = today.toISOString().slice(0, 10);

    const { data: departures } = await admin
      .from("bookings")
      .select(
        "id, property_id, guest_name, guest_email, check_out_date, status, rol_reference, rol_reference_legacy, external_reservation_id",
      )
      .gte("check_out_date", from)
      .lt("check_out_date", to)
      .not("status", "in", "(cancelled,no_show)")
      .limit(300);

    const rows = departures || [];
    const propertyIds = Array.from(
      new Set(rows.map((b) => b.property_id).filter(Boolean) as string[]),
    );

    const optIn = new Map<string, boolean>();
    if (propertyIds.length) {
      const { data: props } = await admin
        .from("properties")
        .select("id, post_stay_survey_enabled")
        .in("id", propertyIds);
      for (const p of props || []) optIn.set(p.id, Boolean(p.post_stay_survey_enabled));
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resend = resendKey ? new Resend(resendKey) : null;

    let created = 0;
    let emailed = 0;
    let enriched = 0;
    const failures: string[] = [];

    for (const booking of rows) {
      const email = normaliseEmail(booking.guest_email);

      const { data: existing } = await admin
        .from("rolos_feedback_requests")
        .select("id, status, email_sent_at, token")
        .eq("booking_id", booking.id)
        .maybeSingle();

      let record = existing;
      if (!record) {
        if (dryRun) {
          created += 1;
          continue;
        }
        const { data: inserted, error } = await admin
          .from("rolos_feedback_requests")
          .insert({
            booking_id: booking.id,
            property_id: booking.property_id,
            guest_name: booking.guest_name,
            guest_email: email || null,
            token: newToken(),
            status: "pending",
          })
          .select("id, status, email_sent_at, token")
          .single();
        if (error) {
          failures.push(`${booking.id}: ${error.message}`);
          continue;
        }
        record = inserted;
        created += 1;
      }

      // ---- Lifecycle refresh + optional CRM projection --------------------
      if (email && booking.property_id) {
        const { data: profile } = await admin
          .from("rolos_guest_profiles")
          .select("total_stays, total_spent, last_stay_date, is_trade")
          .eq("email", email)
          .eq("property_id", booking.property_id)
          .maybeSingle();

        if (profile && !dryRun) {
          const projection = await projectToHubspot(admin, {
            propertyId: booking.property_id,
            action: "enrich_contact",
            payload: {
              enrichment: {
                email,
                trade_or_direct: profile.is_trade ? "trade" : "direct",
                lifecycle: lifecycleFrom(
                  Number(profile.total_stays || 0),
                  profile.last_stay_date,
                ),
                ...(profile.total_stays != null
                  ? { total_stays: Number(profile.total_stays) }
                  : {}),
                ...(profile.total_spent != null
                  ? { total_spent: Number(profile.total_spent) }
                  : {}),
                ...(profile.last_stay_date ? { last_stay_date: profile.last_stay_date } : {}),
              },
            },
          });
          if (projection.pushed) enriched += 1;
        }
      }

      // ---- Branded survey email (opt-in properties only) ------------------
      const wantsEmail = optIn.get(booking.property_id as string) === true;
      if (!wantsEmail || !email || record.email_sent_at || dryRun || !resend) continue;

      try {
        const brand = await resolveEmailBrand(admin, booking.property_id);
        const sender = await resolvePropertySender(admin, booking.property_id);
        const link = `${brand.siteBaseUrl}/feedback?token=${record.token}`;
        const firstName = (booking.guest_name || "there").split(/\s+/)[0];

        const stars = [1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<a href="${link}&rating=${n}" style="display:inline-block;margin:0 4px;padding:10px 14px;border:1px solid ${brand.hairline};border-radius:8px;color:${brand.dark};text-decoration:none;font-weight:600;">${n}</a>`,
          )
          .join("");

        const html = `
          <div style="background:${brand.pageBg};padding:24px 0;font-family:${brand.bodyFont};color:${brand.fontColor};">
            <div style="max-width:560px;margin:0 auto;background:${brand.paper};border-radius:12px;overflow:hidden;">
              ${renderBrandedHeaderHtml(brand, "How was your stay?")}
              <div style="padding:24px;">
                <p style="margin:0 0 12px;">Hi ${esc(firstName)},</p>
                <p style="margin:0 0 16px;">Thank you for staying with ${esc(brand.propertyName)}. One question, one tap — how would you rate your stay?</p>
                <div style="text-align:center;margin:20px 0;">${stars}</div>
                <p style="margin:0 0 8px;font-size:13px;color:${brand.muted};">Reference ${esc(displayBookingReference(booking))}</p>
                <p style="margin:16px 0 0;"><a href="${link}" style="color:${brand.accent};">Leave a longer comment</a></p>
              </div>
              ${renderBrandedFooterHtml(brand)}
            </div>
          </div>`;

        const sent = await resend.emails.send({
          from: sender.from,
          ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
          to: [email],
          subject: `How was your stay at ${brand.propertyName}?`,
          html,
        });

        if ((sent as { error?: { message?: string } })?.error) {
          throw new Error((sent as { error: { message?: string } }).error.message || "send failed");
        }

        await admin
          .from("rolos_feedback_requests")
          .update({ email_sent_at: new Date().toISOString(), status: "sent", email_error: null })
          .eq("id", record.id);
        emailed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "send failed";
        failures.push(`${booking.id}: ${message}`);
        await admin
          .from("rolos_feedback_requests")
          .update({ email_error: message.slice(0, 400) })
          .eq("id", record.id);
      }
    }

    return json({
      success: true,
      dry_run: dryRun,
      window: { from, to },
      departures: rows.length,
      created,
      emailed,
      enriched,
      failures: failures.slice(0, 20),
    });
  } catch (err) {
    console.error("[cron-departure-feedback] error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
