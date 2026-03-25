import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Gauge, TrendingUp } from "lucide-react";

export interface RateLimitsConfig {
  default_requests_per_minute: number;
  default_requests_per_hour: number;
  default_daily_limit: number;
  default_burst_limit: number;
}

export const RATE_LIMITS_DEFAULTS: RateLimitsConfig = {
  default_requests_per_minute: 60,
  default_requests_per_hour: 1000,
  default_daily_limit: 10000,
  default_burst_limit: 20,
};

interface Props {
  config: RateLimitsConfig;
  onChange: (config: RateLimitsConfig) => void;
}

interface UsageRow {
  property_id: string;
  property_name: string;
  today: number;
  this_week: number;
  this_month: number;
}

export function RateLimitsTab({ config, onChange }: Props) {
  const c = { ...RATE_LIMITS_DEFAULTS, ...config };
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Get all logs for this month grouped by property
    const { data: logs } = await supabase
      .from("api_request_log")
      .select("property_id, created_at")
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false })
      .limit(1000);

    // Get property names
    const propertyIds = [...new Set((logs || []).map((l: { property_id: string }) => l.property_id).filter(Boolean))];
    const { data: props } = await supabase
      .from("properties")
      .select("id, name")
      .in("id", propertyIds.length ? propertyIds : ["00000000-0000-0000-0000-000000000000"]);

    const nameMap: Record<string, string> = {};
    (props || []).forEach((p: { id: string; name: string }) => { nameMap[p.id] = p.name; });

    // Aggregate
    const agg: Record<string, { today: number; this_week: number; this_month: number }> = {};
    (logs || []).forEach((l: { property_id: string; created_at: string }) => {
      if (!l.property_id) return;
      if (!agg[l.property_id]) agg[l.property_id] = { today: 0, this_week: 0, this_month: 0 };
      agg[l.property_id].this_month++;
      if (l.created_at >= weekStart) agg[l.property_id].this_week++;
      if (l.created_at >= todayStart) agg[l.property_id].today++;
    });

    setUsage(
      Object.entries(agg)
        .map(([pid, counts]) => ({ property_id: pid, property_name: nameMap[pid] || pid.slice(0, 8), ...counts }))
        .sort((a, b) => b.this_month - a.this_month)
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const update = (field: keyof RateLimitsConfig, value: number) => {
    onChange({ ...c, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* Default Rate Limits */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Default Rate Limits</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Requests / Minute</Label>
              <Input type="number" value={c.default_requests_per_minute} onChange={(e) => update("default_requests_per_minute", Number(e.target.value))} />
            </div>
            <div>
              <Label>Requests / Hour</Label>
              <Input type="number" value={c.default_requests_per_hour} onChange={(e) => update("default_requests_per_hour", Number(e.target.value))} />
            </div>
            <div>
              <Label>Daily Limit</Label>
              <Input type="number" value={c.default_daily_limit} onChange={(e) => update("default_daily_limit", Number(e.target.value))} />
            </div>
            <div>
              <Label>Burst Limit</Label>
              <Input type="number" value={c.default_burst_limit} onChange={(e) => update("default_burst_limit", Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            These defaults apply to properties without custom rate limit overrides.
          </p>
        </CardContent>
      </Card>

      {/* Usage Dashboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">API Usage by Property</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading usage data…</p>
          ) : usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API requests recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Today</TableHead>
                  <TableHead className="text-right">7 Days</TableHead>
                  <TableHead className="text-right">This Month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((row) => (
                  <TableRow key={row.property_id}>
                    <TableCell className="font-medium">{row.property_name}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{row.today.toLocaleString()}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.this_week.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        {row.this_month.toLocaleString()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
