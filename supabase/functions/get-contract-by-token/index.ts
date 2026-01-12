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
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing signing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch contract by signing token
    const { data: contract, error: contractError } = await supabase
      .from("property_contracts")
      .select("*")
      .eq("signing_token", token)
      .single();

    if (contractError || !contract) {
      console.error("Contract fetch error:", contractError);
      return new Response(
        JSON.stringify({ error: "Contract not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already signed
    if (contract.status === "signed") {
      return new Response(
        JSON.stringify({ 
          error: "Contract already signed",
          code: "ALREADY_SIGNED",
          contract: {
            id: contract.id,
            status: contract.status,
            signed_at: contract.signed_at,
            signee_name: contract.signee_name,
            signee_email: contract.signee_email,
            signee_designation: contract.signee_designation,
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token has expired
    if (contract.signing_token_expires_at) {
      const expiryDate = new Date(contract.signing_token_expires_at);
      if (expiryDate < new Date()) {
        return new Response(
          JSON.stringify({ error: "Signing link has expired", code: "EXPIRED" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch property details
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, name, address, city, country, owner_name, owner_email")
      .eq("id", contract.property_id)
      .single();

    if (propertyError) {
      console.error("Property fetch error:", propertyError);
    }

    // Update viewed_at if first view
    if (!contract.viewed_at) {
      await supabase
        .from("property_contracts")
        .update({ viewed_at: new Date().toISOString(), status: "viewed" })
        .eq("id", contract.id);
    }

    // Return sanitized contract data
    return new Response(
      JSON.stringify({
        contract: {
          id: contract.id,
          property_id: contract.property_id,
          status: contract.status,
          version: contract.version,
          sent_at: contract.sent_at,
          viewed_at: contract.viewed_at,
          signing_token_expires_at: contract.signing_token_expires_at,
        },
        property: property || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-contract-by-token:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
