import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the admin-controlled flag that decides whether a property may
 * configure its own payment provider. When false, the Rooms Online
 * default PayFast gateway is used.
 */
export function usePropertyAllowsCustomPayment(propertyId?: string | null) {
  const isUuid =
    !!propertyId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertyId);

  const { data, isLoading } = useQuery({
    queryKey: ["property-allow-custom-payment", propertyId],
    queryFn: async () => {
      if (!propertyId || !isUuid) return null;
      const { data, error } = await supabase
        .from("properties")
        .select("allow_custom_payment_provider")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!propertyId && isUuid,
    staleTime: 60 * 1000,
  });

  return {
    allowed: !!(data as { allow_custom_payment_provider?: boolean } | null)
      ?.allow_custom_payment_provider,
    isLoading,
  };
}
