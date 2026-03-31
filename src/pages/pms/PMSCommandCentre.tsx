import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { usePmsStaffRole } from "@/hooks/usePmsStaffRole";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BedDouble,
  CalendarDays,
  TrendingUp,
  Users,
  Sparkles,
  ChevronDown,
  Copy,
  ExternalLink,
  RefreshCw,
  Lightbulb,
} from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isToday } from "date-fns";
import { toast } from "sonner";

interface AvailabilityRow {
  property_id: string;
  property_name: string;
  room_type_name: string;
  date: string;
  available_units: number;
  total_units: number;
}

interface OccupancySummary {
  property_id: string;
  property_name: string;
  occupancy_pct: number;
  arrivals: number;
  departures: number;
  available_rooms: number;
  total_rooms: number;
}

interface AISuggestion {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export default function PMSCommandCentre() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const propertyId = searchParams.get("property");
  const { properties } = usePmsPropertyId();
  const { staffRole } = usePmsStaffRole(propertyId);
  const { user, isDev, isAdmin, isFearlessLeader } = useAuth();

  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancySummary[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const isPlatformUser = isDev || isAdmin || isFearlessLeader;

  // Get the list of properties this agent can see
  const agentProperties = useMemo(() => {
    if (isPlatformUser || !staffRole) return properties;
    // Staff agents see only properties they're linked to
    return properties;
  }, [properties, isPlatformUser, staffRole]);

  // Week date range
  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  useEffect(() => {
    loadData();
  }, [agentProperties, weekOffset]);

  const loadData = async () => {
    if (agentProperties.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const propertyIds = agentProperties.map((p) => p.id);
    const startDate = format(weekStart, "yyyy-MM-dd");
    const endDate = format(weekEnd, "yyyy-MM-dd");

    try {
      // Fetch availability from cache
      const { data: cacheData } = await supabase
        .from("pms_availability_cache")
        .select("property_id, room_type_name, date, available_units, total_units")
        .in("property_id", propertyIds)
        .gte("date", startDate)
        .lte("date", endDate);

      // Map property names
      const propMap = Object.fromEntries(agentProperties.map((p) => [p.id, p.name]));
      const rows: AvailabilityRow[] = (cacheData || []).map((r) => ({
        ...r,
        property_name: propMap[r.property_id] || "Unknown",
      }));
      setAvailability(rows);

      // Calculate occupancy summaries for today
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const todayRows = rows.filter((r) => r.date === todayStr);

      const summaries: OccupancySummary[] = agentProperties.map((p) => {
        const propRows = todayRows.filter((r) => r.property_id === p.id);
        const totalRooms = propRows.reduce((sum, r) => sum + (r.total_units || 0), 0);
        const availableRooms = propRows.reduce((sum, r) => sum + (r.available_units || 0), 0);
        const occupied = totalRooms - availableRooms;
        return {
          property_id: p.id,
          property_name: p.name,
          occupancy_pct: totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0,
          arrivals: 0, // Would need bookings query for this
          departures: 0,
          available_rooms: availableRooms,
          total_rooms: totalRooms,
        };
      });

      // Fetch today's arrivals/departures from bookings
      const { data: bookingsToday } = await supabase
        .from("bookings")
        .select("property_id, check_in_date, check_out_date")
        .in("property_id", propertyIds)
        .or(`check_in_date.eq.${todayStr},check_out_date.eq.${todayStr}`)
        .in("status", ["confirmed", "checked_in"]);

      if (bookingsToday) {
        for (const b of bookingsToday) {
          const summary = summaries.find((s) => s.property_id === b.property_id);
          if (!summary) continue;
          if (b.check_in_date === todayStr) summary.arrivals++;
          if (b.check_out_date === todayStr) summary.departures++;
        }
      }

      setOccupancy(summaries);
    } catch (err) {
      console.error("Command Centre load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadAiSuggestions = async () => {
    if (agentProperties.length === 0) return;
    setAiLoading(true);

    try {
      const propertyIds = agentProperties.map((p) => p.id);
      const { data, error } = await supabase.functions.invoke("experience-engine", {
        body: {
          property_id: propertyIds[0],
          experience_type: "agent_command",
          payload: {
            properties: propertyIds,
            date_range: {
              start: format(weekStart, "yyyy-MM-dd"),
              end: format(weekEnd, "yyyy-MM-dd"),
            },
            occupancy_summary: occupancy,
          },
        },
      });

      if (error) throw error;

      const result = data?.data?.suggestions || data?.suggestions || [];
      setSuggestions(
        Array.isArray(result)
          ? result.map((s: any) => ({
              title: s.title || "Suggestion",
              description: s.description || s.text || "",
              priority: s.priority || "medium",
            }))
          : []
      );
    } catch (err) {
      console.error("AI suggestions error:", err);
      toast.error("Could not load AI suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  const copyAvailabilityLink = () => {
    const url = `${window.location.origin}/pms/command-centre${propertyId ? `?property=${propertyId}` : ""}`;
    navigator.clipboard.writeText(url);
    toast.success("Availability link copied");
  };

  const goToPropertyBooking = (propId: string) => {
    const prop = agentProperties.find((p) => p.id === propId);
    if (prop) {
      navigate(`/property/${(prop as any).slug || propId}`);
    }
  };

  // Group availability by property → room type
  const groupedAvailability = useMemo(() => {
    const grouped: Record<string, Record<string, Record<string, number>>> = {};
    for (const row of availability) {
      if (!grouped[row.property_name]) grouped[row.property_name] = {};
      if (!grouped[row.property_name][row.room_type_name])
        grouped[row.property_name][row.room_type_name] = {};
      grouped[row.property_name][row.room_type_name][row.date] = row.available_units;
    }
    return grouped;
  }, [availability]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "medium":
        return "bg-status-warning/10 text-status-warning border-status-warning/20";
      default:
        return "bg-primary/10 text-primary border-primary/20";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
        <Skeleton className="h-[300px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Command Centre</h1>
          <p className="text-sm text-muted-foreground">
            Multi-property availability overview
            {agentProperties.length > 0 && ` · ${agentProperties.length} properties`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyAvailabilityLink}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Link
          </Button>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Occupancy Summary Cards */}
      {occupancy.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {occupancy.map((summary) => (
            <Card key={summary.property_id} className="relative overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium truncate">{summary.property_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-foreground">{summary.occupancy_pct}%</span>
                  <span className="text-xs text-muted-foreground pb-1">occupancy today</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded p-1.5">
                    <p className="text-lg font-semibold text-primary">{summary.arrivals}</p>
                    <p className="text-[10px] text-muted-foreground">Arrivals</p>
                  </div>
                  <div className="bg-muted/50 rounded p-1.5">
                    <p className="text-lg font-semibold text-status-warning">{summary.departures}</p>
                    <p className="text-[10px] text-muted-foreground">Departures</p>
                  </div>
                  <div className="bg-muted/50 rounded p-1.5">
                    <p className="text-lg font-semibold text-status-healthy">{summary.available_rooms}</p>
                    <p className="text-[10px] text-muted-foreground">Available</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => goToPropertyBooking(summary.property_id)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View Property
                </Button>
              </CardContent>
              {/* Occupancy bar */}
              <div
                className="absolute bottom-0 left-0 h-1 bg-primary/60 transition-all"
                style={{ width: `${summary.occupancy_pct}%` }}
              />
            </Card>
          ))}
        </div>
      )}

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>
            ← Prev
          </Button>
          <Button
            variant={weekOffset === 0 ? "default" : "outline"}
            size="sm"
            onClick={() => setWeekOffset(0)}
          >
            This Week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
            Next →
          </Button>
        </div>
        <span className="text-sm text-muted-foreground">
          {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
        </span>
      </div>

      {/* Availability Grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Availability Grid
          </CardTitle>
          <CardDescription className="text-xs">Available units per room type per day</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedAvailability).length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              No availability data found for this period. Ensure properties have cached availability.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground min-w-[180px]">
                      Property / Room Type
                    </th>
                    {weekDays.map((day) => (
                      <th
                        key={day.toISOString()}
                        className={`text-center py-2 px-1.5 font-medium min-w-[60px] ${
                          isToday(day) ? "text-primary bg-primary/5 rounded" : "text-muted-foreground"
                        }`}
                      >
                        <div>{format(day, "EEE")}</div>
                        <div className="text-[10px]">{format(day, "d")}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedAvailability).map(([propertyName, roomTypes]) => (
                    <>
                      <tr key={propertyName} className="bg-muted/30">
                        <td colSpan={8} className="py-1.5 px-2 font-semibold text-foreground">
                          {propertyName}
                        </td>
                      </tr>
                      {Object.entries(roomTypes).map(([roomType, dates]) => (
                        <tr key={`${propertyName}-${roomType}`} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="py-1.5 px-2 pl-6 text-foreground/80">{roomType}</td>
                          {weekDays.map((day) => {
                            const dateStr = format(day, "yyyy-MM-dd");
                            const units = dates[dateStr];
                            const hasData = units !== undefined;
                            return (
                              <td
                                key={dateStr}
                                className={`text-center py-1.5 px-1.5 ${
                                  isToday(day) ? "bg-primary/5" : ""
                                }`}
                              >
                                {hasData ? (
                                  <span
                                    className={`inline-flex items-center justify-center w-7 h-6 rounded text-xs font-medium ${
                                      units === 0
                                        ? "bg-destructive/10 text-destructive"
                                        : units <= 2
                                        ? "bg-status-warning/10 text-status-warning"
                                        : "bg-status-healthy/10 text-status-healthy"
                                    }`}
                                  >
                                    {units}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Suggestions (collapsible) */}
      <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-status-warning" />
                  AI Suggestions
                  {suggestions.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {suggestions.length}
                    </Badge>
                  )}
                </CardTitle>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    aiOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
              <CardDescription className="text-xs">
                AI-powered recommendations based on availability data
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {suggestions.length === 0 && !aiLoading ? (
                <div className="text-center py-6">
                  <Button variant="outline" size="sm" onClick={loadAiSuggestions} disabled={aiLoading}>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Generate Suggestions
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Analyzes occupancy trends to recommend actions
                  </p>
                </div>
              ) : aiLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
              ) : (
                <div className="space-y-2">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border ${getPriorityColor(s.priority)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{s.title}</p>
                          <p className="text-xs mt-0.5 opacity-80">{s.description}</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] shrink-0">
                          {s.priority}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs mt-2"
                    onClick={loadAiSuggestions}
                    disabled={aiLoading}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerate
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
