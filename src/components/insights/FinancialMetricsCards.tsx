import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingDown, Calendar, Gauge } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface FinancialMetricsCardsProps {
  monthlyBurn: number;
  unpaidTotal: number;
  ytdTotal: number;
  runwayMonths?: number | null;
  cashBalance?: number | null;
  isLoading: boolean;
}

export function FinancialMetricsCards({
  monthlyBurn,
  unpaidTotal,
  ytdTotal,
  runwayMonths,
  cashBalance,
  isLoading,
}: FinancialMetricsCardsProps) {
  const formatCurrency = (value: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getRunwayColor = (months: number) => {
    if (months >= 12) return "text-green-500";
    if (months >= 6) return "text-yellow-500";
    return "text-red-500";
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Burn</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(monthlyBurn)}</div>
          <p className="text-xs text-muted-foreground">Recurring monthly costs</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Unpaid Invoices</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(unpaidTotal)}</div>
          <p className="text-xs text-muted-foreground">Outstanding balance</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">YTD Spend</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(ytdTotal)}</div>
          <p className="text-xs text-muted-foreground">Total this year</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Runway</CardTitle>
          <Gauge className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${runwayMonths ? getRunwayColor(runwayMonths) : ""}`}>
            {runwayMonths ? `${runwayMonths.toFixed(1)} months` : "—"}
          </div>
          <p className="text-xs text-muted-foreground">
            {cashBalance ? `${formatCurrency(cashBalance)} cash` : "Add metrics to calculate"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
