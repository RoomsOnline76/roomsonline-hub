// ============================================================================
// PAYFLEX GATEWAY v1.0 — Payflex BNPL API (redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAYFLEX_API = "https://api.payflex.co.za/order";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency = "ZAR", guest_email, guest_name, return_url, cancel_url, property_id } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credData } = await supabase
      .from("integration_configs").select("config")
      .eq("property_id", property_id).eq("integration_type", "payment_credentials").maybeSingle();
    const creds = (credData?.config as Record<string, string>) || {};
    const merchantId = creds.merchant_id;
    const apiKeyVal = creds.api_key;

    if ((!merchantId || !apiKeyVal) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "payflex", error: "Payflex merchant_id/api_key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        const res = await fetch(PAYFLEX_API, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKeyVal}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amount.toFixed(2),
            consumer: { email: guest_email || "", givenNames: guest_name?.split(" ")[0] || "Guest", surname: guest_name?.split(" ").slice(1).join(" ") || "" },
            merchant: { redirectConfirmUrl: return_url, redirectCancelUrl: cancel_url || return_url },
            merchantReference: booking_id || `ROL-${Date.now()}`,
            description: body.item_name || "Booking Payment",
          }),
        });
        const data = await res.json();

        if (!data.redirectUrl) {
          return new Response(JSON.stringify({ success: false, gateway: "payflex", error: data.message || "Payflex order creation failed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: "ZAR", payment_provider: "payflex", payment_reference: data.token || booking_id, status: "pending" });

        return new Response(JSON.stringify({ success: true, gateway: "payflex", payment_method: "redirect", redirect_url: data.redirectUrl, transaction_ref: data.token || booking_id, amount, currency: "ZAR" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "payflex", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(merchantId && apiKeyVal) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "payflex", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[PayflexGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "payflex", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
