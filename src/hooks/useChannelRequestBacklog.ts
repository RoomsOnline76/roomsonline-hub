import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StuckChannelRequest {
  id: string;
  reservationId: string | null;
  channelListingId: string | null;
  propertyId: string | null;
  eventType: string | null;
  state: string;
  error: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  guestName: string | null;
}

const UNRESOLVED_STATES = ["retrying", "failed", "unmapped"];
/** Only channel events that represent a stay we may be missing. */
const STAY_EVENTS = ["reservation_request", "reservation_created", "reservation_modified"];

function guestFromEnvelope(rawXml: string | null): string | null {
  if (!rawXml) return null;
  const name = /<Name>([^<]+)<\/Name>/i.exec(rawXml)?.[1]?.trim();
  const surname = /<SurName>([^<]+)<\/SurName>/i.exec(rawXml)?.[1]?.trim();
  const joined = [name, surname].filter(Boolean).join(" ").trim();
  return joined || null;
}

/**
 * Channel reservation notifications that never turned into a stay.
 *
 * The channel sometimes cannot serve a request straight after its own callback, and an
 * unmapped listing can never resolve at all. Both cases used to fail silently — this
 * surfaces them so an operator can retry or fix the mapping.
 */
export function useChannelRequestBacklog(options: { propertyIds?: string[]; enabled?: boolean } = {}) {
  const { propertyIds, enabled = true } = options;
  const [items, setItems] = useState<StuckChannelRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const idsKey = useMemo(() => (propertyIds ? [...propertyIds].sort().join(",") : ""), [propertyIds]);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      let query = supabase
        .from("ru_notifications")
        .select("id, ru_reservation_id, ru_property_id, property_id, event_type, resolution_state, error_message, attempt_count, next_attempt_at, created_at, raw_xml")
        .in("resolution_state", UNRESOLVED_STATES)
        .in("event_type", STAY_EVENTS)
        .order("created_at", { ascending: false })
        .limit(50);

      const ids = idsKey.split(",").filter(Boolean);
      // An unresolved request often has no property yet, so property filtering has to keep
      // the unattributed ones visible — they are exactly the stays at risk of being lost.
      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || [])
        .filter((r) => !ids.length || !r.property_id || ids.includes(r.property_id))
        .map((r) => ({
          id: r.id as string,
          reservationId: r.ru_reservation_id ? String(r.ru_reservation_id) : null,
          channelListingId: r.ru_property_id ? String(r.ru_property_id) : null,
          propertyId: (r.property_id as string) || null,
          eventType: (r.event_type as string) || null,
          state: (r.resolution_state as string) || "failed",
          error: (r.error_message as string) || null,
          attempts: (r.attempt_count as number) ?? 0,
          nextAttemptAt: (r.next_attempt_at as string) || null,
          createdAt: r.created_at as string,
          guestName: guestFromEnvelope((r.raw_xml as string) || null),
        }));
      setItems(rows);
    } catch (e) {
      console.warn("[useChannelRequestBacklog] load failed", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, idsKey]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(
    async (notificationId: string) => {
      setRetryingId(notificationId);
      try {
        const { data, error } = await supabase.functions.invoke("ru-reservation-handler", {
          body: { notification_id: notificationId },
        });
        if (error) throw error;
        await load();
        return (data || {}) as { success?: boolean; outcome?: string; error?: string | null };
      } finally {
        setRetryingId(null);
      }
    },
    [load],
  );

  return { items, loading, retry, retryingId, reload: load };
}
