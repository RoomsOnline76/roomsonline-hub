import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney, type MonthlyPoint, type OwnerBalances } from "@/lib/ownerAccount";

interface Props {
  series: MonthlyPoint[];
  balances: OwnerBalances;
}

export function AccountAnalyticsTab({ series, balances }: Props) {
  const currency = balances.currency;

  const summary = useMemo(() => {
    const revenue = series.reduce((s, p) => s + p.revenue, 0);
    const charged = series.reduce((s, p) => s + p.charged, 0);
    const bookings = series.reduce((s, p) => s + p.bookings, 0);
    return {
      revenue,
      charged,
      bookings,
      avgBooking: bookings ? revenue / bookings : 0,
      costPct: revenue ? (charged / revenue) * 100 : 0,
    };
  }, [series]);

  const tiles = [
    { label: "Revenue through ROL", value: fmtMoney(summary.revenue, currency) },
    { label: "Charged by ROL", value: fmtMoney(summary.charged, currency) },
    { label: "Cost of distribution", value: `${summary.costPct.toFixed(1)}%` },
    { label: "Average booking value", value: fmtMoney(summary.avgBooking, currency) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="border-border/60">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div className="text-lg font-semibold">{t.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Revenue generated vs charged by ROL</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {series.length === 0 ? (
            <p className="text-xs text-muted-foreground">No booking activity yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtMoney(Number(v), currency)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="charged" name="Charged by ROL" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cost of distribution (%)</CardTitle>
        </CardHeader>
        <CardContent className="h-60">
          {series.length === 0 ? (
            <p className="text-xs text-muted-foreground">No booking activity yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => `${Number(v).toFixed(1)}%`} />
                <Line type="monotone" dataKey="costPct" name="Cost %" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Since engagement</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground">Total paid to ROL</div>
            <div className="text-base font-semibold">{fmtMoney(balances.paidAllTime, currency)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total received from ROL</div>
            <div className="text-base font-semibold">{fmtMoney(balances.receivedAllTime, currency)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Net position</div>
            <div className="text-base font-semibold">{fmtMoney(balances.net, currency)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
