import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PayGate PayWeb3 endpoints
const PAYGATE_INITIATE_URL = "https://secure.paygate.co.za/payweb3/initiate.trans";
const PAYGATE_QUERY_URL = "https://secure.paygate.co.za/payweb3/query.trans";
const PAYGATE_REDIRECT_URL = "https://secure.paygate.co.za/payweb3/process.trans";

// Pure JS MD5 implementation (same as payfast-api)
function md5Hash(string: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function md51(s: string) {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= s.length; i += 64) { md5cycle(state, md5blk(s.substring(i - 64, i))); }
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) { tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3); }
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
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
  function rhex(n: number) { let s = ""; for (let j = 0; j < 4; j++) { s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f]; } return s; }
  function hex(x: number[]) { return x.map(rhex).join(""); }
  function add32(a: number, b: number) { return (a + b) & 0xffffffff; }
  return hex(md51(string));
}

// Generate PayGate checksum: MD5 of all field VALUES concatenated (no keys) + encryption key
function generateChecksum(data: Record<string, string>, encryptionKey: string): string {
  // PayGate checksum: MD5(value1value2value3...encryptionKey)
  // Values must be in the EXACT order of the fields
  const values = Object.values(data).join("");
  const checksumString = values + encryptionKey;
  console.log("[PayGate] Checksum input (first 200 chars):", checksumString.substring(0, 200));
  return md5Hash(checksumString);
}

// Verify PayGate response checksum
function verifyChecksum(data: Record<string, string>, receivedChecksum: string, encryptionKey: string): boolean {
  // Remove CHECKSUM from data before calculating
  const dataWithoutChecksum: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== "CHECKSUM") {
      dataWithoutChecksum[key] = value;
    }
  }
  const calculatedChecksum = generateChecksum(dataWithoutChecksum, encryptionKey);
  console.log("[PayGate] Calculated checksum:", calculatedChecksum);
  console.log("[PayGate] Received checksum:", receivedChecksum);
  return calculatedChecksum === receivedChecksum;
}

