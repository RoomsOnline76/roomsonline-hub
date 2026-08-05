import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, property_id, subtotal } = await req.json();

    if (!code || !property_id) {
      return new Response(
        JSON.stringify({ valid: false, reason: "Missing code or property_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the code: match property-specific OR global (null property_id)
    const { data: promos, error } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("is_active", true);

    if (error) throw error;

    // Filter: property-specific first, then global
    const match =
      promos?.find((p: any) => p.property_id === property_id) ||
      promos?.find((p: any) => p.property_id === null);

    if (!match) {
      return new Response(
        JSON.stringify({ valid: false, reason: "Invalid voucher code" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate date range
    const today = new Date().toISOString().split("T")[0];
    if (match.valid_from && today < match.valid_from) {
      return new Response(
        JSON.stringify({ valid: false, reason: "This voucher is not yet active" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (match.valid_until && today > match.valid_until) {
      return new Response(
        JSON.stringify({ valid: false, reason: "This voucher has expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate max uses
    if (match.max_uses !== null && match.current_uses >= match.max_uses) {
      return new Response(
        JSON.stringify({ valid: false, reason: "This voucher has reached its usage limit" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate discount amount
    let discount_amount = 0;
    if (match.discount_type === "percentage") {
      discount_amount = (subtotal || 0) * (match.discount_value / 100);
    } else {
      discount_amount = match.discount_value;
    }
    discount_amount = Math.round(discount_amount * 100) / 100;

    return new Response(
      JSON.stringify({
        valid: true,
        discount_type: match.discount_type,
        discount_value: match.discount_value,
        discount_amount,
        conditions: match.conditions || {},
        description: match.description,
        promo_id: match.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("validate-voucher error:", err);
    return new Response(
      JSON.stringify({ valid: false, reason: "Server error validating voucher" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
