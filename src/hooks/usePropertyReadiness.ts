import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  evaluateRequirements,
  type RequirementStatus,
  type RequirementSubject,
  type RequirementTier,
} from "@/config/propertyFieldRequirements";

/**
 * Unified property readiness model.
 *
 * The field-level registry (`propertyFieldRequirements.ts`) is the single source
 * of truth for scoring AND highlighting. The `check-activation-readiness` edge
 * function only contributes the checks a browser cannot evaluate (signed
 * contract, PMS conflicts, RU location currency), so the score badge, the field
 * borders, the stepper and the checksheet can never disagree.
 */

/** Checks that have no field-registry counterpart — server truth only. */
export const SERVER_ONLY_CHECK_IDS = [
  "contract",
  "pms",
  "rentalsunited_location_currency",
] as const;

/** Stable tier per server-only check (the edge severity can flip across branches). */
const SERVER_ONLY_TIERS: Record<string, RequirementTier> = {
  contract: "mandatory",
  pms: "mandatory",
  rentalsunited_location_currency: "mandatory",
};

export interface ReadinessBackendCheck {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  fix?: string;
  severity: "blocker" | "warning" | "info";
  tier?: RequirementTier;
  section?: string;
  section_label?: string;
  surface?: "rolos" | "admin";
}

export interface ReadinessBackendResponse {
  passed: boolean;
  score: number;
  blockers?: ReadinessBackendCheck[];
  warnings?: ReadinessBackendCheck[];
  checks?: ReadinessBackendCheck[];
}

export interface ReadinessItem {
  /** Requirement key (also the deep-link `focus` value) or the backend check id. */
  key: string;
  label: string;
  tier: RequirementTier;
  /** Section (tab) key that owns the item. */
  section: string;
  satisfied: boolean;
  /** True when a DOM field exists to paint / step to. */
  paintable: boolean;
  hint?: string;
  /** Backend-only extras. */
  message?: string;
  fix?: string;
  sectionLabel?: string;
  surface?: "rolos" | "admin";
  /** Present for registry items so decoration can resolve the control. */
  requirement?: RequirementStatus;
}

export interface SectionReadinessCounts {
  mandatory: number;
  recommended: number;
  /**
   * Labels of the outstanding items, so a count badge can NAME what is missing
   * instead of only showing a number the owner cannot act on.
   */
  mandatoryLabels: string[];
  recommendedLabels: string[];
}

export function usePropertyReadiness(propertyId?: string | null) {
  const query = useQuery({
    queryKey: ["property-readiness", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const [{ data: property, error }, { data: policyRows }, { data: contactRows }, backend] = await Promise.all([
        supabase.from("properties").select("*").eq("id", propertyId).maybeSingle(),
        // Master policy truth lives in the policy library, not in amenities.
        supabase
          .from("rolos_reservation_policies")
          .select("id, is_master, is_default")
          .eq("property_id", propertyId),
        // Public contact details live in their own table, not in amenities.
        supabase
          .from("property_contact_details")
          .select("role, name, email, phone")
          .eq("property_id", propertyId),
        supabase.functions
          .invoke("check-activation-readiness", { body: { property_id: propertyId } })
          .then((res) => (res.error ? null : (res.data as ReadinessBackendResponse)))
          .catch(() => null),
      ]);
      if (error) throw error;
      if (!property) return null;
      const subject = {
        ...(property as Record<string, unknown>),
        policy_rows: policyRows ?? [],
        contact_rows: contactRows ?? [],
      } as RequirementSubject;
      return { subject, backend };
    },
    enabled: !!propertyId,
    staleTime: 15_000,
    // Always re-score on mount so a field cleared earlier in the session cannot
    // leave a stale "all clear" behind when the property is re-opened.
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  const subject = query.data?.subject ?? null;
  const backend = query.data?.backend ?? null;

  const items: ReadinessItem[] = useMemo(() => {
    if (!subject) return [];
    const fieldItems: ReadinessItem[] = evaluateRequirements(subject).map((r) => ({
      key: r.key,
      label: r.label,
      tier: r.tier,
      section: r.section,
      satisfied: r.satisfied,
      paintable: true,
      hint: r.hint,
      requirement: r,
    }));

    const serverItems: ReadinessItem[] = (backend?.checks ?? [])
      .filter((c) => (SERVER_ONLY_CHECK_IDS as readonly string[]).includes(c.id))
      .map((c) => ({
        key: c.id,
        label: c.name,
        tier: SERVER_ONLY_TIERS[c.id] ?? (c.severity === "blocker" ? "mandatory" : "recommended"),
        section: c.section ?? "general",
        satisfied: c.passed,
        paintable: false,
        message: c.message,
        fix: c.fix,
        sectionLabel: c.section_label,
        surface: c.surface,
      }));

    return [...fieldItems, ...serverItems];
  }, [backend?.checks, subject]);

  const totals = useMemo(() => {
    const mandatory = items.filter((i) => i.tier === "mandatory");
    const recommended = items.filter((i) => i.tier === "recommended");
    const mandatoryPassed = mandatory.filter((i) => i.satisfied).length;
    const recommendedPassed = recommended.filter((i) => i.satisfied).length;
    const pct = (passed: number, total: number) =>
      total === 0 ? 100 : Math.round((passed / total) * 100);
    return {
      mandatoryTotal: mandatory.length,
      mandatoryPassed,
      mandatoryOutstanding: mandatory.length - mandatoryPassed,
      mandatoryScore: pct(mandatoryPassed, mandatory.length),
      recommendedTotal: recommended.length,
      recommendedPassed,
      recommendedOutstanding: recommended.length - recommendedPassed,
      recommendedScore: pct(recommendedPassed, recommended.length),
    };
  }, [items]);

  const outstandingBySection: Record<string, SectionReadinessCounts> = useMemo(() => {
    const out: Record<string, SectionReadinessCounts> = {};
    for (const item of items) {
      if (item.satisfied) continue;
      const bucket = (out[item.section] ??= { mandatory: 0, recommended: 0 });
      if (item.tier === "mandatory") bucket.mandatory += 1;
      else bucket.recommended += 1;
    }
    return out;
  }, [items]);

  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    subject,
    items,
    outstandingBySection,
    passed: totals.mandatoryOutstanding === 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    hasData: !!subject,
    refresh,
    ...totals,
  };
}

export default usePropertyReadiness;
