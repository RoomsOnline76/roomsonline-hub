import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Request schemas
const CreateCheckoutSchema = z.object({
  booking_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default("ZAR"),
  return_url: z.string().url(),
  notify_url: z.string().url().optional(),
});

const VerifyPaymentSchema = z.object({
  psn: z.string(),
});

const WebhookSchema = z.object({
  psn: z.string(),
  status: z.string(),
  amount: z.string().optional(),
  sign: z.string(),
});

// Helper: Import RSA private key for signing
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Helper: Import RSA public key for verification
async function importPublicKey(pemKey: string): Promise<CryptoKey> {
  const pemContents = pemKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    "spki",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

// Helper: Create signature string from object (alphabetically sorted keys)
function createSignatureString(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const parts: string[] = [];
  
  for (const key of sortedKeys) {
    if (key === "sign") continue; // Exclude sign field
    const value = obj[key];
    if (value === null || value === undefined || value === "") continue;
    
    const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    parts.push(`${key}=${stringValue}`);
  }
  
  return parts.join("&");
}

// Helper: Sign a request
async function signRequest(data: Record<string, unknown>, privateKey: CryptoKey): Promise<string> {
  const signatureString = createSignatureString(data);
  console.log("Signing string:", signatureString);
  
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(signatureString)
  );
  
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Helper: Verify a signature
async function verifySignature(
  data: Record<string, unknown>,
  signature: string,
  publicKey: CryptoKey
): Promise<boolean> {
  const signatureString = createSignatureString(data);
  console.log("Verifying string:", signatureString);
  
  const encoder = new TextEncoder();
  const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  
  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signatureBytes,
    encoder.encode(signatureString)
  );
}

