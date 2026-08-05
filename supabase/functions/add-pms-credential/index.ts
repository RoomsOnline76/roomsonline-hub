import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the requesting user is admin/dev
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user is admin or dev
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "dev", "fearless_leader"])
      .maybeSingle();

    if (!userRole) {
      throw new Error("Only admins and devs can add PMS credentials");
    }

    const body = await req.json();
    const { owner_id, system_type, agency_uid, owner_will_provide } = body;

    if (!owner_id || !system_type) {
      throw new Error("owner_id and system_type are required");
    }

    // Verify the owner exists
    const { data: ownerProfile, error: ownerError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", owner_id)
      .single();

    if (ownerError || !ownerProfile) {
      throw new Error("Owner not found");
    }

    // Build credential data
    const credentialData: Record<string, any> = {
      owner_id,
      system_type,
      is_active: true,
      environment: "production",
    };

    // For Hostfully, store the agency UID
    if (system_type === "hostfully") {
      if (agency_uid) {
        credentialData.external_account_id = agency_uid;
        credentialData.sync_status = "pending_key"; // Owner needs to provide API key
      } else if (owner_will_provide) {
        credentialData.sync_status = "pending"; // Owner will provide all details
      } else {
        throw new Error("Agency UID or owner_will_provide flag required for Hostfully");
      }
    } else {
      // For other PMS systems, set as pending setup
      credentialData.sync_status = "pending";
    }

    // Insert the credential
    const { data: credential, error: insertError } = await supabase
      .from("owner_pms_credentials")
      .insert(credentialData)
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      
      // Check for unique constraint violation
      if (insertError.code === "23505") {
        throw new Error(`This ${system_type} account is already connected for this owner`);
      }
      
      throw new Error(`Failed to add credential: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        credential_id: credential.id,
        message: `${system_type} connection added successfully`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in add-pms-credential:", errorMessage);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
