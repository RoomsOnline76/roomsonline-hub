import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_DOMAIN } from "@/lib/config";

export interface WhitelabelState {
  /** True when the property's billing tier allows white-label integrations. */
  enabled: boolean;
  /** Optional custom subdomain (e.g. `book.mylodge.com`) the property has configured. */
  domain: string | null;
  /** DNS verification status for the domain. */
  domainStatus: "unconfigured" | "pending" | "active" | "failed";
  /**
   * The host to use in generated integration URLs.
   * Falls back to `PUBLIC_DOMAIN` when no custom domain is Active.
   */
  host: string;
}

const DEFAULT: WhitelabelState = {
  enabled: false,
  domain: null,
  domainStatus: "unconfigured",
  host: PUBLIC_DOMAIN,
};

/**
 * Reads the white-label configuration for a property from `property_billing_configs`.
 * When `white_label_allowed` is true integration cards should switch to the WL
 * variants (hidden ROL chrome, `wl=1` embed param, and — if the domain is
 * Active — the property's own host).
 */
export function useWhitelabel(propertyId: string | undefined) {
  const q = useQuery({
    queryKey: ["whitelabel", propertyId],
    queryFn: async (): Promise<WhitelabelState> => {
      if (!propertyId) return DEFAULT;
      const { data } = await supabase
        .from("property_billing_configs")
        .select("white_label_allowed, white_label_domain, white_label_domain_status")
        .eq("property_id", propertyId)
        .maybeSingle();

      if (!data) return DEFAULT;
      const status = (data as any).white_label_domain_status || "unconfigured";
      const domain = ((data as any).white_label_domain || "").trim() || null;
      const useCustom = status === "active" && !!domain;
      return {
        enabled: !!data.white_label_allowed,
        domain,
        domainStatus: status,
        host: useCustom ? `https://${domain}` : PUBLIC_DOMAIN,
      };
    },
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  return q.data ?? DEFAULT;
}
