import { differenceInDays, subDays, format } from "date-fns";

export interface CancellationRule {
  mode?: "standard" | "dynamic";
  days_before?: number;
  forfeit_percent?: number;
  non_refundable?: boolean;
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
