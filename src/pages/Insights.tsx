import { useState, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { CalendarIcon, Search, Sparkles, Send, Loader2, TrendingUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 15;

const Insights = () => {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return {
      from: subDays(now, 30),
      to: now,
    };
  });
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch AI search logs
  const { data: searchLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["ai-search-logs", dateRange],
    queryFn: async () => {
      const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
      const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
      
      let query = supabase
        .from("ai_search_logs")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (fromDate) query = query.gte("created_at", fromDate);
      if (toDate) query = query.lte("created_at", toDate + "T23:59:59");
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch bookings for correlation analysis
  const { data: bookings = [] } = useQuery({
    queryKey: ["insights-bookings", dateRange],
    queryFn: async () => {
      const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
      const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
      
      let query = supabase
        .from("bookings")
        .select("id, property_id, created_at, status, guest_name");
      
      if (fromDate) query = query.gte("created_at", fromDate);
      if (toDate) query = query.lte("created_at", toDate + "T23:59:59");
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch properties for matching
  const { data: properties = [] } = useQuery({
    queryKey: ["insights-properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, city, country, property_type");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Sorted logs
  const sortedLogs = useMemo(() => {
    return [...searchLogs].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [searchLogs, sortOrder]);

  // Paginated logs
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedLogs, currentPage]);

  const totalPages = Math.ceil(sortedLogs.length / ITEMS_PER_PAGE);

  // Aggregate search terms with frequency
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

  // Calculate search-to-booking correlation
  const correlationData = useMemo(() => {
    if (searchTermStats.length === 0 || properties.length === 0) return [];
    
    return searchTermStats.map(({ term, count, avgMatches }) => {
      // Find properties that match this search term
      const matchingPropertyIds = properties
        .filter(p => {
          const searchTermLower = term.toLowerCase();
          return (
            p.name?.toLowerCase().includes(searchTermLower) ||
            p.city?.toLowerCase().includes(searchTermLower) ||
            p.country?.toLowerCase().includes(searchTermLower) ||
            p.property_type?.toLowerCase().includes(searchTermLower)
          );
        })
        .map(p => p.id);
      
      // Count bookings for matching properties
      const relatedBookings = bookings.filter(
        b => matchingPropertyIds.includes(b.property_id) && b.status !== "cancelled"
      );
      
      // Calculate overlap score (0-100)
      // Based on: search frequency, whether results were found, and if those properties were booked
      const hasMatches = avgMatches > 0;
      const hasBookings = relatedBookings.length > 0;
      const frequencyScore = Math.min(count / 10, 1) * 30; // Up to 30 points for frequency
      const matchScore = hasMatches ? 30 : 0; // 30 points if search had results
      const bookingScore = hasBookings ? Math.min(relatedBookings.length / 5, 1) * 40 : 0; // Up to 40 points for bookings
      
      const overlapScore = Math.round(frequencyScore + matchScore + bookingScore);
      
      return {
        term,
        searchCount: count,
        avgMatches: Math.round(avgMatches * 10) / 10,
        bookingCount: relatedBookings.length,
        overlapScore,
        matchingProperties: matchingPropertyIds.length,
      };
    }).sort((a, b) => b.overlapScore - a.overlapScore);
  }, [searchTermStats, properties, bookings]);

  // Handle AI analysis
  const handleAiAnalysis = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Please enter an analysis prompt");
      return;
    }
    
    setAiLoading(true);
    setAiInsight(null);
    
    try {
      const dashboardData = {
        searchLogs: {
          total: searchLogs.length,
          uniqueTerms: searchTermStats.length,
          topTerms: searchTermStats.slice(0, 10),
          dateRange: dateRange ? {
            from: format(dateRange.from!, "yyyy-MM-dd"),
            to: format(dateRange.to!, "yyyy-MM-dd"),
          } : null,
        },
        correlations: correlationData.slice(0, 10),
        bookings: {
          total: bookings.length,
          confirmed: bookings.filter(b => b.status === "confirmed").length,
        },
      };
      
      const { data, error } = await supabase.functions.invoke("dashboard-insights", {
        body: {
          prompt: `Analyze AI search patterns and booking correlations: ${aiPrompt}`,
          dashboardData,
        },
      });
      
      if (error) throw error;
      setAiInsight(data.insight);
    } catch (error) {
      console.error("AI analysis error:", error);
      toast.error("Failed to generate AI insight");
    } finally {
      setAiLoading(false);
    }
  };

  // Get overlap color based on score
  const getOverlapColor = (score: number) => {
    if (score >= 70) return "bg-green-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getOverlapLabel = (score: number) => {
    if (score >= 70) return "High";
    if (score >= 40) return "Medium";
    return "Low";
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Search Insights</h1>
          <p className="text-muted-foreground mt-1">
            Analyze AI search patterns and their correlation with bookings
          </p>
        </div>

        {/* Date Range Filter */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
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
          
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}
            >
              Last 7 days
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}
            >
              Last 30 days
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}
            >
              This month
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Summary Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{searchLogs.length}</div>
                  <div className="text-sm text-muted-foreground">Total Searches</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{searchTermStats.length}</div>
                  <div className="text-sm text-muted-foreground">Unique Terms</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">
                    {searchLogs.length > 0
                      ? Math.round(searchLogs.reduce((sum, l) => sum + (l.matched_count || 0), 0) / searchLogs.length * 10) / 10
                      : 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Matches</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Analysis
              </CardTitle>
              <CardDescription>
                Ask AI to analyze search patterns and booking trends
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., What are the top search trends? Which searches convert to bookings?"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAiAnalysis()}
                  disabled={aiLoading}
                />
                <Button onClick={handleAiAnalysis} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {aiInsight && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{aiInsight}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Search-to-Booking Correlation */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Search-to-Booking Correlation
            </CardTitle>
            <CardDescription>
              Overlap score indicates how well search terms correlate with actual bookings (higher = stronger correlation)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {correlationData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No search data available for correlation analysis
              </div>
            ) : (
              <div className="space-y-3">
                {correlationData.slice(0, 10).map((item) => (
                  <div key={item.term} className="flex items-center gap-4">
                    <div className="w-48 truncate font-medium" title={item.term}>
                      "{item.term}"
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={item.overlapScore} 
                          className="h-3"
                        />
                        <div 
                          className={cn(
                            "w-3 h-3 rounded-full",
                            getOverlapColor(item.overlapScore)
                          )}
                        />
                      </div>
                    </div>
                    <Badge variant="outline" className="w-20 justify-center">
                      {getOverlapLabel(item.overlapScore)}
                    </Badge>
                    <div className="text-sm text-muted-foreground w-32 text-right">
                      {item.searchCount} searches → {item.bookingCount} bookings
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Search Log</CardTitle>
            <CardDescription>
              Anonymized AI search queries from users
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : sortedLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No search logs found for the selected date range</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50%]">Search Query</TableHead>
                      <TableHead className="text-center">Matches Found</TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                      >
                        <div className="flex items-center gap-1">
                          Timestamp
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.query}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={log.matched_count && log.matched_count > 0 ? "default" : "secondary"}>
                            {log.matched_count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(parseISO(log.created_at), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedLogs.length)} of {sortedLogs.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Insights;