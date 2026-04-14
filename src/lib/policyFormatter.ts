import { differenceInDays, subDays, format } from "date-fns";

export interface CancellationTier {
  days_before: number;
  forfeit_percent: number;
}

export interface CancellationRule {
  mode?: "standard" | "dynamic";
  days_before?: number;
  forfeit_percent?: number;
  non_refundable?: boolean;
  tiers?: CancellationTier[];
  date_ranges?: Array<{
    start: string;
    end: string;
    days_before?: number;
    forfeit_percent?: number;
  }>;
  dynamic_factors?: string[];
  ai_prompt_override?: string | null;
}

export interface PolicyEvaluation {
  summaryText: string;
  deadlineDate: string | null;
  forfeitAmount: number;
  forfeitPercent: number;
  isNonRefundable: boolean;
  isFreeCancel: boolean;
  daysUntilDeadline: number | null;
}

function evaluateTiers(tiers: CancellationTier[], daysUntilCheckIn: number): number {
  const sorted = [...tiers].sort((a, b) => b.days_before - a.days_before);
  for (const tier of sorted) {
    if (daysUntilCheckIn >= tier.days_before) {
      return tier.forfeit_percent;
    }
  }
  // If no tier matched (shouldn't happen if 0-day tier exists), use last tier
  return sorted[sorted.length - 1]?.forfeit_percent ?? 100;
}

function buildTiersSummary(tiers: CancellationTier[]): string {
  const sorted = [...tiers].sort((a, b) => b.days_before - a.days_before);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    const refundPct = 100 - tier.forfeit_percent;
    if (tier.days_before > 0) {
      parts.push(`More than ${tier.days_before} days before check-in: ${refundPct}% deposit refunded.`);
    } else {
      const prevDays = i > 0 ? sorted[i - 1].days_before : null;
      if (prevDays) {
        parts.push(`Less than ${prevDays} days before check-in: ${refundPct}% deposit refunded.`);
      } else {
        parts.push(`${tier.forfeit_percent}% cancellation fee applies.`);
      }
    }
  }
  return parts.join(" ");
}

export function formatCancellationPolicy(
  rule: CancellationRule | null,
  checkInDate?: string,
  totalPrice?: number
): PolicyEvaluation {
  if (!rule) {
    return {
      summaryText: "No cancellation policy configured.",
      deadlineDate: null,
      forfeitAmount: 0,
      forfeitPercent: 0,
      isNonRefundable: false,
      isFreeCancel: true,
      daysUntilDeadline: null,
    };
  }

  if (rule.non_refundable) {
    return {
      summaryText: "This booking is non-refundable. No refund will be given for cancellations.",
      deadlineDate: null,
      forfeitAmount: totalPrice || 0,
      forfeitPercent: 100,
      isNonRefundable: true,
      isFreeCancel: false,
      daysUntilDeadline: null,
    };
  }

  // Tiered cancellation policy
  if (rule.tiers && rule.tiers.length > 0) {
    const summaryText = buildTiersSummary(rule.tiers);

    if (!checkInDate) {
      return {
        summaryText,
        deadlineDate: null,
        forfeitAmount: 0,
        forfeitPercent: 0,
        isNonRefundable: false,
        isFreeCancel: true,
        daysUntilDeadline: null,
      };
    }

    const now = new Date();
    const checkIn = new Date(checkInDate);
    const daysUntil = differenceInDays(checkIn, now);
    const forfeitPct = evaluateTiers(rule.tiers, daysUntil);
    const isFreeCancel = forfeitPct === 0;
    const forfeitAmount = ((totalPrice || 0) * forfeitPct) / 100;

    // Deadline is the earliest tier with 0% forfeit
    const sorted = [...rule.tiers].sort((a, b) => b.days_before - a.days_before);
    const freeTier = sorted.find((t) => t.forfeit_percent === 0);
    const deadlineDate = freeTier
      ? format(subDays(checkIn, freeTier.days_before), "d MMM yyyy")
      : null;
    const daysUntilDeadline = freeTier ? daysUntil - freeTier.days_before : null;

    return {
      summaryText,
      deadlineDate,
      forfeitAmount,
      forfeitPercent: forfeitPct,
      isNonRefundable: false,
      isFreeCancel,
      daysUntilDeadline,
    };
  }

  // Legacy single-tier logic
  const daysBefore = rule.days_before ?? 0;
  const forfeitPct = rule.forfeit_percent ?? 100;

  let effectiveDaysBefore = daysBefore;
  let effectiveForfeitPct = forfeitPct;

  // Check date range overrides
  if (checkInDate && rule.date_ranges?.length) {
    const checkIn = new Date(checkInDate);
    const override = rule.date_ranges.find(
      (r) => checkIn >= new Date(r.start) && checkIn <= new Date(r.end)
    );
    if (override) {
      effectiveDaysBefore = override.days_before ?? daysBefore;
      effectiveForfeitPct = override.forfeit_percent ?? forfeitPct;
    }
  }

  let isFreeCancel = true;
  let daysUntilDeadline: number | null = null;
  let deadlineDate: string | null = null;
  let forfeitAmount = 0;

  if (checkInDate) {
    const now = new Date();
    const checkIn = new Date(checkInDate);
    const deadline = subDays(checkIn, effectiveDaysBefore);
    const daysUntil = differenceInDays(deadline, now);

    deadlineDate = format(deadline, "d MMM yyyy");
    daysUntilDeadline = daysUntil;
    isFreeCancel = daysUntil > 0;
    forfeitAmount = isFreeCancel ? 0 : ((totalPrice || 0) * effectiveForfeitPct) / 100;
  }

  const summaryParts: string[] = [];
  if (effectiveDaysBefore > 0) {
    summaryParts.push(
      `Free cancellation up to ${effectiveDaysBefore} days before check-in.`
    );
    summaryParts.push(
      `After that, ${effectiveForfeitPct}% of the booking total is charged.`
    );
  } else {
    summaryParts.push(`${effectiveForfeitPct}% cancellation fee applies.`);
  }

  if (rule.mode === "dynamic" && rule.dynamic_factors?.length) {
    summaryParts.push("Policy may vary based on occupancy and demand.");
  }

  return {
    summaryText: summaryParts.join(" "),
    deadlineDate,
    forfeitAmount,
    forfeitPercent: effectiveForfeitPct,
    isNonRefundable: false,
    isFreeCancel,
    daysUntilDeadline,
  };
}
