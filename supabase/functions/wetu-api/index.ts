import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

const WETU_API_KEY = Deno.env.get("WETU_API_KEY");
const WETU_BASE = "https://wetu.com/API/Pins";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!WETU_API_KEY) {
      return new Response(
        JSON.stringify({ error: "WETU_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, property_id, search_terms, page_number } = await req.json();

    if (!action || typeof action !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'action' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let url: string;
    let response: Response;

    switch (action) {
      case "health_check":
        url = `${WETU_BASE}/${WETU_API_KEY}/List?suppliers=y`;
        response = await fetch(url);
        if (!response.ok) {
          return new Response(
            JSON.stringify({ status: "error", message: `WETU API returned ${response.status}` }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ status: "healthy", message: "WETU API key is valid" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "list_properties":
        url = `${WETU_BASE}/${WETU_API_KEY}/List?suppliers=y`;
        response = await fetch(url);
        break;

      case "get_property":
        if (!property_id || typeof property_id !== "string") {
          return new Response(
            JSON.stringify({ error: "Missing or invalid 'property_id' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        url = `${WETU_BASE}/${WETU_API_KEY}/Get?ids=${encodeURIComponent(property_id)}`;
        response = await fetch(url);
        break;

      case "search":
        if (!search_terms || typeof search_terms !== "string") {
          return new Response(
            JSON.stringify({ error: "Missing or invalid 'search_terms' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        url = `${WETU_BASE}/${WETU_API_KEY}/Search/${encodeURIComponent(search_terms)}`;
        response = await fetch(url);
        break;

      case "get_paged":
        const pageNum = page_number && typeof page_number === "number" ? page_number : 1;
        url = `${WETU_BASE}/${WETU_API_KEY}/GetPinsWithPaging?pageNumber=${pageNum}`;
        response = await fetch(url);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Supported: health_check, list_properties, get_property, search, get_paged` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `WETU API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