// Generate unique transaction reference
function generateTransRef(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ROL-${timestamp}-${random}`.toUpperCase();
}

// Transaction status codes
const TRANSACTION_STATUS: Record<string, string> = {
  "0": "Not Done",
  "1": "Approved",
  "2": "Declined",
  "3": "Cancelled",
  "4": "User Cancelled",
  "5": "Received by PayGate",
  "7": "Settlement Voided",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // PayGate credentials
    const paygateId = Deno.env.get("PAYGATE_ID");
    const encryptionKey = Deno.env.get("PAYGATE_ENCRYPTION_KEY");

    const contentType = req.headers.get("content-type") || "";

    // Handle NOTIFY callback (form-urlencoded POST from PayGate)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      console.log("[PayGate] Received notify callback");

      const formData = await req.formData();
      const notifyData: Record<string, string> = {};
      formData.forEach((value, key) => {
        notifyData[key] = value.toString();
      });

      console.log("[PayGate] Notify data:", JSON.stringify(notifyData));

      const payRequestId = notifyData.PAY_REQUEST_ID;
      const transactionStatus = notifyData.TRANSACTION_STATUS;
      const receivedChecksum = notifyData.CHECKSUM;
      const reference = notifyData.REFERENCE;

      // Verify checksum
      if (encryptionKey && receivedChecksum) {
        const isValid = verifyChecksum(notifyData, receivedChecksum, encryptionKey);
        if (!isValid) {
          console.error("[PayGate] Invalid checksum on notify");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }
      }

      // Map PayGate status to our status
      const newStatus = transactionStatus === "1" ? "paid" : 
                        transactionStatus === "2" ? "failed" :
                        transactionStatus === "3" || transactionStatus === "4" ? "cancelled" : "pending";

      console.log(`[PayGate] Processing notify: reference=${reference}, status=${transactionStatus} (${TRANSACTION_STATUS[transactionStatus] || "Unknown"}), mapped=${newStatus}`);

      // Find the payment transaction
      const { data: transaction, error: txError } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("m_payment_id", reference)
        .single();

      if (txError || !transaction) {
        console.error("[PayGate] Transaction not found for reference:", reference);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Update payment transaction
      await supabase
        .from("payment_transactions")
        .update({
          status: newStatus,
          transaction_ref: payRequestId,
          pf_payment_id: payRequestId, // Reuse field for PayGate's PAY_REQUEST_ID
          signature_valid: true,
          gateway_response: notifyData,
        })
        .eq("id", transaction.id);

      // Update booking
      await supabase
        .from("bookings")
        .update({
          payment_status: newStatus,
          payment_reference: payRequestId,
          payment_method: "paygate",
          paid_at: newStatus === "paid" ? new Date().toISOString() : null,
          status: newStatus === "paid" ? "confirmed" : undefined,
        })
        .eq("id", transaction.booking_id);

      console.log(`[PayGate] Updated booking ${transaction.booking_id} to status: ${newStatus}`);

      // If payment successful, trigger push-booking
      if (newStatus === "paid") {
        try {
          const { data: bookingData } = await supabase
            .from("bookings")
            .select("booking_channel, ai_metadata")
            .eq("id", transaction.booking_id)
            .single();

          const isItineraryBooking = bookingData?.booking_channel === "rol_itinerary";
          const itineraryId = (bookingData?.ai_metadata as any)?.itinerary_id;

          if (isItineraryBooking && itineraryId) {
            console.log("[PayGate] Triggering multi-push-booking for itinerary:", itineraryId);
            await supabase.functions.invoke("multi-push-booking", {
              body: { itinerary_id: itineraryId },
            });
          } else {
            console.log("[PayGate] Triggering push-booking for:", transaction.booking_id);
            await supabase.functions.invoke("push-booking", {
              body: { booking_id: transaction.booking_id },
            });
          }
        } catch (pushError) {
          console.error("[PayGate] Push-booking failed:", pushError);
        }
      }

      // Log to sync_logs
      await supabase.from("sync_logs").insert({
        booking_id: transaction.booking_id,
        property_id: null,
        external_system: "paygate",
        sync_type: "payment_notify",
        status: newStatus === "paid" ? "success" : "error",
        message: `PayGate notify: ${TRANSACTION_STATUS[transactionStatus] || transactionStatus}`,
        response_data: notifyData,
      });

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Handle JSON API requests
    const body = await req.json();
    const action = body.action;

    console.log(`[PayGate] Action: ${action}`);

    // HEALTH CHECK
    if (action === "health_check") {
      const configured = !!(paygateId && encryptionKey);
      return new Response(
        JSON.stringify({
          success: true,
          healthy: configured,
          status: configured ? "ok" : "not_configured",
          source: "paygate-api",
          fetched_at: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate credentials
    if (!paygateId || !encryptionKey) {
      return new Response(
        JSON.stringify({ success: false, error: "PayGate not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // INITIATE PAYMENT (PayWeb3 redirect flow)
    if (action === "initiate_payment") {
      const bookingId = body.booking_id;
      if (!bookingId) {
        return new Response(
          JSON.stringify({ success: false, error: "booking_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch booking details
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("*, properties(name, slug)")
        .eq("id", bookingId)
        .single();

      if (bookingError || !booking) {
        return new Response(
          JSON.stringify({ success: false, error: "Booking not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const transRef = generateTransRef();
      // PayGate requires amount in CENTS (integer)
      const amountCents = Math.round(booking.total_price * 100).toString();
      const propertyName = (booking.properties as any)?.name || "RoomsOnline";
      const propertySlug = (booking.properties as any)?.slug || "";

      // Build URLs
      const siteUrl = Deno.env.get("SITE_URL") || "https://book.sleepinafrica.roomsonline.co.za";
      const returnUrl = body.return_url || `${siteUrl}/booking-confirmation/${bookingId}?payment=success`;
      const notifyUrl = `${supabaseUrl}/functions/v1/paygate-api`;

      // Build initiate request data - FIELD ORDER MATTERS for checksum
      const initiateData: Record<string, string> = {
        PAYGATE_ID: paygateId,
        REFERENCE: transRef,
        AMOUNT: amountCents,
        CURRENCY: "ZAR",
        RETURN_URL: returnUrl,
        TRANSACTION_DATE: new Date().toISOString().replace("T", " ").substring(0, 19),
        LOCALE: "en-za",
        COUNTRY: "ZAF",
        EMAIL: booking.guest_email,
        NOTIFY_URL: notifyUrl,
      };

      // Generate checksum
      const checksum = generateChecksum(initiateData, encryptionKey);
      initiateData.CHECKSUM = checksum;

      console.log("[PayGate] Initiating payment:", { transRef, amountCents, bookingId });

      // POST to PayGate initiate endpoint
      const formBody = Object.entries(initiateData)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");

      const initiateResponse = await fetch(PAYGATE_INITIATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody,
      });

      const responseText = await initiateResponse.text();
      console.log("[PayGate] Initiate response:", responseText);

      // Parse response (URL-encoded string)
      const responseParams = new URLSearchParams(responseText);
      const payRequestId = responseParams.get("PAY_REQUEST_ID");
      const responseChecksum = responseParams.get("CHECKSUM");
      const errorCode = responseParams.get("ERROR");

      if (errorCode) {
        console.error("[PayGate] Initiate error:", errorCode);
        return new Response(
          JSON.stringify({ success: false, error: `PayGate error: ${errorCode}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!payRequestId) {
        return new Response(
          JSON.stringify({ success: false, error: "No PAY_REQUEST_ID received from PayGate" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify response checksum
      if (responseChecksum && encryptionKey) {
        const responseData: Record<string, string> = {};
        responseParams.forEach((value, key) => {
          if (key !== "CHECKSUM") responseData[key] = value;
        });
        const isValid = verifyChecksum({ ...responseData }, responseChecksum, encryptionKey);
        if (!isValid) {
          console.warn("[PayGate] Response checksum mismatch - proceeding anyway");
        }
      }

      // Create payment transaction record
      await supabase
        .from("payment_transactions")
        .insert({
          booking_id: bookingId,
          amount: booking.total_price,
          currency: "ZAR",
          status: "pending",
          payment_provider: "paygate",
          m_payment_id: transRef,
          transaction_ref: payRequestId,
          gateway_response: { pay_request_id: payRequestId, trans_ref: transRef },
        });

      // Update booking
      await supabase
        .from("bookings")
        .update({
          payment_reference: transRef,
          payment_status: "pending",
          payment_method: "paygate",
        })
        .eq("id", bookingId);

      return new Response(
        JSON.stringify({
          success: true,
          pay_request_id: payRequestId,
          checksum: responseChecksum,
          redirect_url: PAYGATE_REDIRECT_URL,
          trans_ref: transRef,
          source: "paygate-api",
          action: "initiate_payment",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // QUERY TRANSACTION STATUS
    if (action === "query_transaction") {
      const payRequestId = body.pay_request_id;
      const reference = body.reference;

      if (!payRequestId || !reference) {
        return new Response(
          JSON.stringify({ success: false, error: "pay_request_id and reference required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const queryData: Record<string, string> = {
        PAYGATE_ID: paygateId,
        PAY_REQUEST_ID: payRequestId,
        REFERENCE: reference,
      };

      const queryChecksum = generateChecksum(queryData, encryptionKey);
      queryData.CHECKSUM = queryChecksum;

      const queryBody = Object.entries(queryData)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");

      const queryResponse = await fetch(PAYGATE_QUERY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: queryBody,
      });

      const queryResult = await queryResponse.text();
      console.log("[PayGate] Query response:", queryResult);

      const queryParams = new URLSearchParams(queryResult);
      const result: Record<string, string> = {};
      queryParams.forEach((value, key) => {
        result[key] = value;
      });

      return new Response(
        JSON.stringify({
          success: true,
          transaction: result,
          status_text: TRANSACTION_STATUS[result.TRANSACTION_STATUS] || "Unknown",
          source: "paygate-api",
          action: "query_transaction",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Unknown action" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[PayGate] API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
