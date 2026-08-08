import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEur, formatZar } from "@/lib/channelBillingForecast";
import type { ChannelCostMonitorData } from "@/hooks/useChannelCostMonitor";
import { cn } from "@/lib/utils";

interface Props {
  data: ChannelCostMonitorData;
}

function Stat({
  label,
  value,
  hint,
  accent,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className={cn(accent && "border-primary")}>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          accent && "text-primary",
          danger && "text-destructive font-bold"
        )}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ChannelCostSummary({ data }: Props) {
  const {
    forecast,
    fx,
    billableListings,
    activeProperties,
    pausedProperties,
    archivedProperties,
    rolPerListingZar,
    rolRevenueZar,
    effectiveRateEur,
  } = data;

  const toZar = (eur: number) => (fx ? formatZar(eur * fx.eurToZar) : null);
  const costZar = fx ? forecast.billableEur * fx.eurToZar : null;
  const zar = costZar != null ? formatZar(costZar) : "ZAR rate unavailable";

  const rateHint = (() => {
    const parts: string[] = [];
    if (effectiveRateEur != null) {
      const r = toZar(effectiveRateEur);
      parts.push(`Cost ${formatEur(effectiveRateEur)}${r ? ` / ${r}` : ""} per listing`);
    } else {
      parts.push(forecast.tier ? forecast.tier.label : "Below the 101-listing tier floor");
    }
    if (rolPerListingZar != null) parts.push(`ROL bills ${formatZar(rolPerListingZar)}/listing/mo`);
    return parts.join(" · ");
  })();

  const marginZar =
    rolRevenueZar != null && costZar != null ? rolRevenueZar - costZar : rolRevenueZar != null ? null : null;

  const marginPerListing =
    marginZar != null && billableListings > 0 ? marginZar / billableListings : null;

  const driverLabel =
    forecast.driver === "grace"
      ? "Grace period — nothing billable"
      : forecast.driver === "minimum"
        ? `Minimum commitment applies (usage ${formatEur(forecast.usageEur)})`
        : "Actual usage exceeds the minimum";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          accent
          label={`Forecast cost · ${forecast.monthLabel}`}
          value={formatEur(forecast.billableEur)}
          hint={zar}
        />
        <Stat
          label="Billable listings"
          value={String(billableListings)}
          hint={rateHint}
        />
        <Stat
          label="ROL revenue (default)"
          value={rolRevenueZar != null ? formatZar(rolRevenueZar) : "Not configured"}
          hint={
            rolPerListingZar != null
              ? `${formatZar(rolPerListingZar)} × ${billableListings} listings / mo`
              : "Set the channel manager per-unit fee in billing defaults"
          }
        />
        <Stat
          label="Channel margin"
          value={marginZar != null ? formatZar(marginZar) : "—"}
          hint={
            forecast.driver === "grace"
              ? "Grace period — full revenue is margin"
              : marginPerListing != null
                ? `${formatZar(marginPerListing)} per listing spread`
                : "Needs FX rate and default fee"
          }
        />
        <Stat
          label="Properties syncing"
          value={String(activeProperties)}
          hint={`${pausedProperties} paused · ${archivedProperties} archived`}
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={forecast.driver === "usage" ? "default" : "secondary"}>{forecast.minimumLabel}</Badge>
            <span className="text-muted-foreground">{driverLabel}</span>
          </div>

          {data.nextStep && (
            <span className="text-muted-foreground">
              Next step · <span className="text-foreground">{data.nextStep.monthLabel}</span> becomes{" "}
              <span className="text-foreground tabular-nums">{formatEur(data.nextStep.billableEur)}</span>
              {toZar(data.nextStep.billableEur) && (
                <span className="tabular-nums"> ({toZar(data.nextStep.billableEur)})</span>
              )}{" "}
              at today's listing count
            </span>
          )}

          {data.nextTier ? (
            <span className="text-muted-foreground">
              {data.nextTier.needed} more listings drop the rate to{" "}
              <span className="text-foreground">{formatEur(data.nextTier.rateEur)}</span>
              {toZar(data.nextTier.rateEur) && (
                <span className="text-foreground tabular-nums"> ({toZar(data.nextTier.rateEur)})</span>
              )}{" "}
              per listing
            </span>
          ) : (
            <span className="text-muted-foreground">Lowest per-listing rate reached</span>
          )}

          <span className="text-muted-foreground">
            Units archived this month · <span className="text-foreground">{data.unitsArchivedThisMonth}</span>
          </span>

          {fx && (
            <span className="ml-auto text-xs text-muted-foreground">
              EUR/ZAR {fx.eurToZar.toFixed(4)} · {fx.source} · {new Date(fx.fetchedAt).toLocaleDateString()}
            </span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

