import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  booking_id: z.string().uuid({ message: "Invalid booking ID format" }),
  status: z.enum(["success", "failed"]),
  error_message: z.string().optional(),
});

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

// Calculate nights
function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// Replace template variables with actual booking data
function replaceTemplateVariables(template: string, booking: any, property: any): string {
  const nights = calculateNights(booking.check_in_date, booking.check_out_date);
  const totalGuests = (booking.adults || 0) + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0);
  const bookingRef = booking.external_reservation_id || booking.id.substring(0, 8).toUpperCase();
  
  // Get room/rate type names from booking
  const roomTypeName = booking.rooms?.[0]?.roomTypeName || booking.room_type_id || "Standard Room";
  const rateTypeName = booking.rooms?.[0]?.rateTypeName || booking.rate_type_id || "Standard Rate";
  
  // Build property location string
  const propertyLocation = [property.city, property.country].filter(Boolean).join(", ");
  
  const replacements: Record<string, string> = {
    // Reservation
    "{{reservation_reference}}": bookingRef,
    "{{total_amount}}": formatCurrency(booking.total_price),
    "{{total_price}}": formatCurrency(booking.total_price),  // Alias for total_amount
    "{{check_in_date}}": formatDate(booking.check_in_date),
    "{{check_out_date}}": formatDate(booking.check_out_date),
    "{{nights}}": `${nights} night${nights > 1 ? "s" : ""}`,
    "{{total_guests}}": `${totalGuests} guest${totalGuests > 1 ? "s" : ""}`,
    
    // Guest Details
    "{{guest_name}}": booking.guest_name || "",
    "{{guest_email}}": booking.guest_email || "",
    "{{guest_phone}}": booking.guest_phone || "",
    "{{special_requests}}": booking.special_requests || "",
    
    // Property Details
    "{{property_name}}": property.name || "",
    "{{property_city}}": property.city || "",
    "{{property_country}}": property.country || "",
    "{{property_address}}": property.address || "",
    "{{property_location}}": propertyLocation,  // City, Country format
    
    // Room Details
    "{{room_type_name}}": roomTypeName,
    "{{rate_type_name}}": rateTypeName,
    "{{adults}}": String(booking.adults || 0),
    "{{teens}}": String(booking.teens || 0),
    "{{children}}": String(booking.children || 0),
    "{{infants}}": String(booking.infants || 0),
  };
  
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
  }
  
  return result;
}

