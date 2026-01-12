import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { property_id, owner_email, owner_name, resend: isResend } = await req.json();

    if (!property_id || !owner_email) {
      return new Response(JSON.stringify({ error: "property_id and owner_email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get property details
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("name, slug")
      .eq("id", property_id)
      .single();

    if (propError || !property) {
      return new Response(JSON.stringify({ error: "Property not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get next version number
    const { data: existing } = await supabase
      .from("property_contracts")
      .select("version")
      .eq("property_id", property_id)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = (existing?.[0]?.version || 0) + 1;
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Create contract record
    const { data: contract, error: createError } = await supabase
      .from("property_contracts")
      .insert({
        property_id,
        status: "sent",
        version: nextVersion,
        sent_to_email: owner_email,
        sent_at: new Date().toISOString(),
        token_expires_at: tokenExpiresAt,
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating contract:", createError);
      return new Response(JSON.stringify({ error: "Failed to create contract" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build signing URL
    const baseUrl = Deno.env.get("SITE_URL") || "https://roomsonline.co.za";
    const signingUrl = `${baseUrl}/contract/sign/${contract.signing_token}`;

    // Send email if Resend is configured
    if (resendKey) {
      const resend = new Resend(resendKey);

      await resend.emails.send({
        from: "RoomsOnline <noreply@roomsonline.co.za>",
        to: owner_email,
        subject: `Contract for ${property.name} - Signature Required`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 180px; height: auto; margin-bottom: 20px;" />
              <h1 style="margin: 0; font-size: 24px; color: #333;">Contract Ready for Signature</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px;">
              <p style="color: #333; line-height: 1.6;">Dear ${owner_name || "Property Owner"},</p>
              <p style="color: #333; line-height: 1.6;">Your RoomsOnline partnership agreement for <strong>${property.name}</strong> is ready for your signature.</p>
              <p style="color: #333; line-height: 1.6;">Please click the button below to review and sign the contract electronically:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${signingUrl}" style="display: inline-block; padding: 14px 32px; background-color: #e91e8c; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Review & Sign Contract</a>
              </div>
              <p style="color: #666; font-size: 14px; line-height: 1.6;">This link will expire in 7 days. If you have any questions, please contact us.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #666; font-size: 14px;">Kind regards,<br><strong>The RoomsOnline Team</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      contract_id: contract.id,
      signing_url: signingUrl 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in send-contract:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
