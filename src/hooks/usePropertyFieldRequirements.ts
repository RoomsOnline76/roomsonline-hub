import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  countOutstandingBySection,
  evaluateRequirements,
  type RequirementStatus,
  type RequirementSubject,
  type SectionRequirementCounts,
} from "@/config/propertyFieldRequirements";
import {
  clearRequirementDecoration,
  decorateRequirements,
} from "@/lib/requirementFocus";

interface UsePropertyFieldRequirementsOptions {
  propertyId?: string | null;
  /** Active section key — statuses are painted for this section only. */
  section?: string | null;
  /** Container to decorate. Defaults to the whole document. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Disable painting (keeps the counts). */
  paint?: boolean;
}

/**
 * Fetches the property row, evaluates the field-level readiness registry, and
 * paints pink (mandatory) / blue (recommended) borders on the matching controls
 * of the active section. Outstanding fields stay bold; satisfied fields mute.
 */
export function usePropertyFieldRequirements({
  propertyId,
  section,
  containerRef,
  paint = true,
}: UsePropertyFieldRequirementsOptions) {
  const { data: subject, refetch } = useQuery({
    queryKey: ["property-field-requirements", propertyId],
    queryFn: async (): Promise<RequirementSubject | null> => {
      if (!propertyId) return null;
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RequirementSubject | null;
    },
    enabled: !!propertyId,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const statuses: RequirementStatus[] = useMemo(
    () => (subject ? evaluateRequirements(subject) : []),
    [subject],
  );

  const sectionStatuses = useMemo(
    () => (section ? statuses.filter((s) => s.section === section) : statuses),
    [section, statuses],
  );

  const outstandingBySection: Record<string, SectionRequirementCounts> = useMemo(
    () => countOutstandingBySection(statuses),
    [statuses],
  );

  const outstandingInSection = useMemo(
    () => sectionStatuses.filter((s) => !s.satisfied),
    [sectionStatuses],
  );

  const totals = useMemo(() => {
    const mandatory = statuses.filter((s) => s.tier === "mandatory");
    const recommended = statuses.filter((s) => s.tier === "recommended");
    return {
      mandatoryTotal: mandatory.length,
      mandatoryOutstanding: mandatory.filter((s) => !s.satisfied).length,
      recommendedTotal: recommended.length,
      recommendedOutstanding: recommended.filter((s) => !s.satisfied).length,
    };
  }, [statuses]);

  // Paint + keep painting as the tab body renders lazily.
  const timers = useRef<number[]>([]);
  useEffect(() => {
    if (!paint) return;
    const root = containerRef?.current ?? document;
    if (sectionStatuses.length === 0) {
      clearRequirementDecoration(root);
      return;
    }

    const run = () => decorateRequirements(sectionStatuses, root);
    run();
    // Radix / collapsibles mount after the first frame — repaint a few times.
    timers.current = [120, 400, 900, 1800].map((ms) => window.setTimeout(run, ms));

    const observer = new MutationObserver(() => run());
    observer.observe((root as Document).body ?? (root as HTMLElement), {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, [containerRef, paint, sectionStatuses]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    subject,
    statuses,
    sectionStatuses,
    outstandingInSection,
    outstandingBySection,
    refresh,
    ...totals,
  };
}

export default usePropertyFieldRequirements;
