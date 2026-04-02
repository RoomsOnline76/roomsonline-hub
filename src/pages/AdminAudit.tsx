import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Download, RefreshCw, ChevronDown, ChevronUp, X, Archive } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AuditLogTable } from "@/components/audit/AuditLogTable";
import { AuditLogDetail } from "@/components/audit/AuditLogDetail";

export interface AuditLog {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string;
  user_role: "admin" | "dev" | "owner" | "system";
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  action_type: "create" | "update" | "delete" | "permission_change" | "sync" | "export" | "login" | "other";
  table_name: string;
  record_id: string;
  property_id: string | null;
  request_origin: "admin_ui" | "edge_function" | "api" | "cron" | "db_trigger";
  edge_function_name: string | null;
  correlation_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_fields: string[];
  change_summary: string;
  metadata: Record<string, unknown>;
  is_sensitive: boolean;
  redacted_fields: string[];
  immutable_hash: string | null;
  profiles?: { full_name: string | null } | null;
}

interface Filters {
  user_email: string;
  action_types: string[];
  table_names: string[];
  property_id: string;
  request_origins: string[];
  changed_fields_contain: string;
  from_date: Date | undefined;
  to_date: Date | undefined;
  search_text: string;
}

const ACTION_TYPES = ["create", "update", "delete", "permission_change", "sync", "export", "login", "other"];
const TABLE_NAMES = [
  "properties",
  "bookings",
  "profiles",
  "user_roles",
  "journals",
  "pms_credentials",
  "pms_mappings",
  "api_keys",
  "access_requests",
];
const REQUEST_ORIGINS = ["admin_ui", "edge_function", "api", "cron", "db_trigger"];

const initialFilters: Filters = {
  user_email: "",
  action_types: [],
  table_names: [],
  property_id: "",
  request_origins: [],
  changed_fields_contain: "",
  from_date: undefined,
  to_date: undefined,
  search_text: "",
};

