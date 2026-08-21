import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface FeatureFlags {
  // Boolean feature flags
  roomsonline_active: boolean;
  home_icon_open_new_tab: boolean;
  book_open_new_tab: boolean;
  ai_concierge_enabled: boolean;
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
  ai_concierge_enabled: false,
  benson_active_environment: null,
  google_maps_api_key: null,
  google_recaptcha_site_key: null,
  hostfully_client_id: null,
};

const FLAGS_CACHE_KEY = "rolos.feature_flags.v2";
const FLAGS_CACHE_MAX_AGE_MS = 1000 * 60 * 30;

// Publishable keys must never be seeded from cache: a rotated/reconfigured key
// (e.g. a reCAPTCHA site key whose domain list changed) would otherwise keep
// being mounted from a stale tab and fail with "Invalid domain for site key".
const NON_CACHEABLE_KEYS = [
  "google_maps_api_key",
  "google_recaptcha_site_key",
  "hostfully_client_id",
] as const;

function readCachedFlags(): FeatureFlags | undefined {
  try {
    // Drop any pre-versioning cache so stale keys can't survive.
    sessionStorage.removeItem("rolos.feature_flags");
    const raw = sessionStorage.getItem(FLAGS_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { cachedAt?: number; flags?: Partial<FeatureFlags> };
    if (!parsed?.flags || typeof parsed.cachedAt !== "number") return undefined;
    if (Date.now() - parsed.cachedAt > FLAGS_CACHE_MAX_AGE_MS) return undefined;
    const flags = { ...DEFAULT_FLAGS, ...parsed.flags };
    for (const key of NON_CACHEABLE_KEYS) flags[key] = null;
    return flags;
  } catch {
    return undefined;
  }
}


export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async (): Promise<FeatureFlags> => {
      try {
        const { data, error } = await supabase.functions.invoke('get-feature-flags');
        
        if (error || !data?.success) {
          console.error('Feature flags error:', error || data?.error);
          return readCachedFlags() ?? DEFAULT_FLAGS;
        }
        
        const flags = { ...DEFAULT_FLAGS, ...data.data };
        try {
          sessionStorage.setItem(
            FLAGS_CACHE_KEY,
            JSON.stringify({ cachedAt: Date.now(), flags }),
          );
        } catch {
          /* best-effort cache only */
        }

        return flags;
      } catch (err) {
        console.error('Feature flags fetch failed:', err);
        return readCachedFlags() ?? DEFAULT_FLAGS;
      }
    },
    // Paint immediately from the last known flags; a cold edge function then
    // refreshes them in the background instead of gating the first render.
    initialData: readCachedFlags,
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

export function useAIConciergeEnabled() {
  const { data, isLoading } = useFeatureFlags();
  return { enabled: data?.ai_concierge_enabled ?? false, isLoading };
}
