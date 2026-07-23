import type { BillingDefault } from "@/hooks/useBillingDefaults";

const STRATEGY_INTRO: Record<string, string> = {
  default: "Default listing",
  widget: "Widget",
  rolos_pms: "ROL'OS PMS",
  portfolio_aggregator: "Portfolio aggregator (legacy)",
  volume_tiered: "Volume-tiered",
  payment_facilitator: "Payment facilitator",
};

/** Turns a defaults row into a plain-English one-liner for the Summary tab. */
export function summarizeStrategy(d: BillingDefault): string {
  const name = STRATEGY_INTRO[d.strategy] ?? d.strategy;
  const parts: string[] = [];
  if (d.strategy === "widget") {
    parts.push("tiered commission by monthly booking volume");
  } else if (d.default_commission_rate != null) {
    parts.push(`${d.default_commission_rate}% commission`);
  }
  if (d.default_subscription_fee != null) parts.push(`R${d.default_subscription_fee}/mo subscription`);
  if (d.default_transaction_fee != null) parts.push(`${d.default_transaction_fee}% booking surcharge (ROL facilitator)`);
  if ((d as any).byo_gateway_monthly_fee != null) parts.push(`R${(d as any).byo_gateway_monthly_fee}/mo BYO gateway add-on`);
  const tiers = (d as any).tier_pricing_json as Array<{ min_rooms: number; max_rooms: number | null; monthly_fee: number }> | null;
  if (tiers && tiers.length) {
    const summary = tiers
      .map((t) => `${t.min_rooms}${t.max_rooms == null ? "+" : `–${t.max_rooms}`} rooms: R${t.monthly_fee}`)
      .join(" · ");
    parts.push(`tiers ${summary}`);
  }
  if (!parts.length) return `${name}: no fees configured yet.`;
  return `${name}: ${parts.join(" · ")}.`;
}
