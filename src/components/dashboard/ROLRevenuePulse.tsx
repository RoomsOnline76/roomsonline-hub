import { useState } from "react";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, DollarSign, Percent, Hash, TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { useROLPulseData } from "@/hooks/useROLPulseData";
import { ROLKPICard } from "./ROLKPICard";
import { ChannelBreakdownChart } from "./ChannelBreakdownChart";
import { TopPropertiesTable } from "./TopPropertiesTable";
import { RiskIndicators } from "./RiskIndicators";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R${(value / 1000).toFixed(0)}K`;
  }
  return formatCurrency(value);
};

interface CalendarRange {
  from: Date;
  to?: Date;
}

export function ROLRevenuePulse() {
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    end: format(new Date(), "yyyy-MM-dd"),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<CalendarRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const { data, isLoading, error } = useROLPulseData(dateRange);

  const handleDateSelect = (range: CalendarRange | undefined) => {
    if (range?.from && range?.to) {
      setSelectedRange(range);
      setDateRange({
        start: format(range.from, "yyyy-MM-dd"),
        end: format(range.to, "yyyy-MM-dd"),
      });
      setCalendarOpen(false);
    } else if (range?.from) {
      setSelectedRange(range);
    }
  };

  const presetRanges = [
    { label: "7D", days: 7 },
    { label: "30D", days: 30 },
    { label: "90D", days: 90 },
    { label: "1Y", days: 365 },
  ];

  const handlePresetClick = (days: number) => {
    const end = new Date();
    const start = subDays(end, days);
    setSelectedRange({ from: start, to: end });
    setDateRange({
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    });
  };

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Failed to load ROL Revenue data</p>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ROL Revenue Pulse</h2>
        <div className="flex items-center gap-2">
          {presetRanges.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => handlePresetClick(preset.days)}
            >
              {preset.label}
            </Button>
          ))}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(new Date(dateRange.start), "MMM d")} -{" "}
                {format(new Date(dateRange.end), "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                defaultMonth={selectedRange.from}
                selected={selectedRange}
                onSelect={handleDateSelect}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Tier 1: KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ROLKPICard
          title="GBV"
          value={data ? formatCompactCurrency(data.tier1.gbv) : "-"}
          subtitle="Gross Booking Value"
          icon={DollarSign}
          isLoading={isLoading}
        />
        <ROLKPICard
          title="ROL Revenue"
          value={data ? formatCompactCurrency(data.tier1.rolRevenue) : "-"}
          subtitle="Total Commission"
          icon={TrendingUp}
          isLoading={isLoading}
          valueClassName="text-primary"
        />
        <ROLKPICard
          title="Avg Rate"
          value={data ? `${data.tier1.avgCommissionRate.toFixed(1)}%` : "-"}
          subtitle="Commission Rate"
          icon={Percent}
          isLoading={isLoading}
        />
        <ROLKPICard
          title="Net Bookings"
          value={data?.tier1.netBookings ?? "-"}
          subtitle="Confirmed & Paid"
          icon={Hash}
          isLoading={isLoading}
        />
      </div>

      {/* Revenue Timeline Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Revenue Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Loading chart...
              </div>
            ) : data?.timeline && data.timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeline}>
                  <defs>
                    <linearGradient id="gbvGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="commissionGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => {
                      const [year, month] = value.split("-");
                      return `${month}/${year.slice(2)}`;
                    }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => formatCompactCurrency(value)}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "gbv" ? "GBV" : "ROL Revenue",
                    ]}
                    labelFormatter={(label) => `Period: ${label}`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs">
                        {value === "gbv" ? "GBV" : "ROL Revenue"}
                      </span>
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="gbv"
                    stroke="hsl(var(--chart-2))"
                    fill="url(#gbvGradient)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="commission"
                    stroke="hsl(var(--primary))"
                    fill="url(#commissionGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No timeline data available
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tier 2: Split View */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChannelBreakdownChart
          data={data?.tier2.channelBreakdown ?? []}
          isLoading={isLoading}
        />
        <TopPropertiesTable
          data={data?.tier2.topProperties ?? []}
          isLoading={isLoading}
        />
      </div>

      {/* Tier 3: Risk Indicators */}
      <div className="grid lg:grid-cols-2 gap-4">
        <RiskIndicators
          cancellationRate={data?.tier3.cancellationRate ?? 0}
          syncFailureCount={data?.tier3.syncFailureCount ?? 0}
          lowPerformingProperties={data?.tier3.lowPerformingProperties ?? 0}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
