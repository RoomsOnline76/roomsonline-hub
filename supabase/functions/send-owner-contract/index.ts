import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Intent-aware step mapping
const INTENT_STEPS: Record<string, string[]> = {
  accommodation: ['property_identity', 'contact_details', 'location', 'rooms_overview', 'policies_pricing', 'facilities', 'media_documents', 'guest_experience', 'review'],
  venue: ['property_identity', 'contact_details', 'location', 'capacity', 'event_types', 'facilities', 'media_documents', 'guest_experience', 'review'],
  hybrid: ['property_identity', 'contact_details', 'location', 'rooms_overview', 'capacity', 'event_types', 'policies_pricing', 'facilities', 'media_documents', 'guest_experience', 'review'],
  experience: ['property_identity', 'contact_details', 'location', 'experience_details', 'logistics', 'media_documents', 'review'],
};

// Minimum requirements per intent
const INTENT_REQUIREMENTS: Record<string, Record<string, unknown>> = {
  accommodation: {
    min_images: 5,
    min_rooms: 1,
    required_fields: ['name', 'address', 'description', 'check_in_time', 'check_out_time', 'price_per_night'],
  },
  venue: {
    min_images: 5,
    required_fields: ['name', 'address', 'description', 'venue_capacity', 'event_types'],
  },
  hybrid: {
    min_images: 8,
    min_rooms: 1,
    required_fields: ['name', 'address', 'description', 'check_in_time', 'check_out_time', 'venue_capacity'],
  },
  experience: {
    min_images: 3,
    required_fields: ['name', 'address', 'description', 'duration', 'max_participants'],
  },
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
    const { 
      owner_email, 
      owner_name, 
      resend: isResend,
      // New intent-aware fields
      listing_intent,
      commercial_model,
      property_id, // Optional: if sending contract for specific property created via preflight
      template_id, // Optional: specific template to use
      contract_type, // Optional: 'standard' | 'rolos' | 'referral'
      rep_id, // Referral only: the sales rep being engaged
      terms_snapshot, // Referral only: engagement terms captured at send time
    } = await req.json();

    if (!owner_email) {
      return new Response(JSON.stringify({ error: "owner_email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = owner_email.toLowerCase().trim();

    // A referral agreement is a once-off engagement with a sales rep.
    // It is never linked to properties and never renewed per onboarding.
    const isReferral = contract_type === "referral";

    let properties: any[] | null = null;
    if (!isReferral) {
      const { data: props, error: propError } = await supabase
        .from("properties")
        .select("id, name, slug, address, city, country, property_type, amenities, listing_intent, commercial_model")
        .eq("owner_email", normalizedEmail)
        .is("permanently_deleted_at", null)
        .order("name");

      if (propError) {
        console.error("Error fetching properties:", propError);
        return new Response(JSON.stringify({ error: "Failed to fetch properties" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      properties = props;
    }

    const isNewOwner = !isReferral && (!properties || properties.length === 0);
    
    // Determine listing intent - from request, property, or default
    let resolvedIntent = listing_intent || 'accommodation';
    let resolvedCommercialModel = commercial_model || 'commission';
    
    // If property_id is provided, get intent from that property
    if (property_id && !isReferral) {
      const property = properties?.find(p => p.id === property_id);
      if (property) {
        resolvedIntent = property.listing_intent || resolvedIntent;
        resolvedCommercialModel = property.commercial_model || resolvedCommercialModel;
      }
    }
    
    // If updating property status when sending contract
    if (property_id && !isReferral) {
      const { error: statusError } = await supabase
        .from("properties")
        .update({ listing_status: 'contract_sent' })
        .eq("id", property_id);
      
      if (statusError) {
        console.error("Error updating property status:", statusError);
      }
    }


    // Check if user exists and create if needed
    let userId: string | null = null;
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!existingProfile && isNewOwner) {
      // Create new user with temporary password
      const tempPassword = crypto.randomUUID();
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: owner_name || "",
        },
      });

      if (authError && !authError.message.includes("already registered")) {
        console.error("Error creating user:", authError);
        // Continue anyway - user might exist
      } else if (authUser?.user) {
        userId = authUser.user.id;
        console.log("Created new user:", userId);

        // Create profile if it wasn't auto-created by trigger
        const { data: profileCheck } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (!profileCheck) {
          await supabase.from("profiles").insert({
            id: userId,
            email: normalizedEmail,
            full_name: owner_name || "",
            role: "user",
          });
        }

        // Assign user role
        await supabase.from("user_roles").upsert({
          user_id: userId,
          role: "user",
        }, { onConflict: "user_id,role" });
      }
    }

    // Get next version number
    const { data: existing } = await supabase
      .from("owner_contracts")
      .select("version")
      .eq("owner_email", normalizedEmail)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = (existing?.[0]?.version || 0) + 1;
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Fetch the active contract template version
    // If template_id is provided, use that specific template
    // Otherwise, fall back to the default active template
    let activeTemplateQuery = supabase
      .from("contract_template_versions")
      .select("id, template_id")
      .eq("status", "active")
      .order("version_number", { ascending: false })
      .limit(1);

    // If a specific template is requested, filter by it
    if (template_id) {
      activeTemplateQuery = activeTemplateQuery.eq("template_id", template_id);
    } else if (contract_type === "rolos") {
      // ROL'OS PMS template ID
      activeTemplateQuery = activeTemplateQuery.eq("template_id", "b2c3d4e5-f6a7-4890-bcde-f12345678901");
    } else {
      // Default standard template ID
      activeTemplateQuery = activeTemplateQuery.eq("template_id", "f47ac10b-58cc-4372-a567-0e02b2c3d479");
    }

    const { data: activeTemplate } = await activeTemplateQuery.single();

    console.log("Active template version:", activeTemplate?.id || "none found");
    console.log("Is new owner:", isNewOwner);
    console.log("Listing intent:", resolvedIntent);
    console.log("Commercial model:", resolvedCommercialModel);

    // Build contract metadata with intent information
    const contractMetadata = {
      listing_intent: resolvedIntent,
      commercial_model: resolvedCommercialModel,
      expected_steps: INTENT_STEPS[resolvedIntent] || INTENT_STEPS.accommodation,
      min_requirements: INTENT_REQUIREMENTS[resolvedIntent] || INTENT_REQUIREMENTS.accommodation,
      property_id: property_id || null,
      contract_type: contract_type || 'standard',
      template_id: activeTemplate?.template_id || null,
    };

    // Create contract record with template_version_id, is_new_owner flag, and metadata
    const { data: contract, error: createError } = await supabase
      .from("owner_contracts")
      .insert({
        owner_email: normalizedEmail,
        owner_name: owner_name || null,
        status: "sent",
        version: nextVersion,
        sent_at: new Date().toISOString(),
        token_expires_at: tokenExpiresAt,
        template_version_id: activeTemplate?.id || null,
        is_new_owner: isNewOwner,
        metadata: contractMetadata,
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

    // Email content differs based on whether they're a new owner
    let emailSubject: string;
    let emailIntroHtml: string;
    let propertiesSection: string;

    if (isNewOwner) {
      emailSubject = "Welcome to RoomsOnline - Partnership Agreement";
      emailIntroHtml = `
        <p style="color: #333; line-height: 1.6;">Your RoomsOnline partnership agreement is ready. As part of the signing process, you'll be able to provide details about your property.</p>
        <p style="color: #333; line-height: 1.6;">Once you've signed, you'll receive a welcome email with instructions to set up your account and complete your property listing.</p>
      `;
      propertiesSection = `
        <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #92400e;">📝 New Property Registration</h3>
          <p style="margin: 0; color: #78350f; font-size: 14px;">
            When you sign the contract, you'll be asked to provide basic details about your property. This is quick and easy!
          </p>
        </div>
      `;
    } else {
      emailSubject = "RoomsOnline Partnership Agreement - Signature Required";
      emailIntroHtml = `
        <p style="color: #333; line-height: 1.6;">Your RoomsOnline partnership agreement is ready for your signature. This agreement covers all your properties listed with us.</p>
      `;
      const propertyListHTML = properties!.map(p => {
        const location = [p.address, p.city, p.country].filter(Boolean).join(", ");
        const propertyType = p.property_type ? ` (${p.property_type})` : '';
        return `<li style="margin-bottom: 8px;"><strong>${p.name}</strong>${propertyType}${location ? `<br /><span style="color: #666; font-size: 12px;">${location}</span>` : ''}</li>`;
      }).join("");
      
      propertiesSection = `
        <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #2d3748;">Properties Covered (${properties!.length})</h3>
          <ul style="margin: 0; padding-left: 20px; color: #4a5568;">
            ${propertyListHTML}
          </ul>
        </div>
      `;
    }

    // Send email if Resend is configured
    if (resendKey) {
      const resend = new Resend(resendKey);

      await resend.emails.send({
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
        to: normalizedEmail,
        subject: emailSubject,
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
              <h1 style="margin: 0; font-size: 24px; color: #333;">Partnership Agreement</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px;">
              <p style="color: #333; line-height: 1.6;">Dear ${owner_name || "Property Owner"},</p>
              ${emailIntroHtml}
              ${propertiesSection}
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
      signing_url: signingUrl,
      properties_count: properties?.length || 0,
      is_new_owner: isNewOwner,
      metadata: contractMetadata,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in send-owner-contract:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
