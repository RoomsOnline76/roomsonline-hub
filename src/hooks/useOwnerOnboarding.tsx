import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PendingCredential {
  id: string;
  system_type: string;
  sync_status: string;
  api_key: string | null;
  environment: string | null;
  external_account_name: string | null;
  available_listings: any[] | null;
}

interface UseOwnerOnboardingReturn {
  pendingCredentials: PendingCredential[];
  isLoading: boolean;
  showOnboarding: boolean;
  completeOnboarding: () => void;
  skipOnboarding: () => void;
  refreshCredentials: () => Promise<void>;
}

const SKIP_STORAGE_KEY = "rol_onboarding_skipped";

export function useOwnerOnboarding(): UseOwnerOnboardingReturn {
  const { user, isAdmin, isDev } = useAuth();
  const [pendingCredentials, setPendingCredentials] = useState<PendingCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Only show onboarding for regular users (not admins/devs)
  const isOwner = user && !isAdmin && !isDev;

  const fetchPendingCredentials = useCallback(async () => {
    if (!user?.id || !isOwner) {
      setPendingCredentials([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("owner_pms_credentials")
        .select("id, system_type, sync_status, api_key, environment, external_account_name, available_listings")
        .eq("owner_id", user.id)
        .in("sync_status", ["pending", "pending_key"])
        .eq("is_active", true);

      if (error) throw error;

      const pending = (data || []) as PendingCredential[];
      setPendingCredentials(pending);

      // Check if we should show onboarding
      const skipped = sessionStorage.getItem(SKIP_STORAGE_KEY);
      if (pending.length > 0 && !skipped) {
        setShowOnboarding(true);
      }
    } catch (err) {
      console.error("Failed to fetch pending credentials:", err);
      setPendingCredentials([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isOwner]);

  useEffect(() => {
    fetchPendingCredentials();
  }, [fetchPendingCredentials]);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    sessionStorage.removeItem(SKIP_STORAGE_KEY);
    // Refresh to clear any completed credentials
    fetchPendingCredentials();
  }, [fetchPendingCredentials]);

  const skipOnboarding = useCallback(() => {
    setShowOnboarding(false);
    sessionStorage.setItem(SKIP_STORAGE_KEY, "true");
  }, []);

  const refreshCredentials = useCallback(async () => {
    await fetchPendingCredentials();
  }, [fetchPendingCredentials]);

  return {
    pendingCredentials,
    isLoading,
    showOnboarding,
    completeOnboarding,
    skipOnboarding,
    refreshCredentials,
  };
}
