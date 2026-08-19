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
  /** Property id, "all", or "account" for account-level calls with no property. */
  propertyId: string;
  action: string;
  /** High-level ROL'OS operation (`parent_action`), e.g. channel-cleanup:delete. */
  operation: string;
  /** "all" | "outbound" | "inbound" — inbound rows are channel notifications posted to us. */
  direction: string;
  /** Channel account (RU OwnerID) that the exchange was authenticated against. */
  ownerId: string;
  outcome: RuApiLogOutcome;
  /**
   * Free-text lookup across the whole retained window: a channel method name
   * (`Push_CancelReservation_RQ`, or just `cancel`), a ResponseID, a trace id or an error message.
   * Support escalations must never be narrowed by the other filters, so this wins on its own.
   */
  search: string;
  /** Scope to the reservation/booking verbs in one click. */
  bookingsOnly: boolean;
  /** Rolling window in days; 0 keeps everything retained. */
  days: number;
}

/** The channel verbs (and inbound notifications) that carry booking traffic. */
export const RU_BOOKING_ACTIONS = [
  "Push_PutConfirmedReservationMulti_RQ",
  "Push_CancelReservation_RQ",
  "Push_RejectRequest_RQ",
  "Push_ModifyStay_RQ",
  "Pull_ListReservations_RQ",
  "Pull_GetReservationByID_RQ",
  "Pull_GetLeads_RQ",
  "RLNM_ReservationRequest",
  "RLNM_ReservationConfirmed",
  "RLNM_ReservationCancelled",
  "RLNM_ReservationModified",
];

export const DEFAULT_RU_API_LOG_FILTERS: RuApiLogFilters = {
  propertyId: "all",
  direction: "all",
  action: "all",
  operation: "all",
  ownerId: "all",
  outcome: "all",
  search: "",
  bookingsOnly: false,
  days: 7,
};


const LIST_COLUMNS =
  "id, created_at, action, parent_action, trace_id, direction, property_id, unit_id, ru_property_id, ru_owner_id, ru_user_id, response_id, status_id, status_message, http_status, success, elapsed_ms, error_message, request_bytes, response_bytes, endpoint";

const PAGE_SIZE = 100;

export function useRuApiLog(filters: RuApiLogFilters) {
  const [rows, setRows] = useState<RuApiLogRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  /** Applies the active filters to a query builder so list and count stay in sync. */
  const applyFilters = useCallback(
    (query: any) => {
      // A method / ResponseID / trace lookup is a support escalation: it must never be narrowed
      // by the other filters, otherwise a verb with only a handful of calls stays invisible.
      const search = filters.search.trim().replace(/[,()]/g, " ");
      if (search) {
        return query.or(
          [
            `action.ilike.%${search}%`,
            `response_id.ilike.%${search}%`,
            `trace_id.ilike.%${search}%`,
            `parent_action.ilike.%${search}%`,
            `error_message.ilike.%${search}%`,
          ].join(","),
        );
      }
      // Account-level work (pull all listings, deletions) carries no property id,
      // so it needs its own scope rather than disappearing behind "All properties".
      if (filters.propertyId === "account") query = query.is("property_id", null);
      else if (filters.propertyId !== "all") query = query.eq("property_id", filters.propertyId);
      if (filters.direction !== "all") query = query.eq("direction", filters.direction);
      if (filters.bookingsOnly) query = query.in("action", RU_BOOKING_ACTIONS);
      if (filters.action !== "all") query = query.eq("action", filters.action);
      if (filters.operation !== "all") query = query.ilike("parent_action", `${filters.operation}%`);
      if (filters.ownerId !== "all") query = query.eq("ru_owner_id", filters.ownerId);
      if (filters.outcome !== "all") query = query.eq("success", filters.outcome === "success");
      if (filters.days > 0) {
        const since = new Date(Date.now() - filters.days * 86_400_000).toISOString();
        query = query.gte("created_at", since);
      }
      return query;
    },
    [
      filters.propertyId,
      filters.direction,
      filters.action,
      filters.operation,
      filters.ownerId,
      filters.outcome,
      filters.search,
      filters.bookingsOnly,
      filters.days,
    ],

  );


  /** Fetches one page; `offset > 0` appends so the operator can walk the whole retained window. */
  const fetchPage = useCallback(
    async (offset: number) => {
      const seq = ++requestSeq.current;
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const query = applyFilters(
          supabase
            .from("ru_api_log")
            .select(LIST_COLUMNS, { count: offset === 0 ? "exact" : undefined })
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1),
        );

        const { data, error: queryError, count } = await query;
        if (queryError) throw queryError;
        if (seq !== requestSeq.current) return;

        const list = (data ?? []) as RuApiLogRow[];
        setRows((prev) => (offset === 0 ? list : [...prev, ...list]));
        if (offset === 0 && typeof count === "number") setTotalCount(count);
        setHasMore(list.length === PAGE_SIZE);
        setActions((prev) => {
          const merged = new Set([...prev, ...list.map((r) => r.action).filter(Boolean)]);
          return Array.from(merged).sort();
        });
        // Operations are grouped by their prefix (channel-cleanup, channel-reconcile…)
        // so the picker stays short as new sub-steps are added.
        setOperations((prev) => {
          const merged = new Set([
            ...prev,
            ...list.map((r) => (r.parent_action || "").split(":")[0]).filter(Boolean),
          ]);
          return Array.from(merged).sort();
        });
        setOwners((prev) => {
          const merged = new Set([...prev, ...list.map((r) => r.ru_owner_id || "").filter(Boolean)]);
          return Array.from(merged).sort();
        });

      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "Could not load the exchange log");
        if (offset === 0) setRows([]);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [applyFilters],
  );

  const load = useCallback(() => fetchPage(0), [fetchPage]);


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

  const loadMore = useCallback(() => fetchPage(rows.length), [fetchPage, rows.length]);

  const stats = useMemo(() => {
    const failures = rows.filter((r) => !r.success).length;
    const withResponseId = rows.filter((r) => !!r.response_id).length;
    const avgMs = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + (r.elapsed_ms ?? 0), 0) / rows.length)
      : 0;
    return { total: rows.length, failures, withResponseId, avgMs, truncated: hasMore, totalCount };
  }, [rows, hasMore, totalCount]);

  return {
    rows,
    actions,
    operations,
    owners,
    stats,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh: load,
    loadMore,
    loadDetail,
  };


}
