import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface FeatureFlags {
  // Boolean feature flags
  roomsonline_active: boolean;
  home_icon_open_new_tab: boolean;
  book_open_new_tab: boolean;
  // String flags
  benson_active_environment: string | null;
  // Public keys (publishable, not secrets)
  google_maps_api_key: string | null;
  google_recaptcha_site_key: string | null;
  // OAuth client IDs (needed in frontend for OAuth flows)
  hostfully_client_id: string | null;
}

const DEFAULT_FLAGS: FeatureFlags = {
  roomsonline_active: false,
  home_icon_open_new_tab: true,
  book_open_new_tab: true,
  benson_active_environment: null,
  google_maps_api_key: null,
  google_recaptcha_site_key: null,
  hostfully_client_id: null,
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async (): Promise<FeatureFlags> => {
      try {
        const { data, error } = await supabase.functions.invoke('get-feature-flags');
        
        if (error || !data?.success) {
          console.error('Feature flags error:', error || data?.error);
          return DEFAULT_FLAGS;
        }
        
        return {
          ...DEFAULT_FLAGS,
          ...data.data,
        };
      } catch (err) {
        console.error('Feature flags fetch failed:', err);
        return DEFAULT_FLAGS;
      }
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

// Convenience hooks for specific flags
export function useRoomsonlineActive() {
  const { data, isLoading } = useFeatureFlags();
  return { isActive: data?.roomsonline_active ?? false, isLoading };
}

export function useHomeIconOpenNewTab() {
  const { data, isLoading } = useFeatureFlags();
  return { openNewTab: data?.home_icon_open_new_tab ?? true, isLoading };
}

export function useBookOpenNewTab() {
  const { data, isLoading } = useFeatureFlags();
  return { openNewTab: data?.book_open_new_tab ?? true, isLoading };
}

export function useBensonActiveEnvironment() {
  const { data, isLoading } = useFeatureFlags();
  return { environment: data?.benson_active_environment ?? 'staging', isLoading };
}

export function useGoogleMapsApiKey() {
  const { data, isLoading, isFetched } = useFeatureFlags();
  return { 
    apiKey: data?.google_maps_api_key ?? null, 
    isLoading,
    isReady: isFetched && !isLoading 
  };
}

export function useRecaptchaSiteKey() {
  const { data, isLoading } = useFeatureFlags();
  return { siteKey: data?.google_recaptcha_site_key ?? null, isLoading };
}
