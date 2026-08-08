import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  normalisePaymentMode,
  extractBankingDetails,
  type PaymentMode,
  type PropertyBankingDetails,
} from "@/lib/paymentMode";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PaymentModeResult {
  mode: PaymentMode;
  isReservationOnly: boolean;
  banking: PropertyBankingDetails | null;
  isLoading: boolean;
}

/**
 * Resolves how a property handles payment at checkout. Reservation-only
 * properties never see a gateway — the guest reserves and pays the property
 * directly by bank transfer.
 */
export function usePropertyPaymentMode(propertyId?: string | null): PaymentModeResult {
  const isUuid = !!propertyId && UUID_RE.test(propertyId);

  const { data, isLoading } = useQuery({
    queryKey: ["property-payment-mode", propertyId],
    queryFn: async () => {
      if (!propertyId || !isUuid) return null;
      const { data, error } = await supabase
        .from("properties")
        .select("payment_mode, allow_custom_payment_provider, amenities")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!propertyId && isUuid,
    staleTime: 60 * 1000,
  });

  const row = data as
    | { payment_mode?: string | null; allow_custom_payment_provider?: boolean | null; amenities?: unknown }
    | null;

  const mode = normalisePaymentMode(row?.payment_mode, row?.allow_custom_payment_provider);

  return {
    mode,
    isReservationOnly: mode === "reservation_only",
    banking: extractBankingDetails(row?.amenities),
    isLoading,
  };
}
