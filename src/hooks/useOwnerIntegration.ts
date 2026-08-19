import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/functionError";

export interface OwnerIntegrationStatus {
  service: string;
  enabled: boolean;
  connected: boolean;
  portalId: string | null;
  syncStatus: "pending" | "ok" | "error";
  lastSyncAt: string | null;
  lastError: string | null;
}

interface RawStatus {
  service?: string;
  enabled?: boolean;
  connected?: boolean;
  portal_id?: string | null;
  sync_status?: string;
  last_sync_at?: string | null;
  last_error?: string | null;
}

const normalise = (raw: RawStatus | null | undefined): OwnerIntegrationStatus => ({
  service: raw?.service ?? "hubspot",
  enabled: raw?.enabled ?? false,
  connected: raw?.connected ?? false,
  portalId: raw?.portal_id ?? null,
  syncStatus: (raw?.sync_status as OwnerIntegrationStatus["syncStatus"]) ?? "pending",
  lastSyncAt: raw?.last_sync_at ?? null,
  lastError: raw?.last_error ?? null,
});

type Action =
  | "get_status"
  | "save_credentials"
  | "set_enabled"
  | "disconnect"
  | "test_connection"
  | "sync_owner";

interface CallPayload {
  portal_id?: string;
  access_token?: string;
  enabled?: boolean;
}

/**
 * Owner-scoped add-on service state (HubSpot for v1). Every call goes through
 * the isolated `hubspot-api` edge function — tokens never round-trip to the
 * client, and nothing here touches PMS, calendar or booking state.
 */
export function useOwnerIntegration(service: "hubspot" = "hubspot") {
  const [status, setStatus] = useState<OwnerIntegrationStatus>(normalise(null));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Action | null>(null);

  const call = useCallback(
    async (action: Action, payload: CallPayload = {}) => {
      setBusy(action);
      try {
        const { data, error } = await supabase.functions.invoke("hubspot-api", {
          body: { action, ...payload },
        });
        if (error) throw new Error(await extractFunctionError(error, "Request failed"));
        const result = (data ?? {}) as { success?: boolean; data?: RawStatus & Record<string, unknown>; error?: string };
        if (result.success === false) throw new Error(result.error || "Request failed");
        if (result.data && ("enabled" in result.data || "connected" in result.data)) {
          setStatus(normalise(result.data));
        }
        return result.data ?? {};
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await call("get_status");
    } catch {
      setStatus(normalise(null));
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void refresh();
  }, [refresh, service]);

  return { status, loading, busy, call, refresh };
}
