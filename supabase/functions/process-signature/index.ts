import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PendingPropertyData {
  property_name: string;
  property_type: string;
  address: string;
  city: string;
  country: string;
  registered_business_name?: string;
  registration_number?: string;
  vat_number?: string;
  telephone?: string;
  mobile_number?: string;
  postal_address?: string;
  key_representative?: string;
}

// Master checklist template
const CHECKLIST_ITEMS = [
  // Contract phase
  { phase: 'contract', key: 'contract_signed', label: 'Contract signed', required_for: ['all'] },
  
  // Onboarding phase - common
  { phase: 'onboarding', key: 'property_name', label: 'Property name set', required_for: ['all'] },
  { phase: 'onboarding', key: 'property_address', label: 'Address configured', required_for: ['all'] },
  { phase: 'onboarding', key: 'property_description', label: 'Description added', required_for: ['all'] },
  { phase: 'onboarding', key: 'contact_details', label: 'Contact details complete', required_for: ['all'] },
  { phase: 'onboarding', key: 'location_configured', label: 'Location/map configured', required_for: ['all'] },
  { phase: 'onboarding', key: 'images_uploaded', label: 'Images uploaded (min 3)', required_for: ['all'] },
  
  // Accommodation-specific
  { phase: 'onboarding', key: 'rooms_configured', label: 'Room types added', required_for: ['accommodation', 'hybrid'] },
  { phase: 'onboarding', key: 'pricing_set', label: 'Pricing configured', required_for: ['accommodation', 'hybrid'] },
  { phase: 'onboarding', key: 'check_in_out_times', label: 'Check-in/out times set', required_for: ['accommodation', 'hybrid'] },
  
  // Venue-specific
  { phase: 'onboarding', key: 'venue_capacity', label: 'Venue capacity set', required_for: ['venue', 'hybrid'] },
  { phase: 'onboarding', key: 'event_types', label: 'Event types defined', required_for: ['venue', 'hybrid'] },
  
  // Experience-specific
  { phase: 'onboarding', key: 'experience_details', label: 'Experience details complete', required_for: ['experience'] },
  { phase: 'onboarding', key: 'logistics', label: 'Logistics configured', required_for: ['experience'] },
  
  // Commercial phase
  { phase: 'commercial', key: 'bank_details', label: 'Bank details provided', required_for: ['all'] },
  { phase: 'commercial', key: 'commission_agreed', label: 'Commission rate confirmed', required_for: ['all'] },
  
  // Activation phase
  { phase: 'activation', key: 'admin_review', label: 'Admin review complete', required_for: ['all'] },
  { phase: 'activation', key: 'quality_gate_passed', label: 'Quality gate passed', required_for: ['all'] },
];

