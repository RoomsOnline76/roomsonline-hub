import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, MousePointerClick, Eye } from "lucide-react";

interface IntegrationAnalyticsProps {
  propertyId: string;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(217, 91%, 60%)",
];

const formatType = (type: string) => {
  const map: Record<string, string> = {
    direct: "Direct Link",
    widget: "Widget",
    booking_bar: "Booking Bar",
    full_embed: "Full Embed",
    wordpress: "WordPress",
    api: "API",
  };
  return map[type] || type;
};

export function IntegrationAnalytics({ propertyId }: IntegrationAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [logsByType, setLogsByType] = useState<Array<{ type: string; loads: number; clicks: number }>>([]);
  const [bookingsByType, setBookingsByType] = useState<Array<{ name: string; value: number }>>([]);
  const [totalLoads, setTotalLoads] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);

      // Fetch integration logs grouped by type & event
      const { data: logs } = await supabase
        .from("integration_logs")
        .select("integration_type, event")
        .eq("property_id", propertyId);

      // Fetch bookings with integration tracking
      const { data: bookings } = await supabase
        .from("bookings")
        .select("integration_type")
        .eq("property_id", propertyId)
        .not("integration_type", "is", null);

      // Aggregate logs
      const logMap = new Map<string, { loads: number; clicks: number }>();
      let loads = 0;
      (logs || []).forEach((log) => {
        const entry = logMap.get(log.integration_type) || { loads: 0, clicks: 0 };
        if (log.event === "loaded") { entry.loads++; loads++; }
        if (log.event === "click" || log.event === "booking_initiated") entry.clicks++;
        logMap.set(log.integration_type, entry);
      });

      setLogsByType(
        Array.from(logMap.entries()).map(([type, data]) => ({
          type: formatType(type),
          loads: data.loads,
          clicks: data.clicks,
        }))
      );
      setTotalLoads(loads);

      // Aggregate bookings
      const bookingMap = new Map<string, number>();
      (bookings || []).forEach((b) => {
        const t = b.integration_type || "unknown";
        bookingMap.set(t, (bookingMap.get(t) || 0) + 1);
      });
      setBookingsByType(
        Array.from(bookingMap.entries()).map(([name, value]) => ({
          name: formatType(name),
          value,
        }))
      );
      setTotalBookings(bookings?.length || 0);

      setLoading(false);
    };

    if (propertyId) fetchAnalytics();
  }, [propertyId]);

  if (loading) {
    return (
      <div className="grid md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-32" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Eye className="h-3.5 w-3.5" /> Widget Loads
            </div>
            <p className="text-2xl font-bold text-foreground">{totalLoads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MousePointerClick className="h-3.5 w-3.5" /> Bookings via Integrations
            </div>
            <p className="text-2xl font-bold text-foreground">{totalBookings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Activity className="h-3.5 w-3.5" /> Conversion Rate
            </div>
            <p className="text-2xl font-bold text-foreground">
              {totalLoads > 0 ? `${((totalBookings / totalLoads) * 100).toFixed(1)}%` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Load/Click bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Widget Activity by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {logsByType.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={logsByType}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="loads" fill="hsl(var(--chart-2))" name="Loads" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="clicks" fill="hsl(var(--primary))" name="Clicks" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet</p>
            )}
          </CardContent>
        </Card>

        {/* Bookings pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bookings by Integration</CardTitle>
          </CardHeader>
          <CardContent>
            {bookingsByType.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={bookingsByType} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                      {bookingsByType.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No integration bookings yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
