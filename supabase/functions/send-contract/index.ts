import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PropertyContractDetails {
  name: string;
  registeredName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  telephone?: string;
  mobileNumber?: string;
  email?: string;
  physicalAddress?: string;
  postalAddress?: string;
  keyRepresentative?: string;
}

function generatePropertyDetailsHTML(property: PropertyContractDetails): string {
  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; width: 40%; color: #2d3748;">Property Name</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.registeredName || property.name}</td>
      </tr>
      ${property.registrationNumber ? `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Registration Number</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.registrationNumber}</td>
      </tr>` : ''}
      ${property.vatNumber ? `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">VAT Number</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.vatNumber}</td>
      </tr>` : ''}
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Contact</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.telephone || 'N/A'} | ${property.email || 'N/A'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Address</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.physicalAddress || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Key Representative</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.keyRepresentative || 'N/A'}</td>
      </tr>
    </table>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { property_id, owner_email: providedEmail, owner_name, resend: isResend } = await req.json();

    if (!property_id) {
      return new Response(JSON.stringify({ error: "property_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get full property details including amenities
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("id, name, slug, owner_name, owner_email, address, city, country, amenities")
      .eq("id", property_id)
      .single();

    if (propError || !property) {
      return new Response(JSON.stringify({ error: "Property not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build property details for contract - always use fresh DB data
    const amenities = property.amenities as Record<string, any> || {};
    
    // Determine the actual email to send to - prioritize amenities.contact_email, then property.owner_email
    const owner_email = amenities.contact_email || property.owner_email || providedEmail;
    
    if (!owner_email) {
      return new Response(JSON.stringify({ error: "No owner email found for this property" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const propertyDetails: PropertyContractDetails = {
      name: property.name,
      registeredName: amenities.registered_business_name || property.name,
      registrationNumber: amenities.registration_number,
      vatNumber: amenities.vat_number,
      telephone: amenities.telephone,
      mobileNumber: amenities.mobile_number || amenities.telephone,
      email: owner_email,
      physicalAddress: [property.address, property.city, property.country].filter(Boolean).join(", "),
      postalAddress: amenities.postal_address,
      keyRepresentative: property.owner_name || owner_name,
    };

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
    const baseUrl = Deno.env.get("SITE_URL") || "https://sleepinafrica.roomsonline.co.za";
    const signingUrl = `${baseUrl}/contract/sign/${contract.signing_token}`;

    // Send email if Resend is configured
    if (resendKey) {
      const resend = new Resend(resendKey);
      const propertyDetailsHTML = generatePropertyDetailsHTML(propertyDetails);

      await resend.emails.send({
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
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
              <p style="color: #333; line-height: 1.6;">Dear ${propertyDetails.keyRepresentative || owner_name || "Property Owner"},</p>
              <p style="color: #333; line-height: 1.6;">Your RoomsOnline partnership agreement is ready for your signature.</p>
              
              <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #2d3748;">Property Details</h3>
                ${propertyDetailsHTML}
              </div>
              
              <p style="color: #333; line-height: 1.6;">Please click the button below to review the full contract and sign electronically:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${signingUrl}" style="display: inline-block; padding: 14px 32px; background-color: #e91e8c; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Review & Sign Contract</a>
              </div>
              <p style="color: #666; font-size: 14px; line-height: 1.6;">This link will expire in 7 days. If you have any questions, contact us at <a href="mailto:sleepinafrica@roomsonline.co.za" style="color: #e91e8c;">sleepinafrica@roomsonline.co.za</a></p>
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
