import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaymentGateway =
  | "payfast" | "paygate" | "peach" | "yoco" | "ozow"
  | "dpo" | "addpay" | "payflex" | "stitch" | "ikhokha"
  | "snapscan" | "zapper" | "flutterwave" | "stripe";

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

  // Global fallback
  const systemName = globalData?.system_name || "PayFast Staging";
  const isPaygate = systemName.toLowerCase().includes("paygate");

  return {
    gateway: isPaygate ? "paygate" : "payfast",
    systemName,
    isLoading,
  };
}
