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
  /** Container to decorate. Prefer `root` so attach retriggers the effect. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Live painted root. When provided, painting never walks `document` —
   * observing the whole page during typing is a main-thread stall.
   */
  root?: HTMLElement | null;
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
  root,
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
  const resolvedRoot = root ?? containerRef?.current ?? null;
  useEffect(() => {
    if (!paint) return;
    // Never fall back to `document` — a body-wide observer + querySelectorAll
    // on every keystroke is the PropertyForm typing stall.
    if (!resolvedRoot) return;
    if (sectionStatuses.length === 0) {
      clearRequirementDecoration(resolvedRoot);
      return;
    }

    const run = () => decorateRequirements(sectionStatuses, resolvedRoot);
    run();
    // Radix / collapsibles mount after the first frame — repaint a few times.
    timers.current = [120, 400, 900, 1800].map((ms) => window.setTimeout(run, ms));

    const observeTarget =
      resolvedRoot instanceof Document ? resolvedRoot.body : resolvedRoot;
    if (!observeTarget) return;

    let debounceId = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(run, 160);
    });
    observer.observe(observeTarget, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      window.clearTimeout(debounceId);
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, [paint, resolvedRoot, sectionStatuses]);

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
