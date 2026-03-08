import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { ManualBookingDialog } from "@/components/pms/ManualBookingDialog";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek, endOfWeek, differenceInDays, isToday, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { BulkStopSellDialog } from "@/components/BulkStopSellDialog";
import { BulkMinimumStayDialog } from "@/components/BulkMinimumStayDialog";
import { BulkMaximumStayDialog } from "@/components/BulkMaximumStayDialog";
import { BulkLeadDaysAdvanceDialog } from "@/components/BulkLeadDaysAdvanceDialog";
import { BulkLeadDaysPostDialog } from "@/components/BulkLeadDaysPostDialog";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  AlertTriangle,
  MessageSquare,
  User,
  Mail,
  Phone,
  CreditCard,
  Globe,
  Clock,
  BedDouble,
  Baby,
  PawPrint,
  Ban,
  Building2,
  Users,
  CalendarCheck,
  Sparkles,
  Settings2,
  TrendingUp,
  Plus,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

type ViewMode = "week" | "month";

interface BookingRow {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  adults: number;
  children: number | null;
  infants: number | null;
  pets: number | null;
  teens: number | null;
  total_price: number;
  special_requests: string | null;
  special_requests_parsed: any;
  requires_intervention: boolean | null;
  booking_channel: string | null;
  payment_status: string | null;
  payment_method: string | null;
  rolos_check_in_time: string | null;
  rolos_check_out_time: string | null;
  rolos_room_ids: string[] | null;
  rolos_rate_plan_id: string | null;
  modification_notes: any;
  room_type_id: string | null;
}

interface RoomType {
  id: string;
  name: string;
  default_rate: number | null;
  is_active: boolean | null;
  max_occupancy: number | null;
  property_type: string | null;
}

interface Room {
  id: string;
  room_number: string;
  room_name: string | null;
  room_type_id: string | null;
  status: string;
}

interface RateSeason {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_peak: boolean | null;
  rate_plan_id: string;
  min_stay_override: number | null;
}

interface RatePrice {
  id: string;
  base_rate: number;
  room_type_id: string;
  season_id: string;
}

interface AvailabilityOverride {
  room_type: string;
  date: string;
  is_stop_sell: boolean | null;
  minimum_stay: number | null;
  maximum_stay: number | null;
  lead_days_advance: number | null;
  lead_days_post: number | null;
  available_units: number | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  confirmed: { bg: "bg-blue-500/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500/40" },
  pending: { bg: "bg-amber-500/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/40" },
  checked_in: { bg: "bg-green-500/20", text: "text-green-700 dark:text-green-300", border: "border-green-500/40" },
  checked_out: { bg: "bg-slate-500/20", text: "text-slate-700 dark:text-slate-300", border: "border-slate-500/40" },
  cancelled: { bg: "bg-red-500/20", text: "text-red-700 dark:text-red-300 line-through", border: "border-red-500/40" },
  no_show: { bg: "bg-rose-500/20", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/40" },
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  pending: "secondary",
  checked_in: "default",
  checked_out: "outline",
  cancelled: "destructive",
  no_show: "destructive",
};

function getStatusColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.pending;
}

