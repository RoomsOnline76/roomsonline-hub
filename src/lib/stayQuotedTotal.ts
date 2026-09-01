export type GuestStayQuote = {
  shape?: string;
  stay_total?: number;
  display_per_night?: number;
  nights?: number;
};

/** Accommodation subtotal. FSP uses the pinned stay total; everything else keeps the nightly sum. */
export function stayQuotedTotal(
  stayQuote: GuestStayQuote | null | undefined,
  nightlySum: number,
): number {
  if (stayQuote?.shape === "full_stay" && Number(stayQuote.stay_total) > 0) {
    return Math.round(Number(stayQuote.stay_total) * 100) / 100;
  }
  return nightlySum;
}
