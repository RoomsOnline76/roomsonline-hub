import { useEffect, useMemo, useRef } from "react";
import type { RequirementStatus } from "@/config/propertyFieldRequirements";
import {
  clearRequirementDecoration,
  decorateRequirements,
} from "@/lib/requirementFocus";
import { usePropertyReadiness, type SectionReadinessCounts } from "@/hooks/usePropertyReadiness";

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
 * Thin view over the unified readiness model (`usePropertyReadiness`): filters to
 * the paintable field requirements and paints pink (mandatory) / blue
 * (recommended) borders on the controls of the active section.
 *
 * Counts returned here are the SAME totals the readiness score badge and the
 * checksheet render, so the score and the highlighting can never disagree.
 */
export function usePropertyFieldRequirements({
  propertyId,
  section,
  containerRef,
  paint = true,
}: UsePropertyFieldRequirementsOptions) {
  const readiness = usePropertyReadiness(propertyId);

  const statuses: RequirementStatus[] = useMemo(
    () =>
      readiness.items
        .filter((i) => i.paintable && i.requirement)
        .map((i) => i.requirement as RequirementStatus),
    [readiness.items],
  );

  const sectionStatuses = useMemo(
    () => (section ? statuses.filter((s) => s.section === section) : statuses),
    [section, statuses],
  );

  const outstandingInSection = useMemo(
    () => sectionStatuses.filter((s) => !s.satisfied),
    [sectionStatuses],
  );

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

  const outstandingBySection: Record<string, SectionReadinessCounts> =
    readiness.outstandingBySection;

  return {
    subject: readiness.subject,
    statuses,
    sectionStatuses,
    outstandingInSection,
    outstandingBySection,
    refresh: readiness.refresh,
    mandatoryTotal: readiness.mandatoryTotal,
    mandatoryOutstanding: readiness.mandatoryOutstanding,
    recommendedTotal: readiness.recommendedTotal,
    recommendedOutstanding: readiness.recommendedOutstanding,
  };
}

export default usePropertyFieldRequirements;
