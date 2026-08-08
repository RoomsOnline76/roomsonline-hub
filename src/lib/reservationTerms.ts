/**
 * Reservation-only payment terms.
 *
 * When a property opts out of online payment (payment_mode = 'reservation_only')
 * the guest reserves and pays the property directly. This module derives the
 * amount due now (deposit or full prepayment), the due dates and the plain
 * wording shown at checkout, on the pro forma invoice and in the email.
 */

import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { ManualCancellationRule } from "@/lib/cancellationPolicy";
import { RESERVATION_HOLD_DAYS } from "@/lib/paymentMode";

export interface HouseRulesDepositBlock {
  deposit_allowed?: boolean | string | null;
  deposit_percentage?: number | string | null;
  deposit_days?: number | string | null;
}

export interface ReservationTerms {
  /** Amount the guest must transfer to secure the reservation. */
  amountDueNow: number;
  /** Remaining balance after the first transfer (0 when full prepayment). */
  balanceDue: number;
  /** Deposit as a percentage of the stay total. */
  depositPercent: number;
  /** ISO date the first transfer must reflect by. */
  dueDate: string;
  /** ISO date the balance must reflect by, when a balance exists. */
  balanceDueDate: string | null;
  /** True when the whole stay must be prepaid. */
  isFullPrepayment: boolean;
  /** One-line summary, e.g. "50% deposit (R1 200,00) due by 12 Mar 2026". */
  summary: string;
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function isTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

/**
 * Resolves what the guest owes and when, for a reservation-only booking.
 *
 * Deposit precedence: the cancellation policy's `deposit_percent` (authored in
 * the Policies library) wins; the property house rules deposit is the fallback.
 */
export function resolveReservationTerms(params: {
  total: number;
  checkIn: string;
  houseRules?: HouseRulesDepositBlock | null;
  cancellationRule?: ManualCancellationRule | null;
  now?: Date;
}): ReservationTerms {
  const { total, checkIn, houseRules, cancellationRule } = params;
  const now = params.now ?? new Date();

  const policyPercent = cancellationRule?.deposit_percent;
  const rulesAllowDeposit = isTruthy(houseRules?.deposit_allowed);
  const rulesPercent = rulesAllowDeposit ? toNumber(houseRules?.deposit_percentage, 100) : 100;

  let depositPercent = typeof policyPercent === "number" ? policyPercent : rulesPercent;
  if (!Number.isFinite(depositPercent) || depositPercent <= 0) depositPercent = 100;
  depositPercent = Math.min(100, Math.max(1, Math.round(depositPercent)));

  const amountDueNow = Math.round(((total * depositPercent) / 100) * 100) / 100;
  const balanceDue = Math.round((total - amountDueNow) * 100) / 100;
  const isFullPrepayment = balanceDue <= 0.01;

  // The reservation hold is the outer bound for the first transfer; a shorter
  // arrival window shortens it.
  let arrival: Date | null = null;
  try {
    arrival = parseISO(checkIn);
  } catch {
    arrival = null;
  }
  const holdDeadline = addDays(now, RESERVATION_HOLD_DAYS);
  const dueDateObj = arrival && arrival < holdDeadline ? arrival : holdDeadline;

  const balanceWithin = cancellationRule?.full_payment_within_days
    ?? toNumber(houseRules?.deposit_days, 0);
  const balanceDueObj = isFullPrepayment || !arrival
    ? null
    : balanceWithin > 0
      ? addDays(arrival, -balanceWithin)
      : arrival;

  const dueLabel = format(dueDateObj, "d MMM yyyy");
  const summary = isFullPrepayment
    ? `Full payment due by ${dueLabel}`
    : `${depositPercent}% deposit due by ${dueLabel}`;

  return {
    amountDueNow,
    balanceDue: isFullPrepayment ? 0 : balanceDue,
    depositPercent,
    dueDate: format(dueDateObj, "yyyy-MM-dd"),
    balanceDueDate: balanceDueObj ? format(balanceDueObj, "yyyy-MM-dd") : null,
    isFullPrepayment,
    summary,
  };
}

/** True when the arrival date is inside the cancel-on-lapse window. */
export function isWithinArrivalCancelWindow(checkIn: string, windowDays: number, now = new Date()): boolean {
  try {
    return differenceInCalendarDays(parseISO(checkIn), now) <= windowDays;
  } catch {
    return false;
  }
}
