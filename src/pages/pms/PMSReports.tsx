import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, BedDouble, Percent, RefreshCw, Download, Loader2, Receipt, LayoutGrid, Building2, XCircle, UsersRound, RotateCcw } from "lucide-react";
import { PMSFoliosManager } from "@/components/pms/PMSFoliosManager";
import { RefundRegisterPanel } from "@/components/pms/RefundRegisterPanel";
import { GroupPerformancePanel } from "@/components/pms/GroupPerformancePanel";
import { CrossPropertyPipelineCard } from "@/components/pms/CrossPropertyPipelineCard";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCrmAccounts } from "@/hooks/useCrmAccounts";
import { MARKET_SEGMENTS, COMM_CHANNELS, labelFor } from "@/lib/crmSegmentation";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, BarChart, Bar, Legend,
} from "recharts";
import {
  format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear,
  differenceInDays, parseISO, eachDayOfInterval, eachMonthOfInterval,
} from "date-fns";
import { PmsPageSkeleton } from "@/components/pms/PmsPageSkeleton";
import { cancellationCategoryLabel } from "@/lib/revenueStatuses";
import { useRevenueMix } from "@/hooks/useRevenueStreamTotals";
import { RevenueMixPanel } from "@/components/pms/revenue/RevenueMixPanel";



// ── Types ────────────────────────────────────────────────────────────────

