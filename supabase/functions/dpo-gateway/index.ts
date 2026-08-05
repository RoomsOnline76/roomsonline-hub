// ============================================================================
// DPO PAY GATEWAY v1.0 — DPO Group API (redirect-based)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DPO_API = "https://secure.3gdirectpay.com/API/v6/";
const DPO_PAY_URL = "https://secure.3gdirectpay.com/payv2.php";

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
    const companyToken = creds.company_token;
    const serviceType = creds.service_type || "5525";

    if (!companyToken && action !== "health_check") {
      return new Response(JSON.stringify({ success: false, gateway: "dpo", error: "DPO company_token not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      case "initiate_payment": {
        const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${companyToken}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${amount.toFixed(2)}</PaymentAmount>
    <PaymentCurrency>${currency.toUpperCase()}</PaymentCurrency>
    <CompanyRef>${booking_id || "ROL-" + Date.now()}</CompanyRef>
    <RedirectURL>${return_url}</RedirectURL>
    <BackURL>${cancel_url || return_url}</BackURL>
    <CompanyRefUnique>1</CompanyRefUnique>
    <PTL>30</PTL>
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${serviceType}</ServiceType>
      <ServiceDescription>Booking Payment</ServiceDescription>
      <ServiceDate>${new Date().toISOString().split("T")[0]}</ServiceDate>
    </Service>
  </Services>
</API3G>`;

        const res = await fetch(DPO_API, {
          method: "POST",
          headers: { "Content-Type": "application/xml" },
          body: xmlPayload,
        });
        const text = await res.text();

        const tokenMatch = text.match(/<TransToken>([^<]+)<\/TransToken>/);
        const resultMatch = text.match(/<Result>([^<]+)<\/Result>/);

        if (!tokenMatch || resultMatch?.[1] !== "000") {
          const errMsg = text.match(/<ResultExplanation>([^<]+)<\/ResultExplanation>/)?.[1] || "DPO token creation failed";
          return new Response(JSON.stringify({ success: false, gateway: "dpo", error: errMsg }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const transToken = tokenMatch[1];
        const redirectUrl = `${DPO_PAY_URL}?ID=${transToken}`;

        await supabase.from("payment_transactions").insert({ booking_id, property_id, amount, currency: currency.toUpperCase(), payment_provider: "dpo", payment_reference: transToken, status: "pending" });

        return new Response(JSON.stringify({ success: true, gateway: "dpo", payment_method: "redirect", redirect_url: redirectUrl, transaction_ref: transToken, amount, currency: currency.toUpperCase() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "verify_payment": {
        const token = transaction_ref;
        const xmlVerify = `<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>${companyToken}</CompanyToken><Request>verifyToken</Request><TransactionToken>${token}</TransactionToken></API3G>`;
        const res = await fetch(DPO_API, { method: "POST", headers: { "Content-Type": "application/xml" }, body: xmlVerify });
        const text = await res.text();
        const result = text.match(/<Result>([^<]+)<\/Result>/)?.[1];
        const isSuccess = result === "000";

        if (isSuccess) {
          await supabase.from("payment_transactions").update({ status: "completed" }).eq("payment_reference", token);
          if (booking_id) await supabase.from("bookings").update({ payment_status: "paid", payment_reference: token, paid_at: new Date().toISOString() }).eq("id", booking_id);
        }

        return new Response(JSON.stringify({ success: true, gateway: "dpo", payment_method: "redirect", transaction_ref: token, amount, currency: currency?.toUpperCase() || "", status: isSuccess ? "completed" : "pending" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case "health_check":
        return new Response(JSON.stringify({ success: true, gateway: "dpo", payment_method: "redirect", transaction_ref: "health_check", amount: 0, currency: "", status: "healthy", has_credentials: !!companyToken }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      default:
        return new Response(JSON.stringify({ success: false, gateway: "dpo", error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[DPOGateway] Error:", err);
    return new Response(JSON.stringify({ success: false, gateway: "dpo", error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