// Generate unique transaction reference
function generateTransRef(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ROL-${timestamp}-${random}`.toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // AddPay credentials
    const privateKeyPem = Deno.env.get("ADDPAY_PRIVATE_KEY");
    const publicKeyPem = Deno.env.get("ADDPAY_PUBLIC_KEY");
    const merchantId = Deno.env.get("ADDPAY_MERCHANT_ID");
    const storeNo = Deno.env.get("ADDPAY_STORE_NO");
    const terminalSn = Deno.env.get("ADDPAY_TERMINAL_SN");
    const appId = Deno.env.get("ADDPAY_APP_ID");

    if (!privateKeyPem || !publicKeyPem || !merchantId || !storeNo || !terminalSn || !appId) {
      console.error("Missing AddPay credentials");
      return new Response(
        JSON.stringify({ error: "AddPay not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const action = url.pathname.split("/").pop();

    console.log(`AddPay API action: ${action}`);

    // CREATE CHECKOUT SESSION
    if (action === "create_checkout" && req.method === "POST") {
      const body = await req.json();
      const validation = CreateCheckoutSchema.safeParse(body);
      
      if (!validation.success) {
        return new Response(
          JSON.stringify({ error: "Invalid request", details: validation.error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { booking_id, amount, currency, return_url, notify_url } = validation.data;

      // Get booking details
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("*, properties(name)")
        .eq("id", booking_id)
        .single();

      if (bookingError || !booking) {
        console.error("Booking not found:", bookingError);
        return new Response(
          JSON.stringify({ error: "Booking not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const transRef = generateTransRef();
      const privateKey = await importPrivateKey(privateKeyPem);

      // Build AddPay request per their API spec
      const requestData: Record<string, unknown> = {
        app_id: appId,
        method: "inkasso.hosted.create",
        format: "JSON",
        charset: "UTF-8",
        sign_type: "RSA2",
        timestamp: new Date().toISOString(),
        version: "1.0",
        biz_content: JSON.stringify({
          merchant_id: merchantId,
          store_no: storeNo,
          terminal_sn: terminalSn,
          out_trade_no: transRef,
          subject: `Booking at ${booking.properties?.name || "RoomsOnline"}`,
          total_amount: amount.toFixed(2),
          currency: currency,
          return_url: return_url,
          notify_url: notify_url || return_url,
        }),
      };

      // Sign the request
      const signature = await signRequest(requestData, privateKey);
      requestData.sign = signature;

      console.log("AddPay request prepared:", { transRef, amount, booking_id });

      // Create payment transaction record
      const { error: txError } = await supabase
        .from("payment_transactions")
        .insert({
          booking_id,
          amount,
          currency,
          status: "pending",
          addpay_response: { trans_ref: transRef, request: requestData },
        });

      if (txError) {
        console.error("Failed to create transaction record:", txError);
      }

      // Update booking with payment reference
      await supabase
        .from("bookings")
        .update({ payment_reference: transRef, payment_status: "pending" })
        .eq("id", booking_id);

      // For now, return the request data - in production, you'd POST to AddPay
      // AddPay sandbox URL: https://sandbox.paycloud.africa/gateway/do
      // AddPay production URL: https://api.paycloud.africa/gateway/do
      const addpayUrl = "https://sandbox.paycloud.africa/gateway/do";

      return new Response(
        JSON.stringify({
          success: true,
          trans_ref: transRef,
          checkout_url: addpayUrl,
          request_data: requestData,
          // In production, you'd make the POST request and return the hosted checkout URL
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // VERIFY PAYMENT STATUS
    if (action === "verify_payment" && req.method === "POST") {
      const body = await req.json();
      const validation = VerifyPaymentSchema.safeParse(body);
      
      if (!validation.success) {
        return new Response(
          JSON.stringify({ error: "Invalid request", details: validation.error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { psn } = validation.data;

      // Query AddPay for payment status
      const privateKey = await importPrivateKey(privateKeyPem);
      
      const queryData: Record<string, unknown> = {
        app_id: appId,
        method: "inkasso.trade.query",
        format: "JSON",
        charset: "UTF-8",
        sign_type: "RSA2",
        timestamp: new Date().toISOString(),
        version: "1.0",
        biz_content: JSON.stringify({
          merchant_id: merchantId,
          psn: psn,
        }),
      };

      const signature = await signRequest(queryData, privateKey);
      queryData.sign = signature;

      console.log("Payment query prepared for PSN:", psn);

      // In production, POST to AddPay and parse response
      return new Response(
        JSON.stringify({
          success: true,
          message: "Query prepared",
          query_data: queryData,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // WEBHOOK HANDLER
    if (action === "webhook" && req.method === "POST") {
      const body = await req.json();
      console.log("Webhook received:", body);

      const validation = WebhookSchema.safeParse(body);
      
      if (!validation.success) {
        console.error("Invalid webhook payload:", validation.error.errors);
        return new Response(
          JSON.stringify({ error: "Invalid webhook" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { psn, status, sign } = validation.data;

      // Verify signature from AddPay
      const publicKey = await importPublicKey(publicKeyPem);
      const dataWithoutSign = { ...body };
      delete dataWithoutSign.sign;
      
      const isValid = await verifySignature(dataWithoutSign, sign, publicKey);
      
      if (!isValid) {
        console.error("Invalid webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Webhook signature verified for PSN:", psn);

      // Find and update transaction
      const { data: transaction, error: txError } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("psn", psn)
        .single();

      if (txError || !transaction) {
        // Try finding by trans_ref in addpay_response
        console.log("Transaction not found by PSN, checking response data");
      }

      // Update payment status based on AddPay status
      const paymentStatus = status === "SUCCESS" ? "paid" : status === "FAILED" ? "failed" : "pending";

      if (transaction) {
        await supabase
          .from("payment_transactions")
          .update({
            status: paymentStatus,
            psn: psn,
            addpay_response: body,
          })
          .eq("id", transaction.id);

        // Update booking
        await supabase
          .from("bookings")
          .update({
            payment_status: paymentStatus,
            paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
          })
          .eq("id", transaction.booking_id);

        console.log(`Booking ${transaction.booking_id} updated to ${paymentStatus}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("AddPay API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
