import type { StayQuote, StayQuoteInput, StayQuoteShape } from "./ratePricing.ts";
import type { UnitRateContext } from "./rateResolution.ts";

/**
 * The modify-booking reprice, expressed as a pure function of an already loaded resolver.
 *
 * Kept out of `modify-booking/index.ts` so the selection contract can be unit-tested without
 * importing the handler. Fails closed: an unpriced night yields `null`, which keeps the
 * existing "cannot reprice" path — never a rack gap-fill dressed up as a quote.
 */
export interface RolModifyQuote {
  total: number;
  rate_plan_id: string;
  nightly: number | null;
  source: string | null;
  shape: StayQuoteShape;
}

interface QuotingResolver {
  quoteStay(unit: UnitRateContext, stay: StayQuoteInput): StayQuote;
}

export function rolModifyQuote(
  resolver: QuotingResolver,
  unit: UnitRateContext,
  stay: StayQuoteInput,
  planId: string,
): RolModifyQuote | null {
  const quote = resolver.quoteStay(unit, stay);
  if (!(quote.stay_total > 0)) return null;
  const total = Math.round(Number(quote.stay_total) * 100) / 100;
  if (!(total > 0)) return null;
  return {
    total,
    rate_plan_id: planId,
    nightly: Number.isFinite(quote.display_per_night) ? quote.display_per_night : null,
    source: quote.source ? String(quote.source) : null,
    shape: quote.shape,
  };
}
