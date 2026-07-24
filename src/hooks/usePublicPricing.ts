import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PublicPricingTier {
  min_rooms: number;
  max_rooms: number | null;
  max_properties?: number | null;
  monthly_fee: number | null;
  label?: string;
}

export interface PublicPricingData {
  rolosTiers: PublicPricingTier[];
  brandingAddonMonthly: number | null;
  whiteLabelMonthly: number | null;
  pricelabsMonthly: number | null;
  byoGatewayMonthly: number | null;
  widgetFlatCommissionRate: number | null;
  otaCommissionRate: number | null;
}

const FALLBACK: PublicPricingData = {
  rolosTiers: [
    { min_rooms: 0, max_rooms: 9, max_properties: null, monthly_fee: 450, label: "0–9 rooms" },
    { min_rooms: 10, max_rooms: 19, max_properties: null, monthly_fee: 600, label: "10–19 rooms" },
    { min_rooms: 20, max_rooms: 50, max_properties: null, monthly_fee: 750, label: "20–50 rooms" },
    { min_rooms: 51, max_rooms: null, max_properties: null, monthly_fee: 925, label: "51+ rooms" },
  ],
  brandingAddonMonthly: 150,
  whiteLabelMonthly: 450,
  pricelabsMonthly: 250,
  byoGatewayMonthly: 250,
  widgetFlatCommissionRate: 2,
  otaCommissionRate: 10,
};

export function usePublicPricing() {
  return useQuery({
    queryKey: ["public-pricing-defaults"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PublicPricingData> => {
      const { data, error } = await supabase
        .from("billing_global_defaults")
        .select("strategy, tier_pricing_json, branding_addon_monthly_fee, white_label_monthly_fee, pricelabs_monthly_fee, byo_gateway_monthly_fee, widget_flat_commission_rate, default_commission_rate");

      if (error || !data) return FALLBACK;

      const rolos = data.find((r: any) => r.strategy === "rolos_pms");
      const widget = data.find((r: any) => r.strategy === "widget");

      const tiers: PublicPricingTier[] = Array.isArray(rolos?.tier_pricing_json)
        ? (rolos!.tier_pricing_json as unknown as PublicPricingTier[])
        : FALLBACK.rolosTiers;

      return {
        rolosTiers: tiers,
        brandingAddonMonthly: rolos?.branding_addon_monthly_fee ?? FALLBACK.brandingAddonMonthly,
        whiteLabelMonthly: rolos?.white_label_monthly_fee ?? FALLBACK.whiteLabelMonthly,
        pricelabsMonthly: rolos?.pricelabs_monthly_fee ?? FALLBACK.pricelabsMonthly,
        byoGatewayMonthly: rolos?.byo_gateway_monthly_fee ?? FALLBACK.byoGatewayMonthly,
        widgetFlatCommissionRate:
          rolos?.widget_flat_commission_rate ??
          widget?.default_commission_rate ??
          FALLBACK.widgetFlatCommissionRate,
        otaCommissionRate: rolos?.default_commission_rate ?? FALLBACK.otaCommissionRate,
      };
    },
  });
}

export function formatZar(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}
