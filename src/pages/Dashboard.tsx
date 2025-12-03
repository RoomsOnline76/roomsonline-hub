import { useState, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, differenceInDays } from "date-fns";
import { CalendarIcon, DollarSign, CalendarDays, XCircle, Building2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, ComposedChart } from "recharts";
import { DateRange } from "react-day-picker";

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [period, setPeriod] = useState("this_month");
  const [comparePrevYear, setComparePrevYear] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return {
      from: startOfMonth(now),
      to: endOfMonth(now),
    };
  });

  // Calculate if we should aggregate by month (for periods > 31 days)
  const shouldAggregateByMonth = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return false;
    return differenceInDays(dateRange.to, dateRange.from) > 31;
  }, [dateRange]);

  // Calculate previous year date range
  const prevYearDateRange = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return null;
    return {
      from: subYears(dateRange.from, 1),
      to: subYears(dateRange.to, 1),
    };
  }, [dateRange]);

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
        break;
    }
  };

  // Fetch user profile
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

  // Fetch properties
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

  // Fetch current period bookings
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["dashboard-bookings", propertyIds, dateRange],
    queryFn: async () => {
      if (propertyIds.length === 0) return [];
      const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
      const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
      
      let query = supabase.from("bookings").select("*").in("property_id", propertyIds);
      if (fromDate) query = query.gte("created_at", fromDate);
      if (toDate) query = query.lte("created_at", toDate + "T23:59:59");
      
      const { data } = await query;
      return data || [];
    },
    enabled: propertyIds.length > 0 && !!dateRange?.from,
  });

  // Fetch previous year bookings
  const { data: prevYearBookings = [] } = useQuery({
    queryKey: ["dashboard-bookings-prev", propertyIds, prevYearDateRange, comparePrevYear],
    queryFn: async () => {
      if (propertyIds.length === 0 || !prevYearDateRange) return [];
      const fromDate = format(prevYearDateRange.from, "yyyy-MM-dd");
      const toDate = format(prevYearDateRange.to, "yyyy-MM-dd");
      
      let query = supabase.from("bookings").select("*").in("property_id", propertyIds);
      query = query.gte("created_at", fromDate).lte("created_at", toDate + "T23:59:59");
      
      const { data } = await query;
      return data || [];
    },
    enabled: propertyIds.length > 0 && comparePrevYear && !!prevYearDateRange,
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
    
    return {
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      totalRevenue,
      totalProperties: properties.length,
    };
  }, [bookings, properties]);

  // Export chart data to CSV
  const exportToCSV = () => {
    if (chartData.length === 0) return;
    
    const headers = [
      "Date",
      "Label", 
      "Bookings",
      "Cancellations",
      "Revenue",
      "SMA Bookings (Trend)",
      "SMA Revenue (Trend)",
      "Forecast Bookings",
      "Forecast Bookings Upper",
      "Forecast Bookings Lower",
      "Forecast Revenue",
      "Forecast Revenue Upper",
      "Forecast Revenue Lower",
      ...(comparePrevYear ? ["Prev Year Bookings", "Prev Year Cancellations", "Prev Year Revenue"] : [])
    ];
    
    const rows = chartData.map(d => [
      d.date,
      d.label,
      d.bookings,
      d.cancellations,
      d.revenue,
      d.smaBookings ?? "",
      d.smaRevenue ?? "",
      d.forecastBookings ?? "",
      d.forecastBookingsUpper ?? "",
      d.forecastBookingsLower ?? "",
      d.forecastRevenue ?? "",
      d.forecastRevenueUpper ?? "",
      d.forecastRevenueLower ?? "",
      ...(comparePrevYear ? [d.prevBookings ?? "", d.prevCancellations ?? "", d.prevRevenue ?? ""] : [])
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `dashboard-data-${format(dateRange?.from || new Date(), "yyyy-MM-dd")}-to-${format(dateRange?.to || new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate chart data
  // Simple Moving Average (12-period for trend)
  const calculateSMA = (values: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const slice = values.slice(i - period + 1, i + 1);
        result.push(slice.reduce((a, b) => a + b, 0) / period);
      }
    }
    return result;
  };

  // Holt-Winters Triple Exponential Smoothing (Additive Seasonality)
  const holtWinters = (
    values: number[],
    seasonLength: number = 12,
    alpha: number = 0.3,  // level smoothing
    beta: number = 0.1,   // trend smoothing
    gamma: number = 0.3,  // seasonal smoothing
    forecastPeriods: number = 12
  ): { forecast: number[]; upper: number[]; lower: number[] } => {
    const n = values.length;
    if (n < seasonLength * 2) {
      // Not enough data for seasonal model, use simple exponential smoothing
      const forecast: number[] = [];
      const avg = values.reduce((a, b) => a + b, 0) / n;
      const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / n);
      
      for (let i = 0; i < forecastPeriods; i++) {
        forecast.push(avg);
      }
      return {
        forecast,
        upper: forecast.map(f => f + 1.28 * stdDev),
        lower: forecast.map(f => Math.max(0, f - 1.28 * stdDev))
      };
    }

    // Initialize level (average of first season)
    let level = values.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
    
    // Initialize trend (average difference between seasons)
    let trend = 0;
    for (let i = 0; i < seasonLength; i++) {
      trend += (values[seasonLength + i] - values[i]) / seasonLength;
    }
    trend /= seasonLength;

    // Initialize seasonal factors
    const seasonal: number[] = [];
    for (let i = 0; i < seasonLength; i++) {
      const seasonAvg = values.slice(i, n).filter((_, idx) => idx % seasonLength === 0);
      seasonal.push(seasonAvg.reduce((a, b) => a + b, 0) / seasonAvg.length - level);
    }

    // Calculate fitted values and residuals for confidence intervals
    const residuals: number[] = [];
    
    // Apply Holt-Winters
    for (let i = seasonLength; i < n; i++) {
      const seasonIdx = i % seasonLength;
      const prevLevel = level;
      
      // Update level
      level = alpha * (values[i] - seasonal[seasonIdx]) + (1 - alpha) * (level + trend);
      
      // Update trend
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      
      // Update seasonal
      seasonal[seasonIdx] = gamma * (values[i] - level) + (1 - gamma) * seasonal[seasonIdx];
      
      // Calculate residual
      const fitted = prevLevel + trend + seasonal[seasonIdx];
      residuals.push(values[i] - fitted);
    }

    // Calculate standard error for confidence intervals
    const stdError = residuals.length > 0
      ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length)
      : values.reduce((a, b) => a + b, 0) / n * 0.2;

    // Generate forecasts
    const forecast: number[] = [];
    const upper: number[] = [];
    const lower: number[] = [];
    
    for (let i = 0; i < forecastPeriods; i++) {
      const seasonIdx = (n + i) % seasonLength;
      const forecastValue = level + (i + 1) * trend + seasonal[seasonIdx];
      const errorMargin = 1.28 * stdError * Math.sqrt(1 + i * 0.1); // Growing uncertainty
      
      forecast.push(Math.max(0, forecastValue));
      upper.push(Math.max(0, forecastValue + errorMargin));
      lower.push(Math.max(0, forecastValue - errorMargin));
    }

    return { forecast, upper, lower };
  };

  const chartData = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [];
    
    interface ChartDataPoint {
      date: string;
      label: string;
      bookings: number;
      revenue: number;
      cancellations: number;
      prevBookings?: number;
      prevRevenue?: number;
      prevCancellations?: number;
      smaBookings?: number | null;
      smaRevenue?: number | null;
      forecastBookings?: number | null;
      forecastRevenue?: number | null;
      forecastBookingsUpper?: number | null;
      forecastBookingsLower?: number | null;
      forecastRevenueUpper?: number | null;
      forecastRevenueLower?: number | null;
    }
    
    const data: ChartDataPoint[] = [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    if (shouldAggregateByMonth) {
      // Aggregate by month
      const monthsMap = new Map<string, ChartDataPoint>();
      const current = new Date(dateRange.from);
      const end = new Date(dateRange.to);
      
      // Initialize months
      while (current <= end) {
        const monthKey = format(current, "yyyy-MM");
        const label = format(current, "MMM yyyy");
        if (!monthsMap.has(monthKey)) {
          monthsMap.set(monthKey, {
            date: monthKey,
            label,
            bookings: 0,
            revenue: 0,
            cancellations: 0,
            prevBookings: 0,
            prevRevenue: 0,
            prevCancellations: 0,
          });
        }
        current.setMonth(current.getMonth() + 1);
      }
      
      // Aggregate current bookings
      bookings.forEach(b => {
        const monthKey = format(new Date(b.created_at), "yyyy-MM");
        const entry = monthsMap.get(monthKey);
        if (entry) {
          if (b.status !== "cancelled") {
            entry.bookings++;
            entry.revenue += Number(b.total_price || 0);
          } else {
            entry.cancellations++;
          }
        }
      });
      
      // Aggregate previous year bookings
      if (comparePrevYear) {
        prevYearBookings.forEach(b => {
          const bookingDate = new Date(b.created_at);
          // Map to current year month
          const currentYearDate = new Date(bookingDate);
          currentYearDate.setFullYear(currentYearDate.getFullYear() + 1);
          const monthKey = format(currentYearDate, "yyyy-MM");
          const entry = monthsMap.get(monthKey);
          if (entry) {
            if (b.status !== "cancelled") {
              entry.prevBookings = (entry.prevBookings || 0) + 1;
              entry.prevRevenue = (entry.prevRevenue || 0) + Number(b.total_price || 0);
            } else {
              entry.prevCancellations = (entry.prevCancellations || 0) + 1;
            }
          }
        });
      }
      
      // Convert to array
      monthsMap.forEach(value => data.push(value));
      data.sort((a, b) => a.date.localeCompare(b.date));
      
    } else {
      // Aggregate by day
      const current = new Date(dateRange.from);
      const end = new Date(dateRange.to);
      
      while (current <= end) {
        const dateStr = format(current, "yyyy-MM-dd");
        const label = format(current, "MMM dd");
        const isFuture = current > today;
        
        const dayBookings = bookings.filter(b => 
          format(new Date(b.created_at), "yyyy-MM-dd") === dateStr
        );
        
        const entry: ChartDataPoint = {
          date: dateStr,
          label,
          bookings: isFuture ? 0 : dayBookings.filter(b => b.status !== "cancelled").length,
          revenue: isFuture ? 0 : dayBookings
            .filter(b => b.status !== "cancelled")
            .reduce((sum, b) => sum + Number(b.total_price || 0), 0),
          cancellations: isFuture ? 0 : dayBookings.filter(b => b.status === "cancelled").length,
        };
        
        // Add previous year data
        if (comparePrevYear) {
          const prevYearDate = subYears(current, 1);
          const prevDateStr = format(prevYearDate, "yyyy-MM-dd");
          const prevDayBookings = prevYearBookings.filter(b => 
            format(new Date(b.created_at), "yyyy-MM-dd") === prevDateStr
          );
          
          entry.prevBookings = prevDayBookings.filter(b => b.status !== "cancelled").length;
          entry.prevRevenue = prevDayBookings
            .filter(b => b.status !== "cancelled")
            .reduce((sum, b) => sum + Number(b.total_price || 0), 0);
          entry.prevCancellations = prevDayBookings.filter(b => b.status === "cancelled").length;
        }
        
        data.push(entry);
        current.setDate(current.getDate() + 1);
      }
    }
    
    // Apply forecasting - separate actual data from future projections
    const actualData = data.filter(d => new Date(d.date) <= today);
    const futureData = data.filter(d => new Date(d.date) > today);
    
    // For custom ranges that are entirely historical, we still want to show the trend
    const dataForAnalysis = actualData.length > 0 ? actualData : data;
    
    if (dataForAnalysis.length >= 3) {
      const bookingValues = dataForAnalysis.map(d => d.bookings);
      const revenueValues = dataForAnalysis.map(d => d.revenue);
      
      // Calculate SMA period based on data length and aggregation
      const smaPeriod = shouldAggregateByMonth 
        ? Math.min(12, Math.max(3, Math.floor(dataForAnalysis.length / 2))) 
        : Math.min(7, Math.max(3, Math.floor(dataForAnalysis.length / 2)));
      
      const smaBookings = calculateSMA(bookingValues, smaPeriod);
      const smaRevenue = calculateSMA(revenueValues, smaPeriod);
      
      // Apply SMA to all data points that have actuals
      dataForAnalysis.forEach((d, i) => {
        d.smaBookings = smaBookings[i];
        d.smaRevenue = smaRevenue[i];
      });
      
      // Calculate forecast - either for future periods or as projection from historical data
      const seasonLength = shouldAggregateByMonth ? Math.min(12, dataForAnalysis.length) : Math.min(7, dataForAnalysis.length);
      const forecastPeriods = futureData.length > 0 ? futureData.length : Math.max(3, Math.floor(dataForAnalysis.length / 3));
      
      const bookingForecast = holtWinters(bookingValues, seasonLength, 0.3, 0.1, 0.3, forecastPeriods);
      const revenueForecast = holtWinters(revenueValues, seasonLength, 0.3, 0.1, 0.3, forecastPeriods);
      
      if (futureData.length > 0) {
        // Connect forecast to last actual point
        const lastActual = actualData[actualData.length - 1];
        if (lastActual) {
          lastActual.forecastBookings = lastActual.bookings;
          lastActual.forecastRevenue = lastActual.revenue;
          lastActual.forecastBookingsUpper = lastActual.bookings;
          lastActual.forecastBookingsLower = lastActual.bookings;
          lastActual.forecastRevenueUpper = lastActual.revenue;
          lastActual.forecastRevenueLower = lastActual.revenue;
        }
        
        // Apply forecasts to future data
        futureData.forEach((d, i) => {
          d.forecastBookings = Math.round(bookingForecast.forecast[i] || 0);
          d.forecastBookingsUpper = Math.round(bookingForecast.upper[i] || 0);
          d.forecastBookingsLower = Math.round(bookingForecast.lower[i] || 0);
          d.forecastRevenue = Math.round(revenueForecast.forecast[i] || 0);
          d.forecastRevenueUpper = Math.round(revenueForecast.upper[i] || 0);
          d.forecastRevenueLower = Math.round(revenueForecast.lower[i] || 0);
        });
      } else if (dataForAnalysis.length > 0) {
        // For fully historical ranges, show extended trend/forecast line
        // Add forecast extension from the last data point
        const lastIdx = dataForAnalysis.length - 1;
        const extendedForecastCount = Math.min(forecastPeriods, Math.floor(dataForAnalysis.length / 2));
        
        // Apply forecast as an extension of the trend starting from ~60% into the data
        const forecastStartIdx = Math.floor(dataForAnalysis.length * 0.6);
        for (let i = forecastStartIdx; i < dataForAnalysis.length; i++) {
          const forecastIdx = i - forecastStartIdx;
          if (forecastIdx < bookingForecast.forecast.length) {
            dataForAnalysis[i].forecastBookings = Math.round(bookingForecast.forecast[forecastIdx] || 0);
            dataForAnalysis[i].forecastBookingsUpper = Math.round(bookingForecast.upper[forecastIdx] || 0);
            dataForAnalysis[i].forecastBookingsLower = Math.round(bookingForecast.lower[forecastIdx] || 0);
            dataForAnalysis[i].forecastRevenue = Math.round(revenueForecast.forecast[forecastIdx] || 0);
            dataForAnalysis[i].forecastRevenueUpper = Math.round(revenueForecast.upper[forecastIdx] || 0);
            dataForAnalysis[i].forecastRevenueLower = Math.round(revenueForecast.lower[forecastIdx] || 0);
          }
        }
      }
    }
    
    return data;
  }, [bookings, prevYearBookings, dateRange, comparePrevYear, shouldAggregateByMonth]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Header with period selector */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Dashboard</h1>
            <p className="text-muted-foreground">
              {isAdmin ? "All properties overview" : "Your properties overview"}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Compare toggle */}
            <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
              <Switch
                id="compare-prev"
                checked={comparePrevYear}
                onCheckedChange={setComparePrevYear}
              />
              <Label htmlFor="compare-prev" className="text-sm cursor-pointer whitespace-nowrap">
                Compare prev. year
              </Label>
            </div>
            
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
                        <>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>
                      ) : format(dateRange.from, "LLL dd, y")
                    ) : <span>Pick a date range</span>}
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
            
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={chartData.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className={cn(
          "grid gap-4 mb-8",
          isAdmin ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2"
        )}>
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
                  <p className="text-xs text-muted-foreground mt-1">Active properties in system</p>
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
              <CardTitle className="text-lg">
                Bookings Overview
                {shouldAggregateByMonth && <span className="text-sm font-normal text-muted-foreground ml-2">(Monthly)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bookingsLoading ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--destructive))' }} tickLine={false} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--background))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px"
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                      formatter={(value) => <span className="text-xs">{value}</span>}
                    />
                    {/* Confidence interval shaded area */}
                    <Area yAxisId="left" type="monotone" dataKey="forecastBookingsUpper" stroke="none" fill="#0ea5e9" fillOpacity={0.15} name="Confidence" connectNulls={false} />
                    <Area yAxisId="left" type="monotone" dataKey="forecastBookingsLower" stroke="none" fill="#ffffff" fillOpacity={1} connectNulls={false} legendType="none" />
                    {/* Main data bars */}
                    <Bar yAxisId="left" dataKey="bookings" name="Bookings" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="cancellations" name="Cancelled" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    {/* 12-period trend (SMA) - solid orange */}
                    <Line yAxisId="left" type="monotone" dataKey="smaBookings" name="Trend (SMA)" stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
                    {/* Previous year comparison - dotted amber */}
                    {comparePrevYear && <Line yAxisId="left" type="monotone" dataKey="prevBookings" name="Prev Year" stroke="#eab308" strokeWidth={2} strokeDasharray="3 3" dot={false} />}
                    {comparePrevYear && <Line yAxisId="right" type="monotone" dataKey="prevCancellations" name="Prev Cancelled" stroke="#f97316" strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.6} />}
                    {/* Seasonal forecast - dashed blue */}
                    <Line yAxisId="left" type="monotone" dataKey="forecastBookings" name="Forecast" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} />
                  </ComposedChart>
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
                <CardTitle className="text-lg">
                  Revenue Trend
                  {shouldAggregateByMonth && <span className="text-sm font-normal text-muted-foreground ml-2">(Monthly)</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bookingsLoading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `R${v}`} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          `R ${value.toLocaleString()}`, 
                          name
                        ]}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--background))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px"
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                        formatter={(value) => <span className="text-xs">{value}</span>}
                      />
                      {/* Confidence interval shaded area */}
                      <Area type="monotone" dataKey="forecastRevenueUpper" stroke="none" fill="#0ea5e9" fillOpacity={0.15} name="Confidence" connectNulls={false} />
                      <Area type="monotone" dataKey="forecastRevenueLower" stroke="none" fill="#ffffff" fillOpacity={1} connectNulls={false} legendType="none" />
                      {/* Main data bars */}
                      <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      {/* 12-period trend (SMA) - solid orange */}
                      <Line type="monotone" dataKey="smaRevenue" name="Trend (SMA)" stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
                      {/* Previous year comparison - dotted amber */}
                      {comparePrevYear && <Line type="monotone" dataKey="prevRevenue" name="Prev Year" stroke="#eab308" strokeWidth={2} strokeDasharray="3 3" dot={false} />}
                      {/* Seasonal forecast - dashed blue */}
                      <Line type="monotone" dataKey="forecastRevenue" name="Forecast" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No revenue data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Bookings */}
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
                      <div key={booking.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{booking.guest_name}</span>
                          <span className="text-xs text-muted-foreground">{property?.name || "Unknown property"}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-sm">R {Number(booking.total_price).toLocaleString()}</span>
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
                <div className="text-center text-muted-foreground py-8">No bookings found for this period</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
