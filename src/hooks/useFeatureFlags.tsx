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
}

const DEFAULT_FLAGS: FeatureFlags = {
  roomsonline_active: false,
  home_icon_open_new_tab: true,
  book_open_new_tab: true,
  benson_active_environment: null,
  google_maps_api_key: null,
  google_recaptcha_site_key: null,
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async (): Promise<FeatureFlags> => {
      const { data, error } = await supabase.functions.invoke('get-feature-flags');
      
      if (error) {
        console.error('Failed to fetch feature flags:', error);
        throw error;
      }
      
      if (!data?.success) {
        console.error('Feature flags request failed:', data?.error);
        throw new Error(data?.error || 'Failed to fetch feature flags');
      }
      
      return {
        ...DEFAULT_FLAGS,
        ...data.data,
      };
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 2,
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
  const { data, isLoading } = useFeatureFlags();
  return { apiKey: data?.google_maps_api_key ?? null, isLoading };
}

export function useRecaptchaSiteKey() {
  const { data, isLoading } = useFeatureFlags();
  return { siteKey: data?.google_recaptcha_site_key ?? null, isLoading };
}
