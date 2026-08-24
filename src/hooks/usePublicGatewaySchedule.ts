import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  GatewayBillingConfig,
  GatewayVolumeTier,
  normalizeGatewayModel,
  normalizeVolumeTiers,
  summariseVolumeTiers,
} from "@/lib/gatewayBillingRate";

/**
 * The active payment-processing schedule for public pages.
 *
 * Connect is anonymous, so the numbers come from the `public-gateway-schedule`
 * function rather than the table. Every public surface reads this hook instead
 * of hard-coding a percentage, so the page, the FAQ and the signed contract
 * cannot drift. When the schedule cannot be read, `schedule` is null and callers
 * must fall back to prose rather than showing a stale figure.
 */
export interface PublicGatewaySchedule {
  schedule: GatewayBillingConfig | null;
  tiers: GatewayVolumeTier[];
  /** Headline percentage for the entry band (or the base percentage). */
  headlinePercentage: number | null;
  headlineFixedFee: number | null;
  monthlyFee: number;
  /** Lowest percentage on the schedule — what high volume earns you. */
  bestPercentage: number | null;
  isBanded: boolean;
  currency: string;
  summary: string;
  isLoading: boolean;
}

const fmt = (n: number, currency: string) =>
  `${currency === "ZAR" ? "R" : `${currency} `}${n.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;

/** Formats a band's volume range, e.g. "Up to R50,000" / "R250,000 and above". */
export function formatVolumeBand(tier: GatewayVolumeTier, currency = "ZAR"): string {
  if (tier.max_monthly_volume == null) return `${fmt(tier.min_monthly_volume, currency)} and above`;
  if (tier.min_monthly_volume <= 0) return `Up to ${fmt(tier.max_monthly_volume, currency)}`;
  return `${fmt(tier.min_monthly_volume, currency)} – ${fmt(tier.max_monthly_volume, currency)}`;
}

export function formatScheduleMoney(value: number | null | undefined, currency = "ZAR"): string {
  return value == null ? "—" : fmt(value, currency);
}

export function usePublicGatewaySchedule(): PublicGatewaySchedule {
  const { data, isLoading } = useQuery({
    queryKey: ["public-gateway-schedule"],
    queryFn: async (): Promise<GatewayBillingConfig | null> => {
      const { data, error } = await supabase.functions.invoke("public-gateway-schedule", { method: "GET" });
      if (error) return null;
      return ((data as { schedule?: GatewayBillingConfig | null } | null)?.schedule as GatewayBillingConfig) || null;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return useMemo(() => {
    const schedule = data ?? null;
    const tiers = normalizeVolumeTiers(schedule?.volume_tiers);
    const currency = schedule?.currency || "ZAR";
    const model = normalizeGatewayModel(schedule?.model);
    const isBanded = (model === "hybrid" || model === "volume_tiered") && tiers.length > 0;
    const entry = tiers[0] ?? null;

    return {
      schedule,
      tiers,
      headlinePercentage: entry?.percentage ?? schedule?.base_percentage ?? null,
      headlineFixedFee: entry?.fixed_fee ?? schedule?.fixed_fee_per_txn ?? null,
      monthlyFee: Number(schedule?.monthly_platform_fee) || 0,
      bestPercentage: tiers.length
        ? Math.min(...tiers.map((t) => t.percentage))
        : (schedule?.base_percentage ?? null),
      isBanded,
      currency,
      summary: summariseVolumeTiers(tiers, currency),
      isLoading,
    };
  }, [data, isLoading]);
}
