// ============================================================================
// STITCH GATEWAY v1.0 — Stitch Pay-by-Bank API (redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STITCH_API = "https://api.stitch.money/graphql";

async function getStitchToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch("https://secure.stitch.money/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "client_paymentrequest" }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Stitch auth failed");
  return data.access_token;
}

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

    if ((!creds.client_id || !creds.client_secret) && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "stitch", error: "Stitch client_id/client_secret not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        const token = await getStitchToken(creds.client_id!, creds.client_secret!);
        const externalRef = booking_id || `ROL-${Date.now()}`;

        const mutation = `mutation CreatePaymentRequest($amount: MoneyInput!, $payerReference: String!, $externalReference: String) {
          clientPaymentInitiationRequestCreate(input: {
            amount: $amount, payerReference: $payerReference, beneficiaryReference: "RoomsOnline", externalReference: $externalReference
          }) {
            paymentInitiationRequest { id, url }
          }
        }`;

        const res = await fetch(STITCH_API, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: mutation,
            variables: {
              amount: { quantity: Math.round(amount * 100), currency: currency.toUpperCase() },
              payerReference: externalRef.substring(0, 12),
              externalReference: externalRef,
            },
          }),
        });
        const data = await res.json();
        const request = data?.data?.clientPaymentInitiationRequestCreate?.paymentInitiationRequest;

        if (!request?.url) {
          return new Response(JSON.stringify({ success: false, gateway: "stitch", error: "Payment request creation failed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: currency.toUpperCase(), payment_provider: "stitch", payment_reference: request.id, status: "pending" });

        return new Response(JSON.stringify({ success: true, gateway: "stitch", payment_method: "redirect", redirect_url: request.url, transaction_ref: request.id, amount, currency: currency.toUpperCase() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "stitch", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!(creds.client_id && creds.client_secret) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "stitch", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[StitchGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "stitch", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
