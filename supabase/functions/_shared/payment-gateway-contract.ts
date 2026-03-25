// ============================================================================
// SHARED PAYMENT GATEWAY CONTRACT v1.0
// All gateway edge functions must accept/return these interfaces
// ============================================================================

export interface GatewayRequest {
  action: "initiate_payment" | "verify_payment" | "refund" | "health_check" | "webhook";
  booking_id?: string;
  amount: number;
  currency: string;
  guest_email: string;
  guest_name: string;
  return_url: string;
  cancel_url: string;
  notify_url?: string;
  item_name?: string;
  property_id?: string;
  payment_id?: string;
  transaction_ref?: string;
  metadata?: Record<string, unknown>;
}

export interface GatewayResponse {
  success: boolean;
  gateway: string;
  payment_method: "redirect" | "inline" | "modal" | "qr";
  redirect_url?: string;
  client_token?: string;
  transaction_ref: string;
  amount: number;
  currency: string;
  status?: string;
  error?: string;
  raw_response?: Record<string, unknown>;
}

export interface GatewayCredentials {
  [key: string]: string;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Fetch per-property credentials from integration_configs
 */
export async function fetchGatewayCredentials(
  supabase: any,
  propertyId: string,
): Promise<GatewayCredentials> {
  const { data, error } = await supabase
    .from("integration_configs")
    .select("config")
    .eq("property_id", propertyId)
    .eq("integration_type", "payment_credentials")
    .maybeSingle();

  if (error) {
    console.error("[GatewayContract] Error fetching credentials:", error);
    return {};
  }

  return (data?.config as GatewayCredentials) || {};
}

/**
 * Log a payment transaction
 */
export async function logPaymentTransaction(
  supabase: any,
  params: {
    booking_id: string;
    property_id?: string;
    amount: number;
    currency: string;
    payment_provider: string;
    payment_reference: string;
    status: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("payment_transactions").insert({
    booking_id: params.booking_id,
    property_id: params.property_id,
    amount: params.amount,
    currency: params.currency,
    payment_provider: params.payment_provider,
    payment_reference: params.payment_reference,
    status: params.status,
    metadata: params.metadata || {},
  });

  if (error) {
    console.error("[GatewayContract] Error logging transaction:", error);
  }
}

/**
 * Create a standardized error response
 */
export function gatewayErrorResponse(
  gateway: string,
  error: string,
  status = 400,
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      gateway,
      error,
      transaction_ref: "",
      amount: 0,
      currency: "",
    } satisfies GatewayResponse),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/**
 * Create a standardized success response
 */
export function gatewaySuccessResponse(data: GatewayResponse): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
