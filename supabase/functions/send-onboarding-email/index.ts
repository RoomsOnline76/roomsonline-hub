import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePropertySender, platformSender } from "../_shared/email-sender.ts";
import { renderContactFooterHtml } from "../_shared/email-footer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    
    // Support both camelCase and snake_case field names
    const propertyId = body.propertyId || body.property_id;
    const ownerEmail = body.ownerEmail || body.owner_email;
    const ownerName = body.ownerName || body.owner_name;
    const propertyName = body.propertyName || body.property_name;
    const createdBy = body.createdBy || body.created_by;

    if (!propertyId || !ownerEmail) {
      throw new Error("Missing required fields: propertyId and ownerEmail");
    }

    // Check for existing valid token
    const { data: existingToken } = await supabase
      .from("property_onboarding_tokens")
      .select("id, token, expires_at")
      .eq("property_id", propertyId)
      .eq("owner_email", ownerEmail)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    let token: string;

    if (existingToken) {
      token = existingToken.token;
    } else {
      // Create new token
      const { data: newToken, error: tokenError } = await supabase
        .from("property_onboarding_tokens")
        .insert({
          property_id: propertyId,
          owner_email: ownerEmail,
          created_by: createdBy,
        })
        .select("token")
        .single();

      if (tokenError) {
        throw new Error(`Failed to create token: ${tokenError.message}`);
      }

      token = newToken.token;
    }

    // Generate onboarding URL
    const baseUrl = Deno.env.get("SITE_URL") || "https://sleepinafrica.roomsonline.co.za";
    const onboardingUrl = `${baseUrl}/onboarding/${token}`;

    // Send email via Resend
    const identity = await resolvePropertySender(supabase, propertyId);
    const contactFooter = renderContactFooterHtml(identity);
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: identity.from || platformSender(),
        to: [ownerEmail],
        reply_to: identity.replyTo,
        subject: `Complete Your Property Profile - ${propertyName || "Your Property"}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Property Profile</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="height: 50px;">
  </div>

  <h1 style="color: #E1306C; font-size: 24px; margin-bottom: 20px;">
    Welcome to RoomsOnline${ownerName ? `, ${ownerName}` : ""}!
  </h1>

  <p>
    We're excited to have <strong>${propertyName || "your property"}</strong> join the RoomsOnline collection.
  </p>

  <p>
    To get your property live and start receiving bookings, please complete your property profile.
    Our onboarding wizard will guide you through providing all the essential information we need.
  </p>

  <div style="text-align: center; margin: 40px 0;">
    <a href="${onboardingUrl}"
       style="background-color: #E1306C; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
      Complete Your Profile
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    This link is valid for 30 days and is specific to your property. The wizard will take approximately 30-45 minutes to complete.
  </p>

  <h3 style="margin-top: 30px; font-size: 16px;">What you'll need:</h3>
  <ul style="color: #666;">
    <li>Property details and description</li>
    <li>Room types and rates</li>
    <li>High-quality photos (at least 3-5)</li>
    <li>Banking details for payments</li>
    <li>Check-in/check-out policies</li>
  </ul>

  <p style="margin-top: 30px; color: #666; font-size: 14px;">
    If you have any questions, reply to this email or contact us at
    <a href="mailto:sleepinafrica@roomsonline.co.za" style="color: #E1306C;">sleepinafrica@roomsonline.co.za</a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 40px 0 20px;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    RoomsOnline • Strategic Hospitality Solutions<br>
    <a href="https://roomsonline.co.za" style="color: #999;">roomsonline.co.za</a>
  </p>
  ${contactFooter}
</body>
</html>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      throw new Error(`Failed to send email: ${JSON.stringify(errorData)}`);
    }

    const emailResult = await emailResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Onboarding email sent successfully",
        emailId: emailResult.id,
        token: token,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error sending onboarding email:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to send onboarding email";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
