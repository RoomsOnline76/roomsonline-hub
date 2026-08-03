import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { token } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "Token required", code: "MISSING_TOKEN" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First try owner_contracts table (new system)
    const { data: ownerContract } = await supabase
      .from("owner_contracts")
      .select("*")
      .eq("signing_token", token)
      .maybeSingle();

    if (ownerContract) {
      // A referral agreement is a once-off rep engagement — it covers no properties.
      const meta = (ownerContract.metadata || {}) as Record<string, unknown>;
      const isReferral = meta.contract_type === "referral";

      // Fetch properties for this owner (needed for both signed and unsigned contracts)
      const { data: properties } = isReferral
        ? { data: [] as any[] }
        : await supabase
            .from("properties")
            .select("id, name, slug, address, city, country, property_type, amenities")
            .eq("owner_email", ownerContract.owner_email)
            .is("permanently_deleted_at", null)
            .order("name");

      // Determine if this is a new owner who needs to provide property details
      const isNewOwner = !isReferral && ownerContract.is_new_owner === true;
      const requiresPropertyDetails = isNewOwner && (!properties || properties.length === 0);

      // Fetch template content if template_version_id exists
      let templateContent: string | null = null;
      let templateVariablesSchema: Record<string, unknown> | null = null;
      if (ownerContract.template_version_id) {
        const { data: templateVersion } = await supabase
          .from("contract_template_versions")
          .select("content_markdown, variables_schema")
          .eq("id", ownerContract.template_version_id)
          .single();
        
        if (templateVersion) {
          templateContent = templateVersion.content_markdown;
          templateVariablesSchema = templateVersion.variables_schema as Record<string, unknown>;
        }
      }

      if (ownerContract.status === "signed") {
        // Return signed contract with all data needed for display/download
        return new Response(JSON.stringify({ 
          contract: {
            ...ownerContract,
            signee_name: ownerContract.signed_by_name,
            signee_email: ownerContract.signed_by_email,
            signee_designation: ownerContract.signed_by_designation,
          },
          properties: properties || [],
          code: "ALREADY_SIGNED",
          contract_type: isReferral ? "referral" : "owner",
          template_content: templateContent,
          template_variables_schema: templateVariablesSchema,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (ownerContract.token_expires_at && new Date(ownerContract.token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Signing link has expired", code: "EXPIRED" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!ownerContract.viewed_at) {
        await supabase
          .from("owner_contracts")
          .update({ viewed_at: new Date().toISOString(), status: "viewed" })
          .eq("id", ownerContract.id);
      }

      return new Response(JSON.stringify({
        contract: ownerContract,
        properties: properties || [],
        contract_type: isReferral ? "referral" : "owner",
        template_content: templateContent,
        template_variables_schema: templateVariablesSchema,
        requires_property_details: requiresPropertyDetails,
        is_new_owner: isNewOwner,
        terms_snapshot: isReferral ? (meta.terms_snapshot || null) : null,
        rep_id: isReferral ? (meta.rep_id || null) : null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback: try legacy property_contracts table
    const { data: propContract } = await supabase
      .from("property_contracts")
      .select("*")
      .eq("signing_token", token)
      .maybeSingle();

    if (propContract) {
      if (propContract.status === "signed") {
        return new Response(JSON.stringify({ 
          contract: propContract,
          properties: [],
          code: "ALREADY_SIGNED",
          contract_type: "property",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (propContract.token_expires_at && new Date(propContract.token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Signing link has expired", code: "EXPIRED" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: property } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propContract.property_id)
        .single();

      if (!propContract.viewed_at) {
        await supabase
          .from("property_contracts")
          .update({ viewed_at: new Date().toISOString(), status: "viewed" })
          .eq("id", propContract.id);
      }

      return new Response(JSON.stringify({
        contract: propContract,
        properties: property ? [property] : [],
        contract_type: "property",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid or expired signing link", code: "NOT_FOUND" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in get-contract-by-token:", error);
    return new Response(JSON.stringify({ error: "Internal server error", code: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
