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

/**
 * Resolves which payment gateway is currently active.
 *
 * Resolution order:
 * 1. If propertyId is provided, check properties.payment_provider
 * 2. Fall back to the global supporting_systems payment entry
 * 3. Default: "payfast"
 */
export function useActivePaymentGateway(propertyId?: string): ActiveGatewayResult {
  // Per-property override
  const { data: propertyProvider, isLoading: propLoading } = useQuery({
    queryKey: ["property-payment-provider", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("payment_provider")
        .eq("id", propertyId!)
        .single();
      if (error) return null;
      return data?.payment_provider || null;
    },
    enabled: !!propertyId,
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
      if (error) {
        console.error("[PaymentGateway] Error fetching active gateway:", error);
        return null;
      }
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = (!!propertyId && propLoading) || globalLoading;

  // If property has an explicit provider, use it
  if (propertyProvider && propertyProvider !== "default") {
    return {
      gateway: propertyProvider as PaymentGateway,
      systemName: propertyProvider,
      isLoading,
    };
  }

  // Global fallback — resolve from system_name
  const systemName = globalData?.system_name || "PayFast Staging";
  const sysLower = systemName.toLowerCase();

  // Map known system names to gateway keys
  const gatewayMap: Record<string, PaymentGateway> = {
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

  let resolvedGateway: PaymentGateway = "payfast";
  for (const [key, gw] of Object.entries(gatewayMap)) {
    if (sysLower.includes(key)) {
      resolvedGateway = gw;
      break;
    }
  }

  return {
    gateway: resolvedGateway,
    systemName,
    isLoading,
  };
}