interface ReportBooking {
  id: string;
  check_in_date: string;
  check_out_date: string;
  total_price: number;
  status: string;
  created_at: string | null;
  room_type_id: string | null;
  booking_channel: string | null;
  cancellation_reason_category: string | null;
  market_segment: string | null;
  comm_channel: string | null;
  agent_account_id: string | null;
  company_account_id: string | null;
  source_account_id: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("en-ZA", { maximumFractionDigits: 0 });

const PAGE_SIZE = 500;

// ── Component ────────────────────────────────────────────────────────────

export default function PMSReports() {
  const { propertyId, properties, portfolioProperties, portfolioIds, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const scopeProperties = portfolioProperties && portfolioProperties.length > 0 ? portfolioProperties : properties;
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("this_month");

  const [viewMode, setViewMode] = useState<"portfolio" | "single">(
    (portfolioProperties && portfolioProperties.length > 1) ? "portfolio" : "single"
  );
  const autoDefaulted = useRef(false);
  useEffect(() => {
    if (!autoDefaulted.current && portfolioProperties && portfolioProperties.length > 1) {
      setViewMode("portfolio");
      autoDefaulted.current = true;
    }
  }, [portfolioProperties]);

  const isPortfolio = viewMode === "portfolio" && scopeProperties.length > 1;
  const activePropertyIds = useMemo(
    () => (isPortfolio ? scopeProperties.map((p) => p.id) : propertyId ? [propertyId] : []),
    [isPortfolio, scopeProperties, propertyId]
  );

  // Derive date range from period
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "last_7_days": return { from: subDays(now, 7), to: now };
      case "last_30_days": return { from: subDays(now, 30), to: now };
      case "this_month": return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last_month": { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
      case "this_year": return { from: startOfYear(now), to: endOfYear(now) };
      default: return { from: startOfMonth(now), to: endOfMonth(now) };
    }
  }, [period]);

  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");

  // Revenue stream split (accommodation / F&B / other) for the same scope + period.
  const { data: revenueMix } = useRevenueMix({ start: fromStr, end: toStr }, activePropertyIds);



  // ── Fetch bookings with infinite scroll pagination ────────────────────

  const {
    data: bookingsPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["pms-reports-bookings", activePropertyIds.join(","), fromStr, toStr],
    queryFn: async ({ pageParam = 0 }) => {
      if (activePropertyIds.length === 0) return { items: [] as ReportBooking[], nextOffset: null };
      const { data, count } = await supabase
        .from("bookings")
        .select("id, check_in_date, check_out_date, total_price, status, created_at, room_type_id, booking_channel, cancellation_reason_category, market_segment, comm_channel, agent_account_id, company_account_id, source_account_id", { count: "exact" })
        .in("property_id", activePropertyIds)
        .gte("check_in_date", fromStr)
        .lte("check_in_date", toStr)
        .order("check_in_date", { ascending: true })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      const items = (data || []) as ReportBooking[];
      const total = count || 0;
      const nextOffset = pageParam + PAGE_SIZE < total ? pageParam + PAGE_SIZE : null;
      return { items, nextOffset };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    enabled: activePropertyIds.length > 0,
    // Reports are re-read often while navigating between PMS tabs; a short cache
    // window keeps the shell instant without serving stale figures.
    staleTime: 60_000,
  });

  // Flatten all pages into single array
  const bookings = useMemo(() => {
    if (!bookingsPages) return [];
    return bookingsPages.pages.flatMap(p => p.items);
  }, [bookingsPages]);

  // Fetch rooms count for occupancy calculation
  const { data: rooms = [] } = useQuery({
    queryKey: ["pms-reports-rooms", activePropertyIds.join(",")],
    queryFn: async () => {
      if (activePropertyIds.length === 0) return [];
      const { data } = await supabase
        .from("rolos_rooms")
        .select("id")
        .in("property_id", activePropertyIds);
      return data || [];
    },
    enabled: activePropertyIds.length > 0,
  });

  const totalRooms = Math.max(1, rooms.length);
  const daysInPeriod = Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1);

  // ── Compute KPIs ──────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const active = bookings.filter(b => b.status !== "cancelled" && b.status !== "failed");
    const cancelled = bookings.filter(b => b.status === "cancelled");
    const totalRevenue = active.reduce((s, b) => s + Number(b.total_price || 0), 0);
    const bookedNights = active.reduce((s, b) => {
      if (b.check_in_date && b.check_out_date) {
        return s + Math.max(1, differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date)));
      }
      return s + 1;
    }, 0);
    const availableNights = totalRooms * daysInPeriod;
    const adr = active.length > 0 ? totalRevenue / active.length : 0;
    const revpar = availableNights > 0 ? totalRevenue / availableNights : 0;
    const occupancy = availableNights > 0 ? (bookedNights / availableNights) * 100 : 0;
    const cancellationRate = bookings.length > 0 ? (cancelled.length / bookings.length) * 100 : 0;

    return {
      totalBookings: active.length,
      cancelledBookings: cancelled.length,
      totalRevenue,
      adr,
      revpar,
      occupancy: Math.min(occupancy, 100),
      bookedNights,
      availableNights,
      cancellationRate,
    };
  }, [bookings, totalRooms, daysInPeriod]);

  // ── Segmentation analysis ─────────────────────────────────────────────
  // Market code, distribution channel and travel-agent / company production —
  // the reporting payoff for linking CRM profiles to reservations.
  const { accounts: crmAccounts } = useCrmAccounts({ propertyId, portfolioIds });
  const accountName = useCallback(
    (id: string | null) => (id ? crmAccounts.find((a) => a.id === id)?.name || "Unknown profile" : null),
    [crmAccounts],
  );

  const segmentation = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "cancelled" && b.status !== "failed");
    if (active.length === 0) return null;

    const tally = (key: (b: ReportBooking) => string | null) => {
      const m = new Map<string, { count: number; value: number }>();
      for (const b of active) {
        const k = key(b);
        if (!k) continue;
        const row = m.get(k) || { count: 0, value: 0 };
        row.count += 1;
        row.value += Number(b.total_price || 0);
        m.set(k, row);
      }
      return Array.from(m.entries())
        .map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
    };

    const bySegment = tally((b) => (b.market_segment ? labelFor(MARKET_SEGMENTS, b.market_segment) : null));
    const byChannel = tally((b) => (b.comm_channel ? labelFor(COMM_CHANNELS, b.comm_channel) : null));
    const byAgent = tally((b) => accountName(b.agent_account_id));
    const byCompany = tally((b) => accountName(b.company_account_id));

    const unsegmented = active.filter((b) => !b.market_segment).length;
    if (!bySegment.length && !byChannel.length && !byAgent.length && !byCompany.length) return null;
    return { bySegment, byChannel, byAgent, byCompany, unsegmented, activeCount: active.length };
  }, [bookings, accountName]);

  // ── Cancellation analysis ─────────────────────────────────────────────
  // Cancelled bookings are stripped out of revenue, so the lost value and the
  // reason mix are the only way to see why the money went away.
  const cancellationAnalysis = useMemo(() => {
    const cancelled = bookings.filter((b) => b.status === "cancelled");
    if (cancelled.length === 0) return null;

    const lostValue = cancelled.reduce((s, b) => s + Number(b.total_price || 0), 0);

    const byReason = new Map<string, { count: number; value: number }>();
    const byChannel = new Map<string, { count: number; value: number }>();
    for (const b of cancelled) {
      const reasonKey = b.cancellation_reason_category || "uncategorised";
      const reason = byReason.get(reasonKey) || { count: 0, value: 0 };
      reason.count += 1;
      reason.value += Number(b.total_price || 0);
      byReason.set(reasonKey, reason);

      const channelKey = b.booking_channel || "direct";
      const channel = byChannel.get(channelKey) || { count: 0, value: 0 };
      channel.count += 1;
      channel.value += Number(b.total_price || 0);
      byChannel.set(channelKey, channel);
    }

    const sort = (m: Map<string, { count: number; value: number }>) =>
      Array.from(m.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.count - a.count);

    return { total: cancelled.length, lostValue, reasons: sort(byReason), channels: sort(byChannel) };
  }, [bookings]);

  // ── Chart data (daily or monthly) ─────────────────────────────────────

  const shouldAggregate = daysInPeriod > 45;

  const chartData = useMemo(() => {
    const active = bookings.filter(b => b.status !== "cancelled" && b.status !== "failed");

    if (shouldAggregate) {
      const months = eachMonthOfInterval({ start: dateRange.from, end: dateRange.to });
      return months.map(m => {
        const mStr = format(m, "yyyy-MM");
        const mBookings = active.filter(b => b.check_in_date?.startsWith(mStr));
        const rev = mBookings.reduce((s, b) => s + Number(b.total_price || 0), 0);
        const nights = mBookings.reduce((s, b) => {
          if (b.check_in_date && b.check_out_date) return s + Math.max(1, differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date)));
          return s + 1;
        }, 0);
        const daysInM = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const avail = totalRooms * daysInM;
        return {
          date: format(m, "MMM yyyy"),
          bookings: mBookings.length,
          revenue: rev,
          occupancy: avail > 0 ? Math.min((nights / avail) * 100, 100) : 0,
          adr: mBookings.length > 0 ? rev / mBookings.length : 0,
        };
      });
    }

    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    return days.map(d => {
      const dStr = format(d, "yyyy-MM-dd");
      const dBookings = active.filter(b => b.check_in_date?.startsWith(dStr));
      const rev = dBookings.reduce((s, b) => s + Number(b.total_price || 0), 0);
      const nights = dBookings.reduce((s, b) => {
        if (b.check_in_date && b.check_out_date) return s + Math.max(1, differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date)));
        return s + 1;
      }, 0);
      return {
        date: format(d, "dd MMM"),
        bookings: dBookings.length,
        revenue: rev,
        occupancy: totalRooms > 0 ? Math.min((nights / totalRooms) * 100, 100) : 0,
        adr: dBookings.length > 0 ? rev / dBookings.length : 0,
      };
    });
  }, [bookings, dateRange, totalRooms, shouldAggregate]);

  // ── Channel breakdown ─────────────────────────────────────────────────

  const channelData = useMemo(() => {
    const active = bookings.filter(b => b.status !== "cancelled" && b.status !== "failed");
    const map = new Map<string, { count: number; revenue: number }>();
    active.forEach(b => {
      const ch = b.booking_channel || "Direct";
      const entry = map.get(ch) || { count: 0, revenue: 0 };
      entry.count++;
      entry.revenue += Number(b.total_price || 0);
      map.set(ch, entry);
    });
    return Array.from(map.entries())
      .map(([channel, v]) => ({ channel, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [bookings]);

  // ── Export CSV ─────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (chartData.length === 0) return;
    const headers = "Date,Bookings,Revenue,Occupancy %,ADR";
    const rows = chartData.map(d => `${d.date},${d.bookings},${d.revenue.toFixed(2)},${d.occupancy.toFixed(1)},${d.adr.toFixed(2)}`);

    // Revenue mix summary — posted folio revenue split by stream, plus per-property rows.
    const mixLines: string[] = [];
    if (revenueMix && revenueMix.total > 0) {
      mixLines.push(
        "",
        "Revenue mix (posted folio revenue)",
        "Property,Total,Accommodation,Food & Beverage,Other,Room nights,Accom ADR",
        ...revenueMix.byProperty.map(
          (p) =>
            `"${p.propertyName.replace(/"/g, '""')}",${p.total.toFixed(2)},${p.accommodation.toFixed(2)},${p.fnb.toFixed(2)},${p.other.toFixed(2)},${p.nights},${p.accomAdr.toFixed(2)}`,
        ),
        `TOTAL,${revenueMix.total.toFixed(2)},${revenueMix.accommodation.toFixed(2)},${revenueMix.fnb.toFixed(2)},${revenueMix.other.toFixed(2)},${revenueMix.nights},${revenueMix.accomAdr.toFixed(2)}`,
      );
    }

    const blob = new Blob([[headers, ...rows, ...mixLines].join("\n")], { type: "text/csv" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pms-report-${fromStr}-to-${toStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (propertyLoading) return <PmsPageSkeleton rows={3} />;
  if (!isPortfolio && !propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  return (
    <>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Reports & Financials</h1>
        
        <Tabs defaultValue="analytics" className="space-y-4">
          <TabsList>
            <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 mr-1" />Analytics</TabsTrigger>
            <TabsTrigger value="groups"><UsersRound className="w-4 h-4 mr-1" />Groups</TabsTrigger>
            <TabsTrigger value="folios"><Receipt className="w-4 h-4 mr-1" />Folios</TabsTrigger>
            <TabsTrigger value="refunds"><RotateCcw className="w-4 h-4 mr-1" />Refunds</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-6">
        {!isPortfolio && propertyId && <CrossPropertyPipelineCard propertyId={propertyId} />}
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold">
            Performance Analytics
            {isPortfolio && <span className="ml-2 text-xs font-normal text-muted-foreground">Portfolio · {scopeProperties.length} properties</span>}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {scopeProperties.length > 1 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode(viewMode === "portfolio" ? "single" : "portfolio")}
                  title={viewMode === "portfolio" ? "Switch to single property" : "Switch to portfolio view"}
                >
                  {viewMode === "portfolio" ? <Building2 className="h-4 w-4 mr-1" /> : <LayoutGrid className="h-4 w-4 mr-1" />}
                  {viewMode === "portfolio" ? "Portfolio" : "Single"}
                </Button>
                {!isPortfolio && (
                  <Select value={propertyId ?? undefined} onValueChange={(v) => switchProperty(v)}>
                    <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Select property" /></SelectTrigger>
                    <SelectContent>
                      {scopeProperties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["pms-reports-bookings"] })} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={chartData.length === 0}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Load more indicator */}
        {hasNextPage && (
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="w-full">
            {isFetchingNextPage ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading more…</> : `Load more bookings (${bookings.length} loaded)`}
          </Button>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium">Revenue</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">R{fmt(stats.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">{stats.totalBookings} bookings</p>
              {revenueMix?.hasSplit && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Accom R{fmt(revenueMix.accommodation)} · F&amp;B R{fmt(revenueMix.fnb)}
                  {revenueMix.other > 0 ? ` · Other R${fmt(revenueMix.other)}` : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Percent className="h-3 w-3" />Occupancy</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.occupancy.toFixed(1)}%</p><p className="text-xs text-muted-foreground">{stats.bookedNights}/{stats.availableNights} nights</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1"><BedDouble className="h-3 w-3" />ADR</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">R{fmt(stats.adr)}</p><p className="text-xs text-muted-foreground">Avg. Daily Rate</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium">RevPAR</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">R{fmt(stats.revpar)}</p><p className="text-xs text-muted-foreground">Rev per Available Room</p></CardContent>
          </Card>
        </div>

        {/* Revenue mix — accommodation vs F&B vs other, with per-property roll-up */}
        <RevenueMixPanel
          dateRange={{ start: fromStr, end: toStr }}
          propertyIds={activePropertyIds}
          periodLabel={`${format(dateRange.from, "d MMM")} – ${format(dateRange.to, "d MMM yyyy")}`}
        />



        {/* Cancellation analysis */}
        {cancellationAnalysis && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                Cancellations
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {cancellationAnalysis.total} cancelled ({stats.cancellationRate.toFixed(1)}% of all
                bookings) — R{fmt(cancellationAnalysis.lostValue)} of value lost, already excluded
                from revenue above.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">By reason</p>
                {cancellationAnalysis.reasons.map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-xs">
                    <span>{cancellationCategoryLabel(r.key)}</span>
                    <span className="text-muted-foreground">
                      {r.count} · R{fmt(r.value)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">By channel</p>
                {cancellationAnalysis.channels.map((c) => (
                  <div key={c.key} className="flex items-center justify-between text-xs">
                    <span className="capitalize">{c.key.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">
                      {c.count} · R{fmt(c.value)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Segmentation & production */}
        {segmentation && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Segmentation &amp; Production</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { title: "Market Segment", rows: segmentation.bySegment },
                { title: "Distribution Channel", rows: segmentation.byChannel },
                { title: "Travel Agent / Operator", rows: segmentation.byAgent },
                { title: "Company", rows: segmentation.byCompany },
              ].map((group) => (
                <div key={group.title} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
                  {group.rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Not captured on these bookings.</p>
                  ) : (
                    group.rows.map((r) => (
                      <div key={r.label} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{r.label}</span>
                        <span className="whitespace-nowrap font-medium">
                          R{fmt(r.value)} <span className="text-muted-foreground">({r.count})</span>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ))}
              {segmentation.unsegmented > 0 && (
                <p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-4">
                  {segmentation.unsegmented} of {segmentation.activeCount} bookings have no market segment set.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Charts */}
        {chartData.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Revenue & Bookings */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Revenue & Bookings</CardTitle></CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue (R)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="bookings" name="Bookings" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Occupancy Trend */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Occupancy %</CardTitle></CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                    <Area type="monotone" dataKey="occupancy" name="Occupancy" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* ADR Trend */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Average Daily Rate</CardTitle></CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `R${v.toFixed(0)}`} />
                    <Line type="monotone" dataKey="adr" name="ADR" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Channel Breakdown */}
            {channelData.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Channel Breakdown</CardTitle></CardHeader>
                <CardContent className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="channel" type="category" tick={{ fontSize: 11 }} width={90} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue (R)" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="count" name="Bookings" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {isLoading ? "Loading report data…" : "No booking data for this period."}
              </p>
            </CardContent>
          </Card>
        )}
          </TabsContent>

          <TabsContent value="groups">
            <GroupPerformancePanel propertyIds={activePropertyIds} startDate={fromStr} endDate={toStr} />
          </TabsContent>

          <TabsContent value="refunds">
            <RefundRegisterPanel propertyId={propertyId} />
          </TabsContent>

          <TabsContent value="folios">
            {propertyId ? <PMSFoliosManager propertyId={propertyId} /> : <p className="text-muted-foreground">Select a property to view folios.</p>}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
