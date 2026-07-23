import { useEffect, useMemo, useState } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { RateStrategiesTable } from "@/components/revenue/RateStrategiesTable";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  format, subDays, addDays, differenceInDays, parseISO, eachDayOfInterval, startOfDay,
} from "date-fns";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb, DollarSign,
  Calendar, Target, ArrowUpRight, ArrowDownRight, Minus, History, BarChart3,
  Plus, Trash2, Settings2, Zap, Sparkles,
} from "lucide-react";
import { PriceLabsPanel } from "./PMSPriceLabs";

// ============================================================================
// Yield Rules Hook
// ============================================================================
interface YieldRule {
  id: string;
  property_id: string;
  name: string;
  rule_type: string;
  condition: Record<string, unknown>;
  adjustment_percent: number;
  priority: number;
  is_active: boolean;
  created_at: string;
}

function useYieldRules(propertyId: string | null) {
  return useQuery({
    queryKey: ["yield-rules", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_yield_rules" as any)
        .select("*")
        .eq("property_id", propertyId!)
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as YieldRule[];
    },
  });
}

function useUpsertYieldRule(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<YieldRule> & { property_id: string }) => {
      const { data, error } = await supabase
        .from("rolos_yield_rules" as any)
        .upsert(rule as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["yield-rules", propertyId] });
      toast.success("Yield rule saved");
    },
    onError: (err: Error) => toast.error("Failed to save rule", { description: err.message }),
  });
}

function useDeleteYieldRule(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rolos_yield_rules" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["yield-rules", propertyId] });
      toast.success("Yield rule deleted");
    },
    onError: (err: Error) => toast.error("Failed to delete rule", { description: err.message }),
  });
}

function useToggleYieldRule(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("rolos_yield_rules" as any)
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["yield-rules", propertyId] }),
  });
}

