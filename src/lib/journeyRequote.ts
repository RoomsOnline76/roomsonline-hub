/**
 * Journey checkout pre-charge verification.
 *
 * A journey is planned once and paid for later, so the stored stay totals can be
 * stale by the time the guest reaches the gateway. Each stay is re-quoted by the
 * engine and compared net of packages and specials; a stay the engine cannot
 * price (external PMS, no active plan) returns `null` and is skipped rather than
 * blocking a booking the planner already priced.
 */
export interface JourneyStayQuote {
  stayId: string;
  propertyName: string;
  /** What the guest is being shown for this stay's accommodation, net of discounts. */
  shownNet: number;
  /** What the engine currently quotes net, or `null` when it could not quote. */
  serverNet: number | null;
}

export const JOURNEY_REQUOTE_TOLERANCE = 1;

/** The first stay whose shown total no longer matches the engine, if any. */
export function journeyRequoteMismatch(
  quotes: JourneyStayQuote[],
  tolerance: number = JOURNEY_REQUOTE_TOLERANCE,
): JourneyStayQuote | null {
  for (const q of quotes) {
    if (q.serverNet === null || !Number.isFinite(q.serverNet)) continue;
    if (!(q.serverNet > 0)) continue;
    if (Math.abs(q.shownNet - q.serverNet) > tolerance) return q;
  }
  return null;
}

/** Guest-facing refusal for a stale journey price. */
export function journeyRequoteMessage(stay: JourneyStayQuote): string {
  return `The price for ${stay.propertyName} has changed since you planned it — please review your journey and try again.`;
}