async function generatePropertyChecklist(
  supabase: any,
  propertyId: string,
  listingIntent: string
): Promise<void> {
  // Filter items based on listing intent
  const applicableItems = CHECKLIST_ITEMS.filter(item => 
    item.required_for.includes('all') || item.required_for.includes(listingIntent)
  );
  
  // Insert checklist items
  const checklistRecords = applicableItems.map(item => ({
    property_id: propertyId,
    phase: item.phase,
    item_key: item.key,
    item_label: item.label,
    required_for: item.required_for,
    completed: item.key === 'contract_signed', // Auto-complete contract item
    completed_at: item.key === 'contract_signed' ? new Date().toISOString() : null,
    auto_verified: item.key === 'contract_signed',
  }));
  
  const { error } = await supabase
    .from('property_checklist')
    .upsert(checklistRecords, { 
      onConflict: 'property_id,phase,item_key',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('Error creating checklist:', error);
  } else {
    console.log(`Created ${checklistRecords.length} checklist items for property ${propertyId}`);
  }
}

async function generateOnboardingRoadmap(
  supabase: any,
  propertyId: string,
  metadata: Record<string, unknown> | null
): Promise<void> {
  const listingIntent = (metadata?.listing_intent as string) || 'accommodation';
  const commercialModel = (metadata?.commercial_model as string) || 'commission';
  
  const roadmap = {
    listing_intent: listingIntent,
    commercial_model: commercialModel,
    expected_steps: metadata?.expected_steps || [],
    min_requirements: metadata?.min_requirements || {},
    milestones: [
      { key: 'contract_signed', label: 'Contract Signed', completed: true, completed_at: new Date().toISOString() },
      { key: 'onboarding_started', label: 'Onboarding Started', completed: false },
      { key: 'content_complete', label: 'Content Complete', completed: false },
      { key: 'media_uploaded', label: 'Media Uploaded', completed: false },
      { key: 'review_submitted', label: 'Review Submitted', completed: false },
      { key: 'activated', label: 'Property Activated', completed: false },
    ],
    created_at: new Date().toISOString(),
  };
  
  const { error } = await supabase
    .from('property_onboarding_roadmap')
    .upsert({
      property_id: propertyId,
      roadmap,
    }, { onConflict: 'property_id' });
  
  if (error) {
    console.error('Error creating roadmap:', error);
  } else {
    console.log(`Created onboarding roadmap for property ${propertyId}`);
  }
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
    
    const { 
      contract_id, 
      signing_token, 
      signee_name, 
      signee_email, 
      signee_designation, 
      signature_data_url, 
      contract_type,
      pending_property_data,
      terms_snapshot
    } = await req.json();

    // Validate inputs
    if (!contract_id || !signing_token || !signee_name || !signee_email || !signature_data_url) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which table to use
    const tableName = contract_type === "owner" ? "owner_contracts" : "property_contracts";
    
    // Verify contract and token
    const { data: contract, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", contract_id)
      .eq("signing_token", signing_token)
      .single();

    if (fetchError || !contract) {
      return new Response(JSON.stringify({ error: "Invalid contract or token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (contract.status === "signed") {
      return new Response(JSON.stringify({ error: "Contract already signed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check token expiry
    if (contract.token_expires_at && new Date(contract.token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Signing link has expired" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Store signature image
    const signatureFileName = `${contract_id}-signature.png`;
    const base64Data = signature_data_url.replace(/^data:image\/\w+;base64,/, "");
    const signatureBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from("signatures")
      .upload(signatureFileName, signatureBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Signature upload error:", uploadError);
    }

    const { data: signatureUrlData } = supabase.storage
      .from("signatures")
      .getPublicUrl(signatureFileName);

    // Extract contract metadata for intent-aware processing
    const contractMetadata = contract.metadata as Record<string, unknown> | null;
    const listingIntent = (contractMetadata?.listing_intent as string) || 'accommodation';

    // Handle property creation for new owners
    let createdPropertyId: string | null = null;
    let createdPropertyName: string | null = null;
    
    if (contract_type === "owner" && contract.is_new_owner && pending_property_data) {
      const propData = pending_property_data as PendingPropertyData;
      
      // Create the property with listing_status = 'contract_signed'
      const { data: newProperty, error: propError } = await supabase
        .from("properties")
        .insert({
          name: propData.property_name,
          // Normalize property_type to lowercase for Select component compatibility
          property_type: propData.property_type?.toLowerCase() || "hotel",
          address: propData.address,
          city: propData.city,
          country: propData.country,
          owner_email: contract.owner_email,
          owner_name: signee_name,
          is_active: true,
          max_guests: 2,
          bedrooms: 1,
          bathrooms: 1,
          price_per_night: 0,
          // New status fields
          listing_status: 'contract_signed',
          listing_intent: listingIntent,
          commercial_model: contractMetadata?.commercial_model || 'commission',
          pms_readiness: 'none',
          amenities: {
            // Root level (for contract variable resolution)
            registered_business_name: propData.registered_business_name || propData.property_name,
            registration_number: propData.registration_number,
            vat_number: propData.vat_number,
            telephone: propData.telephone,
            mobile_number: propData.mobile_number,
            postal_address: propData.postal_address,
            key_representative: propData.key_representative || signee_name,
            // Nested structure (for PropertyForm compatibility)
            contact: {
              email: contract.owner_email,
              telephone: propData.telephone,
            },
            banking: {
              property_registration: propData.registration_number,
              vat_number: propData.vat_number,
              has_vat: !!propData.vat_number,
            },
          },
        })
        .select("id, name")
        .single();

      if (propError) {
        console.error("Error creating property:", propError);
        return new Response(JSON.stringify({ error: "Failed to create property" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      createdPropertyId = newProperty.id;
      createdPropertyName = newProperty.name;
      console.log("Created new property:", createdPropertyId, createdPropertyName);

      // Generate onboarding roadmap
      if (createdPropertyId) {
        await generateOnboardingRoadmap(supabase, createdPropertyId, contractMetadata);
        
        // Generate property checklist
        await generatePropertyChecklist(supabase, createdPropertyId, listingIntent);
      }

      // Ensure profile and user_role exist for the new owner
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", contract.owner_email)
        .maybeSingle();

      if (!existingProfile) {
        // Find the auth user
        const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
        const authUser = authUsers?.find((u: { email?: string }) => u.email === contract.owner_email);
        
        if (authUser) {
          // Create profile
          const { error: profileError } = await supabase.from("profiles").insert({
            id: authUser.id,
            email: contract.owner_email,
            full_name: signee_name,
            role: "user",
          });
          
          if (profileError) {
            console.error("Error creating profile:", profileError);
          } else {
            console.log("Created profile for new owner:", contract.owner_email);
          }

          // Create user role
          const { error: roleError } = await supabase.from("user_roles").upsert({
            user_id: authUser.id,
            role: "user",
          }, { onConflict: "user_id,role" });
          
          if (roleError) {
            console.error("Error creating user role:", roleError);
          } else {
            console.log("Created user role for new owner");
          }
        } else {
          console.error("Auth user not found for:", contract.owner_email);
        }
      } else {
        console.log("Profile already exists for:", contract.owner_email);
      }
    } else if (contract_type === "owner" && !contract.is_new_owner) {
      // Existing owner signing - update all their properties to 'contract_signed' status
      const { data: ownerProperties, error: propsError } = await supabase
        .from("properties")
        .select("id, listing_intent")
        .eq("owner_email", contract.owner_email)
        .is("permanently_deleted_at", null);
      
      if (!propsError && ownerProperties) {
        for (const prop of ownerProperties) {
          // Update status
          await supabase
            .from("properties")
            .update({ listing_status: 'contract_signed' })
            .eq("id", prop.id);
          
          // Generate roadmap and checklist for each property
          await generateOnboardingRoadmap(supabase, prop.id, contractMetadata);
          await generatePropertyChecklist(supabase, prop.id, prop.listing_intent || listingIntent);
        }
        console.log(`Updated ${ownerProperties.length} properties for existing owner`);
      }
    }

    // Update contract as signed
    const updateData: Record<string, unknown> = {
      status: "signed",
      token_expires_at: null, // Clear expiry since it's now permanently accessible
      signed_at: new Date().toISOString(),
      signed_by_name: signee_name,
      signed_by_email: signee_email,
      signed_by_designation: signee_designation || null,
      signature_image_url: signatureUrlData.publicUrl,
      signature_data: { dataUrl: signature_data_url },
      signature_ip: clientIp,
      signature_user_agent: userAgent,
    };

    // Store pending property data if provided
    if (pending_property_data) {
      updateData.pending_property_data = pending_property_data;
    }

    // Freeze the billing / commission figures the signer actually saw, so later
    // billing-config changes never retro-edit a signed agreement.
    if (terms_snapshot && tableName === "owner_contracts") {
      updateData.metadata = {
        ...((contract.metadata as Record<string, unknown> | null) || {}),
        terms_snapshot,
        terms_snapshot_at: new Date().toISOString(),
      };
    }


    const { error: updateError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq("id", contract_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update contract" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get properties for email
    let propertiesText = "your properties";
    let propertiesCount = 1;
    
    if (contract_type === "owner") {
      if (createdPropertyName) {
        // New owner - use just-created property
        propertiesText = createdPropertyName;
        propertiesCount = 1;
      } else {
        // Existing owner - get all properties
        const { data: properties } = await supabase
          .from("properties")
          .select("name")
          .eq("owner_email", contract.owner_email)
          .is("permanently_deleted_at", null);
        
        propertiesCount = properties?.length || 0;
        propertiesText = properties?.map((p: { name: string }) => p.name).join(", ") || "your properties";
      }
    } else {
      // Legacy property contract
      const { data: property } = await supabase
        .from("properties")
        .select("name")
        .eq("id", contract.property_id)
        .single();
      
      propertiesText = property?.name || "your property";
    }

    // Send confirmation emails
    if (resendKey) {
      const resend = new Resend(resendKey);

      // Check if this was a new owner - send welcome email
      const isNewOwner = contract_type === "owner" && contract.is_new_owner && createdPropertyId;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', sans-serif; background-color: #f5f5f5; padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 48px; color: #22c55e;">✓</div>
      <h1 style="color: #333; margin: 10px 0;">Contract Signed Successfully</h1>
    </div>
    <p style="color: #333;">Dear ${signee_name},</p>
    <p style="color: #333;">Thank you for signing the RoomsOnline partnership agreement${propertiesCount > 1 ? ` covering ${propertiesCount} properties` : ''} (${propertiesText}).</p>
    ${isNewOwner ? `
    <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #047857;">🎉 Your Property Has Been Registered!</h3>
      <p style="margin: 0; color: #065f46; font-size: 14px;">
        "${createdPropertyName}" has been created. You'll receive a separate email with instructions to set up your password and complete your property listing.
      </p>
    </div>
    ` : ''}
    <p style="color: #333;">Your signed contract is now on file. Welcome to RoomsOnline!</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #666; font-size: 14px; text-align: center;">The RoomsOnline Team<br><a href="mailto:sleepinafrica@roomsonline.co.za" style="color: #e91e8c;">sleepinafrica@roomsonline.co.za</a></p>
  </div>
</body>
</html>`;

      // Send to signee
      await resend.emails.send({
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
        to: signee_email,
        subject: `Contract Signed - ${propertiesText}`,
        html: emailHtml,
      });

      // Send to Carike
      await resend.emails.send({
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
        to: "carike@roomsonline.co.za",
        subject: `[Contract Signed] ${propertiesText} - ${signee_name}${isNewOwner ? ' (NEW OWNER)' : ''}`,
        html: emailHtml.replace("Dear " + signee_name, "Dear Carike") + 
          `<p style="color: #666; font-size: 12px;">Signed by: ${signee_name} (${signee_email}) from IP: ${clientIp}</p>${isNewOwner ? `<p style="color: #666; font-size: 12px;">New property created: ${createdPropertyName}</p>` : ''}`,
      });

      // Send to sleepinafrica@roomsonline.co.za
      await resend.emails.send({
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
        to: "sleepinafrica@roomsonline.co.za",
        subject: `[Contract Signed] ${propertiesText} - ${signee_name}${isNewOwner ? ' (NEW OWNER)' : ''}`,
        html: emailHtml.replace("Dear " + signee_name, "Dear Team") + 
          `<p style="color: #666; font-size: 12px;">Signed by: ${signee_name} (${signee_email}) from IP: ${clientIp}</p>${isNewOwner ? `<p style="color: #666; font-size: 12px;">New property created: ${createdPropertyName}</p>` : ''}`,
      });

      // For new owners, also send password reset email so they can set up their account
      if (isNewOwner) {
        try {
          // Generate password reset link
          const { data: resetData, error: resetError } = await supabase.auth.admin.generateLink({
            type: "recovery",
            email: contract.owner_email,
          });

          if (!resetError && resetData?.properties?.action_link) {
            await resend.emails.send({
              from: "RoomsOnline <hello@notify.roomsonline.co.za>",
              to: contract.owner_email,
              subject: "Welcome to RoomsOnline - Set Up Your Account",
              html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', sans-serif; background-color: #f5f5f5; padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 180px; height: auto; margin-bottom: 20px;" />
      <h1 style="color: #333; margin: 10px 0;">Welcome to RoomsOnline!</h1>
    </div>
    <p style="color: #333;">Dear ${signee_name},</p>
    <p style="color: #333;">Your account has been created and your property "${createdPropertyName}" is now registered with RoomsOnline.</p>
    <p style="color: #333;">To complete your setup, please create a password for your account:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetData.properties.action_link}" style="display: inline-block; padding: 14px 32px; background-color: #e91e8c; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Set Up Your Password</a>
    </div>
    <p style="color: #333;">After setting your password, you can log in to complete your property listing with photos, room details, and pricing.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #666; font-size: 14px; text-align: center;">Need help? Contact <a href="mailto:sleepinafrica@roomsonline.co.za" style="color: #e91e8c;">sleepinafrica@roomsonline.co.za</a></p>
  </div>
</body>
</html>`,
            });
          }
        } catch (welcomeError) {
          console.error("Error sending welcome email:", welcomeError);
          // Don't fail the whole process if welcome email fails
        }

        // Send onboarding wizard email
        try {
          const { error: onboardingError } = await supabase.functions.invoke(
            "send-onboarding-email",
            {
              body: {
                propertyId: createdPropertyId,
                ownerEmail: contract.owner_email,
                ownerName: signee_name,
                propertyName: createdPropertyName,
              },
            }
          );

          if (onboardingError) {
            console.error("Error sending onboarding email:", onboardingError);
          } else {
            console.log("Onboarding email sent successfully to:", contract.owner_email);
          }
        } catch (onboardingErr) {
          console.error("Failed to send onboarding email:", onboardingErr);
          // Don't fail the whole process
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      created_property_id: createdPropertyId,
      created_property_name: createdPropertyName,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in process-signature:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
