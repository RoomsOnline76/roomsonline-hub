/**
 * Cancellation policy translators.
 *
 * The canonical manual policy lives in `rolos_policies` (policy_type = 'cancellation')
 * as a tiered rule. This module translates that rule into the shapes required by
 * downstream consumers (channel adapters, showcase text, legacy amenities blob).
 */

import { formatCancellationPolicy, type CancellationRule } from "@/lib/policyFormatter";

export interface LegacyAmenityPolicy {
  days: number;
  forfeit: number;
  description?: string;
}

/**
 * Translate the canonical tiered rule into the legacy
 * `amenities.cancellation_policies` shape consumed by push-property-to-ru
 * (and stored on `properties.amenities` for backwards-compat readers).
 */
export function toLegacyAmenitiesShape(rule: CancellationRule | null | undefined): LegacyAmenityPolicy[] {
  if (!rule) return [];
  if (rule.non_refundable) {
    return [{ days: 0, forfeit: 100, description: "Non-refundable" }];
  }
  const tiers = rule.tiers ?? [];
  if (tiers.length === 0) return [];
  // Sort ascending by days_before so downstream loops build correct ranges.
  return [...tiers]
    .sort((a, b) => a.days_before - b.days_before)
    .map((t) => ({
      days: t.days_before,
      forfeit: t.forfeit_percent,
      description:
        t.forfeit_percent === 0
          ? `Free cancellation up to ${t.days_before} days before arrival`
          : `${t.forfeit_percent}% forfeit within ${t.days_before} days of arrival`,
    }));
}

/** Human-readable single-line policy summary for the showcase / channel text fields. */
export function toHumanSummary(rule: CancellationRule | null | undefined): string {
  if (!rule) return "";
  return formatCancellationPolicy(rule).summaryText;
}

/** Additional manual fields we now accept alongside the tier structure. */
export interface CancellationPolicyExtras {
  deposit_percent?: number;
  one_night_refundable?: boolean;
  full_payment_within_days?: number;
  additional_terms?: string;
  manual_override?: boolean;
}

export type ManualCancellationRule = CancellationRule & CancellationPolicyExtras;

export const RECOMMENDED_POLICY: ManualCancellationRule = {
  mode: "standard",
  non_refundable: false,
  tiers: [
    { days_before: 7, forfeit_percent: 0 },
    { days_before: 0, forfeit_percent: 100 },
  ],
  date_ranges: [],
  dynamic_factors: [],
  ai_prompt_override: null,
  deposit_percent: 100,
  one_night_refundable: false,
  full_payment_within_days: 7,
  additional_terms: "",
  manual_override: true,
};
