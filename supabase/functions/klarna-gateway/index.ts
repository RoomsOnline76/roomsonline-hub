// ============================================================================
// KLARNA GATEWAY v1.0 — Klarna Payments API (BNPL, redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KLARNA_API_EU = "https://api.klarna.com";
const KLARNA_API_NA = "https://api-na.klarna.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency = "EUR", guest_email, guest_name, return_url, cancel_url, property_id, transaction_ref } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credData } = await supabase
      .from("integration_configs").select("config")
      .eq("property_id", property_id).eq("integration_type", "payment_credentials").maybeSingle();
    const creds = (credData?.config as Record<string, string>) || {};
    const username = creds.username;
    const password = creds.password;
    const region = creds.region || "eu"; // eu or na

    if ((!username || !password) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "klarna", error: "Klarna username/password not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = region === "na" ? KLARNA_API_NA : KLARNA_API_EU;
    const authHeader = `Basic ${btoa(`${username}:${password}`)}`;

    switch (action) {
      case "initiate_payment": {
        const amountInMinor = Math.round(amount * 100);
        const orderPayload = {
          purchase_country: body.country || "GB",
          purchase_currency: currency.toUpperCase(),
          order_amount: amountInMinor,
          order_tax_amount: 0,
          order_lines: [{
            type: "digital",
            name: body.item_name || "Accommodation Booking",
            quantity: 1,
            unit_price: amountInMinor,
            tax_rate: 0,
            total_amount: amountInMinor,
            total_tax_amount: 0,
          }],
          merchant_urls: {
            confirmation: return_url,
            cancellation: cancel_url || return_url,
          },
          merchant_reference1: booking_id || `ROL-${Date.now()}`,
        };

        const res = await fetch(`${baseUrl}/checkout/v3/orders`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify(orderPayload),
        });
        const data = await res.json();

        if (!data.order_id) {
          return new Response(JSON.stringify({ success: false, gateway: "klarna", error: data.error_messages?.[0] || "Klarna order creation failed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: currency.toUpperCase(), payment_provider: "klarna", payment_reference: data.order_id, status: "pending" });

        // Klarna returns an HTML snippet or redirect URL
        const redirectUrl = data.redirect_url || `${baseUrl}/checkout/v3/orders/${data.order_id}`;

        return new Response(JSON.stringify({ success: true, gateway: "klarna", payment_method: "redirect", redirect_url: redirectUrl, client_token: data.html_snippet ? data.order_id : undefined, transaction_ref: data.order_id, amount, currency: currency.toUpperCase() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "verify_payment": {
        const orderId = transaction_ref;
        const res = await fetch(`${baseUrl}/checkout/v3/orders/${orderId}`, {
          headers: { Authorization: authHeader },
        });
        const data = await res.json();
        const isComplete = data.status === "checkout_complete";

        if (isComplete) {
          await supabase.from("payment_transactions").update({ status: "completed" }).eq("payment_reference", orderId);
          if (data.merchant_reference1) await supabase.from("bookings").update({ payment_status: "paid", payment_reference: orderId, paid_at: new Date().toISOString() }).eq("id", data.merchant_reference1);
        }

        return new Response(JSON.stringify({ success: true, gateway: "klarna", payment_method: "redirect", transaction_ref: orderId, amount: (data.order_amount || 0) / 100, currency: data.purchase_currency || "", status: isComplete ? "completed" : data.status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "klarna", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(username && password) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "klarna", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[KlarnaGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "klarna", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
