import { supabase } from "@/integrations/supabase/client";
import { resolvePropertyTier, isTierStrategy } from "@/lib/billingTierResolver";

const STRATEGY_LABELS: Record<string, string> = {
  default: "Standard Commission",
  widget: "Widget Distribution",
  saas: "SaaS Subscription",
  portfolio: "Portfolio Partnership",
  enterprise: "Enterprise Agreement",
  "volume-tiered": "Volume-Tiered Pricing",
  payment_facilitator: "Payment Facilitator",
};

function numberToWords(n: number): string {
  const ones = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
    "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if (n < 20) return ones[n] || String(n);
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
  return String(n);
}

export interface BillingContractVariables {
  billing_strategy_label: string;
  commission_rate: string;
  commission_clause: string;
  subscription_fee_monthly: string;
  subscription_clause: string;
  white_label_monthly_fee: string;
  white_label_clause: string;
  payment_facilitator_fee: string;
  payment_facilitator_clause: string;
  byo_gateway_fee: string;
  byo_gateway_clause: string;
  volume_tier_clause: string;
  tier_monthly_fee: string;
  tier_room_count: string;
  tier_clause: string;
}

/**
 * Fetches billing config for a property (or first of a set) and returns
 * pre-rendered clause variables for contract template substitution.
 */
export async function resolveBillingContractVariables(
  propertyIds: string[]
): Promise<BillingContractVariables> {
  const empty: BillingContractVariables = {
    billing_strategy_label: "Standard Commission",
    commission_rate: "ten percent (10%)",
    commission_clause: "",
    subscription_fee_monthly: "",
    subscription_clause: "",
    white_label_monthly_fee: "",
    white_label_clause: "",
    payment_facilitator_fee: "",
    payment_facilitator_clause: "",
    byo_gateway_fee: "",
    byo_gateway_clause: "<!-- N/A -->",
    volume_tier_clause: "",
    tier_monthly_fee: "",
    tier_room_count: "",
    tier_clause: "<!-- N/A -->",
  };

  if (!propertyIds.length) return empty;

  // Fetch billing config and global defaults in parallel
  const [configRes, globalsRes] = await Promise.all([
    supabase
      .from("property_billing_configs")
      .select("billing_strategy, commission_rate, subscription_fee_monthly, transaction_fee_percentage, byo_gateway_monthly_fee, white_label_monthly_fee, white_label_allowed, payment_facilitator_enabled")
      .in("property_id", propertyIds)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("billing_global_defaults")
      .select("*")
      .limit(1)
      .maybeSingle(),
  ]);

  const config = configRes.data as Record<string, any> | null;
  const globals = globalsRes.data as Record<string, any> | null;

  const strategy = config?.billing_strategy || "default";
  const commissionRate = config?.commission_rate ?? globals?.default_commission_rate ?? 10;
  const subscriptionFee = config?.subscription_fee_monthly ?? globals?.default_subscription_fee;
  const whiteLabel = config?.white_label_allowed;
  const whiteLabelFee = config?.white_label_monthly_fee ?? globals?.white_label_monthly_fee;
  const payFacEnabled = config?.payment_facilitator_enabled;
  const payFacFee = config?.transaction_fee_percentage ?? globals?.default_transaction_fee;
  const byoFee = config?.byo_gateway_monthly_fee ?? globals?.byo_gateway_monthly_fee;

  const words = numberToWords(Math.round(commissionRate));

  // Resolve room-count tier for tiered strategies
  let tierMonthlyFee = "";
  let tierRoomCount = "";
  let tierClause: string = "<!-- N/A -->";
  if (isTierStrategy(strategy)) {
    try {
      const info = await resolvePropertyTier(propertyIds[0]);
      if (info.tier) {
        tierMonthlyFee = String(info.tier.monthly_fee);
        tierRoomCount = String(info.rooms);
        const feeWords = numberToWords(Math.round(info.tier.monthly_fee));
        const roomsWords = numberToWords(info.rooms);
        const scopeLabel = info.scope === "portfolio" ? "portfolio" : "property";
        tierClause = `Based on a ${scopeLabel} of ${roomsWords} (${info.rooms}) rooms, the applicable monthly subscription is ${feeWords} Rand (R${info.tier.monthly_fee}) per month.`;
      }
    } catch (e) {
      console.warn("[contractBillingVariables] tier resolution failed", e);
    }
  }

  const result: BillingContractVariables = {
    billing_strategy_label: STRATEGY_LABELS[strategy] || strategy,
    commission_rate: `${words} percent (${commissionRate}%)`,
    commission_clause: "",
    subscription_fee_monthly: subscriptionFee ? String(subscriptionFee) : "",
    subscription_clause: subscriptionFee && subscriptionFee > 0 ? "" : "<!-- N/A -->",
    white_label_monthly_fee: whiteLabelFee ? String(whiteLabelFee) : "",
    white_label_clause: whiteLabel ? "" : "<!-- N/A -->",
    payment_facilitator_fee: payFacFee ? String(payFacFee) : "",
    payment_facilitator_clause: payFacEnabled ? "" : "<!-- N/A -->",
    volume_tier_clause: strategy === "volume_tiered" ? "" : "<!-- N/A -->",
    tier_monthly_fee: tierMonthlyFee,
    tier_room_count: tierRoomCount,
    tier_clause: tierClause,
  };

  return result;
}
