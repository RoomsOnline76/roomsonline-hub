import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ManualCancellationRule } from "@/lib/cancellationPolicy";

export interface ResolvedCancellationPolicy {
  id: string | null;
  name: string | null;
  rule: ManualCancellationRule | null;
  /** Where the policy came from, in resolution order. */
  source: "special" | "rate_plan" | "master" | "legacy" | "none";
}

interface PolicyRow {
  id: string;
  name: string;
  rule: ManualCancellationRule;
  is_master: boolean;
  is_default: boolean;
}

/**
 * Checkout policy resolution order (Phase 4):
 *   selected special's policy -> rate-plan linked policy -> property master policy
 * Falls back to the legacy `rolos_policies` cancellation row when the library is empty.
 */
export function useResolvedCancellationPolicy(
  propertyId: string | null | undefined,
  specialPolicyId: string | null | undefined,
  ratePlanId: string | null | undefined,
) {
  return useQuery<ResolvedCancellationPolicy>({
    queryKey: ["resolved-cancellation-policy", propertyId, specialPolicyId, ratePlanId],
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const none: ResolvedCancellationPolicy = { id: null, name: null, rule: null, source: "none" };
      if (!propertyId) return none;

      const { data } = await supabase
        .from("rolos_reservation_policies")
        .select("id, name, rule, is_master, is_default")
        .eq("property_id", propertyId);
      const policies = ((data ?? []) as unknown as PolicyRow[]).filter(Boolean);

      const pick = (id: string | null | undefined) =>
        id ? policies.find((p) => p.id === id) ?? null : null;

      // 1. Special-specific policy
      const fromSpecial = pick(specialPolicyId);
      if (fromSpecial) {
        return { id: fromSpecial.id, name: fromSpecial.name, rule: fromSpecial.rule, source: "special" };
      }

      // 2. Rate-plan linked policy
      if (ratePlanId && policies.length) {
        const { data: links } = await supabase
          .from("rolos_policy_rate_links")
          .select("policy_id, rate_plan_id")
          .eq("rate_plan_id", ratePlanId);
        const linked = pick((links ?? [])[0]?.policy_id as string | undefined);
        if (linked) {
          return { id: linked.id, name: linked.name, rule: linked.rule, source: "rate_plan" };
        }
      }

      // 3. Property master (global fallback), then default
      const master = policies.find((p) => p.is_master) ?? policies.find((p) => p.is_default);
      if (master) {
        return { id: master.id, name: master.name, rule: master.rule, source: "master" };
      }

      // 4. Legacy canonical row
      const { data: legacy } = await supabase
        .from("rolos_policies" as never)
        .select("rule")
        .eq("property_id", propertyId)
        .eq("policy_type", "cancellation")
        .maybeSingle();
      const legacyRule = (legacy as { rule?: ManualCancellationRule } | null)?.rule ?? null;
      if (legacyRule) return { id: null, name: null, rule: legacyRule, source: "legacy" };

      return none;
    },
  });
}
