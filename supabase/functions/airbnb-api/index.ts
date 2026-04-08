import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SEARCHAPI_BASE = "https://www.searchapi.io/api/v1/search";

const CAPABILITIES = {
  supports_live_availability: true,
  supports_rate_fetch: true,
  supports_create_booking: false,
  supports_modify_booking: false,
  supports_cancel_booking: false,
  supports_webhooks: false,
  supports_owner_credentials: false,
};

interface RequestBody {
  action: string;
  property_id?: string;
  listing_id?: string;
  location?: string;
  check_in?: string;
  check_out?: string;
  guests?: number;
  page?: number;
}

async function resolveApiKey(propertyId: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase
    .from("pms_credentials")
    .select("api_key")
    .eq("property_id", propertyId)
    .eq("system_type", "airbnb")
    .maybeSingle();

  if (error) throw new Error(`Credential lookup failed: ${error.message}`);
  if (!data?.api_key) throw new Error("No SearchAPI.io API key found for this property");

  return data.api_key;
}

async function searchApiRequest(
  apiKey: string,
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(SEARCHAPI_BASE);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SearchAPI error ${res.status}: ${text}`);
  }
  return res.json();
}

async function handleAction(body: RequestBody): Promise<unknown> {
  const { action } = body;

  if (action === "get_capabilities") {
    return { success: true, capabilities: CAPABILITIES };
  }

  if (!body.property_id) {
    throw new Error("property_id is required");
  }

  const apiKey = await resolveApiKey(body.property_id);

  switch (action) {
    case "health_check": {
      const data = await searchApiRequest(apiKey, {
        engine: "airbnb",
        q: "test",
      });
      return { success: true, message: "SearchAPI.io connection verified", data };
    }

    case "fetch_availability": {
      if (!body.location) throw new Error("location is required for fetch_availability");
      const params: Record<string, string> = {
        engine: "airbnb",
        q: body.location,
      };
      if (body.check_in) params.check_in_date = body.check_in;
      if (body.check_out) params.check_out_date = body.check_out;
      if (body.guests) params.adults = String(body.guests);
      if (body.page) params.page = String(body.page);

      const data = await searchApiRequest(apiKey, params);
      return { success: true, data };
    }

    case "fetch_listing": {
      if (!body.listing_id) throw new Error("listing_id is required for fetch_listing");
      const data = await searchApiRequest(apiKey, {
        engine: "airbnb_listing",
        listing_id: body.listing_id,
      });
      return { success: true, data };
    }

    case "fetch_reviews": {
      if (!body.listing_id) throw new Error("listing_id is required for fetch_reviews");
      const params: Record<string, string> = {
        engine: "airbnb_reviews",
        listing_id: body.listing_id,
      };
      if (body.page) params.page = String(body.page);

      const data = await searchApiRequest(apiKey, params);
      return { success: true, data };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();

    if (!body.action) {
      return new Response(
        JSON.stringify({ error: "action is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await handleAction(body);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("airbnb-api error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
