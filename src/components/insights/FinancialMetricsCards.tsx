import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, Calendar, Gauge, Coins } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatZar } from "@/lib/burnRate";

interface FinancialMetricsCardsProps {
  /** Derived monthly burn (recurring commitments) in ZAR. */
  monthlyBurn: number;
  /** How many distinct recurring commitments drive the burn. */
  commitmentCount?: number;
  /** Actual ROL revenue per month (commission + subscriptions) in ZAR. */
  monthlyRevenue?: number;
  netBurn?: number;
  unpaidTotal: number;
  ytdTotal: number;
  runwayMonths?: number | null;
  cashFlowPositive?: boolean;
  cashBalance?: number | null;
  isLoading: boolean;
}

export function FinancialMetricsCards({
  monthlyBurn,
  commitmentCount = 0,
  monthlyRevenue = 0,
  netBurn = 0,
  unpaidTotal,
  ytdTotal,
  runwayMonths,
  cashFlowPositive = false,
  cashBalance,
  isLoading,
}: FinancialMetricsCardsProps) {
  const getRunwayColor = (months: number) => {
    if (months >= 12) return "text-green-500";
    if (months >= 6) return "text-yellow-500";
    return "text-red-500";
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Burn</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatZar(monthlyBurn)}</div>
          <p className="text-xs text-muted-foreground">
            Derived from {commitmentCount} recurring commitment
            {commitmentCount === 1 ? "" : "s"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Actual Revenue</CardTitle>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatZar(monthlyRevenue)}</div>
          <p className="text-xs text-muted-foreground">
            Commission &amp; subscriptions per month
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Unpaid Invoices</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatZar(unpaidTotal)}</div>
          <p className="text-xs text-muted-foreground">Outstanding balance</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Period Spend</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatZar(ytdTotal)}</div>
          <p className="text-xs text-muted-foreground">Total for selected period</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Runway</CardTitle>
          <Gauge className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {cashFlowPositive ? (
            <>
              <div className="text-2xl font-bold text-green-500">Cash-flow positive</div>
              <p className="text-xs text-muted-foreground">
                Revenue covers recurring costs
              </p>
            </>
          ) : (
            <>
              <div
                className={`text-2xl font-bold ${
                  runwayMonths ? getRunwayColor(runwayMonths) : ""
                }`}
              >
                {runwayMonths ? `${runwayMonths.toFixed(1)} months` : "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                {netBurn > 0
                  ? `${formatZar(netBurn)} net burn${
                      cashBalance ? ` · ${formatZar(cashBalance)} cash` : ""
                    }`
                  : "Add cash balance to calculate"}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
