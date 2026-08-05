// ============================================================================
// ZAPPER GATEWAY v1.0 — Zapper QR Code Payment (redirect/QR-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency = "ZAR", return_url, property_id } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credData } = await supabase
      .from("integration_configs").select("config")
      .eq("property_id", property_id).eq("integration_type", "payment_credentials").maybeSingle();
    const creds = (credData?.config as Record<string, string>) || {};
    const merchantId = creds.merchant_id;
    const siteId = creds.site_id;

    if ((!merchantId || !siteId) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "zapper", error: "Zapper merchant_id/site_id not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        // Zapper uses a QR code deep-link pattern
        const amountInCents = Math.round(amount * 100);
        const ref = booking_id?.substring(0, 20) || `ROL${Date.now()}`;
        const zapperUrl = `https://pay.zapper.com/pay?mid=${merchantId}&sid=${siteId}&amount=${amountInCents}&ref=${ref}`;

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: "ZAR", payment_provider: "zapper", payment_reference: ref, status: "pending" });

        return new Response(JSON.stringify({ success: true, gateway: "zapper", payment_method: "qr", redirect_url: zapperUrl, transaction_ref: ref, amount, currency: "ZAR" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "zapper", payment_method: "qr", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(merchantId && siteId) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "zapper", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[ZapperGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "zapper", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