interface RateSeason {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

function useSeasons(propertyId: string | null) {
  return useQuery({
    queryKey: ["rolos-rate-seasons", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_rate_seasons" as any)
        .select("id, name, start_date, end_date")
        .eq("property_id", propertyId!)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RateSeason[];
    },
  });
}

const fmt = (n: number) => n.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R${(n / 1_000).toFixed(0)}K`;
  return fmtCurrency(n);
};

const THRESHOLDS = { low: 30, medium: 60, high: 80 };
const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--muted-foreground))",
];

interface DayForecast {
  date: string;
  dateLabel: string;
  occupancy: number;
  bookedRooms: number;
  totalRooms: number;
  revenue: number;
  adr: number;
  suggestion: "increase" | "decrease" | "hold";
  suggestedAdjustment: number;
  reason: string;
}

const RULE_TYPES = [
  { value: "occupancy_threshold", label: "Occupancy Threshold", desc: "Adjust rates based on occupancy %" },
  { value: "day_of_week", label: "Day of Week", desc: "Adjust rates for specific days" },
  { value: "lead_time", label: "Lead Time", desc: "Adjust based on booking lead days" },
  { value: "season", label: "Season", desc: "Seasonal rate adjustments" },
];

function YieldRulesTab({ propertyId }: { propertyId: string }) {
  const { data: rules = [], isLoading } = useYieldRules(propertyId);
  const { data: seasons = [] } = useSeasons(propertyId);
  const upsert = useUpsertYieldRule(propertyId);
  const deleteRule = useDeleteYieldRule(propertyId);
  const toggleRule = useToggleYieldRule(propertyId);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", rule_type: "occupancy_threshold", adjustment_percent: 10, priority: 10,
    min_occupancy: 80, max_occupancy: 100, days: [] as string[],
    min_lead_days: 0, max_lead_days: 7,
    season_id: "",
  });

  const handleCreate = () => {
    let condition: Record<string, unknown> = {};
    if (form.rule_type === "occupancy_threshold") {
      condition = { min_occupancy: form.min_occupancy, max_occupancy: form.max_occupancy };
    } else if (form.rule_type === "day_of_week") {
      condition = { days: form.days };
    } else if (form.rule_type === "lead_time") {
      condition = { min_lead_days: form.min_lead_days, max_lead_days: form.max_lead_days };
    } else if (form.rule_type === "season") {
      condition = { season_id: form.season_id };
    }
    upsert.mutate({
      property_id: propertyId,
      name: form.name,
      rule_type: form.rule_type,
      condition,
      adjustment_percent: form.adjustment_percent,
      priority: form.priority,
    } as any, {
      onSuccess: () => {
        setShowCreate(false);
        setForm({ name: "", rule_type: "occupancy_threshold", adjustment_percent: 10, priority: 10, min_occupancy: 80, max_occupancy: 100, days: [], min_lead_days: 0, max_lead_days: 7, season_id: "" });
      },
    });
  };

  const formatCondition = (rule: YieldRule) => {
    const c = rule.condition || {};
    switch (rule.rule_type) {
      case "occupancy_threshold": return `${c.min_occupancy ?? 0}% – ${c.max_occupancy ?? 100}% occupancy`;
      case "day_of_week": return (c.days as string[] || []).join(", ") || "No days set";
      case "lead_time": return `${c.min_lead_days ?? 0} – ${c.max_lead_days ?? 999} days ahead`;
      case "season": {
        const sid = c.season_id as string | undefined;
        if (!sid) return "Season-based (no season linked)";
        const s = seasons.find(x => x.id === sid);
        return s ? `Season: ${s.name} (${s.start_date} – ${s.end_date})` : "Season-based (season not found)";
      }
      default: return JSON.stringify(c);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Yield Rules Engine</h3>
          <p className="text-xs text-muted-foreground">Automated rate adjustments based on demand signals</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Yield Rule</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekend Premium" />
              </div>
              <div className="space-y-2">
                <Label>Rule Type</Label>
                <Select value={form.rule_type} onValueChange={v => setForm(f => ({ ...f, rule_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map(rt => (
                      <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{RULE_TYPES.find(r => r.value === form.rule_type)?.desc}</p>
              </div>

              {form.rule_type === "occupancy_threshold" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min Occupancy %</Label>
                    <Input type="number" value={form.min_occupancy} onChange={e => setForm(f => ({ ...f, min_occupancy: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Occupancy %</Label>
                    <Input type="number" value={form.max_occupancy} onChange={e => setForm(f => ({ ...f, max_occupancy: Number(e.target.value) }))} />
                  </div>
                </div>
              )}

              {form.rule_type === "day_of_week" && (
                <div className="space-y-1">
                  <Label className="text-xs">Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(d => (
                      <Badge
                        key={d}
                        variant={form.days.includes(d.toLowerCase()) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setForm(f => ({
                          ...f,
                          days: f.days.includes(d.toLowerCase())
                            ? f.days.filter(x => x !== d.toLowerCase())
                            : [...f.days, d.toLowerCase()],
                        }))}
                      >{d.slice(0, 3)}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {form.rule_type === "lead_time" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min Lead Days</Label>
                    <Input type="number" value={form.min_lead_days} onChange={e => setForm(f => ({ ...f, min_lead_days: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Lead Days</Label>
                    <Input type="number" value={form.max_lead_days} onChange={e => setForm(f => ({ ...f, max_lead_days: Number(e.target.value) }))} />
                  </div>
                </div>
              )}

              {form.rule_type === "season" && (
                <div className="space-y-1">
                  <Label className="text-xs">Linked Season</Label>
                  {seasons.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No seasons configured for this property yet. Configure seasons in Rate Management first.
                    </p>
                  ) : (
                    <Select value={form.season_id} onValueChange={v => setForm(f => ({ ...f, season_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select a season" /></SelectTrigger>
                      <SelectContent>
                        {seasons.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.start_date} – {s.end_date})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[10px] text-muted-foreground">The adjustment applies to dates within this season.</p>
                </div>
              )}



              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Adjustment %</Label>
                  <Input type="number" value={form.adjustment_percent} onChange={e => setForm(f => ({ ...f, adjustment_percent: Number(e.target.value) }))} />
                  <p className="text-[10px] text-muted-foreground">Positive = increase, Negative = decrease</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Priority (lower = first)</Label>
                  <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button onClick={handleCreate} disabled={!form.name || upsert.isPending || (form.rule_type === "season" && !form.season_id)}>
                {upsert.isPending ? "Saving…" : "Create Rule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No yield rules configured.</p>
            <p className="text-xs text-muted-foreground mt-1">Create rules to automate rate adjustments based on demand signals.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id} className={!rule.is_active ? "opacity-60" : ""}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={v => toggleRule.mutate({ id: rule.id, is_active: v })}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{rule.name}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {RULE_TYPES.find(r => r.value === rule.rule_type)?.label || rule.rule_type}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] shrink-0">P{rule.priority}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatCondition(rule)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-xs ${
                      rule.adjustment_percent > 0 ? "bg-primary/10 text-primary border-primary/20" : "bg-destructive/10 text-destructive border-destructive/20"
                    }`}>
                      {rule.adjustment_percent > 0 ? "+" : ""}{rule.adjustment_percent}%
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRule.mutate(rule.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PMSRevenue() {
  const { propertyId, properties, portfolioProperties, loading: propLoading, switchProperty, showPortfolioToggle } = usePmsPropertyId();
  const [forecastDays] = useState(14);
  const [historyDays, setHistoryDays] = useState(30);

  // View mode: default to portfolio when a portfolio exists, otherwise single
  const [viewMode, setViewMode] = useState<"portfolio" | "single">("single");
  const [autoDefaulted, setAutoDefaulted] = useState(false);
  useEffect(() => {
    if (!autoDefaulted && (portfolioProperties?.length || 0) > 1) {
      setViewMode("portfolio");
      setAutoDefaulted(true);
    }
  }, [portfolioProperties, autoDefaulted]);

  const portfolioPropertyIds = useMemo(
    () => portfolioProperties?.map(p => p.id) || [],
    [portfolioProperties]
  );
  const isPortfolioMode = viewMode === "portfolio" && portfolioPropertyIds.length > 1;
  const activeIds = useMemo<string[]>(
    () => (isPortfolioMode ? portfolioPropertyIds : (propertyId ? [propertyId] : [])),
    [isPortfolioMode, portfolioPropertyIds, propertyId]
  );
  const activeIdsKey = activeIds.join(",");
  const queryEnabled = activeIds.length > 0;

  const today = format(new Date(), "yyyy-MM-dd");
  const futureEnd = format(addDays(new Date(), forecastDays), "yyyy-MM-dd");
  const past30 = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const historyStart = format(subDays(new Date(), historyDays), "yyyy-MM-dd");

  // Fetch rooms (sum across active properties)
  const { data: rooms = [] } = useQuery({
    queryKey: ["rev-rooms", activeIdsKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_rooms" as any)
        .select("id")
        .in("property_id", activeIds);
      return data || [];
    },
    enabled: queryEnabled,
  });

  // Fetch upcoming bookings (next 14 days)
  const { data: futureBookings = [], isLoading: futureLoading } = useQuery({
    queryKey: ["rev-future-bookings", activeIdsKey, today, futureEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, check_in_date, check_out_date, total_price, status, room_type_id, property_id")
        .in("property_id", activeIds)
        .gte("check_out_date", today)
        .lte("check_in_date", futureEnd)
        .neq("status", "cancelled");
      return data || [];
    },
    enabled: queryEnabled,
  });

  // Fetch past 30 days bookings for baseline
  const { data: pastBookings = [] } = useQuery({
    queryKey: ["rev-past-bookings", activeIdsKey, past30, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, check_in_date, check_out_date, total_price, status")
        .in("property_id", activeIds)
        .gte("check_in_date", past30)
        .lte("check_in_date", today)
        .neq("status", "cancelled");
      return data || [];
    },
    enabled: queryEnabled,
  });

  // === Historical revenue & channel data ===
  const { data: historyBookings = [], isLoading: historyLoading } = useQuery({
    queryKey: ["rev-history", activeIdsKey, historyStart, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, check_in_date, total_price, calculated_commission, booking_channel, payment_status, status")
        .in("property_id", activeIds)
        .gte("check_in_date", historyStart)
        .lte("check_in_date", today)
        .not("status", "in", '("cancelled","failed")');
      return data || [];
    },
    enabled: queryEnabled,
  });

  // Fetch rate plans
  const { data: ratePlans = [] } = useQuery({
    queryKey: ["rev-rate-plans", activeIdsKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_rate_plans" as any)
        .select("id, name, base_rate, pricing_model, property_id")
        .in("property_id", activeIds)
        .eq("is_active", true);
      return data || [];
    },
    enabled: queryEnabled,
  });

  const totalRooms = Math.max(1, rooms.length);

  // Past 30d baseline ADR
  const baselineAdr = useMemo(() => {
    if (pastBookings.length === 0) return 0;
    const totalRev = pastBookings.reduce((s: number, b: any) => s + Number(b.total_price || 0), 0);
    return totalRev / pastBookings.length;
  }, [pastBookings]);

  // === Historical metrics (include all non-cancelled/failed bookings, not just paid) ===
  const historyMetrics = useMemo(() => {
    const active = historyBookings; // already filtered to exclude cancelled/failed
    const gbv = active.reduce((s: number, b: any) => s + Number(b.total_price || 0), 0);
    const commission = active.reduce((s: number, b: any) => s + Number(b.calculated_commission || 0), 0);
    const avgAdr = active.length > 0 ? gbv / active.length : 0;

    // Channel breakdown
    const channels: Record<string, { count: number; revenue: number }> = {};
    active.forEach((b: any) => {
      const ch = b.booking_channel || "Direct";
      if (!channels[ch]) channels[ch] = { count: 0, revenue: 0 };
      channels[ch].count += 1;
      channels[ch].revenue += Number(b.total_price || 0);
    });
    const channelBreakdown = Object.entries(channels)
      .map(([channel, d]) => ({ channel, ...d }))
      .sort((a, b) => b.revenue - a.revenue);

    // Monthly timeline
    const monthly: Record<string, { date: string; revenue: number; bookings: number }> = {};
    active.forEach((b: any) => {
      const mo = (b.check_in_date as string)?.slice(0, 7) || "unknown";
      if (!monthly[mo]) monthly[mo] = { date: mo, revenue: 0, bookings: 0 };
      monthly[mo].revenue += Number(b.total_price || 0);
      monthly[mo].bookings += 1;
    });
    const timeline = Object.values(monthly).sort((a, b) => a.date.localeCompare(b.date));

    return { gbv, commission, avgAdr, totalBookings: active.length, channelBreakdown, timeline };
  }, [historyBookings]);

  // Generate daily forecast
  const forecast = useMemo<DayForecast[]>(() => {
    const days = eachDayOfInterval({
      start: startOfDay(new Date()),
      end: addDays(new Date(), forecastDays - 1),
    });

    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const overlapping = futureBookings.filter((b: any) =>
        b.check_in_date <= dayStr && b.check_out_date > dayStr
      );
      const bookedRooms = Math.min(overlapping.length, totalRooms);
      const occupancy = (bookedRooms / totalRooms) * 100;
      const dayRevenue = overlapping.reduce((s: number, b: any) => {
        const nights = Math.max(1, differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date)));
        return s + Number(b.total_price || 0) / nights;
      }, 0);
      const adr = bookedRooms > 0 ? dayRevenue / bookedRooms : 0;

      let suggestion: "increase" | "decrease" | "hold" = "hold";
      let suggestedAdjustment = 0;
      let reason = "Rates are well-positioned for current demand.";

      if (occupancy >= THRESHOLDS.high) {
        suggestion = "increase";
        suggestedAdjustment = occupancy >= 90 ? 15 : 10;
        reason = `High demand (${occupancy.toFixed(0)}% occupancy). Consider raising rates to maximize RevPAR.`;
      } else if (occupancy <= THRESHOLDS.low) {
        suggestion = "decrease";
        suggestedAdjustment = occupancy <= 15 ? -20 : -10;
        reason = `Low demand (${occupancy.toFixed(0)}% occupancy). Consider promotional rates to stimulate bookings.`;
      } else if (occupancy < THRESHOLDS.medium) {
        suggestion = "decrease";
        suggestedAdjustment = -5;
        reason = `Below-average demand. A small rate reduction could improve pickup.`;
      }

      return {
        date: dayStr,
        dateLabel: format(day, "EEE dd MMM"),
        occupancy, bookedRooms, totalRooms, revenue: dayRevenue, adr,
        suggestion, suggestedAdjustment, reason,
      };
    });
  }, [futureBookings, totalRooms, forecastDays]);

  // Summary metrics
  const metrics = useMemo(() => {
    const avgOcc = forecast.reduce((s, f) => s + f.occupancy, 0) / forecast.length;
    const totalForecastRev = forecast.reduce((s, f) => s + f.revenue, 0);
    const potentialRevGain = forecast.reduce((s, f) => {
      if (f.suggestion === "increase") return s + (f.revenue * f.suggestedAdjustment / 100);
      return s;
    }, 0);
    const lowDemandDays = forecast.filter(f => f.occupancy < THRESHOLDS.low).length;
    const highDemandDays = forecast.filter(f => f.occupancy >= THRESHOLDS.high).length;
    return { avgOcc, totalForecastRev, potentialRevGain, lowDemandDays, highDemandDays };
  }, [forecast]);

  const chartData = forecast.map(f => ({
    date: format(parseISO(f.date), "dd MMM"),
    occupancy: Math.round(f.occupancy),
    adr: Math.round(f.adr),
    revenue: Math.round(f.revenue),
  }));

  const loading = propLoading || futureLoading;

  if (propLoading) return <p className="text-muted-foreground">Loading property…</p>;
  if (!queryEnabled) return <p className="text-muted-foreground">Select a property first.</p>;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revenue Management</h1>
            <p className="text-sm text-muted-foreground">
              {isPortfolioMode
                ? `Portfolio view — ${portfolioPropertyIds.length} properties aggregated`
                : "Demand forecast, rate optimization & historical performance"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showPortfolioToggle && (
              <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
                <Button
                  size="sm"
                  variant={viewMode === "portfolio" ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setViewMode("portfolio")}
                >
                  Portfolio
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "single" ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setViewMode("single")}
                >
                  Single
                </Button>
              </div>
            )}
            {viewMode === "single" && properties.length > 1 && (
              <Select value={propertyId || ""} onValueChange={(v) => switchProperty(v)}>
                <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>
                  {(portfolioProperties || properties).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>


        {/* KPI Cards - Combined forward + historical */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Target className="h-3 w-3" />Forecast Occupancy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <p className="text-2xl font-bold">{metrics.avgOcc.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Next {forecastDays}d avg</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Forecast Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <p className="text-2xl font-bold">R{fmt(metrics.totalForecastRev)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Opportunity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold text-primary">+R{fmt(metrics.potentialRevGain)}</p>
                  <p className="text-xs text-muted-foreground">If rates optimized</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <History className="h-3 w-3" />Past {historyDays}d GBV
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <p className="text-2xl font-bold">{fmtCompact(historyMetrics.gbv)}</p>
                  <p className="text-xs text-muted-foreground">{historyMetrics.totalBookings} bookings</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />Demand Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="flex items-center gap-2">
                  {metrics.highDemandDays > 0 && (
                    <Badge className="text-xs bg-primary/10 text-primary border-primary/20">{metrics.highDemandDays}d high</Badge>
                  )}
                  {metrics.lowDemandDays > 0 && (
                    <Badge variant="destructive" className="text-xs">{metrics.lowDemandDays}d low</Badge>
                  )}
                  {metrics.highDemandDays === 0 && metrics.lowDemandDays === 0 && (
                    <p className="text-sm font-medium text-muted-foreground">Balanced</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="forecast" className="space-y-4">
          <TabsList>
            <TabsTrigger value="forecast"><Calendar className="w-4 h-4 mr-1" />Demand Forecast</TabsTrigger>
            <TabsTrigger value="performance"><History className="w-4 h-4 mr-1" />Performance</TabsTrigger>
            <TabsTrigger value="suggestions"><Lightbulb className="w-4 h-4 mr-1" />Rate Suggestions</TabsTrigger>
            <TabsTrigger value="pricelabs"><Sparkles className="w-4 h-4 mr-1" />PriceLabs</TabsTrigger>
            <TabsTrigger value="plans"><DollarSign className="w-4 h-4 mr-1" />Active Plans</TabsTrigger>
            <TabsTrigger value="yield"><Zap className="w-4 h-4 mr-1" />Yield Rules</TabsTrigger>
            <TabsTrigger value="strategies"><Settings2 className="w-4 h-4 mr-1" />Rate Strategies</TabsTrigger>
          </TabsList>

          {/* === FORECAST TAB (existing) === */}
          <TabsContent value="forecast" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Occupancy & Revenue Forecast</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {loading ? <Skeleton className="h-full w-full" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="occupancy" name="Occupancy %" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" strokeWidth={2} />
                      <Area yAxisId="right" type="monotone" dataKey="revenue" name="Daily Revenue (R)" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2)/0.1)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Daily Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[520px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Rooms</th>
                        <th className="py-2 px-3">Occupancy</th>
                        <th className="py-2 px-3">Revenue</th>
                        <th className="py-2 px-3">ADR</th>
                        <th className="py-2 px-3">Signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.map(f => (
                        <tr key={f.date} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 px-3 font-medium">{f.dateLabel}</td>
                          <td className="py-2 px-3">{f.bookedRooms}/{f.totalRooms}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    f.occupancy >= THRESHOLDS.high ? "bg-primary" :
                                    f.occupancy >= THRESHOLDS.medium ? "bg-chart-2" :
                                    "bg-destructive"
                                  }`}
                                  style={{ width: `${Math.min(f.occupancy, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs">{f.occupancy.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-2 px-3">R{fmt(f.revenue)}</td>
                          <td className="py-2 px-3">R{fmt(f.adr)}</td>
                          <td className="py-2 px-3">
                            {f.suggestion === "increase" && (
                              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                <ArrowUpRight className="h-3 w-3 mr-0.5" />+{f.suggestedAdjustment}%
                              </Badge>
                            )}
                            {f.suggestion === "decrease" && (
                              <Badge variant="destructive" className="text-[10px]">
                                <ArrowDownRight className="h-3 w-3 mr-0.5" />{f.suggestedAdjustment}%
                              </Badge>
                            )}
                            {f.suggestion === "hold" && (
                              <Badge variant="outline" className="text-[10px]">
                                <Minus className="h-3 w-3 mr-0.5" />Hold
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* === NEW: PERFORMANCE TAB === */}
          <TabsContent value="performance" className="space-y-4">
            {/* Period selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Period:</span>
              {[30, 60, 90].map(d => (
                <Button
                  key={d}
                  variant={historyDays === d ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setHistoryDays(d)}
                >
                  {d}D
                </Button>
              ))}
            </div>

            {/* Revenue History KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Gross Booking Value</p>
                  {historyLoading ? <Skeleton className="h-7 w-20" /> : (
                    <p className="text-xl font-bold tabular-nums">{fmtCompact(historyMetrics.gbv)}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Commission Earned</p>
                  {historyLoading ? <Skeleton className="h-7 w-20" /> : (
                    <p className="text-xl font-bold tabular-nums text-primary">{fmtCompact(historyMetrics.commission)}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Average ADR</p>
                  {historyLoading ? <Skeleton className="h-7 w-20" /> : (
                    <p className="text-xl font-bold tabular-nums">R{fmt(historyMetrics.avgAdr)}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Paid Bookings</p>
                  {historyLoading ? <Skeleton className="h-7 w-12" /> : (
                    <p className="text-xl font-bold tabular-nums">{historyMetrics.totalBookings}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Revenue Timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Revenue Timeline</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {historyLoading ? <Skeleton className="h-full w-full" /> : historyMetrics.timeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={historyMetrics.timeline}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => { const [, m] = v.split("-"); return m; }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCompact(v)} />
                        <Tooltip formatter={(v: number) => [fmtCurrency(v), "Revenue"]} />
                        <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
                  )}
                </CardContent>
              </Card>

              {/* Channel Breakdown */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Channel Mix</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {historyLoading ? <Skeleton className="h-full w-full" /> : historyMetrics.channelBreakdown.length > 0 ? (
                    <div className="flex items-center h-full gap-4">
                      <div className="w-1/2 h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={historyMetrics.channelBreakdown}
                              dataKey="revenue"
                              nameKey="channel"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              innerRadius={40}
                              paddingAngle={2}
                              strokeWidth={0}
                            >
                              {historyMetrics.channelBreakdown.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-1/2 space-y-2">
                        {historyMetrics.channelBreakdown.slice(0, 6).map((ch, i) => (
                          <div key={ch.channel} className="flex items-center gap-2 text-xs">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="truncate flex-1">{ch.channel}</span>
                            <span className="font-medium tabular-nums">{fmtCompact(ch.revenue)}</span>
                            <span className="text-muted-foreground">({ch.count})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No channel data</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* === SUGGESTIONS TAB (existing) === */}
          <TabsContent value="suggestions" className="space-y-4">
            <div className="grid gap-4">
              {forecast.filter(f => f.suggestion !== "hold").length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">All rates are well-positioned. No adjustments needed.</p>
                  </CardContent>
                </Card>
              ) : (
                forecast.filter(f => f.suggestion !== "hold").map(f => (
                  <Card key={f.date} className={f.suggestion === "increase" ? "border-primary/30" : "border-destructive/30"}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{f.dateLabel}</CardTitle>
                        {f.suggestion === "increase" ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            <ArrowUpRight className="h-3 w-3 mr-1" />Increase +{f.suggestedAdjustment}%
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <ArrowDownRight className="h-3 w-3 mr-1" />Reduce {f.suggestedAdjustment}%
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">{f.reason}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-6 text-xs text-muted-foreground">
                        <span>Occupancy: {f.occupancy.toFixed(0)}%</span>
                        <span>Rooms: {f.bookedRooms}/{f.totalRooms}</span>
                        <span>Current ADR: R{fmt(f.adr)}</span>
                        {baselineAdr > 0 && (
                          <span>Suggested ADR: R{fmt(f.adr > 0 ? f.adr * (1 + f.suggestedAdjustment / 100) : baselineAdr * (1 + f.suggestedAdjustment / 100))}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* === ACTIVE PLANS TAB (existing) === */}
          <TabsContent value="plans" className="space-y-4">
            {(ratePlans as unknown as Array<{ id: string }>).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No active rate plans configured.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {(ratePlans as unknown as Array<{ id: string; name: string; base_rate: number | null; pricing_model: string }>).map((plan) => (
                  <Card key={plan.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{plan.name}</CardTitle>
                        <Badge variant="outline" className="text-[10px]">{plan.pricing_model}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Base Rate</p>
                          <p className="text-lg font-bold">R{fmt(Number(plan.base_rate || 0))}</p>
                        </div>
                        {baselineAdr > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">vs 30d ADR</p>
                            <p className={`text-sm font-medium ${
                              Number(plan.base_rate || 0) > baselineAdr ? "text-primary" : "text-destructive"
                            }`}>
                              {Number(plan.base_rate || 0) > baselineAdr ? "+" : ""}
                              {(((Number(plan.base_rate || 0) - baselineAdr) / Math.max(1, baselineAdr)) * 100).toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* === YIELD RULES TAB === */}
          <TabsContent value="yield" className="space-y-4">
            {isPortfolioMode ? (
              <Card>
                <CardContent className="py-10 text-center space-y-3">
                  <Zap className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Yield rules are configured per property.</p>
                  <Button size="sm" variant="outline" onClick={() => setViewMode("single")}>
                    Switch to single-property view
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <YieldRulesTab propertyId={propertyId!} />
            )}
          </TabsContent>

          {/* === RATE STRATEGIES TAB === */}
          <TabsContent value="strategies" className="space-y-4">
            {isPortfolioMode ? (
              <Card>
                <CardContent className="py-10 text-center space-y-3">
                  <Settings2 className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Rate strategies are configured per property.</p>
                  <Button size="sm" variant="outline" onClick={() => setViewMode("single")}>
                    Switch to single-property view
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <RateStrategiesTable propertyId={propertyId!} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
