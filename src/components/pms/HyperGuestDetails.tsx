import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Activity, 
  ArrowRight, 
  CheckCircle2, 
  CircleDot, 
  HeartPulse, 
  RefreshCw, 
  XCircle 
} from "lucide-react";

const CAPABILITIES = [
  { key: "live_availability", label: "Live Availability" },
  { key: "prebook", label: "Prebook" },
  { key: "create_reservation", label: "Create Reservation" },
  { key: "modify_reservation", label: "Modify Reservation" },
  { key: "cancel_reservation", label: "Cancel Reservation" },
  { key: "fetch_static_data", label: "Static Data Sync" },
  { key: "rate_plans", label: "Rate Plans" },
  { key: "room_types", label: "Room Types" },
  { key: "restrictions", label: "Restrictions" },
  { key: "photos", label: "Photos" },
  { key: "policies", label: "Policies" },
  { key: "health_check", label: "Health Check" },
];

interface HyperGuestDetailsProps {
  propertyId?: string;
}

export function HyperGuestDetails({ propertyId }: HyperGuestDetailsProps) {
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [roomCacheCount, setRoomCacheCount] = useState(0);
  const [rateCacheCount, setRateCacheCount] = useState(0);
  const [lastHealthCheck, setLastHealthCheck] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    loadMetrics();
  }, [propertyId]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      // Count cached room types for hyperguest-connected properties
      const { count: rooms } = await supabase
        .from("pms_room_types_cache" as any)
        .select("*", { count: "exact", head: true })
        .eq("pms_system", "hyperguest");

      const { count: rates } = await supabase
        .from("pms_rate_types_cache" as any)
        .select("*", { count: "exact", head: true })
        .eq("pms_system", "hyperguest");

      setRoomCacheCount(rooms ?? 0);
      setRateCacheCount(rates ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("hyperguest-api", {
        body: { action: "health_check" },
      });
      if (error) throw error;
      setHealthOk(data?.status === "ok" || data?.success === true);
      setLastHealthCheck(new Date().toISOString());
      toast.success("Health check complete");
    } catch (e: any) {
      setHealthOk(false);
      setLastHealthCheck(new Date().toISOString());
      toast.error("Health check failed: " + (e.message || "Unknown error"));
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <Card className="border-indigo-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-500" />
          HyperGuest Adapter Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Distribution flow */}
        <div className="flex items-center gap-2 text-xs rounded-md bg-muted/50 p-2">
          <Badge variant="outline" className="text-xs">ROL'OS</Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge className="text-xs bg-indigo-500/10 text-indigo-600 border-indigo-500/20">HyperGuest</Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="outline" className="text-xs">Booking.com</Badge>
          <span className="text-muted-foreground ml-1">+ OTAs</span>
        </div>

        {/* Cache metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-md bg-muted/30">
            <div className="text-lg font-bold">{roomCacheCount}</div>
            <div className="text-[10px] text-muted-foreground">Room Types Cached</div>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/30">
            <div className="text-lg font-bold">{rateCacheCount}</div>
            <div className="text-[10px] text-muted-foreground">Rate Types Cached</div>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/30">
            <div className="flex items-center justify-center gap-1">
              {healthOk === null ? (
                <CircleDot className="h-4 w-4 text-muted-foreground" />
              ) : healthOk ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {lastHealthCheck ? "Checked" : "Not checked"}
            </div>
          </div>
        </div>

        {/* Capability matrix */}
        <div>
          <p className="text-xs font-medium mb-2 text-muted-foreground">Adapter Capabilities</p>
          <div className="grid grid-cols-3 gap-1">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.key}
                className="flex items-center gap-1 text-[10px] py-0.5"
              >
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                <span className="truncate">{cap.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={runHealthCheck}
            disabled={checking}
          >
            <HeartPulse className={`h-3 w-3 mr-1 ${checking ? "animate-pulse" : ""}`} />
            Health Check
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={loadMetrics}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
