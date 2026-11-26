// ============================================================================
// OZOW GATEWAY v1.0 — Ozow Payment API (redirect-based, EFT)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadCheckoutBooking, findStoredTransaction, settleStoredTransaction, recordPendingTransaction, safeGatewayReturn, CheckoutError } from "../_shared/gatewayGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OZOW_API = "https://api.ozow.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, booking_id, amount, currency = "ZAR", return_url, cancel_url, property_id, transaction_ref } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let storedTxn: Awaited<ReturnType<typeof findStoredTransaction>> = null;
    let checkout: Awaited<ReturnType<typeof loadCheckoutBooking>> | null = null;
    try {
      if (action === "verify_payment") {
        storedTxn = await findStoredTransaction(supabase, "ozow", transaction_ref);
        if (!storedTxn) throw new CheckoutError("Unknown transaction", 404);
      } else if (action === "initiate_payment") {
        checkout = await loadCheckoutBooking(supabase, booking_id, property_id, amount);
      }
    } catch (e) {
      if (e instanceof CheckoutError) {
        return new Response(JSON.stringify({ success: false, gateway: "ozow", error: e.message }),
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
    const siteCode = creds.site_code;
    const privateKey = creds.private_key;
    const apiKey = creds.api_key;

    if ((!siteCode || !privateKey) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "ozow", error: "Ozow site_code/private_key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        // Generate SHA512 hash for Ozow
        const transRef = checkout!.id;
        const hashInput = `${siteCode}ZA${currency.toUpperCase()}${amount.toFixed(2)}${transRef}${safeReturnUrl}${safeCancelUrl}${safeCancelUrl}false${privateKey}`;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-512", encoder.encode(hashInput.toLowerCase()));
        const hashCheck = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

        const formData = {
          SiteCode: siteCode,
          CountryCode: "ZA",
          CurrencyCode: currency.toUpperCase(),
          Amount: amount.toFixed(2),
          TransactionReference: transRef,
          BankReference: transRef.substring(0, 20),
          Optional1: checkout!.id,
          Optional2: checkout!.property_id,
          IsTest: "false",
          SuccessUrl: safeReturnUrl,
          CancelUrl: safeCancelUrl,
          ErrorUrl: safeCancelUrl,
          HashCheck: hashCheck,
        };

        // Ozow expects a POST redirect, so we return the URL and form params
        await recordPendingTransaction(supabase, { bookingId: checkout!.id, amount, currency: currency.toUpperCase(), provider: "ozow", transactionRef: transRef });

        return new Response(JSON.stringify({
          success: true, gateway: "ozow", payment_method: "redirect",
          redirect_url: "https://pay.ozow.com",
          transaction_ref: transRef, amount, currency: currency.toUpperCase(),
          raw_response: { form_data: formData },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "verify_payment": {
        const ref = transaction_ref;
        if (!apiKey) {
          return new Response(JSON.stringify({ success: false, gateway: "ozow", error: "Ozow api_key needed for verification" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const res = await fetch(`${OZOW_API}/GetTransactionByReference?SiteCode=${siteCode}&TransactionReference=${ref}`, {
          headers: { Accept: "application/json", ApiKey: apiKey },
        });
        const data = await res.json();
        const isComplete = data?.[0]?.status === "Complete";

        if (isComplete) {
          await settleStoredTransaction(supabase, storedTxn!, Number(data?.[0]?.amount) || 0, ref);
        }

        return new Response(JSON.stringify({ success: true, gateway: "ozow", payment_method: "redirect", transaction_ref: ref, amount: data?.[0]?.amount || 0, currency: "ZAR", status: isComplete ? "completed" : "pending" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "ozow", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(siteCode && privateKey) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "ozow", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[OzowGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "ozow", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
