import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ApiUsageCardProps {
  propertyId: string;
}

export function ApiUsageCard({ propertyId }: ApiUsageCardProps) {
  const [stats, setStats] = useState({ today: 0, month: 0, errors: 0, limit: 60 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [todayRes, monthRes, errRes, limitRes] = await Promise.all([
        supabase
          .from("api_request_log")
          .select("*", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .gte("created_at", todayStart),
        supabase
          .from("api_request_log")
          .select("*", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .gte("created_at", monthStart),
        supabase
          .from("api_request_log")
          .select("*", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .gte("created_at", monthStart)
          .gte("status_code", 400),
        supabase
          .from("api_rate_limits")
          .select("requests_per_minute")
          .eq("property_id", propertyId)
          .maybeSingle(),
      ]);

      setStats({
        today: todayRes.count ?? 0,
        month: monthRes.count ?? 0,
        errors: errRes.count ?? 0,
        limit: (limitRes.data as { requests_per_minute?: number } | null)?.requests_per_minute ?? 60,
      });
      setLoading(false);
    };
    fetch();
  }, [propertyId]);

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">API Usage</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold">{stats.today.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.month.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">This Month</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-destructive">{stats.errors}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              {stats.errors > 0 && <AlertTriangle className="h-3 w-3" />}
              Errors
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Rate limit tier</span>
          <Badge variant="outline">{stats.limit} req/min</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
