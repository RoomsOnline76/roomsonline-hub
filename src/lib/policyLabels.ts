import type { ManualCancellationRule } from "@/lib/cancellationPolicy";

/** Short table-style label, e.g. "Flexible – 30 days" or "Non-refundable". */
export function shortPolicyLabel(rule: ManualCancellationRule | null | undefined): string {
  if (!rule) return "No terms captured";
  if (rule.non_refundable) return "Non-refundable";
  const tiers = [...(rule.tiers ?? [])].sort((a, b) => b.days_before - a.days_before);
  const free = tiers.find((t) => t.forfeit_percent === 0);
  if (free) return `Flexible – ${free.days_before} days`;
  const first = tiers[0];
  if (first) return `${first.forfeit_percent}% forfeit within ${first.days_before} days`;
  return "Custom terms";
}

/** Deposit sentence used under the short label. */
export function depositLabel(rule: ManualCancellationRule | null | undefined): string | null {
  if (!rule) return null;
  const deposit = rule.deposit_percent ?? 100;
  if (deposit >= 100) return "Full prepayment";
  return `${deposit}% deposit${
    rule.full_payment_within_days ? ` — balance if arrival within ${rule.full_payment_within_days} days` : ""
  }`;
}
