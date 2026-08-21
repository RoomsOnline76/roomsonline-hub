import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/functionError";

/**
 * HubSpot CRM add-on — read surfaces for the ROL'OS operator UI.
 *
 * HubSpot is a CRM adapter only: every call here goes through the isolated
 * `hubspot-api` edge function, and nothing in this file is allowed to become a
 * dependency of the native guest messaging dispatcher, bookings or the
 * calendar. When the add-on is off or unhealthy these hooks simply return
 * nothing and the surfaces that consume them disappear.
 */

export interface HubspotStatus {
  enabled: boolean;
  connected: boolean;
  portalId: string | null;
  syncStatus: "pending" | "ok" | "error";
  lastSyncAt: string | null;
  lastError: string | null;
  /** Properties opted into optional message logging (default: none). */
  messageLogProperties: string[];
}

export interface HubspotMetrics {
  contacts_total: number | null;
  open_deals: number | null;
  guests_with_email: number;
  linked_guests: number | null;
  properties: number;
  portal_id: string | null;
  last_sync_at: string | null;
}

export interface HubspotContactSummary {
  linked: boolean;
  portal_id: string | null;
  contact_id?: string;
  email?: string;
  name?: string | null;
  lifecycle_stage?: string | null;
  lead_status?: string | null;
  rol_lifecycle?: string | null;
  trade_or_direct?: string | null;
  owner_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  timeline?: Array<{ id: string; body: string; at: string | null }>;
  deals?: Array<{
    id: string;
    name: string | null;
    stage: string | null;
    amount: string | null;
    closed: boolean;
  }>;
}

export interface HubspotSyncLogEntry {
  id: string;
  event: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  property_id: string | null;
}

type Action =
  | "get_status"
  | "get_metrics"
  | "get_contact_summary"
  | "get_sync_log"
  | "set_message_logging"
  | "log_message_event"
  | "sync_owner"
  | "test_connection";

/** Single transport for the isolated function. Returns the `data` envelope. */
export async function callHubspot<T>(action: Action, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("hubspot-api", {
    body: { action, ...payload },
  });
  if (error) throw new Error(await extractFunctionError(error, "HubSpot request failed"));
  const result = (data ?? {}) as { success?: boolean; data?: T; error?: string };
  if (result.success === false) throw new Error(result.error || "HubSpot request failed");
  return (result.data ?? ({} as T)) as T;
}

const STATUS_KEY = ["hubspot", "status"] as const;

interface RawStatus {
  enabled?: boolean;
  connected?: boolean;
  portal_id?: string | null;
  sync_status?: string;
  last_sync_at?: string | null;
  last_error?: string | null;
  message_log_properties?: string[];
}

/** Connection status — the single cached entry every HubSpot surface reads. */
export function useHubspotStatus() {
  return useQuery<HubspotStatus>({
    queryKey: STATUS_KEY,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const raw = await callHubspot<RawStatus>("get_status");
      return {
        enabled: raw.enabled ?? false,
        connected: raw.connected ?? false,
        portalId: raw.portal_id ?? null,
        syncStatus: (raw.sync_status as HubspotStatus["syncStatus"]) ?? "pending",
        lastSyncAt: raw.last_sync_at ?? null,
        lastError: raw.last_error ?? null,
        messageLogProperties: raw.message_log_properties ?? [],
      };
    },
  });
}

export interface HubspotCapability {
  /** The CRM surface (menu entry, page, panels) may be shown. */
  available: boolean;
  /** Connected, enabled and last sync did not fail. */
  healthy: boolean;
  status: HubspotStatus | undefined;
  loading: boolean;
}

/**
 * Capability check used to gate the CRM menu item and the Guests panel.
 * Properties whose owner never connected HubSpot never see any of it.
 */
export function useHubspotCapability(): HubspotCapability {
  const { data, isLoading } = useHubspotStatus();
  const available = Boolean(data?.enabled && data?.connected);
  return {
    available,
    healthy: available && data?.syncStatus !== "error",
    status: data,
    loading: isLoading,
  };
}

export function useHubspotMetrics(enabled: boolean) {
  return useQuery<HubspotMetrics>({
    queryKey: ["hubspot", "metrics"],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => callHubspot<HubspotMetrics>("get_metrics"),
  });
}

export function useHubspotSyncLog(enabled: boolean) {
  return useQuery<HubspotSyncLogEntry[]>({
    queryKey: ["hubspot", "sync-log"],
    enabled,
    staleTime: 2 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await callHubspot<{ entries?: HubspotSyncLogEntry[] }>("get_sync_log", { limit: 25 });
      return res.entries ?? [];
    },
  });
}

/** Read-only enrichment for one guest. Never blocks the Guests page. */
export function useHubspotContactSummary(email: string | null | undefined, enabled: boolean) {
  const clean = (email || "").trim();
  return useQuery<HubspotContactSummary>({
    queryKey: ["hubspot", "contact", clean.toLowerCase()],
    enabled: enabled && clean.length > 3,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () => callHubspot<HubspotContactSummary>("get_contact_summary", { email: clean }),
  });
}

export function useHubspotActions() {
  const qc = useQueryClient();
  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["hubspot"] });
  }, [qc]);

  const forceSync = useMutation({
    mutationFn: () => callHubspot<{ synced?: boolean; contacts?: number; deals?: number }>("sync_owner"),
    onSuccess: invalidate,
  });

  const testConnection = useMutation({
    mutationFn: () => callHubspot<{ test_ok?: boolean; message?: string }>("test_connection"),
    onSuccess: invalidate,
  });

  const setMessageLogging = useMutation({
    mutationFn: (vars: { propertyId: string; enabled: boolean }) =>
      callHubspot<{ message_log_properties?: string[] }>("set_message_logging", {
        message_logging: { property_id: vars.propertyId, enabled: vars.enabled },
      }),
    onSuccess: invalidate,
  });

  return { forceSync, testConnection, setMessageLogging };
}

/**
 * Fire-and-forget projection of an ALREADY DELIVERED native message.
 * Never awaited by the messaging dispatcher and never surfaces an error.
 */
export function logMessageToHubspot(event: {
  email: string;
  propertyId?: string | null;
  event?: string;
  subject?: string;
  body?: string;
  /** Explicit operator opt-in — bypasses the per-property default-off flag. */
  force?: boolean;
}): void {
  void (async () => {
    try {
      await callHubspot("log_message_event", {
        message_event: {
          email: event.email,
          property_id: event.propertyId || undefined,
          event: event.event,
          subject: event.subject,
          body: event.body,
          force: event.force,
        },
      });
    } catch (err) {
      console.debug("[hubspot] message log skipped:", err);
    }
  })();
}

/** Portal deep links — contacts list, one contact, one deal. */
export function hubspotUrl(portalId: string | null | undefined, path = ""): string {
  return portalId ? `https://app.hubspot.com/contacts/${portalId}${path}` : "https://app.hubspot.com";
}
