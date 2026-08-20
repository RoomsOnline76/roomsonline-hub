import { useState, useCallback } from "react";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { stayRangeCalendarClassNames } from "@/components/ui/stay-range-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CalendarIcon, DollarSign, Percent, Hash, TrendingUp, Receipt, Landmark } from "lucide-react";
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
import { PulseSettlementRow } from "./PulseSettlementRow";
import { ChannelBreakdownChart } from "./ChannelBreakdownChart";
import { TopPropertiesTable } from "./TopPropertiesTable";
import { RiskIndicators } from "./RiskIndicators";
import { PropertyAcquisitionTracker } from "./PropertyAcquisitionTracker";
import { PortfolioDemandForecast } from "./PortfolioDemandForecast";
import { AccountingDashboard } from "@/components/insights/AccountingDashboard";
import { BillingPulseCard } from "./BillingPulseCard";
import { PropertyBillingRevenueSection } from "./PropertyBillingRevenueSection";
import { BankExportDashboard } from "@/components/bank-export";
import { InsightPanelTrigger } from "@/components/InsightPanel";
import { supabase } from "@/integrations/supabase/client";
import { useRevenueStreamTotals } from "@/hooks/useRevenueStreamTotals";
import { toast } from "sonner";

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
  const [showYoY, setShowYoY] = useState(false);

  const { data, isLoading, error } = useROLPulseData(dateRange, showYoY);
  const { data: streams, isLoading: streamsLoading } = useRevenueStreamTotals(dateRange);

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
    <Tabs defaultValue="revenue" className="space-y-4">
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="revenue" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="bank-exports" className="gap-2">
            <Landmark className="h-4 w-4" />
            Bank Exports
          </TabsTrigger>
          <TabsTrigger value="accounting" className="gap-2">
            <Receipt className="h-4 w-4" />
            Accounting
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="yoy-mode" checked={showYoY} onCheckedChange={setShowYoY} />
            <Label htmlFor="yoy-mode" className="text-xs cursor-pointer">Y-on-Y</Label>
          </div>
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
                classNames={stayRangeCalendarClassNames()}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <TabsContent value="revenue" className="space-y-4 mt-0">

      {/* Tier 1: KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4">
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

      {/* Settlement view — collected vs commission vs owner money, same period */}
      <PulseSettlementRow start={dateRange.start} end={dateRange.end} />



      {/* Revenue stream split — appears once F&B revenue is posted */}
      {streams?.hasSplit && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 xl:gap-4">
          <ROLKPICard
            title="Net Accommodation"
            value={formatCompactCurrency(streams.accommodation)}
            subtitle="Excl. F&B"
            icon={DollarSign}
            isLoading={streamsLoading}
          />
          <ROLKPICard
            title="F&B Revenue"
            value={formatCompactCurrency(streams.fnb)}
            subtitle="Breakfast & food"
            icon={Receipt}
            isLoading={streamsLoading}
          />
          <ROLKPICard
            title="Other Revenue"
            value={formatCompactCurrency(streams.other)}
            subtitle="Non-room streams"
            icon={Hash}
            isLoading={streamsLoading}
          />
        </div>
      )}

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

      {/* Revenue Split: Listing vs PMS */}
      {data && (data.tier1.listingRevenue > 0 || data.tier1.pmsRevenue > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue by Commission Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border bg-sky-500/5 border-sky-500/20">
                <p className="text-xs text-muted-foreground mb-1">Listing Revenue</p>
                <p className="text-2xl font-bold tabular-nums">{formatCompactCurrency(data.tier1.listingRevenue)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Sleep in Africa marketplace</p>
              </div>
              <div className="p-4 rounded-lg border bg-violet-500/5 border-violet-500/20">
                <p className="text-xs text-muted-foreground mb-1">PMS Revenue</p>
                <p className="text-2xl font-bold tabular-nums">{formatCompactCurrency(data.tier1.pmsRevenue)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">ROL'OS integrations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier 2: Split View */}
      <div className="grid lg:grid-cols-2 gap-4 xl:gap-6">
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
      <div className="grid lg:grid-cols-2 gap-4 xl:gap-6">
        <RiskIndicators
          cancellationRate={data?.tier3.cancellationRate ?? 0}
          syncFailureCount={data?.tier3.syncFailureCount ?? 0}
          lowPerformingProperties={data?.tier3.lowPerformingProperties ?? 0}
          isLoading={isLoading}
        />
      </div>

      {/* Portfolio Demand Forecast */}
      <PortfolioDemandForecast />

      {/* Property Acquisition & PMS Distribution */}
      <PropertyAcquisitionTracker />

      {/* Property billing & subscriptions — expected / invoiced / paid */}
      <PropertyBillingRevenueSection start={dateRange.start} end={dateRange.end} />

      {/* Billing Summary */}
      <BillingPulseCard />
      </TabsContent>

      <TabsContent value="bank-exports" className="mt-0">
        <BankExportDashboard />
      </TabsContent>

      <TabsContent value="accounting" className="mt-0">
        <AccountingDashboard dateRange={dateRange} />
      </TabsContent>

      <InsightPanelTrigger
        title="Revenue Pulse — TOBI"
        description="Ask questions about revenue, commissions, channels, or property performance."
        placeholder="e.g., What's driving our revenue this month?"
        onAnalyze={async (prompt) => {
          try {
            // Fetch conversion funnel data
            let conversionData = null;
            try {
              const now = new Date();
              const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
              const { data: sessions, error: sessErr } = await supabase
                .from("nightsbridge_booking_sessions")
                .select("status")
                .gte("created_at", startOfMonth);
              if (!sessErr && sessions) {
                const total = sessions.length;
                const matched = sessions.filter((s: any) => s.status === "matched").length;
                const pending = sessions.filter((s: any) => s.status === "pending").length;
                const expired = sessions.filter((s: any) => s.status === "expired").length;
                conversionData = {
                  totalThisMonth: total,
                  matchedThisMonth: matched,
                  pendingThisMonth: pending,
                  expiredThisMonth: expired,
                  conversionRate: total > 0 ? (matched / total) * 100 : 0,
                };
              }
            } catch { /* non-critical */ }

            const { data: fnData, error: fnError } = await supabase.functions.invoke(
              "revenue-pulse-insights",
              {
                body: {
                  prompt,
                  context: {
                    tier1: data?.tier1,
                    tier2: data?.tier2,
                    tier3: data?.tier3,
                    timeline: data?.timeline,
                    dateRange,
                    showYoY,
                    conversionData,
                  },
                },
              }
            );

            if (fnError) {
              toast.error("Failed to get insight", { description: fnError.message });
              return "Error: " + fnError.message;
            }

            return fnData?.insight || "No insight generated.";
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            toast.error("Insight Error", { description: message });
            return "Error: " + message;
          }
        }}
      />
    </Tabs>
  );
}
