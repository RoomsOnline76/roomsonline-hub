/**
 * Edge-side mirror of src/lib/revenueStatuses.ts — see that file for rationale.
 * `paid_externally` marks channel-collected funds (Rentals United et al.) and
 * must count as revenue everywhere.
 */
export const REVENUE_PAYMENT_STATUSES = [
  "paid",
  "paid_externally",
  "settled",
  "completed",
];

export const PARTIAL_PAYMENT_STATUSES = [
  "partially_paid",
  "deposit_paid",
  "partially_refunded",
];

export const REFUNDED_PAYMENT_STATUSES = ["refunded", "partially_refunded"];

export function isRefundedPaymentStatus(paymentStatus?: string | null): boolean {
  return REFUNDED_PAYMENT_STATUSES.includes((paymentStatus || "").toLowerCase());
}

export const ALL_REVENUE_PAYMENT_STATUSES = [
  ...REVENUE_PAYMENT_STATUSES,
  ...PARTIAL_PAYMENT_STATUSES,
];

export const NON_REVENUE_BOOKING_STATUSES = ["cancelled", "canceled", "failed"];

export function isRevenuePaymentStatus(
  paymentStatus?: string | null,
  includePartial = true
): boolean {
  const s = (paymentStatus || "").toLowerCase();
  if (!s) return false;
  if (REVENUE_PAYMENT_STATUSES.includes(s)) return true;
  return includePartial && PARTIAL_PAYMENT_STATUSES.includes(s);
}

export function isChannelSettled(paymentStatus?: string | null): boolean {
  return (paymentStatus || "").toLowerCase() === "paid_externally";
}

export const CANCELLATION_REASON_CATEGORIES = [
  "guest_request",
  "date_change",
  "no_payment",
  "property_operator",
  "channel_cancelled",
  "no_show",
  "other",
];
