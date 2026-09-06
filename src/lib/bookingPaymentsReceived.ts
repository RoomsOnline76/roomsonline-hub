/**
 * One answer to "how much money has actually been received for this stay".
 *
 * Channel reservations (Rentals United and friends) are settled at the channel: no gateway
 * transaction and no folio payment line exists, yet the guest owes nothing. Reading only the
 * folio is what made those stays show their full value as an outstanding balance.
 *
 * The sources never add up — they are different views of the same money — so the largest
 * credible one wins, and a fully-settled flag floors the figure at the guest total.
 */
export const FULLY_PAID_STATUSES = [
  "paid",
  "paid_externally",
  "settled",
  "completed",
  "success",
  "succeeded",
];

export interface PaymentsReceivedInput {
  /** Guest total for the stay (accommodation + non-refundable extras). */
  guestTotal: number;
  /** `bookings.amount_paid`, when the settlement service has written it. */
  storedAmountPaid?: number | null;
  /** `bookings.payment_status`. */
  paymentStatus?: string | null;
  /** Sum of settled gateway transactions. */
  gatewayPaid?: number | null;
  /** Sum of folio payment lines (refunds already netted off). */
  folioPayments?: number | null;
}

const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function isFullyPaidStatus(status?: string | null): boolean {
  return FULLY_PAID_STATUSES.includes(String(status || "").toLowerCase());
}

export function paymentsReceived(input: PaymentsReceivedInput): number {
  const candidates = [
    n(input.storedAmountPaid),
    n(input.gatewayPaid),
    n(input.folioPayments),
  ];
  let received = Math.max(0, ...candidates);
  if (isFullyPaidStatus(input.paymentStatus)) {
    received = Math.max(received, n(input.guestTotal));
  }
  return r2(received);
}

/** Charge snapshot written by the modification service. */
export interface ChargesBreakdown {
  accommodation?: number | null;
  extras_total?: number | null;
  deposit_total?: number | null;
  guest_total?: number | null;
}

export interface BookingAccountTotals {
  accommodation: number;
  extras: number;
  deposit: number;
  gross: number;
  payments: number;
  outstanding: number;
}

/**
 * Booking account maths from the reconciled snapshot when it exists — `total_price` is already
 * the guest total, so treating it as accommodation and adding the extras again double-counted.
 */
export function bookingAccountTotals(args: {
  breakdown?: ChargesBreakdown | null;
  totalPrice: number;
  /** Fallback extras (non-refundable) when no snapshot exists. */
  extrasFallback?: number;
  /** Sum of recorded accommodation folio lines, when any exist. */
  accommodationFallback?: number;
  /** Fallback refundable deposits when no snapshot exists. */
  depositFallback?: number;
  payments: PaymentsReceivedInput;
}): BookingAccountTotals {
  const bd = args.breakdown ?? null;
  const snapshotAccommodation = n(bd?.accommodation);
  const hasSnapshot = snapshotAccommodation > 0;

  const extras = hasSnapshot ? n(bd?.extras_total) : n(args.extrasFallback);
  const deposit = hasSnapshot ? n(bd?.deposit_total) : n(args.depositFallback);

  // Without a snapshot, `total_price` is already the guest total (mandatory extras
  // included), so extras must be carved out of it rather than added on top.
  const accommodation = hasSnapshot
    ? snapshotAccommodation
    : (n(args.accommodationFallback) > 0
        ? n(args.accommodationFallback)
        : Math.max(0, r2(n(args.totalPrice) - extras)));
  const gross = hasSnapshot
    ? (n(bd?.guest_total) || r2(accommodation + extras))
    : Math.max(n(args.totalPrice), r2(accommodation + extras));

  const payments = paymentsReceived({ ...args.payments, guestTotal: gross });

  return {
    accommodation: r2(accommodation),
    extras: r2(extras),
    deposit: r2(deposit),
    gross: r2(gross),
    payments,
    outstanding: Math.max(0, r2(gross - payments)),
  };
}
