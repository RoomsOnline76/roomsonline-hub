import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RuWhiteLabelTokens {
  subUserAccessToken: string;
  subUserRefreshToken: string;
  ruOwnerId: string;
}

interface TokenResponse {
  available?: boolean;
  owner_id?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  reason?: string | null;
  message?: string | null;
  error?: string | null;
  /** True when the RU sub-user is connected and verified (setup is NOT the blocker). */
  sub_user_verified?: boolean | null;
}


/**
 * Resolves the Rentals United White Label Channel Manager token pair for a property's
 * RU sub-user account. Tokens are minted server-side (`ru-whitelabel-token`) and are
 * refetched shortly before they expire so the embedded client never boots on a lapsed
 * token.
 */
export function useRuWhiteLabelTokens(propertyId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["ru-whitelabel-tokens", propertyId],
    enabled: !!propertyId,
    // The pair is short-lived; never persist it beyond the live page.
    gcTime: 0,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<TokenResponse>("ru-whitelabel-token", {
        body: { action: "get_tokens", property_id: propertyId },
      });
      if (error) throw error;
      return (data ?? {}) as TokenResponse;
    },
  });

  const data = query.data;
  const tokens: RuWhiteLabelTokens | null =
    data?.available && data.access_token && data.refresh_token && data.owner_id
      ? {
          subUserAccessToken: data.access_token,
          subUserRefreshToken: data.refresh_token,
          ruOwnerId: String(data.owner_id),
        }
      : null;

  return {
    tokens,
    isLoading: query.isLoading,
    isUnavailable: !query.isLoading && !query.isError && !tokens,
    reason: data?.reason ?? (query.isError ? "request_failed" : null),
    subUserVerified: data?.sub_user_verified === true,
    message: data?.message ?? (query.error instanceof Error ? query.error.message : null),
    refetch: query.refetch,
  };
}

