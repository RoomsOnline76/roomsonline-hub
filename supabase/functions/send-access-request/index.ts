import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AccessRequestPayload {
  name: string;
  email: string;
  message: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, message }: AccessRequestPayload = await req.json();

    console.log("Received access request:", { name, email });

    // Validate input
    if (!name || !email) {
      return new Response(
        JSON.stringify({ error: "Name and email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create Supabase client with service role for inserting without auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch configurable email addresses from api_keys table
    const { data: emailConfig } = await supabase
      .from("api_keys")
      .select("key_name, key_value")
      .in("key_name", ["RESEND_FROM_EMAIL", "RESEND_TO_EMAIL"]);

    const fromEmailConfig = emailConfig?.find((k: any) => k.key_name === "RESEND_FROM_EMAIL")?.key_value;
    const toEmailConfig = emailConfig?.find((k: any) => k.key_name === "RESEND_TO_EMAIL")?.key_value;

    // Use configured emails or fallback to defaults
    const fromEmail = fromEmailConfig || "RoomsOnline <onboarding@resend.dev>";
    const adminEmail = toEmailConfig || "carike@roomsonline.co.za";

    console.log("Using email config:", { fromEmail, adminEmail });

    // Store the request in database
    const { data: accessRequest, error: dbError } = await supabase
      .from("access_requests")
      .insert({
        full_name: name,
        email: email,
        message: message || null,
        status: "pending",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to save request" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Access request saved:", accessRequest.id);

    // Send notification email to admin
    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `New Access Request from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Access Request</h2>
          <p>A new user has requested access to RoomsOnline:</p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
          </div>
          
          <p>Please review this request in the admin panel:</p>
          <a href="https://sleepinafrica.roomsonline.co.za/admin/access-requests" 
             style="display: inline-block; background: #e91e63; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Review Request
          </a>
          
          <p style="color: #666; margin-top: 30px; font-size: 12px;">
            This is an automated notification from RoomsOnline.
          </p>
        </div>
      `,
    });

    console.log("Email sent to admin:", emailResponse);

    // Send confirmation email to requester
    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "Access Request Received - RoomsOnline",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Thank You for Your Interest!</h2>
          <p>Hi ${name},</p>
          <p>We've received your access request for RoomsOnline. Our team will review your request and get back to you shortly.</p>
          
          <p style="color: #666; margin-top: 30px;">
            Best regards,<br>
            The RoomsOnline Team
          </p>
        </div>
      `,
    });

    console.log("Confirmation email sent to requester");

    return new Response(
      JSON.stringify({ success: true, message: "Request submitted successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-access-request:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
