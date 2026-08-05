import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { property_id } = await req.json();

    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch property details
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", property_id)
      .single();

    if (propError || !property) {
      console.error("Property fetch error:", propError);
      return new Response(
        JSON.stringify({ error: "Property not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ownerEmail = property.owner_email;
    const ownerName = property.owner_name || "Property Owner";
    const propertyName = property.name || "Your Property";

    if (!ownerEmail) {
      console.log("No owner email for property:", property_id);
      return new Response(
        JSON.stringify({ success: true, skipped: true, message: "No owner email configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the property showcase URL
    const siteUrl = Deno.env.get("SITE_URL") || "https://sleepinafrica.roomsonline.co.za";
    const propertySlug = property.slug || property.id;
    const showcaseUrl = `${siteUrl}/book/${propertySlug}`;
    const dashboardUrl = `${siteUrl}/dashboard/properties`;

    // Send congratulations email to owner
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f7f7f7; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1a472a 0%, #2d5a3f 100%); padding: 40px 30px; text-align: center;">
      <img src="https://qmprswbgkpzcvexmmcbf.supabase.co/storage/v1/object/public/property-images/rol-logo-email.png" alt="RoomsOnline" style="height: 50px; margin-bottom: 20px;">
      <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-weight: 600;">
        🎉 Congratulations!
      </h1>
      <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 10px 0 0;">
        Your property is now live
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        Dear ${ownerName},
      </p>
      
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        Great news! <strong>${propertyName}</strong> has passed all quality checks and is now 
        <span style="color: #22c55e; font-weight: 600;">live on RoomsOnline</span>.
      </p>
      
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
        Guests can now discover and book your property directly through our platform.
      </p>
      
      <!-- Property Card -->
      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px; border-left: 4px solid #22c55e;">
        <h3 style="margin: 0 0 10px; color: #1a472a; font-size: 18px;">${propertyName}</h3>
        <p style="margin: 0; color: #666; font-size: 14px;">
          ${property.city || ""}${property.city && property.country ? ", " : ""}${property.country || ""}
        </p>
      </div>
      
      <!-- CTA Buttons -->
      <div style="text-align: center; margin-bottom: 30px;">
        <a href="${showcaseUrl}" style="display: inline-block; background: #1a472a; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 5px;">
          View Your Listing
        </a>
        <a href="${dashboardUrl}" style="display: inline-block; background: #ffffff; color: #1a472a; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 5px; border: 2px solid #1a472a;">
          Go to Dashboard
        </a>
      </div>
      
      <!-- What's Next -->
      <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px; color: #92400e; font-size: 16px;">📋 What's Next?</h4>
        <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 14px; line-height: 1.8;">
          <li>Share your listing with friends and family</li>
          <li>Keep your availability calendar up to date</li>
          <li>Respond promptly to booking inquiries</li>
          <li>Add more photos to attract guests</li>
        </ul>
      </div>
      
      <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
        If you have any questions or need assistance, our team is here to help.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #666; font-size: 12px; margin: 0;">
        © ${new Date().getFullYear()} RoomsOnline. All rights reserved.
      </p>
      <p style="color: #999; font-size: 11px; margin: 10px 0 0;">
        This is an automated notification. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: "RoomsOnline <noreply@notify.roomsonline.co.za>",
      to: [ownerEmail],
      subject: `🎉 ${propertyName} is now live on RoomsOnline!`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Email send error:", emailError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send notification email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Activation notification sent to ${ownerEmail} for property ${propertyName}`);

    // Also send internal notification to admins
    try {
      await resend.emails.send({
        from: "RoomsOnline <noreply@notify.roomsonline.co.za>",
        to: ["carike@roomsonline.co.za", "sleepinafrica@roomsonline.co.za"],
        subject: `Property Activated: ${propertyName}`,
        html: `
          <p>A property has been activated and is now live on the website:</p>
          <ul>
            <li><strong>Property:</strong> ${propertyName}</li>
            <li><strong>Owner:</strong> ${ownerName} (${ownerEmail})</li>
            <li><strong>Location:</strong> ${property.city || "N/A"}, ${property.country || "N/A"}</li>
            <li><strong>Activated at:</strong> ${new Date().toISOString()}</li>
          </ul>
          <p><a href="${showcaseUrl}">View Listing</a></p>
        `,
      });
    } catch (adminEmailError) {
      console.error("Admin notification failed:", adminEmailError);
      // Don't fail the main request if admin email fails
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_id: emailResult?.id,
        sent_to: ownerEmail,
        property_name: propertyName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send activation notification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
