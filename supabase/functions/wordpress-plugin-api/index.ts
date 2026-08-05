import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Rate limit check helper
async function checkRateLimit(supabase: ReturnType<typeof createClient>, propertyId: string) {
  const { data: rl } = await supabase
    .from("api_rate_limits")
    .select("*")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .maybeSingle();

  const perMinute = rl?.requests_per_minute ?? 60;
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("api_request_log")
    .select("*", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("endpoint", "wordpress-plugin-api")
    .gte("created_at", oneMinuteAgo);

  const current = count ?? 0;
  const remaining = Math.max(0, perMinute - current);
  const resetAt = new Date(Date.now() + 60_000).toISOString();

  return {
    allowed: current < perMinute,
    headers: {
      "X-RateLimit-Limit": String(perMinute),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": resetAt,
      "X-Api-Version": "v1",
      ...(current >= perMinute ? { "Retry-After": "60" } : {}),
    },
  };
}

async function logRequest(supabase: ReturnType<typeof createClient>, propertyId: string, action: string, statusCode: number, ms: number, req: Request, errorCode?: string) {
  try {
    await supabase.from("api_request_log").insert({
      property_id: propertyId,
      api_version: "v1",
      action,
      status_code: statusCode,
      response_time_ms: ms,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
      error_code: errorCode || null,
      endpoint: "wordpress-plugin-api",
    });
  } catch (_) { /* best effort */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startTime = Date.now();

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

    // Rate limit check
    const rateCheck = await checkRateLimit(supabase, config.property_id);
    if (!rateCheck.allowed) {
      const elapsed = Date.now() - startTime;
      logRequest(supabase, config.property_id, "rate_limited", 429, elapsed, req, "RATE_LIMITED");
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, ...rateCheck.headers, "Content-Type": "application/json" },
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

    const elapsed = Date.now() - startTime;
    logRequest(supabase, config.property_id, action || "unknown", 400, elapsed, req);
    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, ...rateCheck.headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("wordpress-plugin-api error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
