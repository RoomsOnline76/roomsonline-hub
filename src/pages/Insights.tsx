import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { Search, Sparkles, Send, Loader2, TrendingUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 20;

const Insights = () => {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: subDays(now, 30), to: now };
  });
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: searchLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["ai-search-logs", dateRange],
    queryFn: async () => {
      const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
      const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
      let query = supabase.from("ai_search_logs").select("*").order("created_at", { ascending: false });
      if (fromDate) query = query.gte("created_at", fromDate);
      if (toDate) query = query.lte("created_at", toDate + "T23:59:59");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["insights-bookings", dateRange],
    queryFn: async () => {
      const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
      const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
      let query = supabase.from("bookings").select("id, property_id, created_at, status, guest_name");
      if (fromDate) query = query.gte("created_at", fromDate);
      if (toDate) query = query.lte("created_at", toDate + "T23:59:59");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: properties = [] } = useQuery({
    queryKey: ["insights-properties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name, city, country, property_type").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const sortedLogs = useMemo(() => {
    return [...searchLogs].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [searchLogs, sortOrder]);

  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedLogs, currentPage]);

  const totalPages = Math.ceil(sortedLogs.length / ITEMS_PER_PAGE);

  const searchTermStats = useMemo(() => {
    const termCounts = new Map<string, { count: number; avgMatches: number; totalMatches: number }>();
    searchLogs.forEach(log => {
      const term = log.query.toLowerCase().trim();
      const existing = termCounts.get(term) || { count: 0, avgMatches: 0, totalMatches: 0 };
      existing.count += 1;
      existing.totalMatches += log.matched_count || 0;
      existing.avgMatches = existing.totalMatches / existing.count;
      termCounts.set(term, existing);
    });
    return Array.from(termCounts.entries())
      .map(([term, stats]) => ({ term, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [searchLogs]);

  const correlationData = useMemo(() => {
    if (searchTermStats.length === 0 || properties.length === 0) return [];
    return searchTermStats.map(({ term, count, avgMatches }) => {
      const matchingPropertyIds = properties
        .filter(p => {
          const s = term.toLowerCase();
          return p.name?.toLowerCase().includes(s) || p.city?.toLowerCase().includes(s) || 
                 p.country?.toLowerCase().includes(s) || p.property_type?.toLowerCase().includes(s);
        })
        .map(p => p.id);
      const relatedBookings = bookings.filter(b => matchingPropertyIds.includes(b.property_id) && b.status !== "cancelled");
      const hasMatches = avgMatches > 0;
      const hasBookings = relatedBookings.length > 0;
      const frequencyScore = Math.min(count / 10, 1) * 30;
      const matchScore = hasMatches ? 30 : 0;
      const bookingScore = hasBookings ? Math.min(relatedBookings.length / 5, 1) * 40 : 0;
      const overlapScore = Math.round(frequencyScore + matchScore + bookingScore);
      return { term, searchCount: count, avgMatches: Math.round(avgMatches * 10) / 10, bookingCount: relatedBookings.length, overlapScore };
    }).sort((a, b) => b.overlapScore - a.overlapScore);
  }, [searchTermStats, properties, bookings]);

  const handleAiAnalysis = async () => {
    if (!aiPrompt.trim()) { toast.error("Enter a prompt"); return; }
    setAiLoading(true);
    setAiInsight(null);
    try {
      const { data, error } = await supabase.functions.invoke("dashboard-insights", {
        body: {
          prompt: `Analyze AI search patterns and booking correlations: ${aiPrompt}`,
          dashboardData: {
            searchLogs: { total: searchLogs.length, uniqueTerms: searchTermStats.length, topTerms: searchTermStats.slice(0, 10) },
            correlations: correlationData.slice(0, 10),
            bookings: { total: bookings.length, confirmed: bookings.filter(b => b.status === "confirmed").length },
          },
        },
      });
      if (error) throw error;
      setAiInsight(data.insight);
    } catch (error) {
      console.error("AI analysis error:", error);
      toast.error("Failed to generate insight");
    } finally {
      setAiLoading(false);
    }
  };

  const getOverlapColor = (score: number) => score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";
  const avgMatches = searchLogs.length > 0 ? Math.round(searchLogs.reduce((sum, l) => sum + (l.matched_count || 0), 0) / searchLogs.length * 10) / 10 : 0;

  return (
    <AppLayout>
      <PageHeader
        title="Intelligence"
        subtitle="Search analytics and financial tracking"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}>7d</Button>
            <Button variant="ghost" size="sm" onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}>30d</Button>
            <Button variant="ghost" size="sm" onClick={() => setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}>Month</Button>
          </div>
        }
      />

      <div className="space-y-4">
          {/* AI Analysis - compact inline */}
          <Card>
            <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Ask TOBI: e.g., What search trends convert best?"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiAnalysis()}
                disabled={aiLoading}
                className="h-8"
              />
              <Button size="sm" onClick={handleAiAnalysis} disabled={aiLoading} className="shrink-0">
                {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </div>
            {aiInsight && <p className="mt-2 text-sm text-muted-foreground bg-muted rounded px-3 py-2">{aiInsight}</p>}
          </CardContent>
        </Card>

        {/* Two column layout: Correlation left, Log table right */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 xl:gap-6">
          {/* Correlation - narrower */}
          <Card className="xl:col-span-2">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="font-semibold text-sm">Search → Booking Correlation</span>
              </div>
              {correlationData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No data</p>
              ) : (
                <div className="space-y-1.5">
                  {correlationData.slice(0, 12).map((item) => (
                    <div key={item.term} className="flex items-center gap-2 text-xs">
                      <div className="w-32 truncate" title={item.term}>"{item.term}"</div>
                      <Progress value={item.overlapScore} className="h-2 flex-1" />
                      <div className={cn("w-2 h-2 rounded-full shrink-0", getOverlapColor(item.overlapScore))} />
                      <span className="w-16 text-right text-muted-foreground">{item.searchCount}→{item.bookingCount}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Log table - wider */}
          <Card className="xl:col-span-3">
            <CardContent className="py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <span className="font-semibold text-sm">Search Log</span>
                  <span className="text-xs text-muted-foreground">({sortedLogs.length} entries)</span>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 text-xs">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span>{currentPage}/{totalPages}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              {logsLoading ? (
                <div className="space-y-1">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : sortedLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No logs for selected range</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="py-2">Query</TableHead>
                      <TableHead className="py-2 w-16 text-center">Hits</TableHead>
                      <TableHead className="py-2 w-32 cursor-pointer hover:bg-muted/50" onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}>
                        <div className="flex items-center gap-1">Time <ArrowUpDown className="h-3 w-3" /></div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.map((log) => (
                      <TableRow key={log.id} className="text-xs">
                        <TableCell className="py-1.5 font-medium">{log.query}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant={log.matched_count && log.matched_count > 0 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                            {log.matched_count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-muted-foreground">{format(parseISO(log.created_at), "MMM dd, HH:mm")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Insights;