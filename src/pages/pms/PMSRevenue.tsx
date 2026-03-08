import { useMemo, useState } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  format, subDays, addDays, differenceInDays, parseISO, eachDayOfInterval, startOfDay,
} from "date-fns";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb, DollarSign,
  Calendar, Target, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-ZA", { maximumFractionDigits: 0 });

// Occupancy thresholds for rate suggestions
const THRESHOLDS = {
  low: 30,
  medium: 60,
  high: 80,
};

interface DayForecast {
  date: string;
  dateLabel: string;
  occupancy: number;
  bookedRooms: number;
  totalRooms: number;
  revenue: number;
  adr: number;
  suggestion: "increase" | "decrease" | "hold";
  suggestedAdjustment: number; // percentage
  reason: string;
}

export default function PMSRevenue() {
  const { propertyId, loading: propLoading } = usePmsPropertyId();
  const [forecastDays] = useState(14);

  const today = format(new Date(), "yyyy-MM-dd");
  const futureEnd = format(addDays(new Date(), forecastDays), "yyyy-MM-dd");
  const past30 = format(subDays(new Date(), 30), "yyyy-MM-dd");

  // Fetch rooms
  const { data: rooms = [] } = useQuery({
    queryKey: ["rev-rooms", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_rooms" as any)
        .select("id")
        .eq("property_id", propertyId!);
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch upcoming bookings (next 14 days)
  const { data: futureBookings = [], isLoading: futureLoading } = useQuery({
    queryKey: ["rev-future-bookings", propertyId, today, futureEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, check_in_date, check_out_date, total_price, status, room_type_id")
        .eq("property_id", propertyId!)
        .gte("check_out_date", today)
        .lte("check_in_date", futureEnd)
        .neq("status", "cancelled");
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch past 30 days bookings for baseline
  const { data: pastBookings = [] } = useQuery({
    queryKey: ["rev-past-bookings", propertyId, past30, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, check_in_date, check_out_date, total_price, status")
        .eq("property_id", propertyId!)
        .gte("check_in_date", past30)
        .lte("check_in_date", today)
        .neq("status", "cancelled");
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch rate plans
  const { data: ratePlans = [] } = useQuery({
    queryKey: ["rev-rate-plans", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_rate_plans" as any)
        .select("id, name, base_rate, pricing_model")
        .eq("property_id", propertyId!)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!propertyId,
  });

  const totalRooms = Math.max(1, rooms.length);

  // Past 30d baseline ADR
  const baselineAdr = useMemo(() => {
    if (pastBookings.length === 0) return 0;
    const totalRev = pastBookings.reduce((s: number, b: any) => s + Number(b.total_price || 0), 0);
    return totalRev / pastBookings.length;
  }, [pastBookings]);

  // Generate daily forecast
  const forecast = useMemo<DayForecast[]>(() => {
    const days = eachDayOfInterval({
      start: startOfDay(new Date()),
      end: addDays(new Date(), forecastDays - 1),
    });

    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      // Count bookings overlapping this day
      const overlapping = futureBookings.filter((b: any) =>
        b.check_in_date <= dayStr && b.check_out_date > dayStr
      );
      const bookedRooms = Math.min(overlapping.length, totalRooms);
      const occupancy = (bookedRooms / totalRooms) * 100;
      const dayRevenue = overlapping.reduce((s: number, b: any) => {
        const nights = Math.max(1, differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date)));
        return s + Number(b.total_price || 0) / nights;
      }, 0);
      const adr = bookedRooms > 0 ? dayRevenue / bookedRooms : 0;

      let suggestion: "increase" | "decrease" | "hold" = "hold";
      let suggestedAdjustment = 0;
      let reason = "Rates are well-positioned for current demand.";

      if (occupancy >= THRESHOLDS.high) {
        suggestion = "increase";
        suggestedAdjustment = occupancy >= 90 ? 15 : 10;
        reason = `High demand (${occupancy.toFixed(0)}% occupancy). Consider raising rates to maximize RevPAR.`;
      } else if (occupancy <= THRESHOLDS.low) {
        suggestion = "decrease";
        suggestedAdjustment = occupancy <= 15 ? -20 : -10;
        reason = `Low demand (${occupancy.toFixed(0)}% occupancy). Consider promotional rates to stimulate bookings.`;
      } else if (occupancy < THRESHOLDS.medium) {
        suggestion = "decrease";
        suggestedAdjustment = -5;
        reason = `Below-average demand. A small rate reduction could improve pickup.`;
      }

      return {
        date: dayStr,
        dateLabel: format(day, "EEE dd MMM"),
        occupancy,
        bookedRooms,
        totalRooms,
        revenue: dayRevenue,
        adr,
        suggestion,
        suggestedAdjustment,
        reason,
      };
    });
  }, [futureBookings, totalRooms, forecastDays]);

  // Summary metrics
  const metrics = useMemo(() => {
    const avgOcc = forecast.reduce((s, f) => s + f.occupancy, 0) / forecast.length;
    const totalForecastRev = forecast.reduce((s, f) => s + f.revenue, 0);
    const potentialRevGain = forecast.reduce((s, f) => {
      if (f.suggestion === "increase") {
        return s + (f.revenue * f.suggestedAdjustment / 100);
      }
      return s;
    }, 0);
    const lowDemandDays = forecast.filter(f => f.occupancy < THRESHOLDS.low).length;
    const highDemandDays = forecast.filter(f => f.occupancy >= THRESHOLDS.high).length;

    return { avgOcc, totalForecastRev, potentialRevGain, lowDemandDays, highDemandDays };
  }, [forecast]);

  const chartData = forecast.map(f => ({
    date: format(parseISO(f.date), "dd MMM"),
    occupancy: Math.round(f.occupancy),
    adr: Math.round(f.adr),
    revenue: Math.round(f.revenue),
  }));

  const loading = propLoading || futureLoading;

  if (propLoading) return <PMSLayout><p className="text-muted-foreground">Loading property…</p></PMSLayout>;
  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue Management</h1>
          <p className="text-sm text-muted-foreground">
            Demand forecast & rate optimization — next {forecastDays} days
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Target className="h-3 w-3" />Forecast Occupancy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <p className="text-2xl font-bold">{metrics.avgOcc.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Avg next {forecastDays}d</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Forecast Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <p className="text-2xl font-bold">R{fmt(metrics.totalForecastRev)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Revenue Opportunity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold text-primary">+R{fmt(metrics.potentialRevGain)}</p>
                  <p className="text-xs text-muted-foreground">If rates optimized</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />Demand Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="flex items-center gap-2">
                  {metrics.highDemandDays > 0 && (
                    <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                      {metrics.highDemandDays}d high
                    </Badge>
                  )}
                  {metrics.lowDemandDays > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {metrics.lowDemandDays}d low
                    </Badge>
                  )}
                  {metrics.highDemandDays === 0 && metrics.lowDemandDays === 0 && (
                    <p className="text-sm font-medium text-muted-foreground">Balanced</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="forecast" className="space-y-4">
          <TabsList>
            <TabsTrigger value="forecast"><Calendar className="w-4 h-4 mr-1" />Demand Forecast</TabsTrigger>
            <TabsTrigger value="suggestions"><Lightbulb className="w-4 h-4 mr-1" />Rate Suggestions</TabsTrigger>
            <TabsTrigger value="plans"><DollarSign className="w-4 h-4 mr-1" />Active Plans</TabsTrigger>
          </TabsList>

          <TabsContent value="forecast" className="space-y-4">
            {/* Occupancy Forecast Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Occupancy & Revenue Forecast</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {loading ? <Skeleton className="h-full w-full" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="occupancy" name="Occupancy %" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" strokeWidth={2} />
                      <Area yAxisId="right" type="monotone" dataKey="revenue" name="Daily Revenue (R)" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2)/0.1)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Day-by-day table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Daily Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[520px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Rooms</th>
                        <th className="py-2 pr-4">Occupancy</th>
                        <th className="py-2 pr-4">Revenue</th>
                        <th className="py-2 pr-4">ADR</th>
                        <th className="py-2">Signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.map(f => (
                        <tr key={f.date} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium">{f.dateLabel}</td>
                          <td className="py-2 pr-4">{f.bookedRooms}/{f.totalRooms}</td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    f.occupancy >= THRESHOLDS.high ? "bg-primary" :
                                    f.occupancy >= THRESHOLDS.medium ? "bg-chart-2" :
                                    "bg-destructive"
                                  }`}
                                  style={{ width: `${Math.min(f.occupancy, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs">{f.occupancy.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-2 pr-4">R{fmt(f.revenue)}</td>
                          <td className="py-2 pr-4">R{fmt(f.adr)}</td>
                          <td className="py-2">
                            {f.suggestion === "increase" && (
                              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                <ArrowUpRight className="h-3 w-3 mr-0.5" />+{f.suggestedAdjustment}%
                              </Badge>
                            )}
                            {f.suggestion === "decrease" && (
                              <Badge variant="destructive" className="text-[10px]">
                                <ArrowDownRight className="h-3 w-3 mr-0.5" />{f.suggestedAdjustment}%
                              </Badge>
                            )}
                            {f.suggestion === "hold" && (
                              <Badge variant="outline" className="text-[10px]">
                                <Minus className="h-3 w-3 mr-0.5" />Hold
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            {/* Actionable suggestions */}
            <div className="grid gap-4">
              {forecast.filter(f => f.suggestion !== "hold").length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">All rates are well-positioned. No adjustments needed.</p>
                  </CardContent>
                </Card>
              ) : (
                forecast.filter(f => f.suggestion !== "hold").map(f => (
                  <Card key={f.date} className={
                    f.suggestion === "increase"
                      ? "border-primary/30"
                      : "border-destructive/30"
                  }>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{f.dateLabel}</CardTitle>
                        {f.suggestion === "increase" ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            <ArrowUpRight className="h-3 w-3 mr-1" />Increase +{f.suggestedAdjustment}%
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <ArrowDownRight className="h-3 w-3 mr-1" />Reduce {f.suggestedAdjustment}%
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">{f.reason}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-6 text-xs text-muted-foreground">
                        <span>Occupancy: {f.occupancy.toFixed(0)}%</span>
                        <span>Rooms: {f.bookedRooms}/{f.totalRooms}</span>
                        <span>Current ADR: R{fmt(f.adr)}</span>
                        {baselineAdr > 0 && (
                          <span>Suggested ADR: R{fmt(f.adr > 0 ? f.adr * (1 + f.suggestedAdjustment / 100) : baselineAdr * (1 + f.suggestedAdjustment / 100))}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="plans" className="space-y-4">
            {/* Active Rate Plans */}
            {(ratePlans as any[]).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No active rate plans configured.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {(ratePlans as any[]).map((plan: any) => (
                  <Card key={plan.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{plan.name}</CardTitle>
                        <Badge variant="outline" className="text-[10px]">{plan.pricing_model}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Base Rate</p>
                          <p className="text-lg font-bold">R{fmt(Number(plan.base_rate || 0))}</p>
                        </div>
                        {baselineAdr > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">vs 30d ADR</p>
                            <p className={`text-sm font-medium ${
                              Number(plan.base_rate || 0) > baselineAdr ? "text-primary" : "text-destructive"
                            }`}>
                              {Number(plan.base_rate || 0) > baselineAdr ? "+" : ""}
                              {(((Number(plan.base_rate || 0) - baselineAdr) / Math.max(1, baselineAdr)) * 100).toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PMSLayout>
  );
}
