/**
 * Policy-derived refund entitlement.
 *
 * The canonical cancellation rule lives in `rolos_reservation_policies`
 * (master / default) with a legacy fallback in `rolos_policies`. Tiers are
 * `{ days_before, forfeit_percent }`: the applicable tier is the one with the
 * largest `days_before` that is still at or below the days remaining before
 * arrival. Never invent an amount — when no rule resolves we return null and
 * the requester must state the amount explicitly.
 */

export interface CancellationTier {
  days_before: number;
  forfeit_percent: number;
}

export interface CancellationRuleLike {
  non_refundable?: boolean;
  tiers?: CancellationTier[];
}

export interface EntitlementResult {
  /** Refundable amount in the booking currency, or null when no policy resolved. */
  entitled_amount: number | null;
  forfeit_percent: number | null;
  policy_source: "master" | "legacy" | "none";
  days_before_arrival: number | null;
}

export function forfeitPercentForRule(
  rule: CancellationRuleLike | null | undefined,
  daysBeforeArrival: number,
): number | null {
  if (!rule) return null;
  if (rule.non_refundable) return 100;
  const tiers = (rule.tiers ?? []).filter(
    (t) => typeof t?.days_before === "number" && typeof t?.forfeit_percent === "number",
  );
  if (tiers.length === 0) return null;
  const applicable = tiers
    .filter((t) => t.days_before <= Math.max(daysBeforeArrival, 0))
    .sort((a, b) => b.days_before - a.days_before)[0];
  // Booked further out than the most generous tier -> fully refundable.
  if (!applicable) {
    const mostGenerous = [...tiers].sort((a, b) => b.days_before - a.days_before)[0];
    return mostGenerous.forfeit_percent;
  }
  return applicable.forfeit_percent;
}

export function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.floor((target - Date.now()) / 86_400_000);
}

/** Resolve the property's cancellation rule and compute what the guest is owed. */
export async function resolveRefundEntitlement(
  supabase: any,
  params: { property_id: string | null; check_in: string | null; amount_paid: number },
): Promise<EntitlementResult> {
  const none: EntitlementResult = {
    entitled_amount: null,
    forfeit_percent: null,
    policy_source: "none",
    days_before_arrival: daysUntil(params.check_in),
  };
  if (!params.property_id) return none;

  const days = daysUntil(params.check_in) ?? 0;

  const { data: policies } = await supabase
    .from("rolos_reservation_policies")
    .select("rule, is_master, is_default")
    .eq("property_id", params.property_id);

  const master =
    (policies ?? []).find((p: any) => p.is_master) ?? (policies ?? []).find((p: any) => p.is_default);

  let rule: CancellationRuleLike | null = (master?.rule as CancellationRuleLike) ?? null;
  let source: EntitlementResult["policy_source"] = rule ? "master" : "none";

  if (!rule) {
    const { data: legacy } = await supabase
      .from("rolos_policies")
      .select("rule")
      .eq("property_id", params.property_id)
      .eq("policy_type", "cancellation")
      .maybeSingle();
    if (legacy?.rule) {
      rule = legacy.rule as CancellationRuleLike;
      source = "legacy";
    }
  }

  const forfeit = forfeitPercentForRule(rule, days);
  if (forfeit === null) return { ...none, policy_source: source, days_before_arrival: days };

  const refundable = Math.max(0, Math.round(params.amount_paid * (1 - forfeit / 100) * 100) / 100);
  return {
    entitled_amount: refundable,
    forfeit_percent: forfeit,
    policy_source: source,
    days_before_arrival: days,
  };
}
