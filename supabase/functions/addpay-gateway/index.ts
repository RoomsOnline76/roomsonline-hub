// ============================================================================
// ADDPAY GATEWAY v1.0 — AddPay CNP API (redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADDPAY_API = "https://cnp.addpay.cloud/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency = "ZAR", guest_email, guest_name, return_url, cancel_url, property_id, transaction_ref } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credData } = await supabase
      .from("integration_configs").select("config")
      .eq("property_id", property_id).eq("integration_type", "payment_credentials").maybeSingle();
    const creds = (credData?.config as Record<string, string>) || {};
    const apiKeyVal = creds.api_key;
    const apiSecret = creds.api_secret;

    if ((!apiKeyVal || !apiSecret) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "addpay", error: "AddPay api_key/api_secret not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        const ref = booking_id || `ROL-${Date.now()}`;
        const res = await fetch(`${ADDPAY_API}/transactions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKeyVal}:${apiSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reference: ref,
            description: body.item_name || "Booking Payment",
            amount: Math.round(amount * 100),
            currency: currency.toUpperCase(),
            return_url: return_url,
            cancel_url: cancel_url || return_url,
            customer: { email: guest_email || "", name: guest_name || "Guest" },
          }),
        });
        const data = await res.json();

        if (!data.data?.redirect_url) {
          return new Response(JSON.stringify({ success: false, gateway: "addpay", error: data.message || "AddPay transaction creation failed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: currency.toUpperCase(), payment_provider: "addpay", payment_reference: data.data.id || ref, status: "pending" });

        return new Response(JSON.stringify({ success: true, gateway: "addpay", payment_method: "redirect", redirect_url: data.data.redirect_url, transaction_ref: data.data.id || ref, amount, currency: currency.toUpperCase() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "addpay", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(apiKeyVal && apiSecret) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "addpay", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[AddPayGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "addpay", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
