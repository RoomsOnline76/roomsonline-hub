/**
 * Billing schedule helpers.
 *
 * A property's subscription clock starts at the engagement date, runs free for
 * `free_period_days` (default 60), and then bills monthly on the anniversary
 * day. Setup fees are NOT part of this clock — they are invoiced upfront on
 * contract signature.
 */

export const DEFAULT_FREE_PERIOD_DAYS = 60;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ScheduleInput {
  engagement_date?: string | null;
  billing_start_date?: string | null;
  free_period_days?: number | null;
  billing_anchor_day?: number | null;
}

export interface ScheduleResult {
  /** Date the free period ends and paid billing begins (inclusive start). */
  paidStart: string | null;
  freeDays: number;
  inFreePeriod: boolean;
  /** Days left in the free period (0 when it has ended). */
  freeDaysRemaining: number;
  anchorDay: number | null;
}

export function resolveBillingSchedule(
  cfg: ScheduleInput | null | undefined,
  globalFreeDefault = DEFAULT_FREE_PERIOD_DAYS,
  today = new Date().toISOString().slice(0, 10),
): ScheduleResult {
  const freeDays = cfg?.free_period_days ?? globalFreeDefault;
  const engagement = cfg?.engagement_date || null;
  const paidStart = engagement
    ? addDays(engagement, freeDays)
    : cfg?.billing_start_date
      ? cfg.billing_start_date.slice(0, 10)
      : null;
  const inFreePeriod = !!paidStart && today < paidStart;
  const freeDaysRemaining = inFreePeriod
    ? Math.max(
        0,
        Math.round(
          (new Date(`${paidStart}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
            86_400_000,
        ),
      )
    : 0;
  return {
    paidStart,
    freeDays,
    inFreePeriod,
    freeDaysRemaining,
    anchorDay: cfg?.billing_anchor_day ?? (paidStart ? Number(paidStart.slice(8, 10)) : null),
  };
}