// Wrap custom template content in email wrapper
function wrapCustomTemplate(customContent: string, property: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reservation Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #ffffff; border-radius: 8px 8px 0 0;">
              <div style="font-size: 32px; color: #22c55e; margin-bottom: 10px;">✓</div>
              <h1 style="margin: 0; font-size: 24px; color: #333; font-weight: 600;">Reservation Confirmed!</h1>
              <p style="margin: 10px 0 0; color: #666; font-size: 14px;">Thank you for your reservation</p>
            </td>
          </tr>

          <!-- Custom Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <div style="color: #333; line-height: 1.6;">
                ${customContent}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">Kind regards</p>
              <p style="margin: 0 0 15px; color: #333; font-size: 14px;">
                RoomsOnline on behalf of <strong>${property.name}</strong>
              </p>
              <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 180px; height: auto;" />
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

// Generate success email HTML
function generateSuccessEmail(booking: any, property: any): string {
  const nights = calculateNights(booking.check_in_date, booking.check_out_date);
  const totalGuests = (booking.adults || 0) + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0);

  // Build detailed rooms itinerary if multi-room with potential different dates
  let roomsItinerary = "";
  const hasRooms = booking.rooms && Array.isArray(booking.rooms) && booking.rooms.length > 0;

  if (hasRooms) {
    roomsItinerary = booking.rooms
      .map((room: any, index: number) => {
        const roomCheckIn = room.checkIn || booking.check_in_date;
        const roomCheckOut = room.checkOut || booking.check_out_date;
        const roomNights = calculateNights(roomCheckIn, roomCheckOut);
        const guestSummary = [
          `${room.numberOfAdults || 1} Adult${(room.numberOfAdults || 1) > 1 ? "s" : ""}`,
          room.numberOfTeens ? `${room.numberOfTeens} Teen${room.numberOfTeens > 1 ? "s" : ""}` : "",
          room.numberOfChildren ? `${room.numberOfChildren} Child${room.numberOfChildren > 1 ? "ren" : ""}` : "",
          room.numberOfInfants ? `${room.numberOfInfants} Infant${room.numberOfInfants > 1 ? "s" : ""}` : "",
        ]
          .filter(Boolean)
          .join(", ");

        return `
        <tr>
          <td colspan="2" style="padding: 12px 0; border-bottom: 1px solid #eee;">
            <div style="background-color: #f8f9fa; border-radius: 6px; padding: 12px; border-left: 3px solid #e91e8c;">
              <p style="margin: 0 0 6px; font-weight: 600; color: #333;">Room ${index + 1}: ${room.roomTypeName || "Standard Room"}</p>
              <p style="margin: 0 0 4px; color: #666; font-size: 13px;">
                <strong>Dates:</strong> ${formatDate(roomCheckIn)} – ${formatDate(roomCheckOut)} (${roomNights} night${roomNights > 1 ? "s" : ""})
              </p>
              <p style="margin: 0; color: #666; font-size: 13px;">
                <strong>Guests:</strong> ${guestSummary}
              </p>
            </div>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  // Simple stay section for single room without custom dates
  const simpleStaySection = `
    <tr>
      <td style="padding: 8px 0; color: #666;">Check-in</td>
      <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${formatDate(booking.check_in_date)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #666;">Check-out</td>
      <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${formatDate(booking.check_out_date)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #666;">Duration</td>
      <td style="padding: 8px 0; color: #333; text-align: right;">${nights} night${nights > 1 ? "s" : ""}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #666;">Guests</td>
      <td style="padding: 8px 0; color: #333; text-align: right;">${totalGuests} guest${totalGuests > 1 ? "s" : ""}</td>
    </tr>
  `;

  // Choose between detailed itinerary or simple display
  const stayContent = hasRooms && booking.rooms.length > 0 ? roomsItinerary : simpleStaySection;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reservation Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #ffffff; border-radius: 8px 8px 0 0;">
              <div style="font-size: 32px; color: #22c55e; margin-bottom: 10px;">✓</div>
              <h1 style="margin: 0; font-size: 24px; color: #333; font-weight: 600;">Reservation Confirmed!</h1>
              <p style="margin: 10px 0 0; color: #666; font-size: 14px;">Thank you for your reservation</p>
            </td>
          </tr>

          <!-- Reservation Reference -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <p style="margin: 0 0 5px; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Reservation Reference</p>
                <p style="margin: 0; color: #333; font-size: 20px; font-weight: 600; font-family: monospace;">${booking.external_reservation_id || booking.id.substring(0, 8).toUpperCase()}</p>
              </div>
            </td>
          </tr>

          <!-- Property Details -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 10px;">Property Details</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Property</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${property.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Location</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${property.city}, ${property.country}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Stay Details / Itinerary -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 10px;">${hasRooms && booking.rooms.length > 1 ? "Itinerary" : "Stay Details"}</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${stayContent}
              </table>
            </td>
          </tr>

          <!-- Guest Details -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 10px;">Guest Information</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Name</td>
                  <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">${booking.guest_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Email</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${booking.guest_email}</td>
                </tr>
                ${
                  booking.guest_phone
                    ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Phone</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${booking.guest_phone}</td>
                </tr>
                `
                    : ""
                }
              </table>
            </td>
          </tr>

          <!-- Total -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #333; font-size: 18px; font-weight: 600;">Total Amount</td>
                    <td style="color: #e91e8c; font-size: 24px; font-weight: 700; text-align: right;">${formatCurrency(booking.total_price)}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Payment Notice -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px;">
                <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
                  <strong>Payment Note:</strong> This reservation has not yet been paid. An invoice with deposit and settlement amounts will be issued by the property in due course.
                </p>
              </div>
            </td>
          </tr>

          ${
            booking.special_requests
              ? `
          <!-- Special Requests -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 10px;">Special Requests</h2>
              <p style="margin: 0; color: #666; font-style: italic;">"${booking.special_requests}"</p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">Kind regards</p>
              <p style="margin: 0 0 15px; color: #333; font-size: 14px;">
                RoomsOnline on behalf of <strong>${property.name}</strong>
              </p>
              <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 180px; height: auto;" />
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

// Generate failure email HTML
function generateFailureEmail(booking: any, property: any, errorMessage?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Issue</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #ffffff; border-radius: 8px 8px 0 0;">
              <div style="font-size: 32px; color: #ef4444; margin-bottom: 10px;">⚠</div>
              <h1 style="margin: 0; font-size: 24px; color: #333; font-weight: 600;">Booking Issue</h1>
              <p style="margin: 10px 0 0; color: #666; font-size: 14px;">We encountered a problem with your reservation</p>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 20px 40px;">
              <p style="margin: 0 0 20px; color: #333; line-height: 1.6;">
                Dear <strong>${booking.guest_name}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #333; line-height: 1.6;">
                We regret to inform you that there was an issue processing your booking at <strong>${property.name}</strong>.
              </p>
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;">
                  ${errorMessage || "An unexpected error occurred while processing your reservation. Please try again or contact our support team."}
                </p>
              </div>
              <p style="margin: 0 0 20px; color: #333; line-height: 1.6;">
                If you would like to proceed with your booking, please try again or contact us directly for assistance.
              </p>
            </td>
          </tr>

          <!-- Booking Details Summary -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 10px;">Your Attempted Booking</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Property</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${property.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Check-in</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${formatDate(booking.check_in_date)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Check-out</td>
                  <td style="padding: 8px 0; color: #333; text-align: right;">${formatDate(booking.check_out_date)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Contact Support -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="margin: 0 0 10px; color: #666; font-size: 14px;">Need help? Contact our support team</p>
                <a href="mailto:sleepinafrica@roomsonline.co.za" style="color: #e91e8c; font-weight: 600; text-decoration: none;">sleepinafrica@roomsonline.co.za</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">Kind regards</p>
              <p style="margin: 0 0 15px; color: #333; font-size: 14px;">
                RoomsOnline on behalf of <strong>${property.name}</strong>
              </p>
              <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 180px; height: auto;" />
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
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error);
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id, status, error_message } = validationResult.data;

    console.log(`Sending ${status} booking email for booking ${booking_id}`);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*, property:properties(*)")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      console.error("Booking lookup failed:", bookingError);
      return new Response(JSON.stringify({ error: "Unable to find booking" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const property = booking.property;

    // Fetch configured from email (same as access request notifications)
    const { data: emailConfig } = await supabaseClient
      .from("api_keys")
      .select("key_name, key_value")
      .eq("key_name", "RESEND_FROM_EMAIL")
      .maybeSingle();

    const fromEmail = emailConfig?.key_value || "RoomsOnline <hello@notify.roomsonline.co.za>";

    // Check for custom template in property amenities
    const amenities = property.amenities || {};
    const templates = amenities.templates || {};
    const customTemplateContent = templates.template_content;
    const hasCustomTemplate = customTemplateContent && customTemplateContent.trim().length > 0;

    console.log(`Property ${property.id} has custom template: ${hasCustomTemplate}`);

    // Generate email HTML based on status and custom template availability
    let html: string;
    if (status === "success" && hasCustomTemplate) {
      // Use custom template with variable replacement
      const processedContent = replaceTemplateVariables(customTemplateContent, booking, property);
      html = wrapCustomTemplate(processedContent, property);
      console.log("Using custom confirmation template");
    } else if (status === "success") {
      // Fall back to default template
      html = generateSuccessEmail(booking, property);
      console.log("Using default confirmation template");
    } else {
      // Failure emails always use default template
      html = generateFailureEmail(booking, property, error_message);
    }

    const bookingRef = booking.external_reservation_id || booking.id.substring(0, 8).toUpperCase();
    const subject =
      status === "success"
        ? `Reservation Confirmed #${bookingRef} - ${property.name}`
        : `Reservation Issue #${bookingRef} - ${property.name}`;

    console.log(`Sending email to ${booking.guest_email} from ${fromEmail}`);

    // Send email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [booking.guest_email],
      subject,
      html,
    });

    if (emailError) {
      console.error("Email send error:", emailError);
      throw new Error(emailError.message || "Failed to send email");
    }

    console.log("Email sent successfully:", emailData);

    // Log the email send
    await supabaseClient.from("sync_logs").insert({
      booking_id,
      property_id: property.id,
      external_system: "resend",
      sync_type: "email_send",
      status: "success",
      message: `Booking ${status} email sent to ${booking.guest_email}`,
      response_data: emailData,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Booking ${status} email sent successfully`,
        email_id: emailData?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Send booking email error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
