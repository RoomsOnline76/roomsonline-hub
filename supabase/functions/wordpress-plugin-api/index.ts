import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing x-api-key header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate API key
    const { data: config, error: configError } = await supabase
      .from("integration_configs")
      .select("property_id, is_active, integration_type")
      .eq("api_key", apiKey)
      .maybeSingle();

    if (!config || configError) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!config.is_active) {
      return new Response(JSON.stringify({ error: "Integration is disabled" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "get_property_info") {
      const { data: property } = await supabase
        .from("properties")
        .select("id, name, slug, location, description, images, amenities, brand_logo_url, brand_primary_color")
        .eq("id", config.property_id)
        .single();

      return new Response(JSON.stringify({ property }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_availability") {
      const { check_in, check_out } = body;
      if (!check_in || !check_out) {
        return new Response(JSON.stringify({ error: "check_in and check_out required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return property info + booking URL (actual availability comes from PMS at booking time)
      const { data: property } = await supabase
        .from("properties")
        .select("id, name, slug, external_system")
        .eq("id", config.property_id)
        .single();

      const bookingUrl = `https://book.sleepinafrica.roomsonline.co.za/property/${property?.slug}?source=api&integration=api&property_id=${config.property_id}&check_in=${check_in}&check_out=${check_out}`;

      return new Response(JSON.stringify({ property, booking_url: bookingUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_booking_redirect") {
      const { check_in, check_out, rooms } = body;
      const { data: property } = await supabase
        .from("properties")
        .select("slug")
        .eq("id", config.property_id)
        .single();

      const params = new URLSearchParams({
        source: "api",
        integration: "api",
        property_id: config.property_id,
      });
      if (check_in) params.set("check_in", check_in);
      if (check_out) params.set("check_out", check_out);

      const url = `https://book.sleepinafrica.roomsonline.co.za/property/${property?.slug}?${params}`;

      return new Response(JSON.stringify({ booking_url: url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("wordpress-plugin-api error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
