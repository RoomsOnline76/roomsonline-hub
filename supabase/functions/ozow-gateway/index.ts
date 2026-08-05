// ============================================================================
// OZOW GATEWAY v1.0 — Ozow Payment API (redirect-based, EFT)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { data: credData } = await supabase
      .from("integration_configs").select("config")
      .eq("property_id", property_id).eq("integration_type", "payment_credentials").maybeSingle();
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
        const transRef = booking_id || `ROL-${Date.now()}`;
        const hashInput = `${siteCode}ZA${currency.toUpperCase()}${amount.toFixed(2)}${transRef}${return_url}${cancel_url || return_url}${cancel_url || return_url}false${privateKey}`;
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
          Optional1: booking_id || "",
          Optional2: property_id || "",
          IsTest: "false",
          SuccessUrl: return_url,
          CancelUrl: cancel_url || return_url,
          ErrorUrl: cancel_url || return_url,
          HashCheck: hashCheck,
        };

        // Ozow expects a POST redirect, so we return the URL and form params
        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: currency.toUpperCase(), payment_provider: "ozow", payment_reference: transRef, status: "pending" });

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
          await supabase.from("payment_transactions").update({ status: "completed" }).eq("payment_reference", ref);
          if (booking_id) await supabase.from("bookings").update({ payment_status: "paid", payment_reference: ref, paid_at: new Date().toISOString() }).eq("id", booking_id);
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
