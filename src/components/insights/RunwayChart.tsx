import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface FinancialMetric {
  id: string;
  metric_date: string;
  cash_balance_usd: number | null;
  cash_balance_zar: number | null;
  monthly_burn_usd: number | null;
  monthly_revenue_usd: number | null;
  monthly_burn_zar?: number | null;
  monthly_revenue_zar?: number | null;
  runway_months: number | null;
  exchange_rate: number | null;
}

interface RunwayChartProps {
  metrics: FinancialMetric[];
  isLoading: boolean;
}

export function RunwayChart({ metrics, isLoading }: RunwayChartProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const sortedMetrics = [...metrics].sort(
    (a, b) => new Date(a.metric_date).getTime() - new Date(b.metric_date).getTime()
  );

  // Prefer the stored ZAR values; fall back to converting the USD history.
  const getZarCash = (m: FinancialMetric) => {
    if (m.cash_balance_zar) return Number(m.cash_balance_zar);
    if (m.cash_balance_usd) return Number(m.cash_balance_usd) * (m.exchange_rate || 18.5);
    return null;
  };

  const getZarBurn = (m: FinancialMetric) => {
    if (m.monthly_burn_zar) return Number(m.monthly_burn_zar);
    if (m.monthly_burn_usd) return Number(m.monthly_burn_usd) * (m.exchange_rate || 18.5);
    return null;
  };

  const getZarRevenue = (m: FinancialMetric) => {
    if (m.monthly_revenue_zar) return Number(m.monthly_revenue_zar);
    if (m.monthly_revenue_usd) return Number(m.monthly_revenue_usd) * (m.exchange_rate || 18.5);
    return null;
  };

  const chartData = sortedMetrics.map((m) => {
    const cashZar = getZarCash(m);
    return {
      date: format(new Date(m.metric_date), "MMM yy"),
      fullDate: m.metric_date,
      // 999 is the cash-flow-positive sentinel — don't plot it as a runway spike.
      runway: m.runway_months === 999 ? null : m.runway_months,
      cash: cashZar ? cashZar / 1000 : null, // Show in thousands (ZAR)
      burn: getZarBurn(m),
      revenue: getZarRevenue(m),
    };
  });


  const formatZAR = (value: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculate trend
  const latestRunway = sortedMetrics[sortedMetrics.length - 1]?.runway_months;
  const previousRunway = sortedMetrics[sortedMetrics.length - 2]?.runway_months;
  const runwayTrend = latestRunway && previousRunway 
    ? latestRunway - previousRunway 
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Runway Trend</CardTitle>
              <CardDescription>Months of runway over time</CardDescription>
            </div>
            {runwayTrend !== 0 && (
              <div className={`flex items-center gap-1 text-sm ${runwayTrend > 0 ? "text-green-500" : "text-red-500"}`}>
                {runwayTrend > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {Math.abs(runwayTrend).toFixed(1)} months
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              No metrics recorded yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="runwayGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value: number) => [`${value?.toFixed(1)} months`, "Runway"]}
                />
                <Area
                  type="monotone"
                  dataKey="runway"
                  stroke="hsl(var(--primary))"
                  fill="url(#runwayGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash & Burn (ZAR)</CardTitle>
          <CardDescription>Cash balance (K) and monthly burn rate in Rand</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              No metrics recorded yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="left" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value: number, name: string) => {
                    if (name === "cash") return [formatZAR(value * 1000), "Cash Balance"];
                    return [formatZAR(value), "Monthly Burn"];
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="cash"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="burn"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
