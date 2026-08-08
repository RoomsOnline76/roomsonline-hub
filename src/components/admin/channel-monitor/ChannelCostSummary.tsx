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
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className={cn(accent && "border-primary")}>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", accent && "text-primary")}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ChannelCostSummary({ data }: Props) {
  const { forecast, fx, billableListings, activeProperties, pausedProperties, archivedProperties } = data;
  const zar = fx ? formatZar(forecast.billableEur * fx.eurToZar) : "ZAR rate unavailable";

  const driverLabel =
    forecast.driver === "grace"
      ? "Grace period — nothing billable"
      : forecast.driver === "minimum"
        ? `Minimum commitment applies (usage ${formatEur(forecast.usageEur)})`
        : "Actual usage exceeds the minimum";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          accent
          label={`Forecast · ${forecast.monthLabel}`}
          value={formatEur(forecast.billableEur)}
          hint={zar}
        />
        <Stat
          label="Billable listings"
          value={String(billableListings)}
          hint={forecast.tier ? forecast.tier.label : "Below the 101-listing tier floor"}
        />
        <Stat
          label="Properties syncing"
          value={String(activeProperties)}
          hint={`${pausedProperties} paused · ${archivedProperties} archived`}
        />
        <Stat
          label="Units archived this month"
          value={String(data.unitsArchivedThisMonth)}
          hint={`${data.archivedUnits} inactive units still hold a listing id`}
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
              <span className="text-foreground tabular-nums">{formatEur(data.nextStep.billableEur)}</span> at today's
              listing count
            </span>
          )}

          {data.nextTier ? (
            <span className="text-muted-foreground">
              {data.nextTier.needed} more listings drop the rate to{" "}
              <span className="text-foreground">{formatEur(data.nextTier.rateEur)}</span> per listing
            </span>
          ) : (
            <span className="text-muted-foreground">Lowest per-listing rate reached</span>
          )}

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
