import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { callPmsApi } from "@/hooks/usePmsApi";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

interface Metric {
  date: string;
  occupancy_rate: number;
  adr: number;
  revpar: number;
  revenue: number;
}

export default function PMSReports() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await callPmsApi<{ metrics: Metric[] }>("get_daily_metrics", { propertyId });
        if (res.success) setMetrics(res.data?.metrics || []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetch();
  }, [propertyId]);

  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  const latestMetric = metrics[metrics.length - 1];

  return (
    <PMSLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">PMS Reports</h1>

        {metrics.length === 0 ? (
          <Card><CardContent className="py-12 text-center"><BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No metrics data yet. Metrics are generated daily from booking activity.</p></CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Occupancy Rate</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{latestMetric?.occupancy_rate?.toFixed(1) || 0}%</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">ADR</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">R{latestMetric?.adr?.toFixed(0) || 0}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">RevPAR</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">R{latestMetric?.revpar?.toFixed(0) || 0}</p></CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Occupancy Trend</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="occupancy_rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PMSLayout>
  );
}
