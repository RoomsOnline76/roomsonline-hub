import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RuReadinessReport } from "@/components/pms/channels/RuReadinessScorecard";

export interface ChannelReadiness {
  report: RuReadinessReport | null;
  /** 0-100, mandatory-only — a channel may only go live at 100. */
  score: number;
  outstanding: number;
  blocked: boolean;
  /** Failing mandatory checks, deep-linkable. */
  failing: RuReadinessReport["checks"];
  /** Failing recommended checks (never block a connection). */
  advisory: RuReadinessReport["checks"];
}

/**
 * Channel-connection readiness for a property.
 *
 * Deliberately reuses the single RU readiness scorer (`_shared/ruReadiness.ts`
 * via `ru-cert-portal → property_readiness`) so the Channel Manager, the
 * property editor and the certification console can never disagree.
 */
export function useChannelReadiness(propertyId: string | null | undefined) {
  const fetchReadiness = async (probeAri: boolean): Promise<RuReadinessReport | null> => {
    const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
      body: { action: "property_readiness", property_id: propertyId, probe_ari: probeAri },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error?.message ?? "Readiness check failed");
    return (data.property ?? null) as RuReadinessReport | null;
  };

  // Local-only by design. The background "live" query used to fire get_prices +
  // get_availability for every unit on every mount of the editor, wizard and monitor —
  // the stored verdict already carries the last real channel answer, and a live re-read
  // only happens on an operator recheck or the scheduled refresh.
  const local = useQuery({
    queryKey: ["channel-readiness", propertyId, "local"],
    enabled: !!propertyId,
    staleTime: 60_000,
    queryFn: () => fetchReadiness(false),
  });

  const query = local;

  const report = query.data ?? null;


  const checks = report?.checks ?? [];
  const mandatory = checks.filter((c) => c.mandatory);
  const failing = mandatory.filter((c) => !c.passed);
  const advisory = checks.filter((c) => !c.mandatory && !c.passed);
  const score = mandatory.length
    ? Math.round(((mandatory.length - failing.length) / mandatory.length) * 100)
    : 0;

  const readiness: ChannelReadiness = {
    report,
    score,
    outstanding: failing.length,
    blocked: failing.length > 0,
    failing,
    advisory,
  };

  return {
    ...query,
    // Only the first (local) paint is a real loading state.
    isLoading: local.isLoading && !report,
    isPending: local.isPending && !report,
    refetch: async () => {
      await local.refetch();
      return query.refetch();
    },
    readiness,
  };

}
