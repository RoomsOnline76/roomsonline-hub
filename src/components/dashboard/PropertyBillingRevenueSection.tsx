import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Receipt, TrendingUp, AlertTriangle } from "lucide-react";
import { ROLKPICard } from "./ROLKPICard";
import { PropertyBillingTable } from "./PropertyBillingTable";
import { usePropertyBillingRevenue } from "@/hooks/usePropertyBillingRevenue";

const zar = (value: number) =>
  `R ${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface Props {
  start: string;
  end: string;
}

/**
 * Property billing & subscriptions on ROL Pulse → Revenue: contracted monthly
 * recurring, once-off setup income, what has actually been invoiced and paid in
 * the selected period, and per-client detail.
 */
export function PropertyBillingRevenueSection({ start, end }: Props) {
  const { data, isLoading } = usePropertyBillingRevenue({ start, end });
  const t = data?.totals;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4">
        <ROLKPICard
          title="Expected MRR"
          value={t ? zar(t.monthlyExpected) : "-"}
          subtitle={t ? `${zar(t.contractedMonthly)} contracted` : "Active subscriptions"}
          icon={TrendingUp}
          isLoading={isLoading}
          valueClassName="text-primary"
        />
        <ROLKPICard
          title="Invoiced"
          value={t ? zar(t.invoicedMonthly + t.invoicedOnceOff) : "-"}
          subtitle={
            t ? `${zar(t.invoicedMonthly)} monthly · ${zar(t.invoicedOnceOff)} once-off` : "Period"
          }
          icon={Receipt}
          isLoading={isLoading}
        />
        <ROLKPICard
          title="Paid"
          value={t ? zar(t.paidMonthly + t.paidOnceOff) : "-"}
          subtitle={t ? `${zar(t.paidMonthly)} monthly · ${zar(t.paidOnceOff)} once-off` : "Settled"}
          icon={CreditCard}
          isLoading={isLoading}
        />
        <ROLKPICard
          title="Outstanding"
          value={t ? zar(t.outstanding) : "-"}
          subtitle={t && t.overdue > 0 ? `${zar(t.overdue)} overdue` : "Invoiced, unpaid"}
          icon={AlertTriangle}
          isLoading={isLoading}
          valueClassName={t && t.overdue > 0 ? "text-destructive" : undefined}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Subscriptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {(
              [
                ["Active (billing)", t?.counts.active ?? 0],
                ["In free period", t?.counts.trial ?? 0],
                ["Pending start", t?.counts.pending ?? 0],
                ["Past due", t?.counts.past_due ?? 0],
                ["Reservation only", t?.counts.reservation_only ?? 0],
                ["Cancelled", t?.counts.cancelled ?? 0],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2 font-semibold">
              <span>MRR of active set</span>
              <span className="tabular-nums">{zar(t?.activeMrr ?? 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Once-off billing revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Invoiced this period</div>
                <div className="text-[10px] text-muted-foreground">Setup &amp; activation fees</div>
              </div>
              <span className="font-semibold tabular-nums">{zar(t?.invoicedOnceOff ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Paid this period</div>
                <div className="text-[10px] text-muted-foreground">Settled upfront income</div>
              </div>
              <span className="font-semibold tabular-nums">{zar(t?.paidOnceOff ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div>
                <div className="font-medium">Still expected</div>
                <div className="text-[10px] text-muted-foreground">
                  Contracted setup fees not yet invoiced
                </div>
              </div>
              <span className="font-semibold tabular-nums">{zar(t?.setupExpected ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <PropertyBillingTable rows={data?.rows ?? []} isLoading={isLoading} />
    </div>
  );
}
