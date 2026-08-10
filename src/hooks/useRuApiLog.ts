import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Durable channel-manager exchange log (`ru_api_log`).
 *
 * Channel certification requires that any API exchange — full request, full response and the
 * vendor's ResponseID — can be retrieved for a support case for at least 30 days. The list view
 * deliberately selects metadata only: property pushes can produce very large payloads, so the XML
 * bodies load on drill-in.
 */

export interface RuApiLogRow {
  id: string;
  created_at: string;
  action: string;
  parent_action: string | null;
  trace_id: string | null;
  direction: string;
  property_id: string | null;
  unit_id: string | null;
  ru_property_id: string | null;
  ru_owner_id: string | null;
  ru_user_id: string | null;
  response_id: string | null;
  status_id: string | null;
  status_message: string | null;
  http_status: number | null;
  success: boolean;
  elapsed_ms: number | null;
  error_message: string | null;
  request_bytes: number | null;
  response_bytes: number | null;
  endpoint: string | null;
}

export interface RuApiLogDetail extends RuApiLogRow {
  request_xml: string | null;
  response_xml: string | null;
  expires_at: string;
}

export type RuApiLogOutcome = "all" | "success" | "failure";

export interface RuApiLogFilters {
  propertyId: string;
  action: string;
  outcome: RuApiLogOutcome;
  /** Exact ResponseID lookup — the reference channel support asks for. */
  responseId: string;
  /** Rolling window in days; 0 keeps everything retained. */
  days: number;
}

export const DEFAULT_RU_API_LOG_FILTERS: RuApiLogFilters = {
  propertyId: "all",
  action: "all",
  outcome: "all",
  responseId: "",
  days: 7,
};

const LIST_COLUMNS =
  "id, created_at, action, parent_action, trace_id, direction, property_id, unit_id, ru_property_id, ru_owner_id, ru_user_id, response_id, status_id, status_message, http_status, success, elapsed_ms, error_message, request_bytes, response_bytes, endpoint";

const PAGE_SIZE = 100;

export function useRuApiLog(filters: RuApiLogFilters) {
  const [rows, setRows] = useState<RuApiLogRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("ru_api_log")
        .select(LIST_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      // A ResponseID lookup is a support escalation: it must never be narrowed by the other filters.
      const responseId = filters.responseId.trim();
      if (responseId) {
        query = query.ilike("response_id", `%${responseId}%`);
      } else {
        if (filters.propertyId !== "all") query = query.eq("property_id", filters.propertyId);
        if (filters.action !== "all") query = query.eq("action", filters.action);
        if (filters.outcome !== "all") query = query.eq("success", filters.outcome === "success");
        if (filters.days > 0) {
          const since = new Date(Date.now() - filters.days * 86_400_000).toISOString();
          query = query.gte("created_at", since);
        }
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      if (seq !== requestSeq.current) return;

      const list = (data ?? []) as RuApiLogRow[];
      setRows(list);
      setActions((prev) => {
        const merged = new Set([...prev, ...list.map((r) => r.action).filter(Boolean)]);
        return Array.from(merged).sort();
      });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "Could not load the exchange log");
      setRows([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters.propertyId, filters.action, filters.outcome, filters.responseId, filters.days]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Full payloads for one exchange, fetched only when a row is opened. */
  const loadDetail = useCallback(async (id: string): Promise<RuApiLogDetail | null> => {
    const { data, error: detailError } = await supabase
      .from("ru_api_log")
      .select(`${LIST_COLUMNS}, request_xml, response_xml, expires_at`)
      .eq("id", id)
      .maybeSingle();
    if (detailError) throw detailError;
    return (data as RuApiLogDetail | null) ?? null;
  }, []);

  const stats = useMemo(() => {
    const failures = rows.filter((r) => !r.success).length;
    const withResponseId = rows.filter((r) => !!r.response_id).length;
    const avgMs = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + (r.elapsed_ms ?? 0), 0) / rows.length)
      : 0;
    return { total: rows.length, failures, withResponseId, avgMs, truncated: rows.length >= PAGE_SIZE };
  }, [rows]);

  return { rows, actions, stats, loading, error, refresh: load, loadDetail };
}
