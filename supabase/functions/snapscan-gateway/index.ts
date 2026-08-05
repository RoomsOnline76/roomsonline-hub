// ============================================================================
// SNAPSCAN GATEWAY v1.0 — SnapScan QR Code Payment API
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SNAPSCAN_API = "https://pos.snapscan.io/merchant/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency = "ZAR", return_url, property_id, transaction_ref } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credData } = await supabase
      .from("integration_configs").select("config")
      .eq("property_id", property_id).eq("integration_type", "payment_credentials").maybeSingle();
    const creds = (credData?.config as Record<string, string>) || {};
    const merchantId = creds.merchant_id;
    const apiKey = creds.api_key;

    if ((!merchantId || !apiKey) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "snapscan", error: "SnapScan merchant_id/api_key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        // SnapScan uses QR codes — generate a payment URL with the snap code
        const amountInCents = Math.round(amount * 100);
        const ref = booking_id?.substring(0, 20) || `ROL${Date.now()}`;
        const snapUrl = `https://pos.snapscan.io/qr/${merchantId}?id=${ref}&amount=${amountInCents}&strict=true`;

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: "ZAR", payment_provider: "snapscan", payment_reference: ref, status: "pending" });

        return new Response(JSON.stringify({ success: true, gateway: "snapscan", payment_method: "qr", redirect_url: snapUrl, transaction_ref: ref, amount, currency: "ZAR" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "verify_payment": {
        const ref = transaction_ref;
        const res = await fetch(`${SNAPSCAN_API}/payments?merchantReference=${ref}&status=completed`, {
          headers: { Authorization: `Basic ${btoa(apiKey + ":")}` },
        });
        const data = await res.json();
        const payment = data?.[0];
        const isComplete = payment?.status === "completed";

        if (isComplete) {
          await supabase.from("payment_transactions").update({ status: "completed" }).eq("payment_reference", ref);
          if (booking_id) await supabase.from("bookings").update({ payment_status: "paid", payment_reference: ref, paid_at: new Date().toISOString() }).eq("id", booking_id);
        }

        return new Response(JSON.stringify({ success: true, gateway: "snapscan", payment_method: "qr", transaction_ref: ref, amount: payment?.totalAmount ? payment.totalAmount / 100 : 0, currency: "ZAR", status: isComplete ? "completed" : "pending" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "snapscan", payment_method: "qr", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(merchantId && apiKey) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "snapscan", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[SnapScanGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "snapscan", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
