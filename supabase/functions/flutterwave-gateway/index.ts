// ============================================================================
// FLUTTERWAVE GATEWAY v1.0 — Flutterwave Standard API (redirect-based)
// Pan-African payments: NGN, KES, GHS, UGX, TZS, ZAR, USD, EUR, GBP
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FLW_API = "https://api.flutterwave.com/v3";

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

    // Fetch per-property Flutterwave credentials
    const { data: credData } = await supabase
      .from("integration_configs")
      .select("config")
      .eq("property_id", property_id)
      .eq("integration_type", "payment_credentials")
      .maybeSingle();

    const creds = (credData?.config as Record<string, string>) || {};
    const secretKey = creds.secret_key;

    if (!secretKey && action !== "health_check") {
      return new Response(JSON.stringify({
        success: false, gateway: "flutterwave",
        error: "Flutterwave secret_key not configured for this property",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      // ── Initiate Payment ──────────────────────────────────────────────
      case "initiate_payment": {
        if (!amount || !currency || !return_url) {
          return new Response(JSON.stringify({
            success: false, gateway: "flutterwave", error: "Missing required fields",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const txRef = `ROL-${booking_id?.substring(0, 8) || "pay"}-${Date.now()}`;

        const payload = {
          tx_ref: txRef,
          amount,
          currency: currency.toUpperCase(),
          redirect_url: return_url,
          customer: {
            email: guest_email || "guest@roomsonline.co.za",
            name: guest_name || "Guest",
          },
          customizations: {
            title: "RoomsOnline Booking",
            description: body.item_name || `Booking Payment`,
            logo: "https://roomsonline.co.za/logo.png",
          },
          meta: {
            booking_id: booking_id || "",
            property_id: property_id || "",
          },
        };

        const res = await fetch(`${FLW_API}/payments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (data.status !== "success" || !data.data?.link) {
          console.error("[FlutterwaveGateway] Payment init failed:", data);
          return new Response(JSON.stringify({
            success: false, gateway: "flutterwave",
            error: data.message || "Flutterwave payment initiation failed",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Log transaction
        await supabase.from("payment_transactions").insert({
          booking_id,
          property_id,
          amount,
          currency: currency.toUpperCase(),
          payment_provider: "flutterwave",
          payment_reference: txRef,
          status: "pending",
          metadata: { flw_tx_ref: txRef },
        }).then(({ error }) => {
          if (error) console.error("[FlutterwaveGateway] Transaction log error:", error);
        });

        return new Response(JSON.stringify({
          success: true,
          gateway: "flutterwave",
          payment_method: "redirect",
          redirect_url: data.data.link,
          transaction_ref: txRef,
          amount,
          currency: currency.toUpperCase(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Verify Payment ────────────────────────────────────────────────
      case "verify_payment": {
        const txId = transaction_ref || body.transaction_id;
        if (!txId) {
          return new Response(JSON.stringify({
            success: false, gateway: "flutterwave", error: "Missing transaction_id / transaction_ref",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const res = await fetch(`${FLW_API}/transactions/${txId}/verify`, {
          headers: { Authorization: `Bearer ${secretKey}` },
        });

        const data = await res.json();
        const isSuccess = data.data?.status === "successful";

        if (isSuccess) {
          await supabase.from("payment_transactions")
            .update({ status: "completed", metadata: { flw_verify: data.data } })
            .eq("payment_reference", data.data.tx_ref);

          if (data.data.meta?.booking_id) {
            await supabase.from("bookings")
              .update({ payment_status: "paid", payment_reference: String(txId), paid_at: new Date().toISOString() })
              .eq("id", data.data.meta.booking_id);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          gateway: "flutterwave",
          payment_method: "redirect",
          transaction_ref: data.data?.tx_ref || txId,
          amount: data.data?.amount || 0,
          currency: data.data?.currency || "",
          status: isSuccess ? "completed" : data.data?.status || "unknown",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Health Check ──────────────────────────────────────────────────
      case "health_check": {
        return new Response(JSON.stringify({
          success: true,
          gateway: "flutterwave",
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
          success: false, gateway: "flutterwave", error: `Unknown action: ${action}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[FlutterwaveGateway] Unhandled error:", err);
    return new Response(JSON.stringify({
      success: false, gateway: "flutterwave",
      error: err instanceof Error ? err.message : "Internal server error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
