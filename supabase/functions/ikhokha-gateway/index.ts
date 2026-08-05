// ============================================================================
// IKHOKHA GATEWAY v1.0 — iKhokha iK Pay API (redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IKHOKHA_API = "https://api.ikhokha.com/public-api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency = "ZAR", guest_email, return_url, cancel_url, property_id, transaction_ref } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credData } = await supabase
      .from("integration_configs").select("config")
      .eq("property_id", property_id).eq("integration_type", "payment_credentials").maybeSingle();
    const creds = (credData?.config as Record<string, string>) || {};
    const appId = creds.application_id;
    const appKey = creds.application_key;

    if ((!appId || !appKey) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "ikhokha", error: "iKhokha application_id/application_key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        const amountInCents = Math.round(amount * 100);
        const externalId = booking_id || `ROL-${Date.now()}`;

        const res = await fetch(`${IKHOKHA_API}/pay`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "IK-APPLICATION-ID": appId!,
            "IK-APPLICATION-KEY": appKey!,
          },
          body: JSON.stringify({
            amount: amountInCents,
            currency: currency.toUpperCase(),
            externalId,
            description: body.item_name || "Booking Payment",
            urlSuccess: return_url,
            urlCancel: cancel_url || return_url,
            urlFailure: cancel_url || return_url,
          }),
        });
        const data = await res.json();

        if (!data.paylinkUrl) {
          return new Response(JSON.stringify({ success: false, gateway: "ikhokha", error: data.message || "iK Pay link creation failed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: currency.toUpperCase(), payment_provider: "ikhokha", payment_reference: data.paymentId || externalId, status: "pending" });

        return new Response(JSON.stringify({ success: true, gateway: "ikhokha", payment_method: "redirect", redirect_url: data.paylinkUrl, transaction_ref: data.paymentId || externalId, amount, currency: currency.toUpperCase() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "ikhokha", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(appId && appKey) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "ikhokha", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[iKhokhaGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "ikhokha", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
