import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PortfolioPaymentConfig {
  id: string;
  portfolio_id: string;
  allow_custom_payment_provider: boolean;
  payment_providers: string[];
  credentials: Record<string, string>;
}

/** Reads the portfolio-level payment provider config (source of truth for member properties). */
export function usePortfolioPaymentConfig(portfolioId?: string | null) {
  return useQuery({
    queryKey: ["portfolio-payment-config", portfolioId],
    queryFn: async (): Promise<PortfolioPaymentConfig | null> => {
      if (!portfolioId) return null;
      const { data, error } = await supabase
        .from("portfolio_payment_configs" as any)
        .select("*")
        .eq("portfolio_id", portfolioId)
        .maybeSingle();
      if (error) return null;
      return (data as unknown as PortfolioPaymentConfig) || null;
    },
    enabled: !!portfolioId,
    staleTime: 30 * 1000,
  });
}

export interface PropertyPortfolioPaymentContext {
  portfolioId: string | null;
  portfolioName: string | null;
  config: PortfolioPaymentConfig | null;
  /** True when this property is in a portfolio that manages payment providers and the property is not overriding. */
  inherits: boolean;
  isOverriding: boolean;
  isLoading: boolean;
}

/**
 * Resolves whether a property inherits its payment provider setup from a portfolio.
 */
export function usePropertyPortfolioPayment(propertyId?: string | null): PropertyPortfolioPaymentContext {
  const isUuid =
    !!propertyId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertyId);

  const { data, isLoading } = useQuery({
    queryKey: ["property-portfolio-payment-context", propertyId],
    queryFn: async () => {
      if (!propertyId || !isUuid) return null;

      const [{ data: member }, { data: prop }] = await Promise.all([
        supabase
          .from("property_portfolio_members" as any)
          .select("portfolio_id, property_portfolios(id, name)")
          .eq("property_id", propertyId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("properties")
          .select("payment_provider_override")
          .eq("id", propertyId)
          .maybeSingle(),
      ]);

      const portfolioId = (member as any)?.portfolio_id ?? null;
      const portfolioName = (member as any)?.property_portfolios?.name ?? null;

      let config: PortfolioPaymentConfig | null = null;
      if (portfolioId) {
        const { data: cfg } = await supabase
          .from("portfolio_payment_configs" as any)
          .select("*")
          .eq("portfolio_id", portfolioId)
          .maybeSingle();
        config = (cfg as unknown as PortfolioPaymentConfig) || null;
      }

      return {
        portfolioId,
        portfolioName,
        config,
        isOverriding: !!(prop as any)?.payment_provider_override,
      };
    },
    enabled: !!propertyId && isUuid,
    staleTime: 30 * 1000,
  });

  return {
    portfolioId: data?.portfolioId ?? null,
    portfolioName: data?.portfolioName ?? null,
    config: data?.config ?? null,
    isOverriding: !!data?.isOverriding,
    inherits: !!data?.config && !data?.isOverriding,
    isLoading,
  };
}
