import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_DOMAIN } from "@/lib/config";

export interface WhitelabelState {
  /** True when the property's billing tier allows white-label integrations. */
  enabled: boolean;
  /** Optional custom subdomain (e.g. `book.mylodge.com`) the property has configured. */
  domain: string | null;
  /** DNS + TLS lifecycle status for the domain. */
  domainStatus: "unconfigured" | "pending" | "pending_ssl" | "active" | "failed" | "dns_ok_tls_pending";
  /**
   * The host to use in generated integration URLs.
   * Falls back to `PUBLIC_DOMAIN` when no custom domain is Active.
   */
  host: string;
  /** True when the active domain was inherited from a parent portfolio. */
  inherited?: boolean;
  /** Portfolio id that provided the inherited domain (when inherited=true). */
  inheritedFromPortfolioId?: string | null;
  /** Last verifier error, if any. */
  lastError?: string | null;
}


const DEFAULT: WhitelabelState = {
  enabled: false,
  domain: null,
  domainStatus: "unconfigured",
  host: PUBLIC_DOMAIN,
};

/**
 * Reads the white-label configuration for a property. Own configuration on
 * `property_billing_configs` wins; when the property has no verified domain,
 * we inherit an active domain from any portfolio the property belongs to so
 * every integration (Smart Button, embed, portfolio widget, …) uses the same
 * white-label host across the whole portfolio.
 */
export function useWhitelabel(propertyId: string | undefined) {
  const q = useQuery({
    queryKey: ["whitelabel", propertyId],
    queryFn: async (): Promise<WhitelabelState> => {
      if (!propertyId) return DEFAULT;

      const { data: pbc } = await supabase
        .from("property_billing_configs")
        .select("white_label_allowed, white_label_domain, white_label_domain_status, white_label_domain_last_error")
        .eq("property_id", propertyId)
        .maybeSingle();

      const enabled = !!pbc?.white_label_allowed;
      const ownStatus = ((pbc as any)?.white_label_domain_status || "unconfigured") as WhitelabelState["domainStatus"];
      const ownDomain = (((pbc as any)?.white_label_domain || "") as string).trim() || null;
      const ownError = ((pbc as any)?.white_label_domain_last_error as string | null) ?? null;
      const ownActive = ownStatus === "active" && !!ownDomain;

      if (ownActive) {
        return {
          enabled,
          domain: ownDomain,
          domainStatus: ownStatus,
          host: `https://${ownDomain}`,
          lastError: ownError,
        };
      }

      // Fall back to any portfolio the property belongs to
      const { data: memberships } = await supabase
        .from("property_portfolio_members" as any)
        .select("portfolio_id, property_portfolios:portfolio_id(id, white_label_domain, white_label_domain_status)")
        .eq("property_id", propertyId);

      const inheritedRow = (memberships as any[] | null)
        ?.map((m) => m.property_portfolios)
        .find((p) => p && p.white_label_domain_status === "active" && p.white_label_domain);

      if (inheritedRow) {
        const dom = String(inheritedRow.white_label_domain).trim();
        return {
          enabled,
          domain: dom,
          domainStatus: "active",
          host: `https://${dom}`,
          inherited: true,
          inheritedFromPortfolioId: inheritedRow.id,
        };
      }

      return {
        enabled,
        domain: ownDomain,
        domainStatus: ownStatus,
        host: PUBLIC_DOMAIN,
        lastError: ownError,
      };
    },

    enabled: !!propertyId,
    staleTime: 60_000,
  });

  return q.data ?? DEFAULT;
}

export interface PortfolioWhitelabelState {
  domain: string | null;
  domainStatus: "unconfigured" | "pending" | "active" | "failed" | "dns_ok_tls_pending";
  host: string;
  lastError?: string | null;
}

const PORTFOLIO_DEFAULT: PortfolioWhitelabelState = {
  domain: null,
  domainStatus: "unconfigured",
  host: PUBLIC_DOMAIN,
};

/** Reads the white-label domain configured directly on a portfolio. */
export function usePortfolioWhitelabel(portfolioId: string | undefined) {
  const q = useQuery({
    queryKey: ["whitelabel-portfolio", portfolioId],
    queryFn: async (): Promise<PortfolioWhitelabelState> => {
      if (!portfolioId) return PORTFOLIO_DEFAULT;
      const { data } = await supabase
        .from("property_portfolios")
        .select("white_label_domain, white_label_domain_status, white_label_domain_last_error")
        .eq("id", portfolioId)
        .maybeSingle();
      const status = ((data as any)?.white_label_domain_status || "unconfigured") as PortfolioWhitelabelState["domainStatus"];
      const domain = (((data as any)?.white_label_domain || "") as string).trim() || null;
      const lastError = ((data as any)?.white_label_domain_last_error as string | null) ?? null;
      const active = status === "active" && !!domain;
      return {
        domain,
        domainStatus: status,
        host: active ? `https://${domain}` : PUBLIC_DOMAIN,
        lastError,
      };
    },
    enabled: !!portfolioId,
    staleTime: 60_000,
  });
  return q.data ?? PORTFOLIO_DEFAULT;
}

