import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaymentGateway = "payfast" | "paygate";

interface ActiveGatewayResult {
  gateway: PaymentGateway;
  systemName: string;
  isLoading: boolean;
}

/**
 * Resolves which payment gateway is currently active from supporting_systems.
 * Only one payment system can be active at a time (enforced by DB trigger).
 * 
 * - If "PayGate" is active → returns "paygate" (redirect flow)
 * - If anything else (PayFast Staging/Production) is active → returns "payfast" (onsite modal)
 * - Default fallback: "payfast"
 */
export function useActivePaymentGateway(): ActiveGatewayResult {
  const { data, isLoading } = useQuery({
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
    staleTime: 5 * 60 * 1000, // Cache for 5 min
  });

  const systemName = data?.system_name || "PayFast Staging";
  const isPaygate = systemName.toLowerCase().includes("paygate");

  return {
    gateway: isPaygate ? "paygate" : "payfast",
    systemName,
    isLoading,
  };
}
