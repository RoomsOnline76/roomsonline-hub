import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, differenceInDays, parseISO } from "date-fns";
import { PortfolioManager } from "@/components/portfolio/PortfolioManager";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Building2, TrendingUp, BedDouble, Percent, ArrowRight, DollarSign, Users, Calendar,
} from "lucide-react";

interface PropertySummary {
  id: string;
  name: string;
  totalBookings: number;
  revenue: number;
  occupancy: number;
  adr: number;
  revpar: number;
  roomCount: number;
  todayArrivals: number;
  todayDepartures: number;
}

const fmt = (n: number) => n.toLocaleString("en-ZA", { maximumFractionDigits: 0 });

export default function PMSPortfolio() {
  const { properties, portfolioProperties, portfolioIds, loading: propLoading } = usePmsPropertyId();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Auto-select portfolio if selected property belongs to one
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

  // Auto-set portfolio filter when property context provides one
  useEffect(() => {
    if (portfolioIds.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId(portfolioIds[0]);
    }
  }, [portfolioIds]);

  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

  // Fetch portfolio members and their properties directly by ID
  const { data: portfolioMemberProperties = [] } = useQuery({
    queryKey: ["portfolio-members-filter", selectedPortfolioId],
    queryFn: async () => {
      if (!selectedPortfolioId) return [];
      const { data: members } = await supabase
        .from("property_portfolio_members" as any)
        .select("property_id")
        .eq("portfolio_id", selectedPortfolioId);
      const memberIds = (members || []).map((m: any) => m.property_id) as string[];
      if (memberIds.length === 0) return [];

      // Fetch properties directly by ID (regardless of ownership)
      const { data: memberProps } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", memberIds)
        .eq("is_active", true)
        .order("name");
      return (memberProps || []) as { id: string; name: string }[];
    },
    enabled: !!selectedPortfolioId,
  });

  // Filter properties by portfolio — use direct fetch for portfolio members
  const filteredProperties = useMemo(() => {
    if (!selectedPortfolioId) return properties;
    if (portfolioMemberProperties.length > 0) return portfolioMemberProperties;
    return [];
  }, [properties, selectedPortfolioId, portfolioMemberProperties]);

  // Fetch bookings for all properties in last 30 days
  const { data: allBookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["portfolio-bookings", thirtyDaysAgo, today],
    queryFn: async () => {
      const propertyIds = properties.map(p => p.id);
      if (propertyIds.length === 0) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, property_id, check_in_date, check_out_date, total_price, status")
        .in("property_id", propertyIds)
        .gte("check_in_date", thirtyDaysAgo)
        .lte("check_in_date", today)
        .order("check_in_date");
      return data || [];
    },
    enabled: properties.length > 0,
  });

  // Fetch rooms for all properties
  const { data: allRooms = [] } = useQuery({
    queryKey: ["portfolio-rooms", properties.map(p => p.id).join(",")],
    queryFn: async () => {
      const propertyIds = properties.map(p => p.id);
      if (propertyIds.length === 0) return [];
      const { data } = await supabase
        .from("rolos_rooms" as any)
        .select("id, property_id")
        .in("property_id", propertyIds);
      return data || [];
    },
    enabled: properties.length > 0,
  });

  const summaries = useMemo<PropertySummary[]>(() => {
    return filteredProperties.map(prop => {
      const bookings = allBookings.filter((b: any) => b.property_id === prop.id);
      const active = bookings.filter((b: any) => b.status !== "cancelled" && b.status !== "failed");
      const rooms = allRooms.filter((r: any) => r.property_id === prop.id);
      const roomCount = Math.max(1, rooms.length);
      const daysInPeriod = 30;

      const revenue = active.reduce((s: number, b: any) => s + Number(b.total_price || 0), 0);
      const bookedNights = active.reduce((s: number, b: any) => {
        if (b.check_in_date && b.check_out_date) {
          return s + Math.max(1, differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date)));
        }
        return s + 1;
      }, 0);
      const availableNights = roomCount * daysInPeriod;
      const occupancy = availableNights > 0 ? Math.min((bookedNights / availableNights) * 100, 100) : 0;
      const adr = active.length > 0 ? revenue / active.length : 0;
      const revpar = availableNights > 0 ? revenue / availableNights : 0;

      const todayArrivals = active.filter((b: any) => b.check_in_date === today).length;
      const todayDepartures = active.filter((b: any) => b.check_out_date === today).length;

      return {
        id: prop.id,
        name: prop.name,
        totalBookings: active.length,
        revenue,
        occupancy,
        adr,
        revpar,
        roomCount,
        todayArrivals,
        todayDepartures,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [filteredProperties, allBookings, allRooms, today]);

  const totals = useMemo(() => {
    const avgRevpar = summaries.length > 0
      ? summaries.reduce((s, p) => s + p.revpar, 0) / summaries.length
      : 0;
    return {
      properties: summaries.length,
      rooms: summaries.reduce((s, p) => s + p.roomCount, 0),
      bookings: summaries.reduce((s, p) => s + p.totalBookings, 0),
      revenue: summaries.reduce((s, p) => s + p.revenue, 0),
      avgOccupancy: summaries.length > 0
        ? summaries.reduce((s, p) => s + p.occupancy, 0) / summaries.length
        : 0,
      avgAdr: summaries.length > 0
        ? summaries.reduce((s, p) => s + p.adr, 0) / summaries.length
        : 0,
      avgRevpar,
      arrivals: summaries.reduce((s, p) => s + p.todayArrivals, 0),
      departures: summaries.reduce((s, p) => s + p.todayDepartures, 0),
    };
  }, [summaries]);

  const chartData = useMemo(() =>
    summaries.slice(0, 10).map(p => ({
      name: p.name.length > 20 ? p.name.slice(0, 18) + "…" : p.name,
      revenue: Math.round(p.revenue),
      occupancy: Math.round(p.occupancy),
    })),
  [summaries]);

  const goToProperty = (id: string) => {
    navigate(`/pms?property=${id}`);
  };

  const loading = propLoading || bookingsLoading;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio Overview</h1>
            <p className="text-sm text-muted-foreground">Last 30 days across {totals.properties} properties</p>
          </div>
          <Badge variant="outline" className="text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            {format(subDays(new Date(), 30), "dd MMM")} – {format(new Date(), "dd MMM yyyy")}
          </Badge>
        </div>

        {/* Portfolio filter */}
        <PortfolioManager
          selectedPortfolioId={selectedPortfolioId}
          onSelect={setSelectedPortfolioId}
        />

        {/* Portfolio KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <p className="text-2xl font-bold">R{fmt(totals.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{totals.bookings} bookings</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Percent className="h-3 w-3" />Avg Occupancy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <p className="text-2xl font-bold">{totals.avgOccupancy.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">{totals.rooms} rooms total</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <BedDouble className="h-3 w-3" />Avg ADR
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <p className="text-2xl font-bold">R{fmt(totals.avgAdr)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Avg RevPAR
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <p className="text-2xl font-bold">R{fmt(totals.avgRevpar)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Users className="h-3 w-3" />Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <p className="text-2xl font-bold">{totals.arrivals} / {totals.departures}</p>
                  <p className="text-xs text-muted-foreground">Arrivals / Departures</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Revenue by Property Chart */}
        {chartData.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Revenue & Occupancy by Property</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue (R)" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="occupancy" name="Occupancy %" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Property Cards */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Properties</h2>
          <ScrollArea className="max-h-[600px]">
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
                ))
              ) : summaries.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No ROL'OS properties found.</p>
                  </CardContent>
                </Card>
              ) : (
                summaries.map(prop => (
                  <Card key={prop.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => goToProperty(prop.id)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold truncate">{prop.name}</CardTitle>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs text-muted-foreground">{prop.roomCount} rooms</p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Revenue</p>
                          <p className="text-sm font-bold">R{fmt(prop.revenue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Occupancy</p>
                          <p className="text-sm font-bold">{prop.occupancy.toFixed(0)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">ADR</p>
                          <p className="text-sm font-bold">R{fmt(prop.adr)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">RevPAR</p>
                          <p className="text-sm font-bold">R{fmt(prop.revpar)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                        <span className="text-xs text-muted-foreground">{prop.totalBookings} bookings</span>
                        {prop.todayArrivals > 0 && (
                          <Badge variant="secondary" className="text-[10px]">{prop.todayArrivals} arriving</Badge>
                        )}
                        {prop.todayDepartures > 0 && (
                          <Badge variant="outline" className="text-[10px]">{prop.todayDepartures} departing</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
