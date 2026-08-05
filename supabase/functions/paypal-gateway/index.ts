// ============================================================================
// PAYPAL GATEWAY v1.0 — PayPal Orders API v2 (redirect-based)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAYPAL_API_LIVE = "https://api-m.paypal.com";
const PAYPAL_API_SANDBOX = "https://api-m.sandbox.paypal.com";

async function getAccessToken(clientId: string, clientSecret: string, sandbox = false): Promise<string> {
  const baseUrl = sandbox ? PAYPAL_API_SANDBOX : PAYPAL_API_LIVE;
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency, guest_email, guest_name, return_url, cancel_url, property_id, transaction_ref } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch per-property PayPal credentials
    const { data: credData } = await supabase
      .from("integration_configs")
      .select("config")
      .eq("property_id", property_id)
      .eq("integration_type", "payment_credentials")
      .maybeSingle();

    const creds = (credData?.config as Record<string, string>) || {};
    const clientId = creds.client_id;
    const clientSecret = creds.client_secret;
    const isSandbox = creds.environment === "sandbox";

    if ((!clientId || !clientSecret) && action !== "health_check") {
      return new Response(JSON.stringify({
        success: false, gateway: "paypal",
        error: "PayPal client_id/client_secret not configured for this property",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = isSandbox ? PAYPAL_API_SANDBOX : PAYPAL_API_LIVE;

    switch (action) {
      // ── Initiate Payment ──────────────────────────────────────────────
      case "initiate_payment": {
        if (!amount || !currency || !return_url) {
          return new Response(JSON.stringify({
            success: false, gateway: "paypal", error: "Missing required fields",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const accessToken = await getAccessToken(clientId!, clientSecret!, isSandbox);
        const itemName = body.item_name || `Booking ${booking_id?.substring(0, 8) || "payment"}`;

        const orderPayload = {
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: booking_id || crypto.randomUUID(),
            description: itemName,
            amount: {
              currency_code: currency.toUpperCase(),
              value: amount.toFixed(2),
            },
          }],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: return_url,
                cancel_url: cancel_url || return_url,
                brand_name: "RoomsOnline",
                user_action: "PAY_NOW",
                landing_page: "LOGIN",
              },
            },
          },
        };

        const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderPayload),
        });

        const order = await res.json();

        if (!res.ok || !order.id) {
          console.error("[PayPalGateway] Order creation failed:", order);
          return new Response(JSON.stringify({
            success: false, gateway: "paypal",
            error: order.message || "PayPal order creation failed",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const approveLink = order.links?.find((l: any) => l.rel === "payer-action")?.href
          || order.links?.find((l: any) => l.rel === "approve")?.href;

        // Log transaction
        await supabase.from("payment_transactions").insert({
          booking_id,
          property_id,
          amount,
          currency: currency.toUpperCase(),
          payment_provider: "paypal",
          payment_reference: order.id,
          status: "pending",
          metadata: { paypal_order_id: order.id },
        }).then(({ error }) => {
          if (error) console.error("[PayPalGateway] Transaction log error:", error);
        });

        return new Response(JSON.stringify({
          success: true,
          gateway: "paypal",
          payment_method: "redirect",
          redirect_url: approveLink || "",
          transaction_ref: order.id,
          amount,
          currency: currency.toUpperCase(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Verify / Capture Payment ──────────────────────────────────────
      case "verify_payment": {
        const orderId = transaction_ref || body.order_id;
        if (!orderId) {
          return new Response(JSON.stringify({
            success: false, gateway: "paypal", error: "Missing order_id / transaction_ref",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const accessToken = await getAccessToken(clientId!, clientSecret!, isSandbox);

        // Capture the order
        const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        const capture = await captureRes.json();
        const isCompleted = capture.status === "COMPLETED";

        if (isCompleted) {
          await supabase.from("payment_transactions")
            .update({ status: "completed", metadata: { paypal_capture: capture } })
            .eq("payment_reference", orderId);

          const refId = capture.purchase_units?.[0]?.reference_id;
          if (refId) {
            await supabase.from("bookings")
              .update({ payment_status: "paid", payment_reference: orderId, paid_at: new Date().toISOString() })
              .eq("id", refId);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          gateway: "paypal",
          payment_method: "redirect",
          transaction_ref: orderId,
          amount: parseFloat(capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || "0"),
          currency: capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code || "",
          status: isCompleted ? "completed" : capture.status?.toLowerCase(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Health Check ──────────────────────────────────────────────────
      case "health_check": {
        return new Response(JSON.stringify({
          success: true,
          gateway: "paypal",
          payment_method: "redirect",
          transaction_ref: "health_check",
          amount: 0,
          currency: "",
          status: "healthy",
          has_credentials: !!(clientId && clientSecret),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({
          success: false, gateway: "paypal", error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[PayPalGateway] Unhandled error:", err);
    return new Response(JSON.stringify({
      success: false, gateway: "paypal",
      error: err instanceof Error ? err.message : "Internal server error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
