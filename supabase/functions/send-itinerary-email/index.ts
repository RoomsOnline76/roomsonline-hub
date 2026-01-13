import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Format currency
function formatCurrency(amount: number, currency: string = "ZAR"): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(amount);
}

// Format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Short date format for timeline
function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    month: "short",
    day: "numeric",
  });
}

interface Stay {
  propertyId: string;
  propertyName: string;
  roomTypeName?: string;
  rateTypeName?: string;
  checkIn: string;
  checkOut: string;
  guests: {
    adults: number;
    children?: number;
    infants?: number;
  };
  price: number;
  nights: number;
  city?: string;
  country?: string;
}

function generateItineraryEmail(itinerary: any, stays: Stay[]): string {
  const staysHTML = stays.map((stay, index) => `
    <tr>
      <td style="padding: 16px; border-bottom: 1px solid #eee;">
        <div style="background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%); border-radius: 8px; padding: 16px; border-left: 4px solid #e91e8c;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="background: #1a1a1a; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600;">Stay ${index + 1}</span>
            <span style="color: #666; font-size: 12px;">${formatShortDate(stay.checkIn)} – ${formatShortDate(stay.checkOut)}</span>
          </div>
          <h3 style="margin: 0 0 4px; font-size: 18px; color: #333; font-family: Georgia, serif;">${stay.propertyName}</h3>
          ${stay.city ? `<p style="margin: 0 0 12px; color: #666; font-size: 13px;">${stay.city}${stay.country ? `, ${stay.country}` : ''}</p>` : ''}
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0; color: #666;">Duration</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 500;">${stay.nights} night${stay.nights > 1 ? 's' : ''}</td>
            </tr>
            ${stay.roomTypeName ? `
            <tr>
              <td style="padding: 4px 0; color: #666;">Room Type</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 500;">${stay.roomTypeName}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 4px 0; color: #666;">Guests</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 500;">${stay.guests.adults} Adult${stay.guests.adults > 1 ? 's' : ''}${stay.guests.children ? `, ${stay.guests.children} Child${stay.guests.children > 1 ? 'ren' : ''}` : ''}${stay.guests.infants ? `, ${stay.guests.infants} Infant${stay.guests.infants > 1 ? 's' : ''}` : ''}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0 0; color: #666; border-top: 1px solid #eee;">Price</td>
              <td style="padding: 8px 0 0; text-align: right; font-weight: 600; color: #e91e8c; font-size: 15px; border-top: 1px solid #eee;">${formatCurrency(stay.price, itinerary.currency || 'ZAR')}</td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Journey is Confirmed!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); border-radius: 8px 8px 0 0;">
              <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 160px; height: auto; margin-bottom: 16px;" />
              <h1 style="margin: 0; font-size: 28px; color: #fff; font-weight: 600; font-family: Georgia, serif;">Your Journey Awaits</h1>
              <p style="margin: 12px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">${itinerary.total_nights} nights across ${stays.length} destination${stays.length > 1 ? 's' : ''}</p>
            </td>
          </tr>

          <!-- Success Badge -->
          <tr>
            <td style="padding: 20px 40px 0; text-align: center;">
              <div style="display: inline-block; background-color: #dcfce7; border: 1px solid #86efac; border-radius: 20px; padding: 8px 20px;">
                <span style="color: #166534; font-size: 14px; font-weight: 500;">✓ All Reservations Confirmed</span>
              </div>
            </td>
          </tr>

          <!-- Journey Reference -->
          <tr>
            <td style="padding: 20px 40px;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0 0 5px; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Journey Reference</p>
                <p style="margin: 0; color: #333; font-size: 22px; font-weight: 600; font-family: monospace;">${itinerary.id.substring(0, 8).toUpperCase()}</p>
              </div>
            </td>
          </tr>

          <!-- Guest Info -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 12px; font-size: 16px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 8px;">Guest Details</h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #666;">Name</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 500;">${itinerary.guest_name || 'Guest'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666;">Email</td>
                  <td style="padding: 6px 0; text-align: right;">${itinerary.guest_email || '-'}</td>
                </tr>
                ${itinerary.guest_phone ? `
                <tr>
                  <td style="padding: 6px 0; color: #666;">Phone</td>
                  <td style="padding: 6px 0; text-align: right;">${itinerary.guest_phone}</td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>

          <!-- Itinerary -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 16px; font-size: 16px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 8px;">Your Itinerary</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${staysHTML}
              </table>
            </td>
          </tr>

          <!-- Total -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); border-radius: 8px; padding: 24px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: rgba(255,255,255,0.8); font-size: 14px;">Total Nights</td>
                    <td style="color: #fff; font-size: 14px; text-align: right; font-weight: 500;">${itinerary.total_nights}</td>
                  </tr>
                  <tr>
                    <td style="color: rgba(255,255,255,0.8); font-size: 14px; padding-top: 8px;">Properties</td>
                    <td style="color: #fff; font-size: 14px; text-align: right; font-weight: 500; padding-top: 8px;">${stays.length}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 16px; margin-top: 12px;"></td>
                  </tr>
                  <tr>
                    <td style="color: #fff; font-size: 18px; font-weight: 600; font-family: Georgia, serif;">Total Amount</td>
                    <td style="color: #e91e8c; font-size: 26px; font-weight: 700; text-align: right;">${formatCurrency(itinerary.total_price, itinerary.currency || 'ZAR')}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Payment Notice -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px;">
                <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
                  <strong>Payment Note:</strong> Each property will issue a separate invoice with deposit and settlement amounts in due course. Please await their communication for payment instructions.
                </p>
              </div>
            </td>
          </tr>

          ${itinerary.special_requests ? `
          <!-- Special Requests -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 12px; font-size: 16px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 8px;">Special Requests</h2>
              <p style="margin: 0; color: #666; font-style: italic; font-size: 14px;">"${itinerary.special_requests}"</p>
            </td>
          </tr>
          ` : ''}

          <!-- CTA -->
          <tr>
            <td style="padding: 0 40px 30px; text-align: center;">
              <a href="https://sleepinafrica.roomsonline.co.za/journey/confirmation/${itinerary.id}" style="display: inline-block; background: linear-gradient(135deg, #e91e8c 0%, #c91a76 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 14px;">View Your Journey</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 16px; color: #666; font-size: 13px;">We hope you have an unforgettable journey!</p>
              <p style="margin: 0 0 8px; color: #999; font-size: 12px;">
                Questions? Contact us at <a href="mailto:info@roomsonline.co.za" style="color: #e91e8c;">info@roomsonline.co.za</a>
              </p>
              <p style="margin: 16px 0 0; color: #999; font-size: 11px;">
                RoomsOnline – Curated African Hospitality
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendApiKey);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { itinerary_id, status = "success" } = await req.json();

    if (!itinerary_id) {
      return new Response(
        JSON.stringify({ error: "itinerary_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch itinerary
    const { data: itinerary, error: itineraryError } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", itinerary_id)
      .single();

    if (itineraryError || !itinerary) {
      return new Response(
        JSON.stringify({ error: "Itinerary not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!itinerary.guest_email) {
      return new Response(
        JSON.stringify({ error: "No guest email on itinerary" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse stays
    const stays: Stay[] = typeof itinerary.stays === 'string' 
      ? JSON.parse(itinerary.stays) 
      : itinerary.stays || [];

    // Enrich stays with property data
    const propertyIds = [...new Set(stays.map(s => s.propertyId))];
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, city, country")
      .in("id", propertyIds);

    const propertyMap = new Map(properties?.map(p => [p.id, p]) || []);
    
    const enrichedStays = stays.map(stay => ({
      ...stay,
      city: stay.city || propertyMap.get(stay.propertyId)?.city,
      country: stay.country || propertyMap.get(stay.propertyId)?.country,
    }));

    // Generate email HTML
    const emailHtml = generateItineraryEmail(itinerary, enrichedStays);

    // Property names for subject
    const propertyNames = enrichedStays.map(s => s.propertyName).join(" → ");

    // Send email to guest
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "RoomsOnline <hello@notify.roomsonline.co.za>",
      to: [itinerary.guest_email],
      subject: `Your Journey is Confirmed! | ${propertyNames}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      throw new Error(`Failed to send email: ${emailError.message}`);
    }

    console.log("Itinerary confirmation email sent:", emailData);

    // Log email send
    await supabase.from("audit_logs").insert({
      action_type: "create",
      table_name: "itinerary_emails",
      record_id: itinerary_id,
      user_id: itinerary.user_id || "00000000-0000-0000-0000-000000000000",
      user_email: itinerary.guest_email,
      user_role: "guest",
      request_origin: "edge_function",
      change_summary: `Sent itinerary confirmation email for journey with ${stays.length} stays`,
      metadata: {
        email_id: emailData?.id,
        stays_count: stays.length,
        total_nights: itinerary.total_nights,
        total_price: itinerary.total_price,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_id: emailData?.id,
        message: "Itinerary confirmation email sent successfully" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error sending itinerary email:", error);
    const message = error instanceof Error ? error.message : "Failed to send email";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
