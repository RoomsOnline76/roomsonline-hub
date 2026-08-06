import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CrmAccountType } from "@/lib/crmSegmentation";

export interface CrmAccount {
  id: string;
  portfolio_id: string | null;
  property_id: string | null;
  account_type: CrmAccountType;
  name: string;
  contact_title: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  vat_number: string | null;
  registration_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  default_commission_rate: number | null;
  payment_terms_days: number | null;
  is_credit_account: boolean;
  currency: string | null;
  tags: string[] | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CrmBooker {
  id: string;
  portfolio_id: string | null;
  property_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  account_id: string | null;
  notes: string | null;
}

export interface CrmAccountStats {
  account_id: string;
  booking_count: number;
  room_nights: number;
  total_revenue: number;
  last_booking_date: string | null;
}

export interface CrmScope {
  propertyId: string | null | undefined;
  portfolioIds?: string[];
}

const ACCOUNT_COLUMNS =
  "id, portfolio_id, property_id, account_type, name, contact_title, contact_first_name, contact_last_name, email, phone, website, vat_number, registration_number, address_line1, address_line2, city, postal_code, country, default_commission_rate, payment_terms_days, is_credit_account, currency, tags, notes, is_active, created_at";

/**
 * Builds the `or(...)` filter so a record is visible when it belongs to any
 * portfolio the current property is a member of, or directly to the property.
 */
function scopeFilter({ propertyId, portfolioIds }: CrmScope): string | null {
  const parts: string[] = [];
  if (portfolioIds?.length) parts.push(`portfolio_id.in.(${portfolioIds.join(",")})`);
  if (propertyId) parts.push(`property_id.eq.${propertyId}`);
  return parts.length ? parts.join(",") : null;
}

/**
 * Portfolio-wide CRM accounts (companies, travel agents, tour operators,
 * sources) plus bookers. Records are shared across every property in the
 * portfolio so an owner maintains one profile, not one per property.
 */
export function useCrmAccounts(scope: CrmScope) {
  const queryClient = useQueryClient();
  const { propertyId, portfolioIds } = scope;
  const filter = useMemo(() => scopeFilter(scope), [propertyId, portfolioIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const enabled = !!filter;

  const accountsQuery = useQuery({
    queryKey: ["crm-accounts", filter],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CrmAccount[]> => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select(ACCOUNT_COLUMNS)
        .or(filter as string)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as CrmAccount[];
    },
  });

  const bookersQuery = useQuery({
    queryKey: ["crm-bookers", filter],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CrmBooker[]> => {
      const { data, error } = await supabase
        .from("crm_bookers")
        .select("id, portfolio_id, property_id, full_name, email, phone, account_id, notes")
        .or(filter as string)
        .order("full_name");
      if (error) throw error;
      return (data || []) as unknown as CrmBooker[];
    },
  });

  const statsQuery = useQuery({
    queryKey: ["crm-account-stats", filter],
    enabled: enabled && !!accountsQuery.data?.length,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, CrmAccountStats>> => {
      const ids = (accountsQuery.data || []).map((a) => a.id);
      if (!ids.length) return {};
      const { data, error } = await supabase
        .from("crm_account_stats")
        .select("account_id, booking_count, room_nights, total_revenue, last_booking_date")
        .in("account_id", ids);
      if (error) throw error;
      const map: Record<string, CrmAccountStats> = {};
      for (const row of (data || []) as unknown as CrmAccountStats[]) {
        map[row.account_id] = {
          ...row,
          booking_count: Number(row.booking_count) || 0,
          room_nights: Number(row.room_nights) || 0,
          total_revenue: Number(row.total_revenue) || 0,
        };
      }
      return map;
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["crm-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["crm-bookers"] });
    queryClient.invalidateQueries({ queryKey: ["crm-account-stats"] });
  }, [queryClient]);

  /** New records prefer the portfolio scope so siblings inherit them. */
  const defaultScopeColumns = useMemo(
    () =>
      portfolioIds?.length
        ? { portfolio_id: portfolioIds[0], property_id: null as string | null }
        : { portfolio_id: null as string | null, property_id: propertyId || null },
    [portfolioIds?.join(","), propertyId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const saveAccount = useCallback(
    async (values: Partial<CrmAccount> & { name: string }) => {
      const { id, created_at, ...rest } = values as Record<string, unknown> & { id?: string };
      const payload = id ? rest : { ...defaultScopeColumns, ...rest };
      const query = id
        ? supabase.from("crm_accounts").update(payload as never).eq("id", id).select("id").single()
        : supabase.from("crm_accounts").insert(payload as never).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      invalidate();
      return (data as { id: string }).id;
    },
    [defaultScopeColumns, invalidate],
  );

  const saveBooker = useCallback(
    async (values: Partial<CrmBooker> & { full_name: string }) => {
      const { id, ...rest } = values as Record<string, unknown> & { id?: string };
      const payload = id ? rest : { ...defaultScopeColumns, ...rest };
      const query = id
        ? supabase.from("crm_bookers").update(payload as never).eq("id", id).select("id").single()
        : supabase.from("crm_bookers").insert(payload as never).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      invalidate();
      return (data as { id: string }).id;
    },
    [defaultScopeColumns, invalidate],
  );

  const archiveAccount = useCallback(
    async (id: string, isActive: boolean) => {
      const { error } = await supabase
        .from("crm_accounts")
        .update({ is_active: isActive } as never)
        .eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const accounts = accountsQuery.data || [];

  return {
    accounts,
    activeAccounts: useMemo(() => accounts.filter((a) => a.is_active), [accounts]),
    bookers: bookersQuery.data || [],
    stats: statsQuery.data || {},
    loading: accountsQuery.isLoading || bookersQuery.isLoading,
    error: (accountsQuery.error || bookersQuery.error) as Error | null,
    isPortfolioScoped: !!portfolioIds?.length,
    saveAccount,
    saveBooker,
    archiveAccount,
    refresh: invalidate,
  };
}

/**
 * Resolves the CRM scope (portfolio ids + property) for a single property, for
 * components that only know the booking's property.
 */
export function useCrmScopeForProperty(propertyId: string | null | undefined): CrmScope {
  const { data } = useQuery({
    queryKey: ["crm-scope-portfolios", propertyId],
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("property_portfolio_members")
        .select("portfolio_id")
        .eq("property_id", propertyId as string);
      if (error) throw error;
      return (data || []).map((r) => (r as { portfolio_id: string }).portfolio_id).filter(Boolean);
    },
  });
  return { propertyId, portfolioIds: data || [] };
}
