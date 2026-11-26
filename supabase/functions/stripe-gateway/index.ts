// ============================================================================
// STRIPE GATEWAY v1.0 — Stripe Checkout Sessions (redirect-based, no SDK)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadCheckoutBooking, findStoredTransaction, settleStoredTransaction, recordPendingTransaction, safeGatewayReturn, CheckoutError } from "../_shared/gatewayGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeRequest(
  endpoint: string,
  secretKey: string,
  params: Record<string, string>,
  method = "POST",
): Promise<any> {
  const res = await fetch(`${STRIPE_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(secretKey + ":")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method !== "GET" ? new URLSearchParams(params).toString() : undefined,
  });
  return res.json();
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

    let storedTxn: Awaited<ReturnType<typeof findStoredTransaction>> = null;
    let checkout: Awaited<ReturnType<typeof loadCheckoutBooking>> | null = null;
    try {
      if (action === "verify_payment") {
        storedTxn = await findStoredTransaction(supabase, "stripe", transaction_ref || body.session_id);
        if (!storedTxn) throw new CheckoutError("Unknown transaction", 404);
      } else if (action === "initiate_payment") {
        checkout = await loadCheckoutBooking(supabase, booking_id, property_id, amount);
      }
    } catch (e) {
      if (e instanceof CheckoutError) {
        return new Response(JSON.stringify({ success: false, gateway: "stripe", error: e.message }),
          { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }
    const credPropertyId = storedTxn?.property_id ?? checkout?.property_id ?? property_id;
    const safeReturnUrl = await safeGatewayReturn(return_url);
    const safeCancelUrl = await safeGatewayReturn(cancel_url || return_url);

    // Fetch per-property Stripe credentials
    const { data: credData } = await supabase
      .from("integration_configs")
      .select("config")
      .eq("property_id", credPropertyId)
      .eq("integration_type", "payment_credentials")
      .maybeSingle();

    const creds = (credData?.config as Record<string, string>) || {};
    const secretKey = creds.secret_key;

    if (!secretKey && action !== "health_check") {
      return new Response(JSON.stringify({
        success: false,
        gateway: "stripe",
        error: "Stripe secret_key not configured for this property",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      // ── Initiate Payment ──────────────────────────────────────────────
      case "initiate_payment": {
        if (!amount || !currency || !return_url) {
          return new Response(JSON.stringify({
            success: false, gateway: "stripe",
            error: "Missing required fields: amount, currency, return_url",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Stripe amounts are in cents
        const amountInCents = Math.round(amount * 100);
        const itemName = body.item_name || `Booking ${booking_id?.substring(0, 8) || "payment"}`;

        const params: Record<string, string> = {
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": currency.toLowerCase(),
          "line_items[0][price_data][unit_amount]": String(amountInCents),
          "line_items[0][price_data][product_data][name]": itemName,
          "mode": "payment",
          "success_url": `${safeReturnUrl}${safeReturnUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
          "cancel_url": safeCancelUrl,
        };

        if (guest_email) {
          params["customer_email"] = guest_email;
        }

        params["metadata[booking_id]"] = checkout!.id;
        params["metadata[property_id]"] = checkout!.property_id;

        const session = await stripeRequest("/checkout/sessions", secretKey!, params);

        if (session.error) {
          console.error("[StripeGateway] Checkout session error:", session.error);
          return new Response(JSON.stringify({
            success: false, gateway: "stripe",
            error: session.error.message || "Stripe checkout session creation failed",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Log transaction
        await recordPendingTransaction(supabase, { bookingId: checkout!.id, amount, currency: currency.toUpperCase(), provider: "stripe", transactionRef: session.id });

        return new Response(JSON.stringify({
          success: true,
          gateway: "stripe",
          payment_method: "redirect",
          redirect_url: session.url,
          transaction_ref: session.id,
          amount,
          currency: currency.toUpperCase(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Verify Payment ────────────────────────────────────────────────
      case "verify_payment": {
        const sessionId = transaction_ref || body.session_id;
        if (!sessionId) {
          return new Response(JSON.stringify({
            success: false, gateway: "stripe", error: "Missing session_id / transaction_ref",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const session = await stripeRequest(`/checkout/sessions/${sessionId}`, secretKey!, {}, "GET");

        const isPaid = session.payment_status === "paid";

        // Update transaction record
        if (isPaid && session.metadata?.booking_id === storedTxn!.booking_id) {
          await settleStoredTransaction(supabase, storedTxn!, (session.amount_total || 0) / 100, session.payment_intent || sessionId);
        }

        return new Response(JSON.stringify({
          success: true,
          gateway: "stripe",
          payment_method: "redirect",
          transaction_ref: sessionId,
          amount: (session.amount_total || 0) / 100,
          currency: (session.currency || "").toUpperCase(),
          status: isPaid ? "completed" : session.status,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Refund ────────────────────────────────────────────────────────
      case "refund": {
        const paymentIntent = transaction_ref || body.payment_intent;
        if (!paymentIntent) {
          return new Response(JSON.stringify({
            success: false, gateway: "stripe", error: "Missing payment_intent / transaction_ref",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const refundParams: Record<string, string> = { payment_intent: paymentIntent };
        if (amount) refundParams.amount = String(Math.round(amount * 100));

        const refund = await stripeRequest("/refunds", secretKey!, refundParams);

        if (refund.error) {
          return new Response(JSON.stringify({
            success: false, gateway: "stripe", error: refund.error.message,
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({
          success: true,
          gateway: "stripe",
          payment_method: "redirect",
          transaction_ref: refund.id,
          amount: (refund.amount || 0) / 100,
          currency: (refund.currency || "").toUpperCase(),
          status: "refunded",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Health Check ──────────────────────────────────────────────────
      case "health_check": {
        return new Response(JSON.stringify({
          success: true,
          gateway: "stripe",
          payment_method: "redirect",
          transaction_ref: "health_check",
          amount: 0,
          currency: "",
          status: "healthy",
          has_credentials: !!secretKey,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({
          success: false, gateway: "stripe", error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[StripeGateway] Unhandled error:", err);
    return new Response(JSON.stringify({
      success: false,
      gateway: "stripe",
      error: err instanceof Error ? err.message : "Internal server error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
