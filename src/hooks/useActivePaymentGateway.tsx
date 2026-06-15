import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaymentGateway =
  | "payfast" | "paygate" | "peach" | "yoco" | "ozow"
  | "dpo" | "addpay" | "payflex" | "stitch" | "ikhokha"
  | "snapscan" | "zapper" | "flutterwave" | "stripe"
  | "paypal" | "klarna" | "affirm";

interface ActiveGatewayResult {
  gateway: PaymentGateway;
  systemName: string;
  isLoading: boolean;
}

interface ActiveGatewaysResult {
  gateways: PaymentGateway[];
  systemName: string;
  isLoading: boolean;
}

// Map known system names to gateway keys
const GATEWAY_MAP: Record<string, PaymentGateway> = {
  paygate: "paygate",
  stripe: "stripe",
  paypal: "paypal",
  flutterwave: "flutterwave",
  peach: "peach",
  yoco: "yoco",
  ozow: "ozow",
  dpo: "dpo",
  addpay: "addpay",
  payflex: "payflex",
  stitch: "stitch",
  ikhokha: "ikhokha",
  snapscan: "snapscan",
  zapper: "zapper",
  klarna: "klarna",
  affirm: "affirm",
};

function isValidGateway(v: string): v is PaymentGateway {
  return v === "payfast" || v in GATEWAY_MAP;
}

/**
 * Resolves ALL active payment gateways for a property.
 *
 * Resolution order:
 * 1. property.payment_providers array (multi-select)
 * 2. property.payment_provider (legacy single)
 * 3. Global supporting_systems payment entry
 * 4. Default: ["payfast"]
 */
export function useActivePaymentGateways(propertyId?: string): ActiveGatewaysResult {
  const isUuid = !!propertyId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertyId);

  // Per-property providers (array + legacy single) + custom-provider gate
  const { data: propertyData, isLoading: propLoading } = useQuery({
    queryKey: ["property-payment-providers-hook", propertyId],
    queryFn: async () => {
      if (!propertyId || !isUuid) return null;
      const { data, error } = await supabase
        .from("properties")
        .select("payment_provider, payment_providers, allow_custom_payment_provider")
        .eq("id", propertyId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!propertyId && isUuid,
  });

  // Global fallback
  const { data: globalData, isLoading: globalLoading } = useQuery({
    queryKey: ["active-payment-gateway"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supporting_systems")
        .select("system_name, is_active")
        .eq("category", "payment")
        .eq("is_active", true)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = (!!propertyId && propLoading) || globalLoading;

  // 1. Check payment_providers array first
  const arr = (propertyData as any)?.payment_providers as string[] | null;
  if (arr && arr.length > 0) {
    const valid = arr.filter(isValidGateway) as PaymentGateway[];
    if (valid.length > 0) {
      return { gateways: valid, systemName: valid.join(", "), isLoading };
    }
  }

  // 2. Legacy single payment_provider
  const single = propertyData?.payment_provider;
  if (single && single !== "default" && isValidGateway(single)) {
    return { gateways: [single], systemName: single, isLoading };
  }

  // 3. Global fallback
  const systemName = globalData?.system_name || "PayFast Staging";
  const sysLower = systemName.toLowerCase();
  let resolvedGateway: PaymentGateway = "payfast";
  for (const [key, gw] of Object.entries(GATEWAY_MAP)) {
    if (sysLower.includes(key)) { resolvedGateway = gw; break; }
  }

  return { gateways: [resolvedGateway], systemName, isLoading };
}

/**
 * Legacy hook — returns only the FIRST active gateway.
 * Backward-compatible for code that expects a single gateway.
 */
export function useActivePaymentGateway(propertyId?: string): ActiveGatewayResult {
  const { gateways, systemName, isLoading } = useActivePaymentGateways(propertyId);
  return { gateway: gateways[0] || "payfast", systemName, isLoading };
}
