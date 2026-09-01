/**
 * Which half of ARI a delta is allowed to write.
 *
 * Rates and availability are two separate channel writes, and a save only ever moved one of
 * them. Sending both means republishing untouched data: prices get re-sent (and re-verified)
 * because a night was blocked, or the whole 365-day calendar gets re-sent because a rate
 * changed. Both are pure cost and both are a source of drift.
 *
 * Rule: a rate/price/season edit pushes PRICES ONLY. A block, restriction, release or booking
 * event pushes AVAILABILITY ONLY. The two only travel together for onboarding, an explicit
 * full refresh, and scheduled/cron reconciliation.
 */
export type RuDeltaScope = 'rates' | 'availability' | 'both';

/** Availability/inventory-only triggers — never attach Push_PutPrices_RQ. */
const AVAILABILITY_ONLY =
  /^(booking_|restriction_|stop_sell|minimum_stay|maximum_stay|min_stay|max_stay|lead_days|availability|block|unblock|release|partial_release|calendar_block|checkin|checkout|reservation_)/;

/** Price-only triggers — never attach Push_PutAvb_RQ. */
const RATES_ONLY =
  /^(rate_|rates_|price_|prices_|season_|seasons_|tariff|currency_|discount_|derived_rate|rate_plan|shared_season)/;

/**
 * Triggers that legitimately publish the full picture: first push, operator "sync everything",
 * certification runs and the scheduled reconciliation sweeps.
 */
const FULL_SCOPE =
  /^(onboard|initial|full|manual|cron|scheduled|nightly|weekly|reconcil|certification|repair|currency_flip_repair|coverage_repair)/;

export function ruDeltaScopeForTrigger(trigger: string | null | undefined): RuDeltaScope {
  const t = (trigger ?? '').trim().toLowerCase();
  if (!t) return 'both';
  if (FULL_SCOPE.test(t)) return 'both';
  if (AVAILABILITY_ONLY.test(t)) return 'availability';
  if (RATES_ONLY.test(t)) return 'rates';
  return 'both';
}