export default function AdminAudit() {
  const navigate = useNavigate();
  const { user, isAdmin, isDev, loading: authLoading } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Redirect if not admin or dev
  useEffect(() => {
    if (!authLoading && (!user || (!isAdmin && !isDev))) {
      navigate("/auth");
    }
  }, [authLoading, user, isAdmin, isDev, navigate]);

  // Load properties for filter dropdown
  useEffect(() => {
    const loadProperties = async () => {
      let query = supabase
        .from("properties")
        .select("id, name")
        .order("name");
      if (!showArchived) {
        query = query.eq("is_active", true);
      }
      const { data } = await query;
      setProperties(data || []);
    };
    loadProperties();
  }, [showArchived]);

  const fetchLogs = useCallback(async (cursor?: string, append = false) => {
    if (!append) setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        limit: 50,
      };

      if (cursor) payload.cursor = cursor;
      if (appliedFilters.user_email) payload.user_email = appliedFilters.user_email;
      if (appliedFilters.action_types.length) payload.action_types = appliedFilters.action_types;
      if (appliedFilters.table_names.length) payload.table_names = appliedFilters.table_names;
      if (appliedFilters.property_id) payload.property_id = appliedFilters.property_id;
      if (appliedFilters.request_origins.length) payload.request_origins = appliedFilters.request_origins;
      if (appliedFilters.changed_fields_contain) payload.changed_fields_contain = appliedFilters.changed_fields_contain;
      if (appliedFilters.from_date) payload.from_date = appliedFilters.from_date.toISOString();
      if (appliedFilters.to_date) payload.to_date = appliedFilters.to_date.toISOString();
      if (appliedFilters.search_text) payload.search_text = appliedFilters.search_text;

      const { data, error } = await supabase.functions.invoke("fetch-audit-logs", {
        body: payload,
      });

      if (error) throw error;

      if (data.success) {
        if (append) {
          setLogs((prev) => [...prev, ...data.data.logs]);
        } else {
          setLogs(data.data.logs);
        }
        setTotalCount(data.data.pagination.total_count);
        setNextCursor(data.data.pagination.next_cursor);
        setHasMore(data.data.pagination.has_more);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast.error("Failed to fetch audit logs");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  // Fetch logs on mount and when filters change
  useEffect(() => {
    if (user && (isAdmin || isDev)) {
      fetchLogs();
    }
  }, [user, isAdmin, isDev, fetchLogs]);

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const handleClearFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
  };

  const handleLoadMore = () => {
    if (nextCursor && hasMore) {
      fetchLogs(nextCursor, true);
    }
  };

  const handleExportCSV = async () => {
    try {
      const payload: Record<string, unknown> = {
        limit: 1000,
        format: "csv",
      };

      if (appliedFilters.user_email) payload.user_email = appliedFilters.user_email;
      if (appliedFilters.action_types.length) payload.action_types = appliedFilters.action_types;
      if (appliedFilters.table_names.length) payload.table_names = appliedFilters.table_names;
      if (appliedFilters.property_id) payload.property_id = appliedFilters.property_id;
      if (appliedFilters.request_origins.length) payload.request_origins = appliedFilters.request_origins;
      if (appliedFilters.from_date) payload.from_date = appliedFilters.from_date.toISOString();
      if (appliedFilters.to_date) payload.to_date = appliedFilters.to_date.toISOString();
      if (appliedFilters.search_text) payload.search_text = appliedFilters.search_text;

      const { data, error } = await supabase.functions.invoke("fetch-audit-logs", {
        body: payload,
      });

      if (error) throw error;

      // Create blob and download
      const blob = new Blob([data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Audit logs exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export audit logs");
    }
  };

  const handleViewDetail = (log: AuditLog) => {
    setSelectedLog(log);
    setDetailOpen(true);
  };

  const toggleArrayFilter = (key: "action_types" | "table_names" | "request_origins", value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));
  };

  const activeFilterCount = [
    appliedFilters.user_email,
    appliedFilters.action_types.length > 0,
    appliedFilters.table_names.length > 0,
    appliedFilters.property_id,
    appliedFilters.request_origins.length > 0,
    appliedFilters.changed_fields_contain,
    appliedFilters.from_date,
    appliedFilters.to_date,
    appliedFilters.search_text,
  ].filter(Boolean).length;

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-4 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin && !isDev) {
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <PageHeader
          title="Audit Log"
          subtitle="Track all administrative changes"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchLogs()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalCount.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Showing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{logs.length.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{activeFilterCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sensitive Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{logs.filter((l) => l.is_sensitive).length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters Panel */}
        <Card>
          <CardHeader 
            className="cursor-pointer flex flex-row items-center justify-between py-3"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Advanced Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount} active
                </Badge>
              )}
            </CardTitle>
            {filtersExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </CardHeader>

          {filtersExpanded && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search */}
                <div className="space-y-2">
                  <Label>Search</Label>
                  <Input
                    placeholder="Search summary, correlation ID..."
                    value={filters.search_text}
                    onChange={(e) => setFilters((p) => ({ ...p, search_text: e.target.value }))}
                  />
                </div>

                {/* User Email */}
                <div className="space-y-2">
                  <Label>User Email</Label>
                  <Input
                    placeholder="Filter by email"
                    value={filters.user_email}
                    onChange={(e) => setFilters((p) => ({ ...p, user_email: e.target.value }))}
                  />
                </div>

                {/* Property */}
                <div className="space-y-2">
                  <Label>Property</Label>
                  <Select
                    value={filters.property_id}
                    onValueChange={(v) => setFilters((p) => ({ ...p, property_id: v === "all" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All properties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All properties</SelectItem>
                      {properties.map((prop) => (
                        <SelectItem key={prop.id} value={prop.id}>
                          {prop.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Changed Field Contains */}
                <div className="space-y-2">
                  <Label>Changed Field Contains</Label>
                  <Input
                    placeholder="e.g. status, price"
                    value={filters.changed_fields_contain}
                    onChange={(e) => setFilters((p) => ({ ...p, changed_fields_contain: e.target.value }))}
                  />
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal">
                        {filters.from_date ? format(filters.from_date, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.from_date}
                        onSelect={(date) => setFilters((p) => ({ ...p, from_date: date }))}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>To Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal">
                        {filters.to_date ? format(filters.to_date, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.to_date}
                        onSelect={(date) => setFilters((p) => ({ ...p, to_date: date }))}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Multi-select chips */}
              <div className="space-y-4">
                {/* Action Types */}
                <div className="space-y-2">
                  <Label>Action Types</Label>
                  <div className="flex flex-wrap gap-2">
                    {ACTION_TYPES.map((type) => (
                      <Badge
                        key={type}
                        variant={filters.action_types.includes(type) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleArrayFilter("action_types", type)}
                      >
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Table Names */}
                <div className="space-y-2">
                  <Label>Tables</Label>
                  <div className="flex flex-wrap gap-2">
                    {TABLE_NAMES.map((name) => (
                      <Badge
                        key={name}
                        variant={filters.table_names.includes(name) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleArrayFilter("table_names", name)}
                      >
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Request Origins */}
                <div className="space-y-2">
                  <Label>Request Origin</Label>
                  <div className="flex flex-wrap gap-2">
                    {REQUEST_ORIGINS.map((origin) => (
                      <Badge
                        key={origin}
                        variant={filters.request_origins.includes(origin) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleArrayFilter("request_origins", origin)}
                      >
                        {origin.replace("_", " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Apply/Clear buttons */}
              <div className="flex gap-2 pt-2">
                <Button onClick={handleApplyFilters}>Apply Filters</Button>
                <Button variant="outline" onClick={handleClearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Results Table */}
        <AuditLogTable
          logs={logs}
          onViewDetail={handleViewDetail}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          loading={loading}
        />

        {/* Detail Drawer */}
        <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
          <SheetContent className="w-full sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Audit Log Detail</SheetTitle>
            </SheetHeader>
            {selectedLog && (
              <ScrollArea className="h-[calc(100vh-100px)] mt-4">
                <AuditLogDetail log={selectedLog} />
              </ScrollArea>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}
