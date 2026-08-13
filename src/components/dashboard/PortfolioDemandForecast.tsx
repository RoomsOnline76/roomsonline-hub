import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, addDays, eachDayOfInterval, startOfDay, differenceInDays, parseISO } from "date-fns";
import { ArrowUpRight, ArrowDownRight, Minus, Target, TrendingUp, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const fmt = (n: number) => n.toLocaleString("en-ZA", { maximumFractionDigits: 0 });

const THRESHOLDS = { low: 30, medium: 60, high: 80 };
const FORECAST_DAYS = 14;

export function PortfolioDemandForecast() {
  const today = format(new Date(), "yyyy-MM-dd");
  const futureEnd = format(addDays(new Date(), FORECAST_DAYS), "yyyy-MM-dd");

  // Trading properties only — rooms belonging to stale inventory would inflate
  // the available-room denominator and crush the occupancy forecast.
  const { data: tradingPropertyIds = [], isLoading: propsLoading } = useQuery({
    queryKey: ["portfolio-trading-property-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id")
        .eq("is_trading", true);
      return (data || []).map((p: any) => p.id as string);
    },
  });

  // Fetch ROLOS rooms for trading properties
  const { data: allRooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ["portfolio-rooms", tradingPropertyIds.join(",")],
    enabled: tradingPropertyIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_rooms" as any)
        .select("id, property_id")
        .in("property_id", tradingPropertyIds);
      return data || [];
    },
  });

  // Fetch all upcoming bookings for trading properties
  const { data: allBookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["portfolio-future-bookings", today, futureEnd, tradingPropertyIds.join(",")],
    enabled: tradingPropertyIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, property_id, check_in_date, check_out_date, total_price, status")
        .in("property_id", tradingPropertyIds)
        .gte("check_out_date", today)
        .lte("check_in_date", futureEnd)
        .neq("status", "cancelled");
      return data || [];
    },
  });

  const loading = propsLoading || roomsLoading || bookingsLoading;
  const totalRooms = Math.max(1, allRooms.length);

  // Properties with rooms (PMS properties)
  const pmsPropertyIds = useMemo(() => {
    return [...new Set(allRooms.map((r: any) => r.property_id))];
  }, [allRooms]);

  const forecast = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfDay(new Date()),
      end: addDays(new Date(), FORECAST_DAYS - 1),
    });

    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const overlapping = allBookings.filter((b: any) =>
        b.check_in_date <= dayStr && b.check_out_date > dayStr &&
        pmsPropertyIds.includes(b.property_id)
      );
      const bookedRooms = Math.min(overlapping.length, totalRooms);
      const occupancy = (bookedRooms / totalRooms) * 100;
      const revenue = overlapping.reduce((s: number, b: any) => {
        const nights = Math.max(1, differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date)));
        return s + Number(b.total_price || 0) / nights;
      }, 0);

      let signal: "high" | "low" | "hold" = "hold";
      if (occupancy >= THRESHOLDS.high) signal = "high";
      else if (occupancy < THRESHOLDS.low) signal = "low";

      return {
        date: dayStr,
        dateLabel: format(day, "EEE dd MMM"),
        shortLabel: format(day, "dd MMM"),
        occupancy,
        bookedRooms,
        revenue,
        signal,
      };
    });
  }, [allBookings, pmsPropertyIds, totalRooms]);

  const avgOcc = forecast.reduce((s, f) => s + f.occupancy, 0) / forecast.length;
  const totalForecastRev = forecast.reduce((s, f) => s + f.revenue, 0);
  const highDays = forecast.filter(f => f.signal === "high").length;
  const lowDays = forecast.filter(f => f.signal === "low").length;

  const chartData = forecast.map(f => ({
    date: f.shortLabel,
    occupancy: Math.round(f.occupancy),
    revenue: Math.round(f.revenue),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Portfolio Demand Forecast — Next {FORECAST_DAYS} Days
          </CardTitle>
          <div className="flex items-center gap-2">
            {highDays > 0 && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">{highDays}d high</Badge>}
            {lowDays > 0 && <Badge variant="destructive" className="text-[10px]">{lowDays}d low</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">PMS Properties</p>
            {loading ? <Skeleton className="h-6 w-8 mx-auto" /> : <p className="text-lg font-bold">{pmsPropertyIds.length}</p>}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total Rooms</p>
            {loading ? <Skeleton className="h-6 w-10 mx-auto" /> : <p className="text-lg font-bold">{totalRooms}</p>}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Avg Occupancy</p>
            {loading ? <Skeleton className="h-6 w-12 mx-auto" /> : <p className="text-lg font-bold">{avgOcc.toFixed(1)}%</p>}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Forecast Rev</p>
            {loading ? <Skeleton className="h-6 w-14 mx-auto" /> : <p className="text-lg font-bold">R{fmt(totalForecastRev)}</p>}
          </div>
        </div>

        {/* Chart */}
        <div className="h-[200px]">
          {loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="left" type="monotone" dataKey="occupancy" name="Occupancy %" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.12)" strokeWidth={2} />
                <Area yAxisId="right" type="monotone" dataKey="revenue" name="Daily Rev (R)" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2)/0.08)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Compact day list */}
        <ScrollArea className="h-[240px]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1.5 text-left px-2">Date</th>
                <th className="py-1.5 text-left px-2">Rooms</th>
                <th className="py-1.5 text-left px-2">Occ</th>
                <th className="py-1.5 text-left px-2">Rev</th>
                <th className="py-1.5 text-left px-2">Signal</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map(f => (
                <tr key={f.date} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="py-1.5 px-2 font-medium">{f.dateLabel}</td>
                  <td className="py-1.5 px-2">{f.bookedRooms}/{totalRooms}</td>
                  <td className="py-1.5 px-2">{f.occupancy.toFixed(0)}%</td>
                  <td className="py-1.5 px-2">R{fmt(f.revenue)}</td>
                  <td className="py-1.5 px-2">
                    {f.signal === "high" && <Badge className="text-[9px] h-4 bg-primary/10 text-primary border-primary/20"><ArrowUpRight className="h-2.5 w-2.5" /></Badge>}
                    {f.signal === "low" && <Badge variant="destructive" className="text-[9px] h-4"><ArrowDownRight className="h-2.5 w-2.5" /></Badge>}
                    {f.signal === "hold" && <Badge variant="outline" className="text-[9px] h-4"><Minus className="h-2.5 w-2.5" /></Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
