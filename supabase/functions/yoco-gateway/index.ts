// ============================================================================
// YOCO GATEWAY v1.0 — Yoco Online Payments API (redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YOCO_API = "https://payments.yoco.com/api";

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
    const secretKey = creds.secret_key;

    if (!secretKey && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "yoco", error: "Yoco secret_key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        const amountInCents = Math.round(amount * 100);
        const res = await fetch(`${YOCO_API}/checkouts`, {
          method: "POST",
          headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amountInCents,
            currency: currency.toUpperCase(),
            successUrl: return_url,
            cancelUrl: cancel_url || return_url,
            failureUrl: cancel_url || return_url,
            metadata: { booking_id, property_id },
          }),
        });
        const data = await res.json();
        if (!data.redirectUrl) {
          return new Response(JSON.stringify({ success: false, gateway: "yoco", error: data.message || "Checkout creation failed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: currency.toUpperCase(), payment_provider: "yoco", payment_reference: data.id, status: "pending", metadata: { yoco_checkout_id: data.id } });
        return new Response(JSON.stringify({ success: true, gateway: "yoco", payment_method: "redirect", redirect_url: data.redirectUrl, transaction_ref: data.id, amount, currency: currency.toUpperCase() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "verify_payment": {
        const checkoutId = transaction_ref || body.checkout_id;
        const res = await fetch(`${YOCO_API}/checkouts/${checkoutId}`, { headers: { Authorization: `Bearer ${secretKey}` } });
        const data = await res.json();
        const isPaid = data.status === "completed";
        if (isPaid) {
          await supabase.from("payment_transactions").update({ status: "completed" }).eq("payment_reference", checkoutId);
          if (data.metadata?.booking_id) await supabase.from("bookings").update({ payment_status: "paid", payment_reference: checkoutId, paid_at: new Date().toISOString() }).eq("id", data.metadata.booking_id);
        }
        return new Response(JSON.stringify({ success: true, gateway: "yoco", payment_method: "redirect", transaction_ref: checkoutId, amount: (data.amount || 0) / 100, currency: data.currency || "", status: isPaid ? "completed" : data.status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "yoco", payment_method: "inline", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!secretKey }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "yoco", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[YocoGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "yoco", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
