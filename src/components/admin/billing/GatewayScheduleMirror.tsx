import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import {
  GATEWAY_MODEL_LABELS,
  getEffectiveBillingRate,
  listGatewaySchedules,
  normalizeGatewayModel,
  normalizeVolumeTiers,
  summariseVolumeTiers,
} from "@/lib/gatewayBillingRate";

const money = (v: number, currency = "ZAR") =>
  `${currency === "ZAR" ? "R" : `${currency} `}${v.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;

/**
 * Read-only mirror of the processing rate that billing will actually apply.
 * The rate lives in Gateway Schedules — this panel only reports it so the
 * billing preset and the billing run can never disagree.
 */
export function GatewayScheduleMirror({ fallbackRate }: { fallbackRate?: string }) {
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["gateway-billing-configs", "list"],
    queryFn: listGatewaySchedules,
  });

  const active = useMemo(() => schedules.find((s) => s.is_active) ?? null, [schedules]);

  const rate = useMemo(() => (active ? getEffectiveBillingRate(active, 0, 0, null) : null), [active]);
  const tiers = useMemo(() => normalizeVolumeTiers(active?.volume_tiers), [active]);

  if (isLoading) {
    return <p className="text-[11px] text-muted-foreground">Loading the active gateway schedule…</p>;
  }

  if (!active || !rate) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          No active gateway schedule. Billing falls back to the legacy flat rate
          {fallbackRate ? ` of ${fallbackRate}%` : ""}. Publish a schedule in{" "}
          <Link to="/admin/billing-defaults" className="underline">
            Gateway Schedules
          </Link>{" "}
          to take control of the processing rate.
        </span>
      </div>
    );
  }

  const model = normalizeGatewayModel(active.model);
  const banded = model === "hybrid" || model === "volume_tiered";

  return (
    <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium">
          {rate.percentage}%
          {rate.fixed_fee > 0 ? ` + ${money(rate.fixed_fee, rate.currency)} per transaction` : ""}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {active.name}
        {active.version != null ? ` (v${active.version})` : ""} — {GATEWAY_MODEL_LABELS[model]}
        {banded && tiers.length ? `, banded on monthly processed volume: ${summariseVolumeTiers(tiers, rate.currency)}` : ""}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Rates are edited in{" "}
        <Link to="/admin/billing-defaults" className="underline">
          Gateway Schedules
        </Link>
        . A negotiated rate for a single property is set on that property's payment schedule card.
      </p>
    </div>
  );
}
