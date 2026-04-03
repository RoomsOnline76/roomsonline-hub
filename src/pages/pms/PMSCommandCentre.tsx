import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarDays, Sparkles, ChevronDown, Copy, ExternalLink, RefreshCw, Lightbulb, Loader2,
} from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isToday } from "date-fns";
import { toast } from "sonner";

interface AvailabilityRow {
  property_id: string;
  property_name: string;
  room_type_name: string;
  date: string;
  available_units: number;
}

interface OccupancySummary {
  property_id: string;
  property_name: string;
  property_type: string;
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

interface PortfolioGroup {
  portfolio_id: string;
  portfolio_name: string;
  property_ids: string[];
}

/** Slugify a room type name to match cache keys */
function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** Convert slug like "one-bedroom-suite" to "One Bedroom Suite" */
function slugToTitle(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function PMSCommandCentre() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const propertyId = searchParams.get("property");
  const { properties } = usePmsPropertyId();
  const { staffRole } = usePmsStaffRole(propertyId);
  const { isDev, isAdmin, isFearlessLeader } = useAuth();

  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancySummary[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveFetching, setLiveFetching] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState<string>("all");
  const [portfolioGroups, setPortfolioGroups] = useState<PortfolioGroup[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<Record<string, string>>({});

  const isPlatformUser = isDev || isAdmin || isFearlessLeader;

  const agentProperties = useMemo(() => {
    if (isPlatformUser || !staffRole) return properties;
    return properties;
  }, [properties, isPlatformUser, staffRole]);

  // Filtered properties based on dropdown selection
  const filteredProperties = useMemo(() => {
    if (selectedPropertyFilter === "all") return agentProperties;
    return agentProperties.filter((p) => p.id === selectedPropertyFilter);
  }, [agentProperties, selectedPropertyFilter]);

  // Stable key for effect dependencies
  const filteredPropertyIds = useMemo(
    () => filteredProperties.map((p) => p.id).sort().join(","),
    [filteredProperties]
  );

  // Sync URL param to filter on mount
  useEffect(() => {
    if (propertyId && agentProperties.some((p) => p.id === propertyId)) {
      setSelectedPropertyFilter(propertyId);
    }
  }, [propertyId, agentProperties]);

  // Week date range
  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch portfolio groups once
  useEffect(() => {
    if (agentProperties.length === 0) return;
    const fetchPortfolios = async () => {
      const propIds = agentProperties.map((p) => p.id);
      const { data: members } = await supabase
        .from("property_portfolio_members")
        .select("portfolio_id, property_id")
        .in("property_id", propIds);

      if (!members || members.length === 0) {
        setPortfolioGroups([]);
        return;
      }

      const portfolioIds = [...new Set(members.map((m) => m.portfolio_id))];
      const { data: portfolios } = await supabase
        .from("property_portfolios")
        .select("id, name")
        .in("id", portfolioIds);

      const groups: PortfolioGroup[] = (portfolios || []).map((p) => ({
        portfolio_id: p.id,
        portfolio_name: p.name,
        property_ids: members.filter((m) => m.portfolio_id === p.id).map((m) => m.property_id),
      }));
      setPortfolioGroups(groups);
    };
    fetchPortfolios();
  }, [agentProperties]);

  // Fetch property types once
  useEffect(() => {
    if (agentProperties.length === 0) return;
    const fetchTypes = async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, property_type")
        .in("id", agentProperties.map((p) => p.id));
      const map: Record<string, string> = {};
      for (const p of data || []) {
        map[p.id] = p.property_type || "other";
      }
      setPropertyTypes(map);
    };
    fetchTypes();
  }, [agentProperties]);

  // Main data loader
  useEffect(() => {
    if (filteredPropertyIds) loadData();
  }, [filteredPropertyIds, weekOffset]);

  const loadData = useCallback(async () => {
    const propIds = filteredPropertyIds.split(",").filter(Boolean);
    if (propIds.length === 0) {
      setLoading(false);
      setAvailability([]);
      setOccupancy([]);
      return;
    }

    setLoading(true);
    const startDate = format(weekStart, "yyyy-MM-dd");
    const endDate = format(weekEnd, "yyyy-MM-dd");

    try {
      // Parallel fetch: cache data + room types + property info
      const [cacheResult, rolosResult, hostfullyResult, propsResult] = await Promise.all([
        supabase
          .from("pms_availability_cache")
          .select("property_id, external_room_type_id, date, available_units")
          .in("property_id", propIds)
          .gte("date", startDate)
          .lte("date", endDate),
        supabase
          .from("rolos_room_types")
          .select("id, name, property_id, is_active")
          .in("property_id", propIds),
        supabase
          .from("hostfully_room_types")
          .select("id, name, property_id, is_active")
          .in("property_id", propIds),
        supabase
          .from("properties")
          .select("id, amenities, external_system")
          .in("id", propIds),
      ]);

      const cacheData = cacheResult.data || [];

      // ============================================================
      // BUILD NAME MAP + INACTIVE SET
      // Key insight: cache uses BOTH slugs and UUIDs as external_room_type_id
      // - ROL properties use slugs (e.g. "dungeon", "holiday-house")
      // - Hostfully properties use UUIDs (matching hostfully_room_types.id)
      // We index by BOTH uuid AND slugified name for complete coverage.
      // ============================================================
      const nameMap: Record<string, string> = {};
      const inactiveKeys = new Set<string>();

      // Rolos room types — index by UUID + slug
      for (const rt of rolosResult.data || []) {
        const slug = slugify(rt.name);
        // Only set name if not already set (active takes priority)
        if (rt.is_active) {
          nameMap[rt.id] = rt.name;
          nameMap[slug] = rt.name;
        } else {
          // Inactive — add to inactive set, only set name if not already mapped by an active one
          inactiveKeys.add(rt.id);
          inactiveKeys.add(slug);
          if (!nameMap[rt.id]) nameMap[rt.id] = rt.name;
          if (!nameMap[slug]) nameMap[slug] = rt.name;
        }
      }

      // Hostfully room types — index by UUID + slug (don't overwrite active rolos entries)
      for (const rt of hostfullyResult.data || []) {
        const slug = slugify(rt.name);
        if (rt.is_active) {
          // Active hostfully — set name, REMOVE from inactive if rolos had it inactive
          if (!nameMap[rt.id]) nameMap[rt.id] = rt.name;
          if (!nameMap[slug]) nameMap[slug] = rt.name;
          // Don't remove from inactiveKeys here — rolos takes precedence
        } else {
          inactiveKeys.add(rt.id);
          // Only add slug to inactive if no active rolos/hostfully entry has this slug
          if (!nameMap[slug] || inactiveKeys.has(slug)) {
            inactiveKeys.add(slug);
          }
          if (!nameMap[rt.id]) nameMap[rt.id] = rt.name;
          if (!nameMap[slug]) nameMap[slug] = rt.name;
        }
      }

      // Amenities JSONB fallback
      for (const prop of propsResult.data || []) {
        const amenities = prop.amenities as { room_types?: Array<{ id?: string; name?: string }> } | null;
        if (Array.isArray(amenities?.room_types)) {
          for (const rt of amenities!.room_types) {
            if (rt?.name) {
              const slug = slugify(rt.name);
              if (!nameMap[slug]) nameMap[slug] = rt.name;
              if (rt.id && !nameMap[rt.id]) nameMap[rt.id] = rt.name;
            }
          }
        }
      }

      // Property name map
      const propMap = Object.fromEntries(filteredProperties.map((p) => [p.id, p.name]));

      // Filter out inactive room types and resolve names
      const rows: AvailabilityRow[] = cacheData
        .filter((r: any) => {
          const extId = r.external_room_type_id || "";
          // Check if this exact key (UUID or slug) is inactive
          return !inactiveKeys.has(extId);
        })
        .map((r: any) => {
          const extId = r.external_room_type_id || "";
          const resolvedName = nameMap[extId] || (
            /^[0-9a-f]{8}-/.test(extId) ? extId.slice(0, 8) + "…" : slugToTitle(extId)
          );
          return {
            property_id: r.property_id,
            property_name: propMap[r.property_id] || "Unknown",
            room_type_name: resolvedName,
            date: r.date,
            available_units: r.available_units ?? 0,
          };
        });

      setAvailability(rows);

      // If no cache data found, trigger live fetch
      if (cacheData.length === 0 && propIds.length > 0) {
        triggerLiveFetch(propIds, startDate, endDate, propMap);
      }

      // Calculate occupancy summaries
      buildOccupancySummaries(rows, propIds, propMap);
    } catch (err) {
      console.error("Command Centre load error:", err);
    } finally {
      setLoading(false);
    }
  }, [filteredPropertyIds, weekOffset, weekStart, weekEnd, filteredProperties]);

  /** Trigger live ARI fetch when cache is empty */
  const triggerLiveFetch = async (
    propIds: string[],
    startDate: string,
    endDate: string,
    propMap: Record<string, string>
  ) => {
    setLiveFetching(true);
    try {
      const liveRows: AvailabilityRow[] = [];

      await Promise.allSettled(
        propIds.map(async (pid) => {
          try {
            const { data, error } = await supabase.functions.invoke("roomsonline-pms-api", {
              body: {
                action: "fetch_availability",
                propertyId: pid,
                start_date: startDate,
                end_date: endDate,
              },
            });
            if (error || !data?.success) return;

            const roomTypes = data.data?.room_types || data.data?.roomTypes || [];
            for (const rt of roomTypes) {
              const name = rt.room_type_name || rt.roomTypeName || rt.name || "Unknown";
              const avail = rt.rooms_available_per_night || rt.roomsAvailablePerNight || [];
              for (const day of avail) {
                const dateStr = day.date || day.dateStr;
                const units = day.available_units ?? day.numberOfRoomsAvailable ?? 0;
                if (dateStr) {
                  liveRows.push({
                    property_id: pid,
                    property_name: propMap[pid] || "Unknown",
                    room_type_name: name,
                    date: dateStr,
                    available_units: units,
                  });
                }
              }
            }
          } catch {
            // Skip failed properties
          }
        })
      );

      if (liveRows.length > 0) {
        setAvailability(liveRows);
        const propIdsStr = propIds.join(",");
        buildOccupancySummaries(liveRows, propIds, propMap);
      }
    } catch (err) {
      console.error("Live fetch error:", err);
    } finally {
      setLiveFetching(false);
    }
  };

  /** Build occupancy summary cards from availability rows */
  const buildOccupancySummaries = async (
    rows: AvailabilityRow[],
    propIds: string[],
    propMap: Record<string, string>
  ) => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayRows = rows.filter((r) => r.date === todayStr);

    const summaries: OccupancySummary[] = propIds.map((pid) => {
      const propRows = todayRows.filter((r) => r.property_id === pid);
      const totalRooms = propRows.length;
      const availableRooms = propRows.reduce((sum, r) => sum + (r.available_units || 0), 0);
      return {
        property_id: pid,
        property_name: propMap[pid] || "Unknown",
        property_type: propertyTypes[pid] || "other",
        occupancy_pct: totalRooms > 0 ? Math.max(0, Math.round(((totalRooms - availableRooms) / Math.max(totalRooms, 1)) * 100)) : 0,
        arrivals: 0,
        departures: 0,
        available_rooms: availableRooms,
        total_rooms: totalRooms,
      };
    });

    // Fetch today's arrivals/departures
    const { data: bookingsToday } = await supabase
      .from("bookings")
      .select("property_id, check_in_date, check_out_date")
      .in("property_id", propIds)
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
  };

