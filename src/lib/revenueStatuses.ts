/**
 * Single source of truth for "the money for this booking has been received".
 *
 * `paid_externally` is written by channel ingests (Rentals United and other
 * sales channels) where the channel collected the funds. Those bookings are
 * real revenue and must count in every total exactly like a card payment —
 * omitting the value is what made channel bookings vanish from all counters.
 */
export const REVENUE_PAYMENT_STATUSES = [
  "paid",
  "paid_externally",
  "settled",
  "completed",
] as const;

/** Statuses where only part of the money has arrived but the booking still counts. */
export const PARTIAL_PAYMENT_STATUSES = [
  "partially_paid",
  "deposit_paid",
  // A partially refunded stay still holds net revenue — the processed refund is
  // netted off separately by the payout/commission maths.
  "partially_refunded",
] as const;

/** Money that has been (fully or partly) returned to the guest. */
export const REFUNDED_PAYMENT_STATUSES = ["refunded", "partially_refunded"] as const;

export function isRefundedPaymentStatus(paymentStatus?: string | null): boolean {
  return (REFUNDED_PAYMENT_STATUSES as readonly string[]).includes(
    (paymentStatus || "").toLowerCase()
  );
}

/** Everything that should be treated as revenue-bearing. */
export const ALL_REVENUE_PAYMENT_STATUSES: string[] = [
  ...REVENUE_PAYMENT_STATUSES,
  ...PARTIAL_PAYMENT_STATUSES,
];

/** Manual booking hold states — treated exactly like `pending` (no revenue). */
export const PENDING_BOOKING_STATUSES = ["pending", "waiting_for_deposit"];

/** Booking statuses that never count towards revenue. */
export const NON_REVENUE_BOOKING_STATUSES = ["cancelled", "canceled", "failed"];

export function isRevenuePaymentStatus(
  paymentStatus?: string | null,
  includePartial = true
): boolean {
  const s = (paymentStatus || "").toLowerCase();
  if (!s) return false;
  if ((REVENUE_PAYMENT_STATUSES as readonly string[]).includes(s)) return true;
  return includePartial && (PARTIAL_PAYMENT_STATUSES as readonly string[]).includes(s);
}

/** True when the channel (not ROL) collected the funds. */
export function isChannelSettled(paymentStatus?: string | null): boolean {
  return (paymentStatus || "").toLowerCase() === "paid_externally";
}

export function isRevenueBooking(
  booking: { status?: string | null; payment_status?: string | null },
  includePartial = true
): boolean {
  const status = (booking.status || "").toLowerCase();
  if (NON_REVENUE_BOOKING_STATUSES.includes(status)) return false;
  return isRevenuePaymentStatus(booking.payment_status, includePartial);
}

export const CANCELLATION_REASON_CATEGORIES = [
  { value: "guest_request", label: "Guest request" },
  { value: "date_change", label: "Date change" },
  { value: "no_payment", label: "No payment received" },
  { value: "property_operator", label: "Property / operator" },
  { value: "channel_cancelled", label: "Cancelled at channel" },
  { value: "no_show", label: "No-show" },
  { value: "other", label: "Other" },
] as const;

export type CancellationReasonCategory =
  (typeof CANCELLATION_REASON_CATEGORIES)[number]["value"];

export function cancellationCategoryLabel(value?: string | null): string {
  return (
    CANCELLATION_REASON_CATEGORIES.find((c) => c.value === value)?.label ??
    "Uncategorised"
  );
}
