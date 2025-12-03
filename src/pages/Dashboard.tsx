import { useState, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { CalendarIcon, TrendingUp, TrendingDown, DollarSign, CalendarDays, XCircle, Building2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { DateRange } from "react-day-picker";

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [period, setPeriod] = useState("this_month");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return {
      from: startOfMonth(now),
      to: endOfMonth(now),
    };
  });

  // Update date range when period changes
  const handlePeriodChange = (value: string) => {
    setPeriod(value);
    const now = new Date();
    
    switch (value) {
      case "today":
        setDateRange({ from: now, to: now });
        break;
      case "last_7_days":
        setDateRange({ from: subDays(now, 7), to: now });
        break;
      case "last_30_days":
        setDateRange({ from: subDays(now, 30), to: now });
        break;
      case "this_month":
        setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case "last_month":
        const lastMonth = subMonths(now, 1);
        setDateRange({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
        break;
      case "this_year":
        setDateRange({ from: startOfYear(now), to: endOfYear(now) });
        break;
      case "custom":
        // Keep current range for custom
        break;
    }
  };

  // Fetch user profile to get email for owner filtering
  const { data: profile } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Fetch properties (filtered by owner if not admin)
  const { data: properties = [] } = useQuery({
    queryKey: ["dashboard-properties", isAdmin, profile?.email],
    queryFn: async () => {
      let query = supabase.from("properties").select("id, name, owner_email");
      
      if (!isAdmin && profile?.email) {
        query = query.eq("owner_email", profile.email);
      }
      
      const { data } = await query;
      return data || [];
    },
    enabled: !!user && (isAdmin || !!profile?.email),
  });

  const propertyIds = useMemo(() => properties.map(p => p.id), [properties]);

  // Fetch bookings for the selected period and properties
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["dashboard-bookings", propertyIds, dateRange],
    queryFn: async () => {
      if (propertyIds.length === 0) return [];
      
      const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
      const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
      
      let query = supabase
        .from("bookings")
        .select("*")
        .in("property_id", propertyIds);
      
      if (fromDate) {
        query = query.gte("created_at", fromDate);
      }
      if (toDate) {
        query = query.lte("created_at", toDate + "T23:59:59");
      }
      
      const { data } = await query;
      return data || [];
    },
    enabled: propertyIds.length > 0 && !!dateRange?.from,
  });

  // Calculate stats
  const stats = useMemo(() => {
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(b => b.status === "confirmed").length;
    const pendingBookings = bookings.filter(b => b.status === "pending").length;
    const cancelledBookings = bookings.filter(b => b.status === "cancelled").length;
    const totalRevenue = bookings
      .filter(b => b.status !== "cancelled")
      .reduce((sum, b) => sum + Number(b.total_price || 0), 0);
    const totalGuests = bookings.reduce((sum, b) => sum + (b.adults || 0) + (b.children || 0), 0);
    
    return {
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      totalRevenue,
      totalGuests,
      totalProperties: properties.length,
    };
  }, [bookings, properties]);

  // Generate chart data grouped by day
  const chartData = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [];
    
    const data: { date: string; bookings: number; revenue: number; cancellations: number }[] = [];
    const current = new Date(dateRange.from);
    const end = new Date(dateRange.to);
    
    while (current <= end) {
      const dateStr = format(current, "yyyy-MM-dd");
      const dayBookings = bookings.filter(b => 
        format(new Date(b.created_at), "yyyy-MM-dd") === dateStr
      );
      
      data.push({
        date: format(current, "MMM dd"),
        bookings: dayBookings.filter(b => b.status !== "cancelled").length,
        revenue: dayBookings
          .filter(b => b.status !== "cancelled")
          .reduce((sum, b) => sum + Number(b.total_price || 0), 0),
        cancellations: dayBookings.filter(b => b.status === "cancelled").length,
      });
      
      current.setDate(current.getDate() + 1);
    }
    
    return data;
  }, [bookings, dateRange]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Header with period selector */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              {isAdmin ? "All properties overview" : "Your properties overview"}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="last_7_days">Last 7 days</SelectItem>
                <SelectItem value="last_30_days">Last 30 days</SelectItem>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="this_year">This year</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            
            {period === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className={cn(
          "grid gap-4 mb-8",
          isAdmin ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2"
        )}>
          {/* Bookings Card - Show for all */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalBookings}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span className="text-green-600">{stats.confirmedBookings} confirmed</span>
                <span>•</span>
                <span className="text-yellow-600">{stats.pendingBookings} pending</span>
              </div>
            </CardContent>
          </Card>

          {/* Cancellations Card - Show for all */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cancellations</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.cancelledBookings}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.totalBookings > 0 
                  ? `${((stats.cancelledBookings / stats.totalBookings) * 100).toFixed(1)}% cancellation rate`
                  : "No bookings yet"}
              </p>
            </CardContent>
          </Card>

          {/* Admin-only cards */}
          {isAdmin && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    R {stats.totalRevenue.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    From {stats.confirmedBookings + stats.pendingBookings} active bookings
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Properties</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalProperties}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Active properties in system
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bookings Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bookings Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {bookingsLoading ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Loading...
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }} 
                      className="text-muted-foreground"
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }} 
                      className="text-muted-foreground"
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--background))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar dataKey="bookings" name="Bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cancellations" name="Cancellations" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No booking data for this period
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue Chart - Admin only */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {bookingsLoading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Loading...
                  </div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }} 
                        className="text-muted-foreground"
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }} 
                        className="text-muted-foreground"
                        tickLine={false}
                        tickFormatter={(value) => `R${value}`}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`R ${value.toLocaleString()}`, "Revenue"]}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--background))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="hsl(var(--primary))" 
                        fill="hsl(var(--primary) / 0.2)" 
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No revenue data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Bookings Table */}
          <Card className={isAdmin ? "" : "lg:col-span-2"}>
            <CardHeader>
              <CardTitle className="text-lg">Recent Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              {bookings.length > 0 ? (
                <div className="space-y-3">
                  {bookings.slice(0, 5).map((booking) => {
                    const property = properties.find(p => p.id === booking.property_id);
                    return (
                      <div 
                        key={booking.id} 
                        className="flex items-center justify-between p-3 rounded-lg border border-border"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{booking.guest_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {property?.name || "Unknown property"}
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-sm">
                            R {Number(booking.total_price).toLocaleString()}
                          </span>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            booking.status === "confirmed" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
                            booking.status === "pending" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
                            booking.status === "cancelled" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                          )}>
                            {booking.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No bookings found for this period
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