  const loadAiSuggestions = async () => {
    if (filteredProperties.length === 0) return;
    setAiLoading(true);

    try {
      const propIds = filteredProperties.map((p) => p.id);
      const { data, error } = await supabase.functions.invoke("experience-engine", {
        body: {
          property_id: propIds[0],
          experience_type: "agent_command",
          payload: {
            properties: propIds,
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
    const url = `${window.location.origin}/pms/command-centre${selectedPropertyFilter !== "all" ? `?property=${selectedPropertyFilter}` : ""}`;
    navigator.clipboard.writeText(url);
    toast.success("Availability link copied");
  };

  const goToPropertyBooking = (propId: string) => {
    const prop = agentProperties.find((p) => p.id === propId);
    if (prop) {
      navigate(`/property/${(prop as any).slug || propId}`);
    }
  };

  const handlePropertyFilterChange = (value: string) => {
    setSelectedPropertyFilter(value);
    setSearchParams((prev) => {
      if (value === "all") {
        prev.delete("property");
      } else {
        prev.set("property", value);
      }
      return prev;
    }, { replace: true });
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

  // Group occupancy cards: portfolio → property type → cards
  const groupedOccupancy = useMemo(() => {
    const assignedIds = new Set<string>();
    const sections: Array<{
      label: string;
      subgroups: Array<{ typeLabel: string; cards: OccupancySummary[] }>;
    }> = [];

    // Portfolio groups
    for (const pg of portfolioGroups) {
      const cards = occupancy.filter((o) => pg.property_ids.includes(o.property_id));
      if (cards.length === 0) continue;
      cards.forEach((c) => assignedIds.add(c.property_id));

      // Sub-group by property type
      const byType: Record<string, OccupancySummary[]> = {};
      for (const c of cards) {
        const t = c.property_type || "other";
        if (!byType[t]) byType[t] = [];
        byType[t].push(c);
      }

      const subgroups = Object.entries(byType)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([typeKey, typeCards]) => ({
          typeLabel: slugToTitle(typeKey.replace(/_/g, "-")),
          cards: typeCards.sort((a, b) => a.property_name.localeCompare(b.property_name)),
        }));

      sections.push({ label: pg.portfolio_name, subgroups });
    }

    // Unassigned properties
    const unassigned = occupancy.filter((o) => !assignedIds.has(o.property_id));
    if (unassigned.length > 0) {
      const byType: Record<string, OccupancySummary[]> = {};
      for (const c of unassigned) {
        const t = c.property_type || "other";
        if (!byType[t]) byType[t] = [];
        byType[t].push(c);
      }

      const subgroups = Object.entries(byType)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([typeKey, typeCards]) => ({
          typeLabel: slugToTitle(typeKey.replace(/_/g, "-")),
          cards: typeCards.sort((a, b) => a.property_name.localeCompare(b.property_name)),
        }));

      sections.push({ label: "Other Properties", subgroups });
    }

    return sections;
  }, [occupancy, portfolioGroups]);

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

  if (loading && availability.length === 0 && occupancy.length === 0) {
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Command Centre</h1>
          <p className="text-sm text-muted-foreground">
            Multi-property availability overview
            {filteredProperties.length > 0 && ` · ${filteredProperties.length} propert${filteredProperties.length === 1 ? "y" : "ies"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {agentProperties.length > 1 && (
            <Select value={selectedPropertyFilter} onValueChange={handlePropertyFilterChange}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {agentProperties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={copyAvailabilityLink}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Link
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Occupancy Summary Cards — grouped by portfolio then property type */}
      {groupedOccupancy.length > 0 && (
        <div className="space-y-5">
          {groupedOccupancy.map((section) => (
            <div key={section.label}>
              <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                {section.label}
                <Badge variant="secondary" className="text-[10px]">
                  {section.subgroups.reduce((sum, sg) => sum + sg.cards.length, 0)}
                </Badge>
              </h2>
              {section.subgroups.map((sg) => (
                <div key={sg.typeLabel} className="mb-3">
                  {section.subgroups.length > 1 && (
                    <p className="text-xs text-muted-foreground mb-1.5 ml-1">{sg.typeLabel}</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {sg.cards.map((summary) => (
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
                        <div
                          className="absolute bottom-0 left-0 h-1 bg-primary/60 transition-all"
                          style={{ width: `${summary.occupancy_pct}%` }}
                        />
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
            {liveFetching && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                <Loader2 className="h-3 w-3 animate-spin" />
                Fetching live data…
              </span>
            )}
          </CardTitle>
          <CardDescription className="text-xs">Available units per room type per day</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedAvailability).length === 0 && !liveFetching ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-muted-foreground text-sm">
                No availability data for this period.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const propIds = filteredPropertyIds.split(",").filter(Boolean);
                  const propMap = Object.fromEntries(filteredProperties.map((p) => [p.id, p.name]));
                  triggerLiveFetch(propIds, format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd"), propMap);
                }}
                disabled={liveFetching}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Fetch Live Availability
              </Button>
            </div>
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
                  {Object.entries(groupedAvailability)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([propertyName, roomTypes]) => (
                    <Fragment key={propertyName}>
                      <tr className="bg-muted/30">
                        <td colSpan={8} className="py-1.5 px-2 font-semibold text-foreground">
                          {propertyName}
                        </td>
                      </tr>
                      {Object.entries(roomTypes)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([roomType, dates]) => (
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
                    </Fragment>
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

