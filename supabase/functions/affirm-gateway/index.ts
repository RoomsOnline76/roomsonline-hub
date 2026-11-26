// ============================================================================
// AFFIRM GATEWAY v1.0 — Affirm Checkout API (BNPL, redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadCheckoutBooking, findStoredTransaction, settleStoredTransaction, recordPendingTransaction, safeGatewayReturn, CheckoutError } from "../_shared/gatewayGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AFFIRM_API_PROD = "https://api.affirm.com/api/v1";
const AFFIRM_API_SANDBOX = "https://sandbox.affirm.com/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency = "USD", guest_email, guest_name, return_url, cancel_url, property_id, transaction_ref } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let storedTxn: Awaited<ReturnType<typeof findStoredTransaction>> = null;
    let checkout: Awaited<ReturnType<typeof loadCheckoutBooking>> | null = null;
    try {
      if (action === "verify_payment") {
        storedTxn = await findStoredTransaction(supabase, "affirm", booking_id);
        if (!storedTxn) throw new CheckoutError("Unknown transaction", 404);
      } else if (action === "initiate_payment") {
        checkout = await loadCheckoutBooking(supabase, booking_id, property_id, amount);
      }
    } catch (e) {
      if (e instanceof CheckoutError) {
        return new Response(JSON.stringify({ success: false, gateway: "affirm", error: e.message }),
          { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }
    const credPropertyId = storedTxn?.property_id ?? checkout?.property_id ?? property_id;
    const safeReturnUrl = await safeGatewayReturn(return_url);
    const safeCancelUrl = await safeGatewayReturn(cancel_url || return_url);

    const { data: credData } = await supabase
      .from("integration_configs").select("config")
      .eq("property_id", credPropertyId).eq("integration_type", "payment_credentials").maybeSingle();
    const creds = (credData?.config as Record<string, string>) || {};
    const publicKey = creds.public_api_key;
    const privateKey = creds.private_api_key;
    const isSandbox = creds.environment === "sandbox";

    if ((!publicKey || !privateKey) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "affirm", error: "Affirm public/private API keys not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = isSandbox ? AFFIRM_API_SANDBOX : AFFIRM_API_PROD;
    const authHeader = `Basic ${btoa(`${publicKey}:${privateKey}`)}`;

    switch (action) {
      case "initiate_payment": {
        const amountInCents = Math.round(amount * 100);
        const checkoutPayload = {
          merchant: {
            user_confirmation_url: safeReturnUrl,
            user_cancel_url: safeCancelUrl,
            name: "RoomsOnline",
          },
          order_id: checkout!.id,
          total: amountInCents,
          currency: currency.toUpperCase(),
          items: [{
            display_name: body.item_name || "Accommodation Booking",
            sku: booking_id || "booking",
            unit_price: amountInCents,
            qty: 1,
          }],
        };

        // Affirm checkout is primarily client-side; we return the config for the JS SDK
        // For server-side, we'd create a charge after user confirms
        await recordPendingTransaction(supabase, { bookingId: checkout!.id, amount, currency: currency.toUpperCase(), provider: "affirm", transactionRef: checkout!.id });

        return new Response(JSON.stringify({
          success: true, gateway: "affirm", payment_method: "redirect",
          redirect_url: `https://${isSandbox ? "sandbox" : "www"}.affirm.com/checkout`,
          client_token: publicKey,
          transaction_ref: checkout!.id,
          amount, currency: currency.toUpperCase(),
          raw_response: { checkout_config: checkoutPayload, public_key: publicKey },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "verify_payment": {
        // Affirm: authorize the checkout_token after user confirms
        const checkoutToken = transaction_ref || body.checkout_token;
        const res = await fetch(`${baseUrl}/charges`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ checkout_token: checkoutToken }),
        });
        const data = await res.json();
        const isAuthorized = data.status === "authorized" && data.order_id === storedTxn!.booking_id;

        if (isAuthorized && data.id) {
          // Capture the charge
          const captureRes = await fetch(`${baseUrl}/charges/${data.id}/capture`, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
          });
          const captureData = await captureRes.json();

          if (captureRes.ok && captureData) {
            await settleStoredTransaction(supabase, storedTxn!, (data.amount || 0) / 100, data.id);
          }
        }

        return new Response(JSON.stringify({ success: true, gateway: "affirm", payment_method: "redirect", transaction_ref: data?.id || checkoutToken, amount: (data?.amount || 0) / 100, currency: data?.currency || "", status: isAuthorized ? "completed" : "pending" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "affirm", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(publicKey && privateKey) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "affirm", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[AffirmGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "affirm", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
