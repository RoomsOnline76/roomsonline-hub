import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestAccessSchema = z.object({
  action: z.literal("request_access"),
  email: z.string().email().max(255),
  last_name: z.string().min(1).max(100).optional(),
  booking_id: z.string().uuid().optional(),
});

const validateTokenSchema = z.object({
  action: z.literal("validate_token"),
  token: z.string().min(10).max(128),
});

const bodySchema = z.discriminatedUnion("action", [requestAccessSchema, validateTokenSchema]);

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = parsed.data;

    if (body.action === "request_access") {
      // Find bookings matching email (+ optional last_name or booking_id)
      let query = supabase
        .from("bookings")
        .select("id, guest_name, guest_email, check_in_date, check_out_date, status, total_price, property_id, property:properties!bookings_property_id_fkey(name, slug, brand_primary_color, brand_logo_url)")
        .eq("guest_email", body.email.toLowerCase().trim())
        .in("status", ["confirmed", "pending", "checked_in"])
        .order("check_in_date", { ascending: false })
        .limit(5);

      if (body.booking_id) {
        query = supabase
          .from("bookings")
          .select("id, guest_name, guest_email, check_in_date, check_out_date, status, total_price, property_id, property:properties!bookings_property_id_fkey(name, slug, brand_primary_color, brand_logo_url)")
          .eq("id", body.booking_id)
          .eq("guest_email", body.email.toLowerCase().trim())
          .limit(1);
      }

      const { data: bookings, error: bookingError } = await query;

      if (bookingError || !bookings || bookings.length === 0) {
        // Don't reveal whether bookings exist — always return success
        return new Response(
          JSON.stringify({ success: true, message: "If matching bookings exist, a secure link has been sent to your email." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Optional last_name filter
      let filtered = bookings;
      if (body.last_name) {
        const ln = body.last_name.toLowerCase().trim();
        filtered = bookings.filter((b: any) =>
          b.guest_name?.toLowerCase().includes(ln)
        );
        if (filtered.length === 0) {
          return new Response(
            JSON.stringify({ success: true, message: "If matching bookings exist, a secure link has been sent to your email." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Generate tokens for each matching booking
      const tokens: { booking_id: string; token: string }[] = [];
      for (const booking of filtered) {
        // Delete old tokens for this booking+email
        await supabase
          .from("guest_portal_tokens")
          .delete()
          .eq("booking_id", booking.id)
          .eq("guest_email", body.email.toLowerCase().trim());

        const { data: tokenRow, error: tokenError } = await supabase
          .from("guest_portal_tokens")
          .insert({
            booking_id: booking.id,
            guest_email: body.email.toLowerCase().trim(),
          })
          .select("token")
          .single();

        if (!tokenError && tokenRow) {
          tokens.push({ booking_id: booking.id, token: tokenRow.token });
        }
      }

      // Send email with portal links
      if (tokens.length > 0) {
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        if (RESEND_API_KEY) {
          const resend = new Resend(RESEND_API_KEY);
          const baseUrl = "https://sleepinafrica.roomsonline.co.za";
          const property = (filtered[0] as any).property;
          const brandColor = property?.brand_primary_color || "#e91e8c";

          const bookingLinks = tokens.map((t, idx) => {
            const b = filtered[idx];
            return `
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
                  <p style="margin: 0 0 4px; font-weight: 600; color: #333;">${(b as any).property?.name || "Property"}</p>
                  <p style="margin: 0 0 8px; color: #666; font-size: 13px;">${formatDate(b.check_in_date)} – ${formatDate(b.check_out_date)}</p>
                  <a href="${baseUrl}/my-booking?token=${t.token}" style="display: inline-block; background-color: ${brandColor}; color: white; padding: 8px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">View Booking</a>
                </td>
              </tr>
            `;
          }).join("");

          const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
        <tr><td style="padding:30px 40px;text-align:center;background-color:${brandColor};border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:white;font-size:22px;">Access Your Booking</h1>
        </td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="margin:0 0 15px;color:#333;line-height:1.6;">Hi ${filtered[0].guest_name?.split(" ")[0] || "there"},</p>
          <p style="margin:0 0 20px;color:#666;line-height:1.6;">Use the secure link(s) below to view and manage your booking(s). These links expire in 24 hours.</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            ${bookingLinks}
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px;background-color:#fafafa;border-radius:0 0 8px 8px;text-align:center;">
          <p style="margin:0;color:#aaa;font-size:11px;">Powered by <a href="https://roomsonline.co.za" style="color:#aaa;text-decoration:none;">RoomsOnline</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

          try {
            await resend.emails.send({
              from: "hello@notify.roomsonline.co.za",
              to: body.email.toLowerCase().trim(),
              subject: `Access Your Booking – ${property?.name || "RoomsOnline"}`,
              html: emailHtml,
            });
          } catch (emailErr) {
            console.error("Failed to send portal access email:", emailErr);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "If matching bookings exist, a secure link has been sent to your email." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (body.action === "validate_token") {
      // Find and validate token
      const { data: tokenRow, error: tokenError } = await supabase
        .from("guest_portal_tokens")
        .select("*")
        .eq("token", body.token)
        .single();

      if (tokenError || !tokenRow) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired link. Please request a new one." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check expiry
      if (new Date(tokenRow.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "This link has expired. Please request a new one." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch booking details
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id, guest_name, guest_email, check_in_date, check_out_date, status, total_price, rooms, special_requests, adults, children, infants, teens, payment_status, cancellation_reason, property_id, property:properties!bookings_property_id_fkey(id, name, slug, city, country, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url, brand_override_enabled, is_rol_property, experience_engine_enabled)")
        .eq("id", tokenRow.booking_id)
        .single();

      if (bookingError || !booking) {
        return new Response(
          JSON.stringify({ error: "Booking not found." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Evaluate cancellation policy if experience engine is enabled
      let cancellationPolicy = null;
      const property = (booking as any).property;
      if (property?.experience_engine_enabled) {
        try {
          const eeResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/experience-engine`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                property_id: property.id,
                experience_type: "cancellation_policy",
                payload: {
                  check_in_date: booking.check_in_date,
                  total_price: booking.total_price,
                },
              }),
            }
          );
          if (eeResponse.ok) {
            const eeData = await eeResponse.json();
            cancellationPolicy = eeData?.data?.evaluation || null;
          }
        } catch (e) {
          console.warn("Failed to fetch cancellation policy:", e);
        }
      }

      // Mask sensitive data
      const maskedEmail = booking.guest_email
        ? booking.guest_email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
        : null;

      return new Response(
        JSON.stringify({
          success: true,
          booking: {
            id: booking.id,
            guest_name: booking.guest_name,
            guest_email_masked: maskedEmail,
            check_in_date: booking.check_in_date,
            check_out_date: booking.check_out_date,
            status: booking.status,
            total_price: booking.total_price,
            rooms: booking.rooms,
            special_requests: booking.special_requests,
            adults: booking.adults,
            children: booking.children,
            infants: booking.infants,
            teens: booking.teens,
            payment_status: booking.payment_status,
            cancellation_reason: booking.cancellation_reason,
          },
          property: {
            name: property?.name,
            slug: property?.slug,
            city: property?.city,
            country: property?.country,
            brand_primary_color: property?.brand_primary_color,
            brand_secondary_color: property?.brand_secondary_color,
            brand_font_color: property?.brand_font_color,
            brand_logo_url: property?.brand_logo_url,
          },
          cancellation_policy: cancellationPolicy,
          token_expires_at: tokenRow.expires_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Guest portal access error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
