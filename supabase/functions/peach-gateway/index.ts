// ============================================================================
// PEACH PAYMENTS GATEWAY v1.0 — Peach Payments Checkout API (redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PEACH_API = "https://eu-test.oppwa.com/v1"; // Production: https://eu-prod.oppwa.com/v1

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
    const accessToken = creds.access_token;
    const entityId = creds.entity_id;

    if ((!accessToken || !entityId) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "peach", error: "Peach access_token/entity_id not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        const params = new URLSearchParams({
          "entityId": entityId!,
          "amount": amount.toFixed(2),
          "currency": currency.toUpperCase(),
          "paymentType": "DB",
          "shopperResultUrl": return_url,
        });
        if (guest_email) params.set("customer.email", guest_email);
        if (booking_id) params.set("merchantTransactionId", booking_id);

        const res = await fetch(`${PEACH_API}/checkouts`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        const data = await res.json();

        if (!data.id) {
          return new Response(JSON.stringify({ success: false, gateway: "peach", error: data.result?.description || "Checkout creation failed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: currency.toUpperCase(), payment_provider: "peach", payment_reference: data.id, status: "pending" });

        // Peach uses a widget-based checkout; the redirect URL includes the checkout ID
        const checkoutUrl = `${PEACH_API}/paymentWidgets.js?checkoutId=${data.id}`;

        return new Response(JSON.stringify({ success: true, gateway: "peach", payment_method: "redirect", redirect_url: checkoutUrl, client_token: data.id, transaction_ref: data.id, amount, currency: currency.toUpperCase() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "verify_payment": {
        const checkoutId = transaction_ref;
        const res = await fetch(`${PEACH_API}/checkouts/${checkoutId}/payment?entityId=${entityId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        const isSuccess = data.result?.code && /^(000\.000\.|000\.100\.|000\.600\.)/.test(data.result.code);

        if (isSuccess) {
          await supabase.from("payment_transactions").update({ status: "completed" }).eq("payment_reference", checkoutId);
          if (data.merchantTransactionId) await supabase.from("bookings").update({ payment_status: "paid", payment_reference: checkoutId, paid_at: new Date().toISOString() }).eq("id", data.merchantTransactionId);
        }

        return new Response(JSON.stringify({ success: true, gateway: "peach", payment_method: "redirect", transaction_ref: checkoutId, amount: parseFloat(data.amount || "0"), currency: data.currency || "", status: isSuccess ? "completed" : "pending" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "peach", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(accessToken && entityId) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "peach", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[PeachGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "peach", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
