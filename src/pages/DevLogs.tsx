import { useEffect, useState, useCallback } from "react";
import {
  Database,
  Search,
  RefreshCw,
  Filter,
  Download,
  AlertCircle,
  CheckCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";

const PAGE_SIZE = 50;

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error";
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export default function DevLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, errors: 0, warnings: 0, info: 0 });

  const getDateFilter = useCallback(() => {
    const now = new Date();
    switch (dateRange) {
      case "24h": return subDays(now, 1).toISOString();
      case "7d": return subDays(now, 7).toISOString();
      case "30d": return subDays(now, 30).toISOString();
      case "90d": return subDays(now, 90).toISOString();
      case "all": return null;
      default: return subDays(now, 7).toISOString();
    }
  }, [dateRange]);

  // Load distinct sources once
  useEffect(() => {
    const loadSources = async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("table_name")
        .limit(1000);
      if (data) {
        const unique = [...new Set(data.map((d: any) => d.table_name))].sort();
        setSources(unique);
      }
    };
    loadSources();
  }, []);

  // Load logs with server-side filtering
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const dateStart = getDateFilter();

      // Use RPC for deep search (searches inside JSON columns too)
      const { data, error } = await supabase.rpc("search_audit_logs", {
        search_text: searchQuery || null,
        date_from: dateStart || null,
        date_to: null,
        source_filter: sourceFilter !== "all" ? sourceFilter : null,
        result_limit: PAGE_SIZE,
        result_offset: page * PAGE_SIZE,
      });

      if (error) throw error;

      const totalFromRpc = (data as any)?.[0]?.total_count || 0;
      setTotalCount(Number(totalFromRpc));

      const logEntries: LogEntry[] = (data || []).map((log: any) => ({
        id: log.id,
        timestamp: log.created_at,
        level: log.action_type === "delete" ? "warning" : log.is_sensitive ? "error" : "info",
        source: log.table_name,
        message: log.change_summary,
        metadata: {
          user: log.user_email,
          action: log.action_type,
          record_id: log.record_id,
        },
      }));

      setLogs(logEntries);

      // Compute stats from loaded data (approximate for current filter)
      const errors = logEntries.filter((l) => l.level === "error").length;
      const warnings = logEntries.filter((l) => l.level === "warning").length;
      const infos = logEntries.filter((l) => l.level === "info").length;
      setStats({ total: Number(totalFromRpc), errors, warnings, info: infos });
    } catch (error) {
      console.error("Error loading logs:", error);
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [getDateFilter, sourceFilter, searchQuery, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, levelFilter, sourceFilter, dateRange]);

  const handleSearch = () => {
    setSearchQuery(searchInput);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
    toast.success("Logs refreshed");
  };

  // Client-side level filter (since it's derived, not a DB column)
  const filteredLogs =
    levelFilter === "all" ? logs : logs.filter((log) => log.level === levelFilter);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "warning":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Warning</Badge>
        );
      default:
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Data & Logs"
          subtitle="Sync logs, booking orchestration, and error traces"
        />
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.errors}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{stats.warnings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Info</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.info}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Log Entries</CardTitle>
              <CardDescription>
                Recent system activity and audit trail — {totalCount.toLocaleString()} total
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs (user, message, table, record ID)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-10"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={handleSearch}>
              <Search className="h-4 w-4 mr-1" />
              Search
            </Button>
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSearchInput("");
                }}
              >
                Clear
              </Button>
            )}
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[130px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[130px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {searchQuery && (
            <div className="mb-4">
              <Badge variant="outline" className="text-xs">
                Searching: "{searchQuery}" — {totalCount} results
              </Badge>
            </div>
          )}

          {/* Logs Table */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No logs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[80px]">Level</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                  <TableHead className="w-[140px]">Source</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[180px]">User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {getLevelIcon(log.level)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          (log.metadata as any)?.action === "delete"
                            ? "destructive"
                            : "outline"
                        }
                        className="font-mono text-xs"
                      >
                        {(log.metadata as any)?.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {log.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate" title={log.message}>
                      {log.message}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate" title={(log.metadata as any)?.user}>
                      {(log.metadata as any)?.user}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({totalCount.toLocaleString()} records)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
