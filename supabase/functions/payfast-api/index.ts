import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { resolvePayfastCredentials, maskId } from "../_shared/paymentCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PayFast URLs
const PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za/eng/process";
const PAYFAST_PRODUCTION_URL = "https://www.payfast.co.za/eng/process";
const PAYFAST_SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate";
const PAYFAST_PRODUCTION_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate";

// PayFast IP whitelist for ITN verification
const PAYFAST_IPS = [
  "197.97.145.144", "197.97.145.145", "197.97.145.146", "197.97.145.147",
  "41.74.179.194", "41.74.179.195", "41.74.179.196", "41.74.179.197",
];

// Request schemas
const InitiatePaymentSchema = z.object({
  action: z.literal("initiate_payment"),
  booking_id: z.string().uuid(),
  return_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

const InitiateOnsitePaymentSchema = z.object({
  action: z.literal("initiate_onsite_payment"),
  booking_id: z.string().uuid(),
});

const VerifyItnSchema = z.object({
  action: z.literal("verify_itn"),
});

const VerifyPaymentSchema = z.object({
  action: z.literal("verify_payment"),
  transaction_ref: z.string(),
});

const HealthCheckSchema = z.object({
  action: z.literal("health_check"),
});

// PayFast Onsite URLs
const PAYFAST_SANDBOX_ONSITE_URL = "https://sandbox.payfast.co.za/onsite/process";
const PAYFAST_PRODUCTION_ONSITE_URL = "https://www.payfast.co.za/onsite/process";

// Generate MD5 hash using Web Crypto API
async function md5(text: string): Promise<string> {
  // Deno doesn't have native MD5, use a simple implementation
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Use SubtleCrypto for MD5 (via a workaround since MD5 isn't directly supported)
  // We'll use a pure JS MD5 implementation
  return md5Hash(text);
}

// Pure JS MD5 implementation
function md5Hash(string: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

  function md51(s: string) {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= s.length; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) {
      tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    }
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }

  function md5blk(s: string) {
    const md5blks = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

  const hex_chr = "0123456789abcdef".split("");

  function rhex(n: number) {
    let s = "";
    for (let j = 0; j < 4; j++) {
      s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f];
    }
    return s;
  }

  function hex(x: number[]) {
    const result: string[] = [];
    for (let i = 0; i < x.length; i++) {
      result.push(rhex(x[i]));
    }
    return result.join("");
  }

  function add32(a: number, b: number) {
    return (a + b) & 0xffffffff;
  }

  return hex(md51(string));
}

// Generate unique transaction reference
function generateTransRef(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ROL-${timestamp}-${random}`.toUpperCase();
}

// PayFast required field order for Custom Integration (from their documentation)
// See: https://developers.payfast.co.za/docs#step_2_signature
const PAYFAST_FIELD_ORDER = [
  // Merchant details
  'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
  // Buyer details  
  'name_first', 'name_last', 'email_address', 'cell_number',
  // Transaction details
  'm_payment_id', 'amount', 'item_name', 'item_description',
  'custom_int1', 'custom_int2', 'custom_int3', 'custom_int4', 'custom_int5',
  'custom_str1', 'custom_str2', 'custom_str3', 'custom_str4', 'custom_str5',
  // Transaction options
  'email_confirmation', 'confirmation_address',
  // Payment method
  'payment_method',
  // Recurring billing
  'subscription_type', 'billing_date', 'recurring_amount', 'frequency', 'cycles',
  // Signature is added last (but not included in signature calculation)
  'signature',
];

// Helper to URL-encode a value exactly like PHP's urlencode()
// PHP urlencode: Encodes EVERYTHING except letters, digits, underscore, hyphen, period
// CRITICAL DIFFERENCES from JavaScript encodeURIComponent:
// - PHP encodes: ! ' ( ) * ~ (encodeURIComponent leaves these unencoded)
// - Both encode: @ # $ % ^ & + = [ ] { } | \ : ; " < > , ? /
// - Spaces become + (not %20)
// - Hex codes MUST be uppercase (%3A not %3a)
function pfUrlencode(val: string): string {
  // First, use encodeURIComponent for base encoding
  let encoded = encodeURIComponent(val.trim());
  
  // PHP urlencode encodes these chars that encodeURIComponent does NOT:
  // ! ' ( ) * ~
  encoded = encoded
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E');
  
  // Ensure all hex codes are uppercase
  encoded = encoded.replace(/%([0-9a-f]{2})/gi, (_, hex) => '%' + hex.toUpperCase());
  
  // Convert %20 to + (PHP urlencode behavior)
  encoded = encoded.replace(/%20/g, '+');
  
  return encoded;
}

// Convert data object to URL-encoded param string (like PHP's dataToString)
// This is used for BOTH signature generation AND POST body
function dataToString(data: Record<string, string>, excludeSignature: boolean = false): string {
  // Get keys in PayFast's required order
  const orderedKeys = PAYFAST_FIELD_ORDER.filter(key => {
    if (excludeSignature && key === 'signature') return false;
    return key in data && data[key] !== "" && data[key] !== undefined && data[key] !== null;
  });
  
  // Add any extra keys not in the standard list (sorted alphabetically)
  const extraKeys = Object.keys(data)
    .filter(k => !PAYFAST_FIELD_ORDER.includes(k) && data[k] !== "" && data[k] !== undefined && data[k] !== null)
    .sort();
  
  const allKeys = [...orderedKeys, ...extraKeys];
  
  // Build URL-encoded param string
  return allKeys.map(key => `${key}=${pfUrlencode(String(data[key]))}`).join("&");
}

// Generate PayFast signature
// CRITICAL: Must match PHP implementation exactly
// 1. Create param string from data using urlencode (excluding signature field)
// 2. Append passphrase if set
// 3. MD5 hash the result
function generateSignature(data: Record<string, string>, passphrase?: string): string {
  // Create param string (excluding signature)
  const paramString = dataToString(data, true);
  
  // Add passphrase if provided
  // CRITICAL: Per PayFast PHP SDK, passphrase MUST be URL-encoded using urlencode()
  // PHP: $getString .= '&passphrase='. urlencode( trim( $passPhrase ) );
  const stringToHash = passphrase && passphrase.length > 0
    ? `${paramString}&passphrase=${pfUrlencode(passphrase)}`
    : paramString;
  
  const hash = md5Hash(stringToHash);
  
  // Debug: log full hash input for troubleshooting
  console.log("[PayFast] Signature input (first 500 chars):", stringToHash.substring(0, 500));
  console.log("[PayFast] Full string length:", stringToHash.length);
  console.log("[PayFast] Last 100 chars (with passphrase):", stringToHash.slice(-100));
  console.log("[PayFast] Passphrase length:", passphrase?.length || 0, "| Has passphrase:", !!passphrase && passphrase.length > 0);
  console.log("[PayFast] Generated signature:", hash);
  
  return hash;
}

// ITN-specific param string builder - uses ORIGINAL POST ORDER (as received from PayFast)
// CRITICAL: The PHP code iterates through $_POST in the order received and BREAKS at 'signature'
// This is NOT alphabetical - it's the exact order PayFast sends the fields
// See: https://developers.payfast.co.za/docs#step_4_confirm_payment
function dataToStringForItn(data: Record<string, string>, orderedKeys: string[]): string {
  const parts: string[] = [];
  
  for (const key of orderedKeys) {
    if (key === 'signature') {
      break; // Stop when we hit signature, just like PHP code does
    }
    // Include ALL fields, even empty ones (unlike outbound requests)
    const value = data[key] ?? '';
    parts.push(`${key}=${pfUrlencode(String(value))}`);
  }
  
  return parts.join("&");
}

// Generate signature for ITN verification (uses original POST order)
function generateItnSignature(data: Record<string, string>, orderedKeys: string[], passphrase?: string): string {
  const paramString = dataToStringForItn(data, orderedKeys);
  
  const stringToHash = passphrase && passphrase.length > 0
    ? `${paramString}&passphrase=${pfUrlencode(passphrase)}`
    : paramString;
  
  console.log("[PayFast] ITN Signature input (first 500 chars):", stringToHash.substring(0, 500));
  console.log("[PayFast] ITN Full string length:", stringToHash.length);
  
  return md5Hash(stringToHash);
}

// Verify PayFast signature from ITN - uses original POST order
function verifySignature(data: Record<string, string>, orderedKeys: string[], signature: string, passphrase?: string): boolean {
  // Use ITN-specific signature generation (original POST order)
  const calculatedSignature = generateItnSignature(data, orderedKeys, passphrase);
  console.log("[PayFast] ITN Calculated signature:", calculatedSignature);
  console.log("[PayFast] ITN Received signature:", signature);
  
  return calculatedSignature === signature;
}

// Validate ITN source IP
function validateSourceIp(ip: string | null, isSandbox: boolean): boolean {
  if (!ip) {
    console.log("[PayFast] No source IP provided");
    return false;
  }
  
  // In sandbox mode, be more lenient with IP validation
  if (isSandbox) {
    console.log("[PayFast] Sandbox mode - skipping strict IP validation for:", ip);
    return true;
  }
  
  const isValid = PAYFAST_IPS.includes(ip);
  console.log(`[PayFast] IP validation: ${ip} is ${isValid ? "valid" : "invalid"}`);
  return isValid;
}

// Server-side validation with PayFast
async function validateWithPayFast(params: Record<string, string>, isSandbox: boolean): Promise<boolean> {
  const validateUrl = isSandbox ? PAYFAST_SANDBOX_VALIDATE_URL : PAYFAST_PRODUCTION_VALIDATE_URL;
  
  const paramString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  
  try {
    const response = await fetch(validateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: paramString,
    });
    
    const result = await response.text();
    console.log("[PayFast] Validation response:", result);
    
    return result.trim() === "VALID";
  } catch (error) {
    console.error("[PayFast] Validation request failed:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // PayFast credentials — default to the RoomsOnline facilitator account.
    // These are replaced per-request by the property's own (BYO) merchant when
    // one is configured (see resolvePayfastCredentials below).
    let merchantId = (Deno.env.get("PAYFAST_MERCHANT_ID") || "").trim();
    let merchantKey = (Deno.env.get("PAYFAST_MERCHANT_KEY") || "").trim();
    const rawPassphrase = Deno.env.get("PAYFAST_PASSPHRASE") || "";
    let passphrase = rawPassphrase.replace(/[\x00-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/g, "").trim();
    let isSandbox = Deno.env.get("PAYFAST_SANDBOX") !== "false"; // Default to sandbox
    let credentialSource: "byo" | "rol" = "rol";

    /** Swap in the property's BYO merchant account when configured. */
    const applyPropertyCredentials = async (propertyId?: string | null) => {
      const creds = await resolvePayfastCredentials(supabase, propertyId);
      merchantId = creds.merchantId;
      merchantKey = creds.merchantKey;
      passphrase = creds.passphrase;
      isSandbox = creds.isSandbox;
      credentialSource = creds.source;
      console.log("[PayFast] Credentials resolved:", {
        property_id: propertyId || null,
        credential_source: creds.source,
        inherited: creds.inherited,
        merchant_id: maskId(creds.merchantId),
        is_sandbox: creds.isSandbox,
      });
      return creds;
    };


    const url = new URL(req.url);
    
    // Handle ITN webhook (POST to /payfast-api without JSON body)
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/x-www-form-urlencoded")) {
      // ITN callback from PayFast
      console.log("[PayFast] Received ITN callback");
      
      const formData = await req.formData();
      const itnData: Record<string, string> = {};
      const itnKeyOrder: string[] = []; // Capture original POST order
      formData.forEach((value, key) => {
        itnData[key] = value.toString();
        itnKeyOrder.push(key);
      });
      
      console.log("[PayFast] ITN data:", JSON.stringify(itnData));
      console.log("[PayFast] ITN key order:", itnKeyOrder.join(", "));

      // Resolve the merchant account this payment was originally created against,
      // so the signature is verified with the correct passphrase (BYO or ROL).
      const itnRef = itnData.m_payment_id;
      if (itnRef) {
        const { data: originTx } = await supabase
          .from("payment_transactions")
          .select("booking_id, merchant_id, credential_source, bookings(property_id)")
          .eq("m_payment_id", itnRef)
          .maybeSingle();

        if (originTx) {
          const originPropertyId = (originTx as any)?.bookings?.property_id || null;
          await applyPropertyCredentials(originPropertyId);

          // Guard: the posted merchant must match the account we initiated with.
          if (
            originTx.merchant_id &&
            itnData.merchant_id &&
            String(originTx.merchant_id) !== String(itnData.merchant_id)
          ) {
            console.error("[PayFast] ITN merchant mismatch", {
              expected: maskId(originTx.merchant_id),
              received: maskId(itnData.merchant_id),
            });
            return new Response("OK", { status: 200, headers: corsHeaders });
          }
        }
      }

      // Validate source IP
      const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
        || req.headers.get("cf-connecting-ip")
        || null;
      
      if (!validateSourceIp(sourceIp, isSandbox)) {
        console.error("[PayFast] Invalid source IP:", sourceIp);
        // Still return 200 to PayFast but don't process
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
      
      // Verify signature using original POST order
      const signatureValid = verifySignature(itnData, itnKeyOrder, itnData.signature, passphrase);
      
      if (!signatureValid) {
        console.error("[PayFast] Invalid signature");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      
      // Server-side validation (optional but recommended)
      // const isValid = await validateWithPayFast(itnData, isSandbox);
      // if (!isValid) {
      //   console.error("[PayFast] Server validation failed");
      //   return new Response("OK", { status: 200, headers: corsHeaders });
      // }
      
      // Extract payment details
      const mPaymentId = itnData.m_payment_id; // Our reference
      const pfPaymentId = itnData.pf_payment_id; // PayFast reference
      const paymentStatus = itnData.payment_status; // COMPLETE, FAILED, CANCELLED
      const amountGross = parseFloat(itnData.amount_gross || "0");
      
      console.log(`[PayFast] Processing ITN: m_payment_id=${mPaymentId}, status=${paymentStatus}`);
      
      // Find the payment transaction
      const { data: transaction, error: txError } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("m_payment_id", mPaymentId)
        .single();
      
      if (txError || !transaction) {
        // Check subscription invoice branch (m_payment_id like "SUB-<invoice_id>")
        if (typeof mPaymentId === "string" && mPaymentId.startsWith("SUB-")) {
          const invoiceId = mPaymentId.slice(4);
          console.log("[PayFast] Subscription ITN for invoice:", invoiceId, "status:", paymentStatus);
          const subStatus = paymentStatus === "COMPLETE" ? "paid" : paymentStatus === "FAILED" ? "failed" : "cancelled";
          const { data: inv } = await supabase
            .from("subscription_invoices")
            .select("*")
            .eq("id", invoiceId)
            .single();
          if (inv) {
            await supabase.from("subscription_invoices").update({
              status: subStatus,
              payfast_payment_id: pfPaymentId,
              paid_at: subStatus === "paid" ? new Date().toISOString() : null,
              metadata: { ...(inv.metadata ?? {}), itn: itnData },
            }).eq("id", invoiceId);

            if (subStatus === "paid") {
              const periodStart = new Date(inv.period_start);
              const nextEnd = new Date(periodStart);
              nextEnd.setMonth(nextEnd.getMonth() + 1);
              const nextEndStr = nextEnd.toISOString().slice(0, 10);
              const tableName = inv.property_id ? "property_billing_configs" : "portfolio_billing_configs";
              const keyCol = inv.property_id ? "property_id" : "portfolio_id";
              const keyVal = inv.property_id || inv.portfolio_id;
              await supabase.from(tableName).update({
                subscription_status: "active",
                current_period_end: nextEndStr,
                last_invoice_id: invoiceId,
                cancelled_at: null,
              }).eq(keyCol, keyVal);

              // Mark any charge items invoiced on this invoice as billed
              await supabase.from("subscription_charge_items")
                .update({ invoiced_at: new Date().toISOString() })
                .eq("invoiced_on_invoice_id", invoiceId)
                .is("invoiced_at", null);

              // Assign human-readable invoice number if missing
              if (!inv.invoice_number) {
                const { data: seq } = await supabase.rpc("nextval_subscription_invoice_number").catch(() => ({ data: null } as any));
                let number = seq;
                if (!number) {
                  const { data: s } = await supabase.from("subscription_invoices").select("id").order("created_at", { ascending: false }).limit(1);
                  number = 1000 + (s?.length || 0);
                }
                const year = new Date().getFullYear();
                const invoiceNumber = `RO-${year}-${String(number).padStart(6, "0")}`;
                await supabase.from("subscription_invoices").update({ invoice_number: invoiceNumber }).eq("id", invoiceId);
              }

              await supabase.from("billing_transactions").insert({
                property_id: inv.property_id,
                owner_id: inv.owner_id,
                type: "subscription",
                amount: inv.amount,
                currency: inv.currency,
                reference_id: invoiceId,
                calculated_by: "payfast_itn",
                metadata: { portfolio_id: inv.portfolio_id, pf_payment_id: pfPaymentId, period_start: inv.period_start, period_end: inv.period_end },
              });

              // Fire-and-log: PDF + email
              try {
                await supabase.functions.invoke("generate-subscription-invoice-pdf", { body: { invoice_id: invoiceId } });
              } catch (e) {
                console.error("[PayFast] Failed to trigger invoice PDF:", e);
                await supabase.from("subscription_invoice_events").insert({
                  invoice_id: invoiceId, event_type: "pdf_dispatch", status: "error", detail: String(e),
                });
              }
            }
          }
          return new Response("OK", { status: 200, headers: corsHeaders });
        }
        console.error("[PayFast] Transaction not found for m_payment_id:", mPaymentId);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
      
      // Determine status
      const newStatus = paymentStatus === "COMPLETE" ? "paid" : paymentStatus === "FAILED" ? "failed" : "cancelled";
      
      // Update payment transaction
      await supabase
        .from("payment_transactions")
        .update({
          status: newStatus,
          transaction_ref: pfPaymentId,
          pf_payment_id: pfPaymentId,
          signature_valid: true,
          gateway_response: itnData,
        })
        .eq("id", transaction.id);
      
      // Update booking - also set status to 'confirmed' when payment is successful
      await supabase
        .from("bookings")
        .update({
          payment_status: newStatus,
          payment_reference: pfPaymentId,
          payment_method: "payfast",
          paid_at: newStatus === "paid" ? new Date().toISOString() : null,
          status: newStatus === "paid" ? "confirmed" : undefined,
        })
        .eq("id", transaction.booking_id);
      
      console.log(`[PayFast] Updated booking ${transaction.booking_id} to status: ${newStatus}`);
      
      // If payment successful, trigger push-booking and send email
      if (newStatus === "paid") {
        try {
          // Check if this is an itinerary booking
          const { data: bookingData } = await supabase
            .from("bookings")
            .select("booking_channel, ai_metadata")
            .eq("id", transaction.booking_id)
            .single();
          
          const isItineraryBooking = bookingData?.booking_channel === 'rol_itinerary';
          const itineraryId = (bookingData?.ai_metadata as any)?.itinerary_id;
          
          if (isItineraryBooking && itineraryId) {
            // For itinerary bookings, trigger multi-push-booking instead
            console.log("[PayFast] Triggering multi-push-booking for itinerary:", itineraryId);
            
            const pushResponse = await supabase.functions.invoke("multi-push-booking", {
              body: { itinerary_id: itineraryId },
            });
            
            console.log("[PayFast] Multi-push-booking response:", JSON.stringify(pushResponse.data));
          } else {
            // Standard single booking flow
            console.log("[PayFast] Triggering push-booking for:", transaction.booking_id);
            
            const pushResponse = await supabase.functions.invoke("push-booking", {
              body: { booking_id: transaction.booking_id },
            });
            
            console.log("[PayFast] Push-booking response:", JSON.stringify(pushResponse.data));
          }
        } catch (pushError) {
          console.error("[PayFast] Push/multi-push-booking failed:", pushError);
          // Don't fail ITN - booking payment is still recorded
        }
      }
      
      // Log to sync_logs
      await supabase.from("sync_logs").insert({
        booking_id: transaction.booking_id,
        property_id: null, // Will be populated by push-booking
        external_system: "payfast",
        sync_type: "payment_itn",
        status: newStatus === "paid" ? "success" : "error",
        message: `PayFast ITN received: ${paymentStatus}`,
        response_data: itnData,
      });
      
      return new Response("OK", { status: 200, headers: corsHeaders });
    }
    
    // Handle JSON API requests
    const body = await req.json();
    const action = body.action;
    
    console.log(`[PayFast] Action: ${action}`);
    
    // HEALTH CHECK - also tests signature generation with known data
    if (action === "health_check") {
      HealthCheckSchema.parse(body);
      
      const configured = !!(merchantId && merchantKey);
      
      // Test signature generation with PayFast's official test data
      // From https://developers.payfast.co.za/docs#step_2_signature
      // Expected: with passphrase "jt7NOE43FZPn" should match their example
      const testData: Record<string, string> = {
        merchant_id: "10000100",
        merchant_key: "46f0cd694581a",
        return_url: "http://www.yourdomain.co.za/return.php",
        cancel_url: "http://www.yourdomain.co.za/cancel.php",
        notify_url: "http://www.yourdomain.co.za/notify.php",
        name_first: "First Name",
        name_last: "Last Name",
        email_address: "test@test.com",
        m_payment_id: "1234",
        amount: "10.00",
        item_name: "Order#123",
      };
      
      const testPassphrase = "jt7NOE43FZPn";
      const testSignature = generateSignature(testData, testPassphrase);
      
      console.log("[PayFast] Health check - Test signature:", testSignature);
      console.log("[PayFast] Health check - Current passphrase length:", passphrase?.length || 0);
      
      return new Response(
        JSON.stringify({
          success: true,
          healthy: configured,
          status: configured ? "ok" : "not_configured",
          source: "payfast-api",
          fetched_at: new Date().toISOString(),
          debug: {
            test_signature: testSignature,
            passphrase_configured: !!passphrase && passphrase.length > 0,
            passphrase_length: passphrase?.length || 0,
            is_sandbox: isSandbox,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Validate credentials for other actions
    if (!merchantId || !merchantKey) {
      console.error("[PayFast] Missing credentials");
      return new Response(
        JSON.stringify({ success: false, error: "PayFast not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // INITIATE PAYMENT
    if (action === "initiate_payment") {
      const validation = InitiatePaymentSchema.safeParse(body);
      
      if (!validation.success) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid request", details: validation.error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const { booking_id, return_url, cancel_url } = validation.data;
      
      // Fetch booking details
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("*, properties!bookings_property_id_fkey(name, slug)")
        .eq("id", booking_id)
        .single();
      
      if (bookingError || !booking) {
        console.error("[PayFast] Booking not found:", bookingError);
        return new Response(
          JSON.stringify({ success: false, error: "Booking not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Use the property's own PayFast account when BYO is configured
      await applyPropertyCredentials((booking as any).property_id);
      if (!merchantId || !merchantKey) {
        return new Response(
          JSON.stringify({ success: false, error: "PayFast not configured for this property" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const transRef = generateTransRef();

      const amount = booking.total_price.toFixed(2);
      const propertyName = (booking.properties as any)?.name || "RoomsOnline";
      const propertySlug = (booking.properties as any)?.slug || "";
      
      // Build URLs
      const siteUrl = Deno.env.get("SITE_URL") || "https://book.sleepinafrica.roomsonline.co.za";
      const defaultReturnUrl = `${siteUrl}/booking-confirmation/${booking_id}?payment=success`;
      const defaultCancelUrl = `${siteUrl}/booking/${propertySlug}?payment=cancelled`;
      const notifyUrl = `${supabaseUrl}/functions/v1/payfast-api`;
      
      // Build form fields for PayFast
      const formFields: Record<string, string> = {
        merchant_id: merchantId,
        merchant_key: merchantKey,
        return_url: return_url || defaultReturnUrl,
        cancel_url: cancel_url || defaultCancelUrl,
        notify_url: notifyUrl,
        m_payment_id: transRef,
        amount: amount,
        item_name: `Booking at ${propertyName}`.substring(0, 100),
        item_description: `Reservation #${booking_id.substring(0, 8).toUpperCase()}`.substring(0, 255),
        email_address: booking.guest_email,
        name_first: booking.guest_name.split(" ")[0] || "",
        name_last: booking.guest_name.split(" ").slice(1).join(" ") || "",
        ...((() => { const c = (booking.guest_phone || "").replace(/\D/g, ""); return /^0[0-9]{9}$/.test(c) ? { cell_number: c } : {}; })()),
      };
      
      // Generate signature
      const signature = generateSignature(formFields, passphrase);
      formFields.signature = signature;
      
      console.log("[PayFast] Payment initiated:", { transRef, amount, booking_id });
      
      // Create payment transaction record
      const { error: txError } = await supabase
        .from("payment_transactions")
        .insert({
          booking_id,
          amount: booking.total_price,
          currency: "ZAR",
          status: "pending",
          payment_provider: "payfast",
          m_payment_id: transRef,
          gateway_response: { trans_ref: transRef, form_fields: formFields },
        });
      
      if (txError) {
        console.error("[PayFast] Failed to create transaction record:", txError);
      }
      
      // Update booking with payment reference
      await supabase
        .from("bookings")
        .update({ 
          payment_reference: transRef, 
          payment_status: "pending",
          payment_method: "payfast",
        })
        .eq("id", booking_id);
      
      const payfastUrl = isSandbox ? PAYFAST_SANDBOX_URL : PAYFAST_PRODUCTION_URL;
      
      return new Response(
        JSON.stringify({
          success: true,
          trans_ref: transRef,
          checkout_url: payfastUrl,
          form_fields: formFields,
          is_sandbox: isSandbox,
          source: "payfast-api",
          action: "initiate_payment",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // INITIATE SUBSCRIPTION PAYMENT — for property/portfolio monthly subscription
    if (action === "initiate_subscription_payment") {
      const token = (body?.token || "").toString();
      if (!token) {
        return new Response(JSON.stringify({ success: false, error: "Missing token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: inv, error: invErr } = await supabase
        .from("subscription_invoices")
        .select("*, properties(name, slug), property_portfolios(name)")
        .eq("payfast_token", token)
        .single();
      if (invErr || !inv) {
        return new Response(JSON.stringify({ success: false, error: "Invoice not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (inv.status !== "pending") {
        return new Response(JSON.stringify({ success: false, error: `Invoice ${inv.status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let ownerEmail = "";
      let ownerFirst = "";
      let ownerLast = "";
      if (inv.owner_id) {
        const { data: prof } = await supabase.from("profiles").select("email, first_name, last_name, full_name").eq("id", inv.owner_id).single();
        if (prof) {
          ownerEmail = prof.email || "";
          ownerFirst = (prof as any).first_name || (prof.full_name || "").split(" ")[0] || "Owner";
          ownerLast = (prof as any).last_name || (prof.full_name || "").split(" ").slice(1).join(" ") || "";
        }
      }
      const entityName = (inv.properties as any)?.name || (inv.property_portfolios as any)?.name || "Subscription";
      const siteUrl = Deno.env.get("SITE_URL") || "https://sleepinafrica.roomsonline.co.za";
      const returnUrl = `${siteUrl}/subscribe/pay/${token}?status=success`;
      const cancelUrl = `${siteUrl}/subscribe/pay/${token}?status=cancelled`;
      const notifyUrl = `${supabaseUrl}/functions/v1/payfast-api`;
      const mPaymentId = `SUB-${inv.id}`;
      const formFields: Record<string, string> = {
        merchant_id: merchantId!,
        merchant_key: merchantKey!,
        return_url: returnUrl,
        cancel_url: cancelUrl,
        notify_url: notifyUrl,
        m_payment_id: mPaymentId,
        amount: Number(inv.amount).toFixed(2),
        item_name: `Rooms Online — ${entityName}`.substring(0, 100),
        item_description: `Subscription ${inv.period_start} to ${inv.period_end}`.substring(0, 255),
        ...(ownerEmail ? { email_address: ownerEmail } : {}),
        ...(ownerFirst ? { name_first: ownerFirst } : {}),
        ...(ownerLast ? { name_last: ownerLast } : {}),
      };
      formFields.signature = generateSignature(formFields, passphrase);
      const payfastUrl = isSandbox ? PAYFAST_SANDBOX_URL : PAYFAST_PRODUCTION_URL;
      return new Response(JSON.stringify({
        success: true,
        checkout_url: payfastUrl,
        form_fields: formFields,
        is_sandbox: isSandbox,
        invoice_id: inv.id,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    
    // INITIATE ONSITE PAYMENT (Modal-based, stays in ROL UI)
    if (action === "initiate_onsite_payment") {
      const validation = InitiateOnsitePaymentSchema.safeParse(body);
      
      if (!validation.success) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid request", details: validation.error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const { booking_id } = validation.data;
      
      // Fetch booking details
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("*, properties!bookings_property_id_fkey(name, slug)")
        .eq("id", booking_id)
        .single();
      
      if (bookingError || !booking) {
        console.error("[PayFast] Booking not found:", bookingError);
        return new Response(
          JSON.stringify({ success: false, error: "Booking not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const transRef = generateTransRef();
      const amount = booking.total_price.toFixed(2);
      const propertyName = (booking.properties as any)?.name || "RoomsOnline";
      
      // Build URLs for callbacks
      const siteUrl = Deno.env.get("SITE_URL") || "https://book.sleepinafrica.roomsonline.co.za";
      const notifyUrl = `${supabaseUrl}/functions/v1/payfast-api`;
      
      // Build form fields for PayFast onsite
      const formFields: Record<string, string> = {
        merchant_id: merchantId,
        merchant_key: merchantKey,
        return_url: `${siteUrl}/booking-confirmation/${booking_id}?payment=success`,
        cancel_url: `${siteUrl}/booking/${(booking.properties as any)?.slug || ''}?payment=cancelled`,
        notify_url: notifyUrl,
        m_payment_id: transRef,
        amount: amount,
        item_name: `Booking at ${propertyName}`.substring(0, 100),
        item_description: `Reservation #${booking_id.substring(0, 8).toUpperCase()}`.substring(0, 255),
        email_address: booking.guest_email,
        name_first: booking.guest_name.split(" ")[0] || "",
        name_last: booking.guest_name.split(" ").slice(1).join(" ") || "",
        ...((() => { const c = (booking.guest_phone || "").replace(/\D/g, ""); return /^0[0-9]{9}$/.test(c) ? { cell_number: c } : {}; })()),
      };
      
      // Generate signature (calculated from URL-encoded param string, excluding signature)
      const signature = generateSignature(formFields, passphrase);
      formFields.signature = signature;
      
      console.log("[PayFast] Onsite payment initiated:", { transRef, amount, booking_id });
      
      // Build param string for POST - MUST use same encoding as signature
      // Using dataToString ensures exact same encoding and order
      const paramString = dataToString(formFields, false);
      
      console.log("[PayFast] POST body (first 400 chars):", paramString.substring(0, 400));
      
      // Request UUID from PayFast onsite API
      const onsiteUrl = isSandbox ? PAYFAST_SANDBOX_ONSITE_URL : PAYFAST_PRODUCTION_ONSITE_URL;
      
      console.log("[PayFast] Requesting onsite UUID from:", onsiteUrl);
      
      const onsiteResponse = await fetch(onsiteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: paramString,
      });
      
      const onsiteResult = await onsiteResponse.text();
      console.log("[PayFast] Onsite API response:", onsiteResult);
      
      let uuid: string | null = null;
      let payfastError: string | null = null;
      
      try {
        const parsed = JSON.parse(onsiteResult);
        uuid = parsed.uuid || null;
      } catch (e) {
        console.error("[PayFast] Failed to parse onsite response:", e);
        // Try to extract error from HTML response
        const errorMatch = onsiteResult.match(/<span class="err-msg">([^<]+)<\/span>/);
        if (errorMatch) {
          payfastError = errorMatch[1];
        }
      }
      
      if (!uuid) {
        console.error("[PayFast] No UUID received from onsite API. PayFast error:", payfastError);
        // Return 200 with success:false so supabase.functions.invoke passes the body to the client
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: payfastError || "Failed to initiate onsite payment",
            details: payfastError ? `PayFast: ${payfastError}` : undefined
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Create payment transaction record
      const { error: txError } = await supabase
        .from("payment_transactions")
        .insert({
          booking_id,
          amount: booking.total_price,
          currency: "ZAR",
          status: "pending",
          payment_provider: "payfast",
          m_payment_id: transRef,
          gateway_response: { trans_ref: transRef, uuid, onsite: true },
        });
      
      if (txError) {
        console.error("[PayFast] Failed to create transaction record:", txError);
      }
      
      // Update booking with payment reference
      await supabase
        .from("bookings")
        .update({ 
          payment_reference: transRef, 
          payment_status: "pending",
          payment_method: "payfast",
        })
        .eq("id", booking_id);
      
      return new Response(
        JSON.stringify({
          success: true,
          uuid: uuid,
          trans_ref: transRef,
          is_sandbox: isSandbox,
          source: "payfast-api",
          action: "initiate_onsite_payment",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // VERIFY PAYMENT
    if (action === "verify_payment") {
      const validation = VerifyPaymentSchema.safeParse(body);
      
      if (!validation.success) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid request", details: validation.error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const { transaction_ref } = validation.data;
      
      // Find transaction
      const { data: transaction, error: txError } = await supabase
        .from("payment_transactions")
        .select("*, bookings(id, status, payment_status)")
        .or(`m_payment_id.eq.${transaction_ref},transaction_ref.eq.${transaction_ref}`)
        .single();
      
      if (txError || !transaction) {
        return new Response(
          JSON.stringify({ success: false, error: "Transaction not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          transaction: {
            id: transaction.id,
            booking_id: transaction.booking_id,
            status: transaction.status,
            amount: transaction.amount,
            currency: transaction.currency,
            payment_provider: transaction.payment_provider,
            transaction_ref: transaction.transaction_ref,
            pf_payment_id: transaction.pf_payment_id,
            m_payment_id: transaction.m_payment_id,
          },
        source: "payfast-api",
          action: "verify_payment",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // DEBUG: Test signature with PayFast's documented example
    if (action === "debug_signature_test") {
      // PayFast documentation example from Step 2
      const testData: Record<string, string> = {
        merchant_id: '10000100',
        merchant_key: '46f0cd694581a',
        return_url: 'http://www.yourdomain.co.za/return.php',
        cancel_url: 'http://www.yourdomain.co.za/cancel.php',
        notify_url: 'http://www.yourdomain.co.za/notify.php',
        name_first: 'First Name',
        name_last: 'Last Name',
        email_address: 'test@test.com',
        m_payment_id: '1234',
        amount: '10.00',
        item_name: 'Order#123',
      };
      
      const testPassphrase = 'jt7NOE43FZPn';
      
      // Generate our signature
      const ourSignature = generateSignature(testData, testPassphrase);
      
      // Also generate without passphrase for comparison
      const ourSignatureNoPass = generateSignature(testData, undefined);
      
      // Log full string for manual verification
      const fullStringNoPass = dataToString(testData, true);
      const fullStringWithPass = fullStringNoPass + '&passphrase=' + pfUrlencode(testPassphrase);
      
      console.log("[PayFast Debug] Test data string (no pass):", fullStringNoPass);
      console.log("[PayFast Debug] Test data string (with pass):", fullStringWithPass);
      console.log("[PayFast Debug] Our signature (with pass):", ourSignature);
      console.log("[PayFast Debug] Our signature (no pass):", ourSignatureNoPass);
      
      return new Response(
        JSON.stringify({
          success: true,
          test_data: testData,
          passphrase: testPassphrase,
          full_string_no_pass: fullStringNoPass,
          full_string_with_pass: fullStringWithPass,
          our_signature_with_pass: ourSignature,
          our_signature_no_pass: ourSignatureNoPass,
          note: "Compare with PayFast PHP implementation. Expected signature should match.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: "Unknown action" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: unknown) {
    console.error("[PayFast] API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
