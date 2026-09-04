export type GuestStayQuote = {
  shape?: string;
  stay_total?: number;
  display_per_night?: number;
  nights?: number;
  /** Server flag: `stay_total` is the billable figure, not the nightly sum. */
  total_authoritative?: boolean;
};

/**
 * Accommodation subtotal.
 * The engine's stay total wins whenever the server marks it authoritative (full stay
 * pricing, or a length-of-stay ladder that could not be laid over the published nightly
 * series). Everything else keeps the nightly sum.
 */
export function stayQuotedTotal(
  stayQuote: GuestStayQuote | null | undefined,
  nightlySum: number,
): number {
  const total = Number(stayQuote?.stay_total);
  if (!(total > 0)) return nightlySum;
  if (stayQuote?.shape === "full_stay" || stayQuote?.total_authoritative === true) {
    return Math.round(total * 100) / 100;
  }
  return nightlySum;
}