export default function PMSDashboard() {
  const { propertyId, properties, loading: propLoading, switchProperty } = usePmsPropertyId();
  const { propertyName: brandName } = usePMSBrand();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Restriction dialogs
  const [stopSellOpen, setStopSellOpen] = useState(false);
  const [minStayOpen, setMinStayOpen] = useState(false);
  const [maxStayOpen, setMaxStayOpen] = useState(false);
  const [leadDaysAdvanceOpen, setLeadDaysAdvanceOpen] = useState(false);
  const [leadDaysPostOpen, setLeadDaysPostOpen] = useState(false);
  const [manualBookingOpen, setManualBookingOpen] = useState(false);

  // Compute date range
  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
      const end = endOfWeek(anchorDate, { weekStartsOn: 1 });
      return { start, end };
    }
    // Month view: start from anchorDate, show 30 days
    const start = anchorDate;
    const end = addDays(anchorDate, 30);
    return { start, end };
  }, [anchorDate, viewMode]);

  const dates = useMemo(() => {
    const days: Date[] = [];
    let d = dateRange.start;
    while (d <= dateRange.end) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [dateRange]);

  // For month view, chunk dates into weeks of 7 days
  const weekChunks = useMemo(() => {
    if (viewMode === "week") return [dates];
    const chunks: Date[][] = [];
    for (let i = 0; i < dates.length; i += 7) {
      chunks.push(dates.slice(i, i + 7));
    }
    return chunks;
  }, [dates, viewMode]);

  // Fetch property name
  const { data: propertyData } = useQuery({
    queryKey: ["pms-prop-name", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const { data } = await supabase.from("properties").select("name").eq("id", propertyId).single();
      return data;
    },
    enabled: !!propertyId,
  });

  // Fetch room types (with linked overview data for unit counts)
  const { data: roomTypes = [] } = useQuery({
    queryKey: ["pms-cal-room-types", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("rolos_room_types")
        .select("id, name, default_rate, is_active, max_occupancy, linked_overview_id")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("name");

      // Fetch overview room types for unit/property_type info
      const { data: overviewData } = await supabase
        .from("hostfully_room_types")
        .select("id, property_type, max_guests")
        .eq("property_id", propertyId)
        .eq("is_active", true);

      const overviewMap = new Map((overviewData || []).map(o => [o.id, o]));

      return (data || []).map(rt => {
        const overview = overviewMap.get((rt as any).linked_overview_id);
        return {
          ...rt,
          property_type: overview?.property_type || null,
        } as RoomType;
      });
    },
    enabled: !!propertyId,
  });

  // Fetch rooms
  const { data: rooms = [] } = useQuery({
    queryKey: ["pms-cal-rooms", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("rolos_rooms")
        .select("id, room_number, room_name, room_type_id, status")
        .eq("property_id", propertyId)
        .order("room_number");
      return (data || []) as Room[];
    },
    enabled: !!propertyId,
  });

  // Fetch bookings in range
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["pms-cal-bookings", propertyId, format(dateRange.start, "yyyy-MM-dd"), format(dateRange.end, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, guest_name, guest_email, guest_phone, check_in_date, check_out_date, status, adults, children, infants, pets, teens, total_price, special_requests, special_requests_parsed, requires_intervention, booking_channel, payment_status, payment_method, rolos_check_in_time, rolos_check_out_time, rolos_room_ids, rolos_rate_plan_id, modification_notes, room_type_id")
        .eq("property_id", propertyId)
        .neq("status", "cancelled")
        .lte("check_in_date", format(dateRange.end, "yyyy-MM-dd"))
        .gte("check_out_date", format(dateRange.start, "yyyy-MM-dd"));
      return (data || []) as BookingRow[];
    },
    enabled: !!propertyId,
  });

  // Fetch today's arrivals & departures
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todayArrivals = [] } = useQuery({
    queryKey: ["pms-arrivals", propertyId, today],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, guest_name, check_in_date, check_out_date, status")
        .eq("property_id", propertyId)
        .eq("check_in_date", today)
        .in("status", ["confirmed", "pending"])
        .limit(20);
      return data || [];
    },
    enabled: !!propertyId,
  });

  const { data: todayDepartures = [] } = useQuery({
    queryKey: ["pms-departures", propertyId, today],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, guest_name, check_in_date, check_out_date, status")
        .eq("property_id", propertyId)
        .eq("check_out_date", today)
        .in("status", ["confirmed", "checked_in"])
        .limit(20);
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch rate seasons & prices & rate plan base rates
  const { data: ratePlansWithRate = [] } = useQuery({
    queryKey: ["pms-cal-rate-plans", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("rolos_rate_plans")
        .select("id, name, base_rate, pricing_model")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      return (data || []) as { id: string; name: string; base_rate: number | null; pricing_model?: string }[];
    },
    enabled: !!propertyId,
  });

  // Fetch rate plan → room type links
  const { data: ratePlanRoomLinks = [] } = useQuery({
    queryKey: ["pms-cal-rate-plan-links", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data: plans } = await supabase
        .from("rolos_rate_plans")
        .select("id")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      if (!plans?.length) return [];
      const { data } = await supabase
        .from("rolos_rate_plan_room_types")
        .select("rate_plan_id, room_type_id")
        .in("rate_plan_id", plans.map(p => p.id));
      return (data || []) as { rate_plan_id: string; room_type_id: string }[];
    },
    enabled: !!propertyId,
  });

  const { data: rateSeasons = [] } = useQuery({
    queryKey: ["pms-cal-seasons", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data: plans } = await supabase
        .from("rolos_rate_plans")
        .select("id")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      if (!plans?.length) return [];
      const planIds = plans.map(p => p.id);
      const { data } = await supabase
        .from("rolos_rate_seasons")
        .select("id, name, start_date, end_date, is_peak, rate_plan_id, min_stay_override")
        .in("rate_plan_id", planIds);
      return (data || []) as RateSeason[];
    },
    enabled: !!propertyId,
  });

  const { data: ratePrices = [] } = useQuery({
    queryKey: ["pms-cal-prices", propertyId, rateSeasons.map(s => s.id).join(",")],
    queryFn: async () => {
      if (!rateSeasons.length) return [];
      const seasonIds = rateSeasons.map(s => s.id);
      const { data } = await supabase
        .from("rolos_rate_prices")
        .select("id, base_rate, room_type_id, season_id")
        .in("season_id", seasonIds);
      return (data || []) as RatePrice[];
    },
    enabled: rateSeasons.length > 0,
  });

  // Fetch availability overrides
  const { data: availOverrides = [], refetch: refetchOverrides } = useQuery({
    queryKey: ["pms-cal-overrides", propertyId, format(dateRange.start, "yyyy-MM-dd"), format(dateRange.end, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("property_availability")
        .select("room_type, date, is_stop_sell, minimum_stay, maximum_stay, lead_days_advance, lead_days_post, available_units")
        .eq("property_id", propertyId)
        .gte("date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("date", format(dateRange.end, "yyyy-MM-dd"));
      return (data || []) as AvailabilityOverride[];
    },
    enabled: !!propertyId,
  });

  // Build override lookup
  const overrideMap = useMemo(() => {
    const map = new Map<string, AvailabilityOverride>();
    availOverrides.forEach(o => map.set(`${o.room_type}-${o.date}`, o));
    return map;
  }, [availOverrides]);

  // Group rooms by room type
  const roomsByType = useMemo(() => {
    const map = new Map<string, Room[]>();
    rooms.forEach(r => {
      const key = r.room_type_id || "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  }, [rooms]);

  // Dynamic stats based on actual bookings for today
  // Uses rolos_rooms if available, otherwise derives unit counts from room types
  const dynamicStats = useMemo(() => {
    const WHOLE_PROPERTY_TYPES = ['self_catering', 'villa', 'cottage', 'holiday_house', 'house', 'holiday'];
    const physicalRooms = rooms.filter(r => r.status !== "out_of_service").length;

    // If no physical rooms registered, each room type = 1 bookable unit
    const totalRooms = physicalRooms > 0
      ? physicalRooms
      : roomTypes.length;

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const activeBookingsToday = bookings.filter(b =>
      todayStr >= b.check_in_date && todayStr < b.check_out_date &&
      !["cancelled", "no_show"].includes(b.status)
    );

    // Count occupied: use room IDs if available, else count bookings
    let occupied: number;
    if (physicalRooms > 0) {
      const occupiedRoomIds = new Set<string>();
      activeBookingsToday.forEach(b => {
        b.rolos_room_ids?.forEach(rid => occupiedRoomIds.add(rid));
      });
      occupied = occupiedRoomIds.size;
    } else {
      // No physical rooms — count distinct bookings per room type today
      occupied = activeBookingsToday.length;
    }

    const available = Math.max(0, totalRooms - occupied);
    const occupancyPct = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
    const dirty = rooms.filter(r => r.status === "dirty").length;
    const maintenance = rooms.filter(r => r.status === "maintenance" || r.status === "out_of_order").length;

    return { totalRooms, occupied, available, occupancyPct, dirty, maintenance };
  }, [rooms, roomTypes, bookings]);

  // Get rate for a room type on a date
  const getRateForDate = (roomTypeId: string, date: Date): number | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    // 1. Check seasonal prices first
    for (const season of rateSeasons) {
      if (dateStr >= season.start_date && dateStr <= season.end_date) {
        const price = ratePrices.find(p => p.season_id === season.id && p.room_type_id === roomTypeId);
        if (price) return price.base_rate;
      }
    }
    // 2. Check linked rate plan base_rate
    const linkedPlanIds = ratePlanRoomLinks
      .filter(l => l.room_type_id === roomTypeId)
      .map(l => l.rate_plan_id);
    for (const planId of linkedPlanIds) {
      const plan = ratePlansWithRate.find(p => p.id === planId);
      if (plan?.base_rate && plan.base_rate > 0) return plan.base_rate;
    }
    // 3. Fallback to room type default_rate
    const rt = roomTypes.find(t => t.id === roomTypeId);
    return rt?.default_rate || null;
  };

  // Get pricing model suffix for a room type (based on linked rate plans)
  const getPricingSuffix = (roomTypeId: string): string => {
    const linkedPlanIds = ratePlanRoomLinks
      .filter(l => l.room_type_id === roomTypeId)
      .map(l => l.rate_plan_id);
    for (const planId of linkedPlanIds) {
      const plan = ratePlansWithRate.find(p => p.id === planId);
      if (plan?.pricing_model === 'per_person') return '/pp';
      if (plan?.pricing_model === 'per_person_sharing') return '/pps';
      if (plan?.pricing_model === 'per_unit') return '/unit';
    }
    return '';
  };

  // Get season for date
  const getSeasonForDate = (date: Date): RateSeason | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    return rateSeasons.find(s => dateStr >= s.start_date && dateStr <= s.end_date) || null;
  };

  // Get restriction for room type on date
  const getRestriction = (roomTypeName: string, date: Date): AvailabilityOverride | undefined => {
    return overrideMap.get(`${roomTypeName}-${format(date, "yyyy-MM-dd")}`);
  };

  // Navigation
  const navigateBy = (dir: number) => {
    setAnchorDate(prev => addDays(prev, dir * (viewMode === "week" ? 7 : 30)));
  };
  const goToToday = () => setAnchorDate(new Date());

  // Room types for restriction dialogs
  const dialogRoomTypes = useMemo(() =>
    roomTypes.map(rt => ({
      name: rt.name,
      id: rt.id,
      units: (roomsByType.get(rt.id) || []).length,
    })),
    [roomTypes, roomsByType]
  );

  const handleRuleCreated = () => {
    refetchOverrides();
  };

  const displayName = brandName || propertyData?.name || "";

  if (propLoading) {
    return (
      <PMSLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </PMSLayout>
    );
  }

  if (!propertyId) {
    return (
      <PMSLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Sparkles className="h-12 w-12 text-primary" />
          <h1 className="text-2xl font-bold">Property Management</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Select a property from your Property Overview to access the PMS module.
          </p>
        </div>
      </PMSLayout>
    );
  }

  const statCards = [
    { label: "Total Rooms", value: dynamicStats.totalRooms, icon: Building2, color: "text-foreground" },
    { label: "Available", value: dynamicStats.available, icon: BedDouble, color: "text-emerald-600" },
    { label: "Occupied", value: `${dynamicStats.occupied} (${dynamicStats.occupancyPct}%)`, icon: Users, color: "text-blue-600" },
    { label: "Arrivals Today", value: todayArrivals.length, icon: CalendarCheck, color: "text-amber-600" },
    { label: "Departures Today", value: todayDepartures.length, icon: TrendingUp, color: "text-purple-600" },
  ];

  return (
    <PMSLayout>
      <div className="space-y-4">
        {/* Header with property switch & stats */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
            {properties.length > 1 && (
              <Select value={propertyId || ""} onValueChange={switchProperty}>
                <SelectTrigger className="w-[220px] h-8 text-sm">
                  <SelectValue placeholder="Switch property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Compact stat pills */}
          <div className="grid grid-cols-5 gap-3">
            {statCards.map((stat) => (
              <Card key={stat.label} className="py-2">
                <CardContent className="flex items-center gap-2 p-0 px-3">
                  <stat.icon className={cn("h-4 w-4 shrink-0", stat.color)} />
                  <div className="min-w-0">
                    <p className={cn("text-xl font-bold leading-none", stat.color)}>{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Calendar controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {format(dateRange.start, "d MMM")} – {format(dateRange.end, "d MMM yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* New Booking */}
            <Button size="sm" onClick={() => setManualBookingOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Booking
            </Button>

            {/* Restrictions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="h-4 w-4 mr-1" />
                  Restrictions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setStopSellOpen(true)}>
                  <Ban className="h-4 w-4 mr-2 text-red-500" />
                  Stop Sell
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMinStayOpen(true)}>
                  <CalendarDays className="h-4 w-4 mr-2 text-blue-500" />
                  Min Stay
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMaxStayOpen(true)}>
                  <CalendarDays className="h-4 w-4 mr-2 text-pink-500" />
                  Max Stay
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLeadDaysAdvanceOpen(true)}>
                  <CalendarDays className="h-4 w-4 mr-2 text-yellow-500" />
                  Lead Days Advance
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLeadDaysPostOpen(true)}>
                  <CalendarDays className="h-4 w-4 mr-2 text-orange-500" />
                  Lead Days Post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View mode */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("week")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent text-foreground"
                )}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent text-foreground"
                )}
              >
                Month
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigateBy(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateBy(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Jump
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={anchorDate}
                  onSelect={(d) => { if (d) { setAnchorDate(d); setDatePickerOpen(false); } }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(STATUS_COLORS).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={cn("w-3 h-3 rounded-sm border", colors.bg, colors.border)} />
              <span className="capitalize text-muted-foreground">{status.replace("_", " ")}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/40" />
            <span className="text-muted-foreground">Stop Sell</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-500/40" />
            <span className="text-muted-foreground">Min Stay</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-pink-500/20 border border-pink-500/40" />
            <span className="text-muted-foreground">Max Stay</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-yellow-500/20 border border-yellow-500/40" />
            <span className="text-muted-foreground">Lead Advance</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-orange-500/20 border border-orange-500/40" />
            <span className="text-muted-foreground">Lead Post</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span className="text-muted-foreground">Needs attention</span>
          </div>
        </div>

        {/* Calendar Grid — week view: horizontal scroll; month view: stacked weekly rows */}
        {viewMode === "week" ? (
          <WeekCalendarGrid
            dates={dates}
            roomTypes={roomTypes}
            roomsByType={roomsByType}
            bookings={bookings}
            rateSeasons={rateSeasons}
            ratePrices={ratePrices}
            rooms={rooms}
            overrideMap={overrideMap}
            getRateForDate={getRateForDate}
            getPricingSuffix={getPricingSuffix}
            getSeasonForDate={getSeasonForDate}
            getRestriction={getRestriction}
            onSelectBooking={setSelectedBooking}
            bookingsLoading={bookingsLoading}
          />
        ) : (
          <MonthCalendarGrid
            weekChunks={weekChunks}
            roomTypes={roomTypes}
            roomsByType={roomsByType}
            bookings={bookings}
            rooms={rooms}
            overrideMap={overrideMap}
            getRateForDate={getRateForDate}
            getPricingSuffix={getPricingSuffix}
            getSeasonForDate={getSeasonForDate}
            getRestriction={getRestriction}
            onSelectBooking={setSelectedBooking}
            bookingsLoading={bookingsLoading}
          />
        )}

        {/* Today's Arrivals & Departures */}
        {(todayArrivals.length > 0 || todayDepartures.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Today's Arrivals ({todayArrivals.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {todayArrivals.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                    <p className="text-sm font-medium">{b.guest_name}</p>
                    <Badge variant="outline" className="text-xs">{b.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Today's Departures ({todayDepartures.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {todayDepartures.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                    <p className="text-sm font-medium">{b.guest_name}</p>
                    <Badge variant="outline" className="text-xs">{b.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Booking Detail Sheet */}
      <Sheet open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedBooking && <BookingDetail booking={selectedBooking} rooms={rooms} propertyId={propertyId || ""} onSaved={() => { setSelectedBooking(null); queryClient.invalidateQueries({ queryKey: ["pms-cal-bookings"] }); }} />}
        </SheetContent>
      </Sheet>

      {/* Manual Booking Dialog */}
      <ManualBookingDialog
        open={manualBookingOpen}
        onOpenChange={setManualBookingOpen}
        propertyId={propertyId || ""}
        roomTypes={roomTypes}
        rooms={rooms}
        ratePlans={ratePlansWithRate}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["pms-cal-bookings"] })}
      />

      {/* Restriction Dialogs */}
      <BulkStopSellDialog open={stopSellOpen} onOpenChange={setStopSellOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} onRuleCreated={handleRuleCreated} />
      <BulkMinimumStayDialog open={minStayOpen} onOpenChange={setMinStayOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} onRuleCreated={handleRuleCreated} />
      <BulkMaximumStayDialog open={maxStayOpen} onOpenChange={setMaxStayOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} onRuleCreated={handleRuleCreated} />
      <BulkLeadDaysAdvanceDialog open={leadDaysAdvanceOpen} onOpenChange={setLeadDaysAdvanceOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} onRuleCreated={handleRuleCreated} />
      <BulkLeadDaysPostDialog open={leadDaysPostOpen} onOpenChange={setLeadDaysPostOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} onRuleCreated={handleRuleCreated} />
    </PMSLayout>
  );
}

// ──────────── Week Calendar (horizontal scroll, original layout) ────────────
interface CalendarGridProps {
  dates?: Date[];
  weekChunks?: Date[][];
  roomTypes: RoomType[];
  roomsByType: Map<string, Room[]>;
  bookings: BookingRow[];
  rooms: Room[];
  rateSeasons?: RateSeason[];
  ratePrices?: RatePrice[];
  overrideMap: Map<string, AvailabilityOverride>;
  getRateForDate: (roomTypeId: string, date: Date) => number | null;
  getPricingSuffix: (roomTypeId: string) => string;
  getSeasonForDate: (date: Date) => RateSeason | null;
  getRestriction: (roomTypeName: string, date: Date) => AvailabilityOverride | undefined;
  onSelectBooking: (b: BookingRow) => void;
  bookingsLoading: boolean;
}

const WEEK_CELL_W = "w-[100px] min-w-[100px]";
const WEEK_LABEL_W = "w-[180px] min-w-[180px]";

function WeekCalendarGrid(props: CalendarGridProps) {
  const { dates = [], roomTypes, roomsByType, bookings, rooms, getRateForDate, getPricingSuffix, getSeasonForDate, getRestriction, onSelectBooking, bookingsLoading } = props;

  const dailyOccupancy = useMemo(() => {
    const totalRooms = rooms.filter(r => r.status !== "out_of_service").length;
    if (!totalRooms) return dates.map(() => 0);
    return dates.map(date => {
      const dateStr = format(date, "yyyy-MM-dd");
      const occupied = bookings.filter(b => dateStr >= b.check_in_date && dateStr < b.check_out_date).length;
      return Math.round((occupied / totalRooms) * 100);
    });
  }, [dates, bookings, rooms]);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <ScrollArea className="w-full">
        <div className="min-w-max">
          {/* Occupancy bar */}
          <div className="flex border-b border-border bg-muted/30">
            <div className={cn(WEEK_LABEL_W, "shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border flex items-center")}>Occupancy</div>
            {dates.map((date, i) => {
              const occ = dailyOccupancy[i];
              return (
                <div key={i} className={cn(WEEK_CELL_W, "shrink-0 px-1 py-2 text-center border-r border-border last:border-r-0")}>
                  <div className="w-full bg-muted rounded-full h-2 mb-1">
                    <div className={cn("h-2 rounded-full", occ >= 90 ? "bg-green-500" : occ >= 60 ? "bg-blue-500" : occ >= 30 ? "bg-amber-500" : "bg-muted-foreground/30")} style={{ width: `${Math.min(occ, 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{occ}%</span>
                </div>
              );
            })}
          </div>

          {/* Date header */}
          <div className="flex border-b border-border bg-muted/50 sticky top-0 z-10">
            <div className={cn(WEEK_LABEL_W, "shrink-0 px-3 py-2 text-xs font-semibold text-foreground border-r border-border")}>Room</div>
            {dates.map((date, i) => {
              const season = getSeasonForDate(date);
              return (
                <div key={i} className={cn(WEEK_CELL_W, "shrink-0 px-1 py-2 text-center border-r border-border last:border-r-0", isToday(date) && "bg-primary/10", season?.is_peak && "bg-amber-500/5")}>
                  <div className="text-[10px] uppercase text-muted-foreground">{format(date, "EEE")}</div>
                  <div className={cn("text-sm font-semibold", isToday(date) ? "text-primary" : "text-foreground")}>{format(date, "d")}</div>
                  <div className="text-[9px] text-muted-foreground">{format(date, "MMM")}</div>
                  {season?.is_peak && <div className="text-[8px] text-amber-600 font-medium mt-0.5">PEAK</div>}
                </div>
              );
            })}
          </div>

          {/* Room type rows */}
          {roomTypes.map((rt) => (
            <RoomTypeSection key={rt.id} rt={rt} dates={dates} roomsByType={roomsByType} bookings={bookings} getRateForDate={getRateForDate} getPricingSuffix={getPricingSuffix} getRestriction={getRestriction} onSelectBooking={onSelectBooking} cellW={WEEK_CELL_W} labelW={WEEK_LABEL_W} />
          ))}

          {roomTypes.length === 0 && !bookingsLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <div className="text-center space-y-2">
                <CalendarDays className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">No room types configured</p>
              </div>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

// ──────────── Month Calendar (stacked weekly rows, no horizontal scroll) ────────────
function MonthCalendarGrid(props: CalendarGridProps) {
  const { weekChunks = [], roomTypes, roomsByType, bookings, rooms, getRateForDate, getPricingSuffix, getSeasonForDate, getRestriction, onSelectBooking, bookingsLoading } = props;

  // 7 columns for days + 1 for label. Use CSS grid with equal columns.
  return (
    <div className="space-y-4">
      {weekChunks.map((weekDates, weekIdx) => (
        <div key={weekIdx} className="border border-border rounded-lg bg-card overflow-hidden">
          {/* Date header row */}
          <div className="grid border-b border-border bg-muted/50" style={{ gridTemplateColumns: `160px repeat(${weekDates.length}, 1fr)` }}>
            <div className="px-3 py-2 text-xs font-semibold text-foreground border-r border-border">Room</div>
            {weekDates.map((date, i) => {
              const season = getSeasonForDate(date);
              return (
                <div key={i} className={cn("px-1 py-2 text-center border-r border-border last:border-r-0", isToday(date) && "bg-primary/10", season?.is_peak && "bg-amber-500/5")}>
                  <div className="text-[10px] uppercase text-muted-foreground">{format(date, "EEE")}</div>
                  <div className={cn("text-sm font-semibold", isToday(date) ? "text-primary" : "text-foreground")}>{format(date, "d")}</div>
                  <div className="text-[9px] text-muted-foreground">{format(date, "MMM")}</div>
                  {season?.is_peak && <div className="text-[8px] text-amber-600 font-medium mt-0.5">PEAK</div>}
                </div>
              );
            })}
          </div>

          {/* Room type rows */}
          {roomTypes.map((rt) => {
            const typeRooms = roomsByType.get(rt.id) || [];
            const totalUnits = typeRooms.length || 1;

            const getMonthAvail = (date: Date) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const booked = bookings.filter(b => {
                if (b.room_type_id === rt.id || b.rolos_room_ids?.some(rid => typeRooms.some(r => r.id === rid))) {
                  return dateStr >= b.check_in_date && dateStr < b.check_out_date && !["cancelled", "no_show"].includes(b.status);
                }
                return false;
              }).length;
              return { booked, avail: Math.max(0, totalUnits - booked) };
            };

            return (
              <div key={rt.id}>
                {/* Room type header with rates + restrictions + availability */}
                <div className="grid border-b border-border bg-muted/20" style={{ gridTemplateColumns: `160px repeat(${weekDates.length}, 1fr)` }}>
                  <div className="px-3 py-2 border-r border-border flex items-center gap-2">
                    <BedDouble className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{rt.name}</div>
                      <div className="text-[10px] text-muted-foreground">{typeRooms.length} room{typeRooms.length !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  {weekDates.map((date, i) => {
                    const rate = getRateForDate(rt.id, date);
                    const restriction = getRestriction(rt.name, date);
                    const isStopSell = restriction?.is_stop_sell;
                    const { booked, avail } = getMonthAvail(date);
                    return (
                      <div key={i} className={cn("px-1 py-1.5 text-center border-r border-border last:border-r-0", isToday(date) && "bg-primary/5", isStopSell && "bg-red-500/10")}>
                        {rate != null ? (
                          <span className="text-[10px] font-medium text-muted-foreground">R{rate.toLocaleString()}{getPricingSuffix(rt.id)}</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50">—</span>
                        )}
                        <div className="text-[8px] mt-0.5">
                          {booked > 0 && <span className="text-amber-600">{booked}b</span>}
                          {booked > 0 && " · "}
                          <span className={avail > 0 ? "text-emerald-600" : "text-red-500"}>{avail}a</span>
                        </div>
                        <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                          {isStopSell && <span className="text-[7px] bg-red-500/20 text-red-600 rounded px-0.5">STOP</span>}
                          {restriction?.minimum_stay != null && <span className="text-[7px] bg-blue-500/20 text-blue-600 rounded px-0.5">MIN {restriction.minimum_stay}</span>}
                          {restriction?.maximum_stay != null && <span className="text-[7px] bg-pink-500/20 text-pink-600 rounded px-0.5">MAX {restriction.maximum_stay}</span>}
                          {restriction?.lead_days_advance != null && <span className="text-[7px] bg-yellow-500/20 text-yellow-700 rounded px-0.5">ADV {restriction.lead_days_advance}</span>}
                          {restriction?.lead_days_post != null && <span className="text-[7px] bg-orange-500/20 text-orange-600 rounded px-0.5">POST {restriction.lead_days_post}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Individual room rows */}
                {typeRooms.map((room) => (
                  <MonthRoomRow key={room.id} room={room} dates={weekDates} bookings={bookings} onSelectBooking={onSelectBooking} colCount={weekDates.length} />
                ))}

                {/* Unassigned bookings */}
                {(() => {
                  const unassigned = bookings.filter(b =>
                    b.room_type_id === rt.id && (!b.rolos_room_ids || b.rolos_room_ids.length === 0) &&
                    weekDates.some(d => { const ds = format(d, "yyyy-MM-dd"); return ds >= b.check_in_date && ds < b.check_out_date; })
                  );
                  if (!unassigned.length) return null;
                  return (
                    <div className="grid border-b border-border bg-amber-500/5" style={{ gridTemplateColumns: `160px repeat(${weekDates.length}, 1fr)` }}>
                      <div className="px-3 py-1.5 border-r border-border flex items-center">
                        <span className="text-[10px] text-amber-600 italic ml-4">Unassigned</span>
                      </div>
                      {weekDates.map((date, i) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const dayBookings = bookings.filter(b =>
                          b.room_type_id === rt.id && (!b.rolos_room_ids || b.rolos_room_ids.length === 0) &&
                          dateStr >= b.check_in_date && dateStr < b.check_out_date
                        );
                        return (
                          <div key={i} className="border-r border-border last:border-r-0 relative h-8">
                            {dayBookings.map(b => {
                              const colors = getStatusColor(b.status);
                              const isStart = b.check_in_date === dateStr;
                              return (
                                <button key={b.id} onClick={() => onSelectBooking(b)} className={cn("absolute inset-y-0.5 inset-x-0.5 rounded-sm border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-90", colors.bg, colors.border)}>
                                  {isStart && <span className={cn("text-[9px] font-medium truncate", colors.text)}>{b.guest_name.split(" ")[0]}</span>}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {roomTypes.length === 0 && weekIdx === 0 && !bookingsLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <div className="text-center space-y-2">
                <CalendarDays className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">No room types configured</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ──────────── Month Room Row (CSS Grid) ────────────
function MonthRoomRow({ room, dates, bookings, onSelectBooking, colCount }: {
  room: Room;
  dates: Date[];
  bookings: BookingRow[];
  onSelectBooking: (b: BookingRow) => void;
  colCount: number;
}) {
  const isOOS = room.status === "out_of_service";

  return (
    <div className={cn("grid border-b border-border", isOOS && "opacity-50")} style={{ gridTemplateColumns: `160px repeat(${colCount}, 1fr)` }}>
      <div className="px-3 py-1.5 border-r border-border flex items-center gap-2">
        <span className="text-xs text-foreground/80 ml-4">{room.room_number}</span>
        {room.room_name && <span className="text-[10px] text-muted-foreground truncate">({room.room_name})</span>}
        {isOOS && <Badge variant="outline" className="text-[8px] px-1 py-0">OOS</Badge>}
      </div>
      {dates.map((date, i) => {
        const dateStr = format(date, "yyyy-MM-dd");

        if (isOOS) {
          return (
            <div key={i} className="border-r border-border last:border-r-0 h-8 bg-muted/30 flex items-center justify-center">
              <Ban className="h-3 w-3 text-muted-foreground/40" />
            </div>
          );
        }

        const dayBookings = bookings.filter(b => {
          if (!b.rolos_room_ids?.includes(room.id)) return false;
          return dateStr >= b.check_in_date && dateStr < b.check_out_date;
        });

        return (
          <div key={i} className={cn("border-r border-border last:border-r-0 relative h-8", isToday(date) && "bg-primary/5")}>
            {dayBookings.map(b => {
              const colors = getStatusColor(b.status);
              const isStart = b.check_in_date === dateStr;
              const isEnd = addDays(parseISO(b.check_out_date), -1).toISOString().slice(0, 10) === dateStr;
              return (
                <button key={b.id} onClick={() => onSelectBooking(b)} className={cn(
                  "absolute inset-y-0.5 border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-80 z-[1]",
                  colors.bg, colors.border,
                  isStart ? "left-0.5 rounded-l-sm" : "left-0",
                  isEnd ? "right-0.5 rounded-r-sm" : "right-0"
                )}>
                  {isStart && (
                    <>
                      <span className={cn("text-[9px] font-medium truncate", colors.text)}>{b.guest_name.split(" ")[0]}</span>
                      {hasSpecialIndicator(b) && <AlertTriangle className="h-2.5 w-2.5 text-amber-500 ml-auto shrink-0" />}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ──────────── Room Type Section (for week view) ────────────
function RoomTypeSection({ rt, dates, roomsByType, bookings, getRateForDate, getPricingSuffix, getRestriction, onSelectBooking, cellW, labelW }: {
  rt: RoomType;
  dates: Date[];
  roomsByType: Map<string, Room[]>;
  bookings: BookingRow[];
  getRateForDate: (roomTypeId: string, date: Date) => number | null;
  getPricingSuffix: (roomTypeId: string) => string;
  getRestriction: (roomTypeName: string, date: Date) => AvailabilityOverride | undefined;
  onSelectBooking: (b: BookingRow) => void;
  cellW: string;
  labelW: string;
}) {
  const typeRooms = roomsByType.get(rt.id) || [];
  const totalUnits = typeRooms.length || 1; // At least 1 bookable unit per type

  // Compute per-day availability
  const getAvail = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const booked = bookings.filter(b => {
      if (b.room_type_id === rt.id || b.rolos_room_ids?.some(rid => typeRooms.some(r => r.id === rid))) {
        return dateStr >= b.check_in_date && dateStr < b.check_out_date && !["cancelled", "no_show"].includes(b.status);
      }
      return false;
    }).length;
    return { booked, avail: Math.max(0, totalUnits - booked) };
  };

  return (
    <div>
      {/* Room type header row */}
      <div className="flex border-b border-border bg-muted/20">
        <div className={cn(labelW, "shrink-0 px-3 py-2 border-r border-border flex items-center gap-2")}>
          <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <div className="text-xs font-semibold text-foreground">{rt.name}</div>
            <div className="text-[10px] text-muted-foreground">{typeRooms.length} room{typeRooms.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        {dates.map((date, i) => {
          const rate = getRateForDate(rt.id, date);
          const restriction = getRestriction(rt.name, date);
          const isStopSell = restriction?.is_stop_sell;
          const { booked, avail } = getAvail(date);
          return (
            <div key={i} className={cn(cellW, "shrink-0 px-1 py-1.5 text-center border-r border-border last:border-r-0", isToday(date) && "bg-primary/5", isStopSell && "bg-red-500/10")}>
              {rate != null ? <span className="text-[10px] font-medium text-muted-foreground">R{rate.toLocaleString()}{getPricingSuffix(rt.id)}</span> : <span className="text-[10px] text-muted-foreground/50">—</span>}
              <div className="text-[8px] mt-0.5">
                {booked > 0 && <span className="text-amber-600">{booked}b</span>}
                {booked > 0 && " · "}
                <span className={avail > 0 ? "text-emerald-600" : "text-red-500"}>{avail}a</span>
              </div>
              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                {isStopSell && <span className="text-[7px] bg-red-500/20 text-red-600 rounded px-0.5">STOP</span>}
                {restriction?.minimum_stay != null && <span className="text-[7px] bg-blue-500/20 text-blue-600 rounded px-0.5">MIN {restriction.minimum_stay}</span>}
                {restriction?.maximum_stay != null && <span className="text-[7px] bg-pink-500/20 text-pink-600 rounded px-0.5">MAX {restriction.maximum_stay}</span>}
                {restriction?.lead_days_advance != null && <span className="text-[7px] bg-yellow-500/20 text-yellow-700 rounded px-0.5">ADV {restriction.lead_days_advance}</span>}
                {restriction?.lead_days_post != null && <span className="text-[7px] bg-orange-500/20 text-orange-600 rounded px-0.5">POST {restriction.lead_days_post}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Individual room rows */}
      {typeRooms.map((room) => (
        <WeekRoomRow key={room.id} room={room} dates={dates} bookings={bookings} onSelectBooking={onSelectBooking} cellW={cellW} labelW={labelW} />
      ))}
    </div>
  );
}

// ──────────── Week Room Row (flex) ────────────
function WeekRoomRow({ room, dates, bookings, onSelectBooking, cellW, labelW }: {
  room: Room;
  dates: Date[];
  bookings: BookingRow[];
  onSelectBooking: (b: BookingRow) => void;
  cellW: string;
  labelW: string;
}) {
  const isOOS = room.status === "out_of_service";

  return (
    <div className={cn("flex border-b border-border", isOOS && "opacity-50")}>
      <div className={cn(labelW, "shrink-0 px-3 py-1.5 border-r border-border flex items-center gap-2")}>
        <span className="text-xs text-foreground/80 ml-4">{room.room_number}</span>
        {room.room_name && <span className="text-[10px] text-muted-foreground truncate">({room.room_name})</span>}
        {isOOS && <Badge variant="outline" className="text-[8px] px-1 py-0">OOS</Badge>}
      </div>
      {dates.map((date, i) => {
        const dateStr = format(date, "yyyy-MM-dd");
        if (isOOS) {
          return <div key={i} className={cn(cellW, "shrink-0 border-r border-border last:border-r-0 h-8 bg-muted/30 flex items-center justify-center")}><Ban className="h-3 w-3 text-muted-foreground/40" /></div>;
        }
        const dayBookings = bookings.filter(b => b.rolos_room_ids?.includes(room.id) && dateStr >= b.check_in_date && dateStr < b.check_out_date);
        return (
          <div key={i} className={cn(cellW, "shrink-0 border-r border-border last:border-r-0 relative h-8", isToday(date) && "bg-primary/5")}>
            {dayBookings.map(b => {
              const colors = getStatusColor(b.status);
              const isStart = b.check_in_date === dateStr;
              const isEnd = addDays(parseISO(b.check_out_date), -1).toISOString().slice(0, 10) === dateStr;
              return (
                <button key={b.id} onClick={() => onSelectBooking(b)} className={cn(
                  "absolute inset-y-0.5 border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-80 z-[1]",
                  colors.bg, colors.border,
                  isStart ? "left-0.5 rounded-l-sm" : "left-0",
                  isEnd ? "right-0.5 rounded-r-sm" : "right-0"
                )}>
                  {isStart && (
                    <>
                      <span className={cn("text-[9px] font-medium truncate", colors.text)}>{b.guest_name.split(" ")[0]}</span>
                      {hasSpecialIndicator(b) && <AlertTriangle className="h-2.5 w-2.5 text-amber-500 ml-auto shrink-0" />}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ──────────── Booking Detail Component (Editable) ────────────
function BookingDetail({ booking, rooms, onSaved }: { booking: BookingRow; rooms: Room[]; onSaved: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    guest_name: booking.guest_name,
    guest_email: booking.guest_email,
    guest_phone: booking.guest_phone || "",
    check_in_date: booking.check_in_date,
    check_out_date: booking.check_out_date,
    adults: String(booking.adults),
    children: String(booking.children ?? 0),
    teens: String(booking.teens ?? 0),
    infants: String(booking.infants ?? 0),
    pets: String(booking.pets ?? 0),
    total_price: String(booking.total_price),
    payment_status: booking.payment_status || "unpaid",
    payment_method: booking.payment_method || "",
    status: booking.status,
    special_requests: booking.special_requests || "",
  });
  const update = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("bookings").update({
      guest_name: form.guest_name,
      guest_email: form.guest_email,
      guest_phone: form.guest_phone || null,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      adults: parseInt(form.adults) || 1,
      children: parseInt(form.children) || 0,
      teens: parseInt(form.teens) || 0,
      infants: parseInt(form.infants) || 0,
      pets: parseInt(form.pets) || 0,
      total_price: parseFloat(form.total_price) || 0,
      payment_status: form.payment_status,
      payment_method: form.payment_method || null,
      status: form.status,
      special_requests: form.special_requests || null,
    }).eq("id", booking.id);
    setSaving(false);
    if (error) {
      toast("Failed to save: " + error.message);
      return;
    }
    toast("Booking updated successfully");
    setIsEditing(false);
    onSaved();
  };

  const b = booking;
  const nights = differenceInDays(parseISO(form.check_out_date), parseISO(form.check_in_date));
  const assignedRooms = rooms.filter(r => b.rolos_room_ids?.includes(r.id));

  if (isEditing) {
    return (
      <>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Edit Booking
          </SheetTitle>
          <SheetDescription>Booking #{b.id.slice(0, 8)}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guest</h4>
            <div className="space-y-2">
              <div><label className="text-xs text-muted-foreground">Name</label><input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.guest_name} onChange={e => update("guest_name", e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Email</label><input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.guest_email} onChange={e => update("guest_email", e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Phone</label><input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.guest_phone} onChange={e => update("guest_phone", e.target.value)} /></div>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dates</h4>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Check-in</label><input type="date" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.check_in_date} onChange={e => update("check_in_date", e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Check-out</label><input type="date" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.check_out_date} onChange={e => update("check_out_date", e.target.value)} /></div>
            </div>
            {nights > 0 && <p className="text-xs text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</p>}
          </div>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guests</h4>
            <div className="grid grid-cols-5 gap-2">
              <div><label className="text-[10px] text-muted-foreground">Adults</label><input type="number" min={1} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={form.adults} onChange={e => update("adults", e.target.value)} /></div>
              <div><label className="text-[10px] text-muted-foreground">Children</label><input type="number" min={0} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={form.children} onChange={e => update("children", e.target.value)} /></div>
              <div><label className="text-[10px] text-muted-foreground">Teens</label><input type="number" min={0} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={form.teens} onChange={e => update("teens", e.target.value)} /></div>
              <div><label className="text-[10px] text-muted-foreground">Infants</label><input type="number" min={0} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={form.infants} onChange={e => update("infants", e.target.value)} /></div>
              <div><label className="text-[10px] text-muted-foreground">Pets</label><input type="number" min={0} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={form.pets} onChange={e => update("pets", e.target.value)} /></div>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment</h4>
            <div><label className="text-xs text-muted-foreground">Total Price (ZAR)</label><input type="number" min={0} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.total_price} onChange={e => update("total_price", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Payment Status</label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.payment_status} onChange={e => update("payment_status", e.target.value)}>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Payment Method</label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.payment_method} onChange={e => update("payment_method", e.target.value)}>
                  <option value="">—</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="eft">EFT</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Booking Status</label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.status} onChange={e => update("status", e.target.value)}>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Special Requests</label>
            <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.special_requests} onChange={e => update("special_requests", e.target.value)} rows={3} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? "Saving..." : "Save Changes"}</Button>
            <Button variant="outline" onClick={() => setIsEditing(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <User className="h-4 w-4" />
          {b.guest_name}
        </SheetTitle>
        <SheetDescription className="flex items-center justify-between">
          <span>Booking #{b.id.slice(0, 8)}</span>
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="ml-2">
            <Pencil className="h-3 w-3 mr-1" />Edit
          </Button>
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 mt-4">
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_BADGE_VARIANT[b.status] || "secondary"} className="capitalize">{b.status.replace("_", " ")}</Badge>
          {b.requires_intervention && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Needs Attention</Badge>}
        </div>
        <Separator />
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stay Details</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Check-in</span>
              <p className="font-medium">{format(parseISO(b.check_in_date), "d MMM yyyy")}</p>
              {b.rolos_check_in_time && <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{b.rolos_check_in_time}</p>}
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Check-out</span>
              <p className="font-medium">{format(parseISO(b.check_out_date), "d MMM yyyy")}</p>
              {b.rolos_check_out_time && <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{b.rolos_check_out_time}</p>}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</div>
        </div>
        <Separator />
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guest</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span>{b.guest_email}</span></div>
            {b.guest_phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span>{b.guest_phone}</span></div>}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className="text-xs gap-1"><User className="h-3 w-3" />{b.adults} Adult{b.adults !== 1 ? "s" : ""}</Badge>
            {(b.children ?? 0) > 0 && <Badge variant="outline" className="text-xs">{b.children} Child{(b.children ?? 0) !== 1 ? "ren" : ""}</Badge>}
            {(b.teens ?? 0) > 0 && <Badge variant="outline" className="text-xs">{b.teens} Teen{(b.teens ?? 0) !== 1 ? "s" : ""}</Badge>}
            {(b.infants ?? 0) > 0 && <Badge variant="outline" className="text-xs gap-1"><Baby className="h-3 w-3" />{b.infants} Infant{(b.infants ?? 0) !== 1 ? "s" : ""}</Badge>}
            {(b.pets ?? 0) > 0 && <Badge variant="outline" className="text-xs gap-1"><PawPrint className="h-3 w-3" />{b.pets} Pet{(b.pets ?? 0) !== 1 ? "s" : ""}</Badge>}
          </div>
        </div>
        <Separator />
        {assignedRooms.length > 0 && (
          <>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room Assignment</h4>
              <div className="flex flex-wrap gap-2">
                {assignedRooms.map(r => <Badge key={r.id} variant="secondary"><BedDouble className="h-3 w-3 mr-1" />{r.room_number}{r.room_name ? ` (${r.room_name})` : ""}</Badge>)}
              </div>
            </div>
            <Separator />
          </>
        )}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment</h4>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold text-lg">R{b.total_price.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" />
            <span className="capitalize">{b.payment_status || "unknown"}</span>
            {b.payment_method && <span>· {b.payment_method}</span>}
          </div>
        </div>
        {b.booking_channel && (
          <>
            <Separator />
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Channel:</span>
              <span className="capitalize">{b.booking_channel}</span>
            </div>
          </>
        )}
        {(b.special_requests || (b.special_requests_parsed && Object.keys(b.special_requests_parsed).length > 0)) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1"><MessageSquare className="h-3 w-3" />Special Requests</h4>
              {b.special_requests && <p className="text-sm bg-amber-500/10 p-3 rounded-md border border-amber-500/20">{b.special_requests}</p>}
              {b.special_requests_parsed && typeof b.special_requests_parsed === "object" && Object.entries(b.special_requests_parsed).length > 0 && (
                <div className="space-y-1">
                  {Object.entries(b.special_requests_parsed).map(([key, val]) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <span className="font-medium capitalize text-muted-foreground">{key.replace(/_/g, " ")}:</span>
                      <span>{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {b.modification_notes && Array.isArray(b.modification_notes) && b.modification_notes.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modification History</h4>
              <div className="space-y-2">
                {(b.modification_notes as any[]).slice(-5).reverse().map((note: any, i: number) => (
                  <div key={i} className="text-xs bg-muted/50 p-2 rounded border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-[10px] capitalize">{note.action}</Badge>
                      <span className="text-muted-foreground">{note.timestamp ? format(new Date(note.timestamp), "d MMM HH:mm") : ""}</span>
                    </div>
                    {note.changes && Object.entries(note.changes).map(([k, v]) => (
                      <div key={k} className="text-muted-foreground">{k.replace(/_/g, " ")}: {String(v)}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function hasSpecialIndicator(b: BookingRow): boolean {
  return !!(b.requires_intervention || b.special_requests || (b.special_requests_parsed && typeof b.special_requests_parsed === "object" && Object.keys(b.special_requests_parsed).length > 0));
}
