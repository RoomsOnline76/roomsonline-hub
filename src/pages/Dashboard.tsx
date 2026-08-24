import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { stayRangeCalendarClassNames } from "@/components/ui/stay-range-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InsightPanelTrigger } from "@/components/InsightPanel";
import { useAuth } from "@/hooks/useAuth";
import { applyAdminScope } from "@/lib/adminScope";
import { SalesRepDashboard } from "@/components/dashboard/SalesRepDashboard";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, differenceInDays, parseISO } from "date-fns";
import { CalendarIcon, CalendarDays, XCircle, Building2, Download, TrendingUp, TrendingDown, Percent, BedDouble, Search, MousePointerClick, HelpCircle } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, ComposedChart, Cell, ReferenceLine, PieChart, Pie } from "recharts";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { isRevenuePaymentStatus, isChannelSettled } from "@/lib/revenueStatuses";
import {
  addToOtbSplit,
  buildBookingCurve,
  daysBetween,
  emptyOtbSplit,
  forecastWithPickup,
  isDeadBooking,
  provisionalRealisationRate,
  stlyCutoff,
  summariseOtb,
  wasOnBooksAt,
  type OtbSplit,
  type PulseBookingLike,
} from "@/lib/pulseOnTheBooks";

// Colors for pie charts - using HSL values that work in both light/dark modes
const PIE_COLORS = [
  'hsl(142, 71%, 45%)', // green
  'hsl(217, 91%, 60%)', // blue  
  'hsl(38, 92%, 50%)',  // amber
  'hsl(0, 84%, 60%)',   // red
  'hsl(258, 90%, 66%)', // purple
  'hsl(330, 81%, 60%)', // pink
  'hsl(186, 94%, 41%)', // cyan
  'hsl(84, 81%, 44%)',  // lime
];

const Dashboard = () => {
  const { user, isAdmin, isDev, isFearlessLeader, isSalesRep, salesRepId, scopedPropertyIds } = useAuth();
  const [period, setPeriod] = useState("this_month");
  const [comparePrevYear, setComparePrevYear] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [selectedOwner, setSelectedOwner] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [propertySearch, setPropertySearch] = useState<string>("");
  const [drillDownDate, setDrillDownDate] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return {
      from: startOfMonth(now),
      to: endOfMonth(now),
    };
  });

  // Calculate if we should aggregate by month (for periods > 31 days)
  const shouldAggregateByMonth = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return false;
    return differenceInDays(dateRange.to, dateRange.from) > 31;
  }, [dateRange]);

  // Calculate previous year date range
  const prevYearDateRange = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return null;
    return {
      from: subYears(dateRange.from, 1),
      to: subYears(dateRange.to, 1),
    };
  }, [dateRange]);

  // Update date range when period changes
  const handlePeriodChange = (value: string) => {
    setPeriod(value);
    const now = new Date();
    
    switch (value) {
      case "today":
        setDateRange({ from: now, to: now });
        break;
      case "last_7_days":
        setDateRange({ from: subDays(now, 7), to: now });
        break;
      case "last_30_days":
        setDateRange({ from: subDays(now, 30), to: now });
        break;
      case "this_month":
        setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case "last_month":
        const lastMonth = subMonths(now, 1);
        setDateRange({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
        break;
      case "this_year":
        setDateRange({ from: startOfYear(now), to: endOfYear(now) });
        break;
      case "custom":
        break;
    }
  };

  // Fetch user profile
  const { data: profile } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Fetch trading properties with PMS data for distribution tracking. Only
  // properties flagged as trading (and not sandbox) may drive counts, occupancy
  // denominators, ADR and RevPAR — stale inventory would flatten every metric.
  const { data: properties = [] } = useQuery({
    queryKey: ["dashboard-properties", isAdmin, profile?.email, scopedPropertyIds.join(",")],
    queryFn: async () => {
      let query = supabase.from("properties").select("id, name, owner_email, owner_name, property_type, bedrooms, max_guests, external_system, created_at, is_active, is_trading, is_sandbox")
        .eq("is_active", true);
      // Unrestricted admins/owners only count trading inventory. A scoped IT
      // tester must still see Seesig + Tidal even if they are not flagged trading.
      if (scopedPropertyIds.length === 0) {
        query = query.eq("is_trading", true);
      }
      if (!isAdmin && profile?.email) {
        query = query.eq("owner_email", profile.email);
      }
      query = applyAdminScope(query, "id", scopedPropertyIds);
      const { data } = await query;
      return data || [];
    },
    enabled: !!user && (isAdmin || !!profile?.email),
  });


  // Real room inventory for active properties: cascade rolos_rooms → rolos_room_types → hostfully_room_types → bedrooms
  const activePropertyIds = useMemo(() => properties.map((p: any) => p.id), [properties]);
  const { data: roomsByProperty = new Map<string, number>() } = useQuery({
    queryKey: ["dashboard-rooms-by-property", activePropertyIds.join(",")],
    enabled: activePropertyIds.length > 0,
    queryFn: async () => {
      const [rr, rrt, hrt] = await Promise.all([
        supabase.from("rolos_rooms").select("property_id").in("property_id", activePropertyIds),
        supabase.from("rolos_room_types").select("property_id, is_active").in("property_id", activePropertyIds),
        supabase.from("hostfully_room_types").select("property_id").in("property_id", activePropertyIds),
      ]);
      const tally = (rows: any[] | null, filter?: (r: any) => boolean) => {
        const m = new Map<string, number>();
        (rows || []).forEach((r) => {
          if (filter && !filter(r)) return;
          m.set(r.property_id, (m.get(r.property_id) || 0) + 1);
        });
        return m;
      };
      const rrMap = tally(rr.data);
      const rrtMap = tally(rrt.data, (r) => r.is_active !== false);
      const hrtMap = tally(hrt.data);
      const bedroomsMap = new Map<string, number>(
        properties.map((p: any) => [p.id, Math.max(1, Number(p.bedrooms) || 1)]),
      );
      const out = new Map<string, number>();
      activePropertyIds.forEach((id) => {
        out.set(
          id,
          rrMap.get(id) || rrtMap.get(id) || hrtMap.get(id) || bedroomsMap.get(id) || 1,
        );
      });
      return out;
    },
  });


  // Fetch NightsBridge booking sessions (intent tracking)
  const { data: nbSessions = [] } = useQuery({
    queryKey: ["dashboard-nb-sessions", properties.map((p) => p.name).join(",")],
    queryFn: async () => {
      const lastMonthStart = startOfMonth(subMonths(new Date(), 1));
      
      const { data } = await supabase
        .from("nightsbridge_booking_sessions")
        .select("id, status, created_at, match_confidence, estimated_revenue, property_name")
        .gte("created_at", lastMonthStart.toISOString());
      const rows = data || [];
      if (scopedPropertyIds.length === 0) return rows;
      const allowed = new Set(properties.map((p) => (p.name ?? "").toLowerCase()).filter(Boolean));
      return rows.filter((s) => {
        const name = (s.property_name ?? "").toLowerCase();
        if (!name) return false;
        if (allowed.has(name)) return true;
        return [...allowed].some((n) => name.includes(n) || n.includes(name));
      });
    },
    enabled: isAdmin,
  });

  // NightsBridge session stats (intent tracking)
  const nbSessionStats = useMemo(() => {
    if (!isAdmin) return null;
    
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    
    const thisMonthSessions = nbSessions.filter(s => 
      s.created_at && parseISO(s.created_at) >= thisMonthStart
    );
    const lastMonthSessions = nbSessions.filter(s => {
      if (!s.created_at) return false;
      const d = parseISO(s.created_at);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });
    
    const pendingThisMonth = thisMonthSessions.filter(s => s.status === 'pending').length;
    const matchedThisMonth = thisMonthSessions.filter(s => s.status === 'matched').length;
    const expiredThisMonth = thisMonthSessions.filter(s => s.status === 'expired').length;
    
    const pendingLastMonth = lastMonthSessions.filter(s => s.status === 'pending').length;
    const matchedLastMonth = lastMonthSessions.filter(s => s.status === 'matched').length;
    
    const totalThisMonth = thisMonthSessions.length;
    const totalLastMonth = lastMonthSessions.length;
    const momChange = totalLastMonth > 0 
      ? ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100 
      : (totalThisMonth > 0 ? 100 : 0);
    
    // Estimated revenue from matched sessions
    const matchedRevenue = thisMonthSessions
      .filter(s => s.status === 'matched' && s.estimated_revenue)
      .reduce((sum, s) => sum + (s.estimated_revenue || 0), 0);
    
    // Property breakdown
    const byProperty = thisMonthSessions.reduce((acc, s) => {
      const name = s.property_name || 'Unknown';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const propertyBreakdown = Object.entries(byProperty)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    return {
      totalThisMonth,
      totalLastMonth,
      pendingThisMonth,
      matchedThisMonth,
      expiredThisMonth,
      momChange,
      matchedRevenue,
      conversionRate: totalThisMonth > 0 ? (matchedThisMonth / totalThisMonth) * 100 : 0,
      propertyBreakdown,
    };
  }, [nbSessions, isAdmin]);


  /**
   * Owners see the same full Property Pulse as admins — every query above is already
   * scoped to the properties they own, so revenue/occupancy/ADR figures are their own.
   */
  const showFullPulse = isAdmin || isDev || isFearlessLeader || properties.length > 0;

  // Unique owners and types for filter dropdowns
  const uniqueOwners = useMemo(() => {
    const owners = new Map<string, string>();
    properties.forEach(p => {
      const ownerKey = p.owner_email || '';
      if (ownerKey && !owners.has(ownerKey)) {
        owners.set(ownerKey, p.owner_name || p.owner_email?.split('@')[0] || 'Unknown');
      }
    });
    return Array.from(owners.entries()).map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [properties]);

  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    properties.forEach(p => {
      if (p.property_type) types.add(p.property_type);
    });
    return Array.from(types).sort();
  }, [properties]);

  // Filtered properties based on owner and type selection
  const filteredProperties = useMemo(() => {
    return properties.filter(p => {
      const ownerMatch = selectedOwner === "all" || p.owner_email === selectedOwner;
      const typeMatch = selectedType === "all" || p.property_type === selectedType;
      return ownerMatch && typeMatch;
    });
  }, [properties, selectedOwner, selectedType]);

  // Search-filtered properties for dropdown
  const searchFilteredProperties = useMemo(() => {
    if (!propertySearch.trim()) return filteredProperties;
    const query = propertySearch.toLowerCase();
    return filteredProperties.filter(p => p.name?.toLowerCase().includes(query));
  }, [filteredProperties, propertySearch]);

  // Filtered owners based on type selection
  const filteredOwners = useMemo(() => {
    if (selectedType === "all") return uniqueOwners;
    const ownersForType = new Set<string>();
    properties.filter(p => p.property_type === selectedType).forEach(p => {
      if (p.owner_email) ownersForType.add(p.owner_email);
    });
    return uniqueOwners.filter(o => ownersForType.has(o.email));
  }, [properties, uniqueOwners, selectedType]);

  // Filtered types based on owner selection  
  const filteredTypes = useMemo(() => {
    if (selectedOwner === "all") return uniqueTypes;
    const typesForOwner = new Set<string>();
    properties.filter(p => p.owner_email === selectedOwner).forEach(p => {
      if (p.property_type) typesForOwner.add(p.property_type);
    });
    return uniqueTypes.filter(t => typesForOwner.has(t));
  }, [properties, uniqueTypes, selectedOwner]);

  const propertyIds = useMemo(() => {
    if (selectedPropertyId !== "all") return [selectedPropertyId];
    return filteredProperties.map(p => p.id);
  }, [filteredProperties, selectedPropertyId]);

  /**
   * PMS reservations carry their settlements in a `payments` array rather than
   * the flat columns native bookings use. Normalising the cash here is what lets
   * the on-the-books view separate paid, deposit-only and unpaid business.
   */
  const normalizePmsReservation = useCallback((res: any) => {
    const total = Number(res.total_amount || 0);
    const paid = Array.isArray(res.payments)
      ? res.payments.reduce((sum: number, p: any) => {
          const amount = Number(p?.amount ?? p?.value ?? 0);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0)
      : 0;
    return {
      id: res.id,
      property_id: res.property_id,
      check_in_date: res.arrival_date,
      check_out_date: res.departure_date,
      total_price: total,
      status: (res.status || 'pending').toLowerCase(),
      guest_name: res.contact_name,
      guest_email: res.contact_email,
      created_at: res.created_at,
      amount_paid: paid,
      balance_due: Math.max(0, total - paid),
      payment_status: paid <= 0 ? 'unpaid' : paid + 0.01 >= total ? 'paid' : 'partial',
      source: 'pms',
    };
  }, []);

  // Fetch current period bookings (from both internal bookings and PMS reservations)
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["dashboard-bookings", propertyIds, dateRange],
    queryFn: async () => {
      if (propertyIds.length === 0) return [];
      const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
      const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
      
      // Fetch internal bookings — scoped by STAY date (arrival), not capture date,
      // so bulk historical imports never pile onto their import day.
      let internalQuery = supabase.from("bookings").select("*").in("property_id", propertyIds);
      if (fromDate) internalQuery = internalQuery.gte("check_in_date", fromDate);
      if (toDate) internalQuery = internalQuery.lte("check_in_date", toDate);
      
      // Fetch PMS reservations
      let pmsQuery = supabase.from("pms_reservations").select("*").in("property_id", propertyIds);
      if (fromDate) pmsQuery = pmsQuery.gte("arrival_date", fromDate);
      if (toDate) pmsQuery = pmsQuery.lte("arrival_date", toDate);

      
      const [internalResult, pmsResult] = await Promise.all([internalQuery, pmsQuery]);
      
      // Normalize PMS reservations to match booking structure
      const normalizedPmsBookings = (pmsResult.data || []).map(normalizePmsReservation);
      
      const internalBookings = (internalResult.data || []).map(b => ({ ...b, source: 'internal' }));
      
      return [...internalBookings, ...normalizedPmsBookings];
    },
    enabled: propertyIds.length > 0 && !!dateRange?.from,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Fetch previous year bookings (from both internal bookings and PMS reservations)
  const { data: prevYearBookings = [] } = useQuery({
    queryKey: ["dashboard-bookings-prev", propertyIds, prevYearDateRange, comparePrevYear],
    queryFn: async () => {
      if (propertyIds.length === 0 || !prevYearDateRange) return [];
      const fromDate = format(prevYearDateRange.from, "yyyy-MM-dd");
      const toDate = format(prevYearDateRange.to, "yyyy-MM-dd");
      
      // Fetch internal bookings
      let internalQuery = supabase.from("bookings").select("*").in("property_id", propertyIds);
      internalQuery = internalQuery.gte("check_in_date", fromDate).lte("check_in_date", toDate);
      
      // Fetch PMS reservations
      let pmsQuery = supabase.from("pms_reservations").select("*").in("property_id", propertyIds);
      pmsQuery = pmsQuery.gte("arrival_date", fromDate).lte("arrival_date", toDate);

      
      const [internalResult, pmsResult] = await Promise.all([internalQuery, pmsQuery]);
      
      // Normalize PMS reservations
      const normalizedPmsBookings = (pmsResult.data || []).map(normalizePmsReservation);
      
      const internalBookings = (internalResult.data || []).map(b => ({ ...b, source: 'internal' }));
      
      return [...internalBookings, ...normalizedPmsBookings];
    },
    enabled: propertyIds.length > 0 && comparePrevYear && !!prevYearDateRange,
  });

  /**
   * Booking-curve history: bookings that have already arrived, used to learn how
   * far ahead this portfolio sells. Without it, future periods could only be
   * forecast blind — the very problem that hid on-the-books business.
   */
  const { data: pickupHistory = [] } = useQuery({
    queryKey: ["dashboard-pickup-history", propertyIds],
    queryFn: async () => {
      if (propertyIds.length === 0) return [] as PulseBookingLike[];
      const today = format(new Date(), "yyyy-MM-dd");
      const from = format(subMonths(new Date(), 24), "yyyy-MM-dd");

      const [internalResult, pmsResult] = await Promise.all([
        supabase
          .from("bookings")
          .select("check_in_date, check_out_date, created_at, total_price, status")
          .in("property_id", propertyIds)
          .gte("check_in_date", from)
          .lt("check_in_date", today),
        supabase
          .from("pms_reservations")
          .select("arrival_date, departure_date, created_at, total_amount, status")
          .in("property_id", propertyIds)
          .gte("arrival_date", from)
          .lt("arrival_date", today),
      ]);

      const pms: PulseBookingLike[] = (pmsResult.data || []).map((res: any) => ({
        check_in_date: res.arrival_date,
        check_out_date: res.departure_date,
        created_at: res.created_at,
        total_price: res.total_amount || 0,
        status: (res.status || "pending").toLowerCase(),
      }));
      return [...((internalResult.data || []) as PulseBookingLike[]), ...pms];
    },
    enabled: propertyIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  /** How this portfolio sells: lead-time curve + provisional conversion rate. */
  const pickupModel = useMemo(
    () => ({
      curve: buildBookingCurve(pickupHistory),
      realisation: provisionalRealisationRate(pickupHistory),
    }),
    [pickupHistory],
  );

  // Filter bookings by selected property
  const filteredBookings = useMemo(() => {
    if (selectedPropertyId === "all") return bookings;
    return bookings.filter(b => b.property_id === selectedPropertyId);
  }, [bookings, selectedPropertyId]);

  const filteredPrevYearBookings = useMemo(() => {
    if (selectedPropertyId === "all") return prevYearBookings;
    return prevYearBookings.filter(b => b.property_id === selectedPropertyId);
  }, [prevYearBookings, selectedPropertyId]);

  // Calculate stats with KPIs
  const stats = useMemo(() => {
    const confirmedBookings = filteredBookings.filter(b => b.status === "confirmed").length;
    const pendingBookings = filteredBookings.filter(b => b.status === "pending").length;
    const cancelledBookings = filteredBookings.filter(b => b.status === "cancelled").length;
    const activeBookings = filteredBookings.filter(b => b.status !== "cancelled" && b.status !== "failed");
    const totalBookings = activeBookings.length;
    const totalRevenue = activeBookings.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
    
    // Calculate days in period
    const daysInPeriod = dateRange?.from && dateRange?.to 
      ? Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1) 
      : 1;
    
    // Calculate total rooms from real inventory (rolos_rooms / room_types / hostfully), excluding archived properties
    const relevantProperties = selectedPropertyId === "all"
      ? properties
      : properties.filter(p => p.id === selectedPropertyId);
    const totalRooms = relevantProperties.reduce((sum, p) => sum + (roomsByProperty.get(p.id) || 1), 0);
    
    // ADR (Average Daily Rate) = Revenue / Bookings
    const adr = activeBookings.length > 0 ? totalRevenue / activeBookings.length : 0;
    
    // Calculate total booked nights from check_in and check_out dates
    const bookedNights = activeBookings.reduce((sum, b) => {
      if (b.check_in_date && b.check_out_date) {
        const checkIn = new Date(b.check_in_date);
        const checkOut = new Date(b.check_out_date);
        return sum + Math.max(1, differenceInDays(checkOut, checkIn));
      }
      return sum + 1; // Default to 1 night if dates missing
    }, 0);
    
    // Available nights = Total Rooms * Days in Period
    const availableNights = totalRooms * daysInPeriod;
    
    // RevPAR (Revenue Per Available Room) = Revenue / Available Nights
    const revpar = availableNights > 0 ? totalRevenue / availableNights : 0;
    
    // Occupancy % = (Booked Nights / Available Nights) * 100
    const occupancy = availableNights > 0 ? (bookedNights / availableNights) * 100 : 0;
    
    // Previous year stats for Y-o-Y comparison
    const prevActiveBookings = filteredPrevYearBookings.filter(b => b.status !== "cancelled");
    const prevTotalBookings = filteredPrevYearBookings.length;
    const prevCancelledBookings = filteredPrevYearBookings.filter(b => b.status === "cancelled").length;
    const prevTotalRevenue = prevActiveBookings.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
    const prevAdr = prevActiveBookings.length > 0 ? prevTotalRevenue / prevActiveBookings.length : 0;
    const prevBookedNights = prevActiveBookings.reduce((sum, b) => {
      if (b.check_in_date && b.check_out_date) {
        const checkIn = new Date(b.check_in_date);
        const checkOut = new Date(b.check_out_date);
        return sum + Math.max(1, differenceInDays(checkOut, checkIn));
      }
      return sum + 1;
    }, 0);
    const prevOccupancy = availableNights > 0 ? (prevBookedNights / availableNights) * 100 : 0;
    const prevRevpar = availableNights > 0 ? prevTotalRevenue / availableNights : 0;
    
    // === On-the-books (future arrivals inside the period) ===
    // Business already sold for dates still to come. Reported separately so a
    // forward-looking period reads as "held" rather than "achieved".
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const futureArrivals = filteredBookings.filter(b => {
      if (!b.check_in_date) return false;
      return new Date(b.check_in_date) >= todayStart;
    });
    const otb = summariseOtb(futureArrivals as PulseBookingLike[]);
    const periodHasFuture = !!dateRange?.to && dateRange.to >= todayStart;

    // Y-o-Y % changes
    const calcYoY = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return ((current - prev) / prev) * 100;
    };

    // Pace (same-time-last-year) baseline: for forward-looking periods, compare
    // only against prior-year business that was already sold at the equivalent
    // point in the cycle. Comparing today's part-sold period against a fully
    // matured prior year would show a false collapse.
    const cutoff = stlyCutoff();
    const stlyBookings = filteredPrevYearBookings.filter(
      b => !isDeadBooking(b as PulseBookingLike) && wasOnBooksAt(b as PulseBookingLike, cutoff),
    );
    const stlyRevenue = stlyBookings.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
    const stlyNights = stlyBookings.reduce((sum, b) => {
      if (b.check_in_date && b.check_out_date) {
        return sum + Math.max(1, differenceInDays(new Date(b.check_out_date), new Date(b.check_in_date)));
      }
      return sum + 1;
    }, 0);
    const stlyAdr = stlyBookings.length > 0 ? stlyRevenue / stlyBookings.length : 0;
    const stlyOccupancy = availableNights > 0 ? (stlyNights / availableNights) * 100 : 0;
    const stlyRevpar = availableNights > 0 ? stlyRevenue / availableNights : 0;

    // Forward-looking periods compare pace-to-pace; settled periods compare final-to-final.
    const baseBookings = periodHasFuture ? stlyBookings.length : prevTotalBookings;
    const baseRevenue = periodHasFuture ? stlyRevenue : prevTotalRevenue;
    const baseAdr = periodHasFuture ? stlyAdr : prevAdr;
    const baseOccupancy = periodHasFuture ? stlyOccupancy : prevOccupancy;
    const baseRevpar = periodHasFuture ? stlyRevpar : prevRevpar;

    return {
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      totalRevenue,
      totalProperties: relevantProperties.length,
      totalRooms,
      daysInPeriod,
      adr,
      revpar,
      occupancy,
      bookedNights,
      availableNights,
      // On-the-books
      periodHasFuture,
      otbBookings: otb.bookings,
      otbFirmBookings: otb.firmBookings,
      otbProvisionalBookings: otb.provisionalBookings,
      otbRevenue: otb.revenue,
      otbFirmRevenue: otb.firmRevenue,
      otbProvisionalRevenue: otb.provisionalRevenue,
      otbPaid: otb.paid,
      otbDeposit: otb.deposit,
      otbOutstanding: otb.outstanding,
      otbNights: otb.nights,
      // Y-o-Y changes (pace-aware for forward-looking periods)
      yoyIsPace: periodHasFuture,
      yoyBookings: calcYoY(totalBookings, baseBookings),
      yoyCancellations: calcYoY(cancelledBookings, prevCancelledBookings),
      yoyRevenue: calcYoY(totalRevenue, baseRevenue),
      yoyAdr: calcYoY(adr, baseAdr),
      yoyRevpar: calcYoY(revpar, baseRevpar),
      yoyOccupancy: occupancy - baseOccupancy, // Absolute difference for occupancy
    };
  }, [filteredBookings, filteredPrevYearBookings, properties, roomsByProperty, dateRange, selectedPropertyId]);

  // Property breakdown for pie charts
  const propertyBreakdown = useMemo(() => {
    const breakdown = properties.map(p => {
      const propBookings = bookings.filter(b => b.property_id === p.id && b.status !== "cancelled");
      const revenue = propBookings.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
      return {
        name: p.name || "Unknown",
        bookings: propBookings.length,
        revenue,
      };
    }).filter(p => p.bookings > 0 || p.revenue > 0);
    
    return breakdown.sort((a, b) => b.revenue - a.revenue);
  }, [properties, bookings]);

  // Helper to get display status prioritizing payment info
  const getBookingDisplayStatus = (booking: any) => {
    // Payment status takes priority
    if (isRevenuePaymentStatus(booking.payment_status, false)) {
      return {
        label: isChannelSettled(booking.payment_status) ? "paid (channel)" : "paid",
        variant: "success",
      };
    }
    if (booking.payment_status === "pending") {
      return { label: "paying...", variant: "info" };
    }
    // Fall back to booking status
    if (booking.status === "confirmed") {
      return { label: "confirmed", variant: "success" };
    }
    if (booking.status === "cancelled") {
      return { label: "cancelled", variant: "error" };
    }
    if (booking.status === "failed") {
      return { label: "failed", variant: "error" };
    }
    return { label: "pending", variant: "warning" };
  };

  // Export chart data to CSV
  const exportToCSV = () => {
    if (chartData.length === 0) return;
    
    const headers = [
      "Date",
      "Label", 
      "Bookings",
      "Cancellations",
      "Revenue",
      "On The Books Bookings",
      "On The Books Revenue",
      "OTB Confirmed Revenue",
      "OTB Provisional Revenue",
      "OTB Paid",
      "OTB Deposit Only",
      "OTB Outstanding",
      "SMA Bookings (Trend)",
      "SMA Revenue (Trend)",
      "Forecast Bookings",
      "Forecast Bookings Upper 80%",
      "Forecast Bookings Lower 80%",
      "Forecast Bookings Upper 95%",
      "Forecast Bookings Lower 95%",
      "Forecast Revenue",
      "Forecast Revenue Upper 80%",
      "Forecast Revenue Lower 80%",
      "Forecast Revenue Upper 95%",
      "Forecast Revenue Lower 95%",
      ...(comparePrevYear ? ["Prev Year Bookings", "Prev Year Cancellations", "Prev Year Revenue", "STLY Bookings (pace)", "STLY Revenue (pace)"] : [])
    ];
    
    const rows = chartData.map(d => [
      d.date,
      d.label,
      d.bookings,
      d.cancellations,
      d.revenue,
      d.otbBookings ?? "",
      d.otbRevenue ?? "",
      d.otbFirmRevenue ?? "",
      d.otbProvisionalRevenue ?? "",
      d.otbPaid ?? "",
      d.otbDeposit ?? "",
      d.otbOutstanding ?? "",
      d.smaBookings ?? "",
      d.smaRevenue ?? "",
      d.forecastBookings ?? "",
      d.forecastBookingsUpper80 ?? "",
      d.forecastBookingsLower80 ?? "",
      d.forecastBookingsUpper95 ?? "",
      d.forecastBookingsLower95 ?? "",
      d.forecastRevenue ?? "",
      d.forecastRevenueUpper80 ?? "",
      d.forecastRevenueLower80 ?? "",
      d.forecastRevenueUpper95 ?? "",
      d.forecastRevenueLower95 ?? "",
      ...(comparePrevYear ? [d.prevBookings ?? "", d.prevCancellations ?? "", d.prevRevenue ?? "", d.stlyBookings ?? "", d.stlyRevenue ?? ""] : [])
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `dashboard-data-${format(dateRange?.from || new Date(), "yyyy-MM-dd")}-to-${format(dateRange?.to || new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  // Generate chart data
  // Simple Moving Average (12-period rolling mean for trend)
  // Handles early months by using available data (expanding window until period is reached)
  const calculateSMA = (values: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < values.length; i++) {
      // For early months, use expanding window (all available data up to current point)
      // Once we have enough data, use fixed rolling window
      const windowStart = Math.max(0, i - period + 1);
      const windowSize = i - windowStart + 1;
      const slice = values.slice(windowStart, i + 1);
      
      // Only show SMA if we have at least 2 data points
      if (windowSize >= 2) {
        const sum = slice.reduce((a, b) => a + b, 0);
        result.push(sum / windowSize);
      } else {
        result.push(null);
      }
    }
    return result;
  };

  // Holt-Winters Triple Exponential Smoothing (Additive Seasonality)
  // Returns forecast with both 80% and 95% confidence intervals that widen over time
  const holtWinters = (
    values: number[],
    seasonLength: number = 12,
    alpha: number = 0.3,  // level smoothing
    beta: number = 0.1,   // trend smoothing
    gamma: number = 0.3,  // seasonal smoothing
    forecastPeriods: number = 12
  ): { 
    forecast: number[]; 
    upper80: number[]; 
    lower80: number[];
    upper95: number[];
    lower95: number[];
  } => {
    const n = values.length;
    
    // Z-scores for confidence intervals
    const z80 = 1.28;  // 80% CI
    const z95 = 1.96;  // 95% CI
    
    if (n < seasonLength * 2) {
      // Not enough data for seasonal model, use simple exponential smoothing with trend
      const forecast: number[] = [];
      const avg = values.reduce((a, b) => a + b, 0) / n;
      
      // Calculate variance for confidence intervals
      const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / n;
      const stdDev = Math.sqrt(variance);
      
      // Simple trend estimate
      const trendSlope = n > 1 ? (values[n - 1] - values[0]) / (n - 1) : 0;
      const lastValue = values[n - 1] || avg;
      
      const upper80: number[] = [];
      const lower80: number[] = [];
      const upper95: number[] = [];
      const lower95: number[] = [];
      
      for (let i = 0; i < forecastPeriods; i++) {
        const forecastValue = lastValue + trendSlope * (i + 1);
        // Confidence intervals widen with sqrt of forecast horizon
        const errorGrowth = Math.sqrt(1 + (i + 1) * 0.15);
        const margin80 = z80 * stdDev * errorGrowth;
        const margin95 = z95 * stdDev * errorGrowth;
        
        forecast.push(Math.max(0, forecastValue));
        upper80.push(Math.max(0, forecastValue + margin80));
        lower80.push(Math.max(0, forecastValue - margin80));
        upper95.push(Math.max(0, forecastValue + margin95));
        lower95.push(Math.max(0, forecastValue - margin95));
      }
      
      return { forecast, upper80, lower80, upper95, lower95 };
    }

    // === Seasonal Decomposition ===
    // Initialize level (average of first season)
    let level = values.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
    
    // Initialize trend using least squares fit over first two seasons
    let trend = 0;
    if (n >= seasonLength * 2) {
      const firstSeasonAvg = values.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
      const secondSeasonAvg = values.slice(seasonLength, seasonLength * 2).reduce((a, b) => a + b, 0) / seasonLength;
      trend = (secondSeasonAvg - firstSeasonAvg) / seasonLength;
    }

    // Initialize seasonal factors using classical decomposition
    const seasonal: number[] = new Array(seasonLength).fill(0);
    const seasonalCounts: number[] = new Array(seasonLength).fill(0);
    
    // Compute detrended values and average by season index
    for (let i = 0; i < n; i++) {
      const seasonIdx = i % seasonLength;
      const detrended = values[i] - (level + trend * i);
      seasonal[seasonIdx] += detrended;
      seasonalCounts[seasonIdx]++;
    }
    
    // Normalize seasonal factors (should sum to 0 for additive model)
    for (let i = 0; i < seasonLength; i++) {
      seasonal[i] = seasonalCounts[i] > 0 ? seasonal[i] / seasonalCounts[i] : 0;
    }
    const seasonalSum = seasonal.reduce((a, b) => a + b, 0);
    const seasonalAdj = seasonalSum / seasonLength;
    for (let i = 0; i < seasonLength; i++) {
      seasonal[i] -= seasonalAdj;
    }

    // === Holt-Winters Recursion ===
    const residuals: number[] = [];
    const fittedValues: number[] = [];
    
    // Re-initialize for forward pass
    level = values.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
    
    for (let i = 0; i < n; i++) {
      const seasonIdx = i % seasonLength;
      
      if (i >= seasonLength) {
        const prevLevel = level;
        
        // Update level: deseasonalize current observation
        level = alpha * (values[i] - seasonal[seasonIdx]) + (1 - alpha) * (level + trend);
        
        // Update trend
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
        
        // Update seasonal factor
        seasonal[seasonIdx] = gamma * (values[i] - level) + (1 - gamma) * seasonal[seasonIdx];
        
        // Calculate fitted value and residual
        const fitted = prevLevel + trend + seasonal[seasonIdx];
        fittedValues.push(fitted);
        residuals.push(values[i] - fitted);
      }
    }

    // === Calculate Standard Error with degrees of freedom correction ===
    const df = Math.max(1, residuals.length - 3); // level, trend, seasonal params
    const mse = residuals.length > 0
      ? residuals.reduce((sum, r) => sum + r * r, 0) / df
      : Math.pow(values.reduce((a, b) => a + b, 0) / n * 0.2, 2);
    const stdError = Math.sqrt(mse);

    // === Generate Forecasts with Widening Confidence Intervals ===
    const forecast: number[] = [];
    const upper80: number[] = [];
    const lower80: number[] = [];
    const upper95: number[] = [];
    const lower95: number[] = [];
    
    for (let i = 0; i < forecastPeriods; i++) {
      const h = i + 1; // forecast horizon
      const seasonIdx = (n + i) % seasonLength;
      
      // Point forecast
      const forecastValue = level + h * trend + seasonal[seasonIdx];
      
      // Variance grows with forecast horizon (Holt-Winters variance formula)
      // σ²(h) = σ² * (1 + (h-1) * (α² + α*β*h + β²*h*(2h-1)/6 + γ²*(1 - (1-γ)^(2*⌊h/m⌋))/(1-(1-γ)²)))
      // Simplified approximation that captures widening uncertainty:
      const varianceMultiplier = 1 + 
        alpha * alpha * h + 
        beta * beta * h * (h + 1) / 2 + 
        (h > seasonLength ? gamma * gamma * Math.floor(h / seasonLength) : 0);
      
      const errorStd = stdError * Math.sqrt(Math.max(1, varianceMultiplier));
      
      forecast.push(Math.max(0, forecastValue));
      upper80.push(Math.max(0, forecastValue + z80 * errorStd));
      lower80.push(Math.max(0, forecastValue - z80 * errorStd));
      upper95.push(Math.max(0, forecastValue + z95 * errorStd));
      lower95.push(Math.max(0, forecastValue - z95 * errorStd));
    }

    return { forecast, upper80, lower80, upper95, lower95 };
  };

  /**
   * Revenue and volume belong to the STAY (arrival) date, never the capture date.
   * Bulk imports create hundreds of historical bookings on a single day, which
   * previously produced a single absurd revenue spike on the import day.
   */
  const stayDateOf = useCallback((b: { check_in_date?: string | null; created_at?: string | null }) => {
    const raw = b.check_in_date || b.created_at;
    return raw ? new Date(raw) : null;
  }, []);

  const chartData = useMemo(() => {

    if (!dateRange?.from || !dateRange?.to) return [];
    
    interface ChartDataPoint {
      date: string;
      label: string;
      bookings: number;
      revenue: number;
      cancellations: number;
      prevBookings?: number;
      prevRevenue?: number;
      prevCancellations?: number;
      smaBookings?: number | null;
      smaRevenue?: number | null;
      forecastBookings?: number | null;
      forecastRevenue?: number | null;
      // 80% Confidence Interval
      forecastBookingsUpper80?: number | null;
      forecastBookingsLower80?: number | null;
      forecastRevenueUpper80?: number | null;
      forecastRevenueLower80?: number | null;
      // 95% Confidence Interval (wider)
      forecastBookingsUpper95?: number | null;
      forecastBookingsLower95?: number | null;
      forecastRevenueUpper95?: number | null;
      forecastRevenueLower95?: number | null;
      // Gap detection
      isDataGap?: boolean;
      isInterpolated?: boolean;
      // On-the-books (future periods): business already sold for this date
      isFuture?: boolean;
      split?: OtbSplit;
      otbBookings?: number;
      otbRevenue?: number;
      otbFirmRevenue?: number;
      otbProvisionalRevenue?: number;
      otbPaid?: number;
      otbDeposit?: number;
      otbOutstanding?: number;
      /** Prior-year value at the equivalent point in the booking cycle. */
      stlyBookings?: number;
      stlyRevenue?: number;
    }
    
    const data: ChartDataPoint[] = [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const paceCutoff = stlyCutoff();
    
    if (shouldAggregateByMonth) {
      // Aggregate by month
      const monthsMap = new Map<string, ChartDataPoint>();
      const current = new Date(dateRange.from);
      const end = new Date(dateRange.to);
      
      // Initialize months
      while (current <= end) {
        const monthKey = format(current, "yyyy-MM");
        const label = format(current, "MMM yyyy");
        if (!monthsMap.has(monthKey)) {
          monthsMap.set(monthKey, {
            date: monthKey,
            label,
            bookings: 0,
            revenue: 0,
            cancellations: 0,
            prevBookings: 0,
            prevRevenue: 0,
            prevCancellations: 0,
            stlyBookings: 0,
            stlyRevenue: 0,
            isFuture: endOfMonth(current) > today,
            split: emptyOtbSplit(),
          });
        }
        current.setMonth(current.getMonth() + 1);
      }
      
      // Aggregate current bookings
      bookings.forEach(b => {
        const sd = stayDateOf(b);
        if (!sd) return;
        const monthKey = format(sd, "yyyy-MM");
        const entry = monthsMap.get(monthKey);
        if (entry) {
          if (b.status !== "cancelled") {
            entry.bookings++;
            entry.revenue += Number(b.total_price || 0);
            addToOtbSplit(entry.split!, b as PulseBookingLike);
          } else {
            entry.cancellations++;
          }
        }
      });
      
      // Aggregate previous year bookings
      if (comparePrevYear) {
        prevYearBookings.forEach(b => {
          const bookingDate = stayDateOf(b);
          if (!bookingDate) return;
          // Map to current year month
          const currentYearDate = new Date(bookingDate);
          currentYearDate.setFullYear(currentYearDate.getFullYear() + 1);
          const monthKey = format(currentYearDate, "yyyy-MM");
          const entry = monthsMap.get(monthKey);
          if (entry) {
            if (b.status !== "cancelled") {
              entry.prevBookings = (entry.prevBookings || 0) + 1;
              entry.prevRevenue = (entry.prevRevenue || 0) + Number(b.total_price || 0);
              // Same-time-last-year: only what had actually been sold by this
              // point in the prior year's cycle.
              if (wasOnBooksAt(b as PulseBookingLike, paceCutoff)) {
                entry.stlyBookings = (entry.stlyBookings || 0) + 1;
                entry.stlyRevenue = (entry.stlyRevenue || 0) + Number(b.total_price || 0);
              }
            } else {
              entry.prevCancellations = (entry.prevCancellations || 0) + 1;
            }
          }
        });
      }
      
      // Convert to array
      monthsMap.forEach(value => data.push(value));
      data.sort((a, b) => a.date.localeCompare(b.date));
      
    } else {
      // Aggregate by day
      const current = new Date(dateRange.from);
      const end = new Date(dateRange.to);
      
      while (current <= end) {
        const dateStr = format(current, "yyyy-MM-dd");
        const label = format(current, "MMM dd");
        const isFuture = current > today;
        
        const dayBookings = bookings.filter(b => 
          { const sd = stayDateOf(b); return !!sd && format(sd, "yyyy-MM-dd") === dateStr; }
        );
        
        // Future dates are no longer zeroed: what is already sold for that night
        // is real business and belongs on the chart.
        const liveBookings = dayBookings.filter(b => !isDeadBooking(b as PulseBookingLike));
        const split = summariseOtb(dayBookings as PulseBookingLike[]);
        
        const entry: ChartDataPoint = {
          date: dateStr,
          label,
          isFuture,
          split,
          bookings: liveBookings.length,
          revenue: split.revenue,
          cancellations: dayBookings.filter(b => b.status === "cancelled").length,
        };
        
        // Add previous year data
        if (comparePrevYear) {
          const prevYearDate = subYears(current, 1);
          const prevDateStr = format(prevYearDate, "yyyy-MM-dd");
          const prevDayBookings = prevYearBookings.filter(b => 
            { const sd = stayDateOf(b); return !!sd && format(sd, "yyyy-MM-dd") === prevDateStr; }
          );
          const prevLive = prevDayBookings.filter(b => b.status !== "cancelled");
          
          entry.prevBookings = prevLive.length;
          entry.prevRevenue = prevLive.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
          entry.prevCancellations = prevDayBookings.filter(b => b.status === "cancelled").length;
          
          const prevPace = prevLive.filter(b => wasOnBooksAt(b as PulseBookingLike, paceCutoff));
          entry.stlyBookings = prevPace.length;
          entry.stlyRevenue = prevPace.reduce((sum, b) => sum + Number(b.total_price || 0), 0);
        }
        
        data.push(entry);
        current.setDate(current.getDate() + 1);
      }
    }
    
    // Publish the OTB split as flat fields for the charts, tooltips and CSV.
    data.forEach(d => {
      const s = d.split || emptyOtbSplit();
      d.otbBookings = s.bookings;
      d.otbRevenue = Math.round(s.revenue);
      d.otbFirmRevenue = Math.round(s.firmRevenue);
      d.otbProvisionalRevenue = Math.round(s.provisionalRevenue);
      d.otbPaid = Math.round(s.paid);
      d.otbDeposit = Math.round(s.deposit);
      d.otbOutstanding = Math.round(s.outstanding);
    });
    
    // === Gap Detection and Interpolation ===
    // Detect consecutive zero periods (data gaps) in actual data
    const detectAndInterpolateGaps = (dataArray: ChartDataPoint[], maxGapToInterpolate: number = 2) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      // Find zero periods in actual data only
      for (let i = 0; i < dataArray.length; i++) {
        const d = dataArray[i];
        const isActual = new Date(d.date) <= today;
        
        if (isActual && d.bookings === 0 && d.revenue === 0) {
          d.isDataGap = true;
        }
      }
      
      // Find consecutive gaps and interpolate if gap size <= maxGapToInterpolate
      let gapStart = -1;
      for (let i = 0; i <= dataArray.length; i++) {
        const isGap = i < dataArray.length && dataArray[i].isDataGap;
        const isActual = i < dataArray.length && new Date(dataArray[i].date) <= today;
        
        if (isGap && isActual) {
          if (gapStart === -1) gapStart = i;
        } else {
          // End of gap or end of array
          if (gapStart !== -1) {
            const gapLength = i - gapStart;
            
            // Interpolate if gap is small enough and we have data on both sides
            if (gapLength <= maxGapToInterpolate && gapStart > 0 && i < dataArray.length) {
              const prevData = dataArray[gapStart - 1];
              const nextData = dataArray[i];
              
              // Linear interpolation for each gap point
              for (let j = gapStart; j < i; j++) {
                const ratio = (j - gapStart + 1) / (gapLength + 1);
                dataArray[j].bookings = Math.round(prevData.bookings + (nextData.bookings - prevData.bookings) * ratio);
                dataArray[j].revenue = Math.round(prevData.revenue + (nextData.revenue - prevData.revenue) * ratio);
                dataArray[j].isInterpolated = true;
                dataArray[j].isDataGap = false; // No longer a gap since we interpolated
              }
            }
          }
          gapStart = -1;
        }
      }
    };
    
    // If there is no live (non-cancelled) activity in the range, keep the chart
    // clean: no interpolation, no smoothing, no forecast. Synthetic trend lines
    // over an all-zero series are misleading.
    const hasLiveActivity = data.some(d => d.bookings > 0 || d.revenue > 0);
    if (!hasLiveActivity) {
      return data;
    }
    
    detectAndInterpolateGaps(data, 2); // Interpolate gaps of 1-2 periods
    
    // Apply forecasting - separate actual data from future projections
    const actualData = data.filter(d => new Date(d.date) <= today);
    const futureData = data.filter(d => new Date(d.date) > today);
    
    // For custom ranges that are entirely historical, we still want to show the trend
    const dataForAnalysis = actualData.length > 0 ? actualData : data;
    
    if (dataForAnalysis.length >= 3) {
      const bookingValues = dataForAnalysis.map(d => d.bookings);
      const revenueValues = dataForAnalysis.map(d => d.revenue);
      
      // Calculate SMA period based on data length and aggregation
      const smaPeriod = shouldAggregateByMonth 
        ? Math.min(12, Math.max(3, Math.floor(dataForAnalysis.length / 2))) 
        : Math.min(7, Math.max(3, Math.floor(dataForAnalysis.length / 2)));
      
      const smaBookings = calculateSMA(bookingValues, smaPeriod);
      const smaRevenue = calculateSMA(revenueValues, smaPeriod);
      
      // Apply SMA to all data points that have actuals
      dataForAnalysis.forEach((d, i) => {
        d.smaBookings = smaBookings[i];
        d.smaRevenue = smaRevenue[i];
      });
      
      // Calculate forecast - either for future periods or as projection from historical data
      const seasonLength = shouldAggregateByMonth ? Math.min(12, dataForAnalysis.length) : Math.min(7, dataForAnalysis.length);
      const forecastPeriods = futureData.length > 0 ? futureData.length : Math.max(3, Math.floor(dataForAnalysis.length / 3));
      
      const bookingForecast = holtWinters(bookingValues, seasonLength, 0.3, 0.1, 0.3, forecastPeriods);
      const revenueForecast = holtWinters(revenueValues, seasonLength, 0.3, 0.1, 0.3, forecastPeriods);
      
      if (futureData.length > 0) {
        // Connect forecast to last actual point
        const lastActual = actualData[actualData.length - 1];
        if (lastActual) {
          lastActual.forecastBookings = lastActual.bookings;
          lastActual.forecastRevenue = lastActual.revenue;
          lastActual.forecastBookingsUpper80 = lastActual.bookings;
          lastActual.forecastBookingsLower80 = lastActual.bookings;
          lastActual.forecastBookingsUpper95 = lastActual.bookings;
          lastActual.forecastBookingsLower95 = lastActual.bookings;
          lastActual.forecastRevenueUpper80 = lastActual.revenue;
          lastActual.forecastRevenueLower80 = lastActual.revenue;
          lastActual.forecastRevenueUpper95 = lastActual.revenue;
          lastActual.forecastRevenueLower95 = lastActual.revenue;
        }
        
        /**
         * Future periods = what we already hold + what history says still books.
         * The statistical model alone ignored on-the-books business, so a
         * heavily pre-sold month could be forecast below what was already paid
         * for. Uncertainty now applies to the pickup component only, and the
         * bands never fall below firm (confirmed) business.
         */
        const now = new Date();
        futureData.forEach((d, i) => {
          const arrival = d.date.length === 7 ? new Date(`${d.date}-01T00:00:00`) : new Date(`${d.date}T00:00:00`);
          const daysOut = Math.max(0, daysBetween(now, arrival));
          const split = d.split || emptyOtbSplit();

          const revenueView = forecastWithPickup({
            otb: split.revenue,
            firm: split.firmRevenue,
            daysOut,
            curve: pickupModel.curve,
            realisation: pickupModel.realisation,
            trend: revenueForecast.forecast[i] ?? null,
          });
          const bookingsView = forecastWithPickup({
            otb: split.bookings,
            firm: split.firmBookings,
            daysOut,
            curve: pickupModel.curve,
            realisation: pickupModel.realisation,
            trend: bookingForecast.forecast[i] ?? null,
          });

          // Pickup is the only uncertain part, and it gets less certain the
          // further out the arrival sits.
          const spread = Math.min(0.9, 0.3 + i * 0.04);
          const bandFor = (view: typeof revenueView, z: number) => {
            const sigma = view.pickup * spread;
            return {
              upper: view.forecast + z * sigma,
              lower: Math.max(view.floor, view.forecast - z * sigma),
            };
          };

          const rev80 = bandFor(revenueView, 1.28);
          const rev95 = bandFor(revenueView, 1.96);
          const bkg80 = bandFor(bookingsView, 1.28);
          const bkg95 = bandFor(bookingsView, 1.96);

          d.forecastBookings = Math.round(bookingsView.forecast);
          d.forecastBookingsUpper80 = Math.round(bkg80.upper);
          d.forecastBookingsLower80 = Math.round(bkg80.lower);
          d.forecastBookingsUpper95 = Math.round(bkg95.upper);
          d.forecastBookingsLower95 = Math.round(bkg95.lower);
          d.forecastRevenue = Math.round(revenueView.forecast);
          d.forecastRevenueUpper80 = Math.round(rev80.upper);
          d.forecastRevenueLower80 = Math.round(rev80.lower);
          d.forecastRevenueUpper95 = Math.round(rev95.upper);
          d.forecastRevenueLower95 = Math.round(rev95.lower);
        });
      } else if (dataForAnalysis.length > 0) {
        // For fully historical ranges, show extended trend/forecast line
        // Add forecast extension from the last data point
        const lastIdx = dataForAnalysis.length - 1;
        const extendedForecastCount = Math.min(forecastPeriods, Math.floor(dataForAnalysis.length / 2));
        
        // Apply forecast as an extension of the trend starting from ~60% into the data
        const forecastStartIdx = Math.floor(dataForAnalysis.length * 0.6);
        for (let i = forecastStartIdx; i < dataForAnalysis.length; i++) {
          const forecastIdx = i - forecastStartIdx;
          if (forecastIdx < bookingForecast.forecast.length) {
            dataForAnalysis[i].forecastBookings = Math.round(bookingForecast.forecast[forecastIdx] || 0);
            dataForAnalysis[i].forecastBookingsUpper80 = Math.round(bookingForecast.upper80[forecastIdx] || 0);
            dataForAnalysis[i].forecastBookingsLower80 = Math.round(bookingForecast.lower80[forecastIdx] || 0);
            dataForAnalysis[i].forecastBookingsUpper95 = Math.round(bookingForecast.upper95[forecastIdx] || 0);
            dataForAnalysis[i].forecastBookingsLower95 = Math.round(bookingForecast.lower95[forecastIdx] || 0);
            dataForAnalysis[i].forecastRevenue = Math.round(revenueForecast.forecast[forecastIdx] || 0);
            dataForAnalysis[i].forecastRevenueUpper80 = Math.round(revenueForecast.upper80[forecastIdx] || 0);
            dataForAnalysis[i].forecastRevenueLower80 = Math.round(revenueForecast.lower80[forecastIdx] || 0);
            dataForAnalysis[i].forecastRevenueUpper95 = Math.round(revenueForecast.upper95[forecastIdx] || 0);
            dataForAnalysis[i].forecastRevenueLower95 = Math.round(revenueForecast.lower95[forecastIdx] || 0);
          }
        }
      }
    }
    
    return data;
  }, [bookings, prevYearBookings, dateRange, comparePrevYear, shouldAggregateByMonth, stayDateOf, pickupModel]);

  return (
    <AppLayout>
      <PageHeader
        title="Property Pulse"
        subtitle={`${format(dateRange?.from || new Date(), "MMM yyyy")} · ${isAdmin ? "All properties" : `My ${properties.length === 1 ? "property" : "portfolio"}`}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Compare toggle */}
            <div className="flex items-center gap-1.5 bg-secondary/50 rounded px-2 py-1">
              <Switch
                id="compare-prev"
                checked={comparePrevYear}
                onCheckedChange={setComparePrevYear}
                className="scale-75"
              />
              <Label htmlFor="compare-prev" className="text-xs cursor-pointer whitespace-nowrap">
                Y-o-Y
              </Label>
            </div>
            
            <Select value={period} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[130px] h-7 text-xs">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today" className="text-xs">Today</SelectItem>
                <SelectItem value="last_7_days" className="text-xs">Last 7 days</SelectItem>
                <SelectItem value="last_30_days" className="text-xs">Last 30 days</SelectItem>
                <SelectItem value="this_month" className="text-xs">This month</SelectItem>
                <SelectItem value="last_month" className="text-xs">Last month</SelectItem>
                <SelectItem value="this_year" className="text-xs">This year</SelectItem>
                <SelectItem value="custom" className="text-xs">Custom range</SelectItem>
              </SelectContent>
            </Select>
            
            {period === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-7 text-xs px-2 justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>{format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yy")}</>
                      ) : format(dateRange.from, "MMM d, yy")
                    ) : <span>Pick dates</span>}
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
                    classNames={stayRangeCalendarClassNames()}
                  />
                </PopoverContent>
              </Popover>
            )}
            
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={exportToCSV} disabled={chartData.length === 0}>
              <Download className="h-3 w-3 mr-1" />
              CSV
            </Button>
          </div>
        }
      />

      {/* Filters Row - compact inline */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
          <Label className="text-xs font-medium text-muted-foreground">Type:</Label>
          <Select value={selectedType} onValueChange={(value) => {
            setSelectedType(value);
            if (selectedPropertyId !== "all") {
              const prop = properties.find(p => p.id === selectedPropertyId);
              if (prop && value !== "all" && prop.property_type !== value) {
                setSelectedPropertyId("all");
              }
            }
          }}>
            <SelectTrigger className="w-[110px] h-7 text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All types</SelectItem>
              {filteredTypes.map(type => (
                <SelectItem key={type} value={type} className="text-xs">
                  {type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label className="text-xs font-medium text-muted-foreground ml-2">Owner:</Label>
          <Select value={selectedOwner} onValueChange={(value) => {
            setSelectedOwner(value);
            if (selectedPropertyId !== "all") {
              const prop = properties.find(p => p.id === selectedPropertyId);
              if (prop && value !== "all" && prop.owner_email !== value) {
                setSelectedPropertyId("all");
              }
            }
          }}>
            <SelectTrigger className="w-[130px] h-7 text-xs">
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All owners</SelectItem>
              {filteredOwners.map(owner => (
                <SelectItem key={owner.email} value={owner.email} className="text-xs">
                  {owner.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label className="text-xs font-medium text-muted-foreground ml-2">Property:</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={propertySearch}
              onChange={(e) => setPropertySearch(e.target.value)}
              className="w-[100px] pl-6 h-7 text-xs"
            />
          </div>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-[180px] h-7 text-xs">
              <SelectValue placeholder="All properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All ({searchFilteredProperties.length})</SelectItem>
              {searchFilteredProperties.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sales Rep Dashboard */}
        {isSalesRep && salesRepId && (
          <div className="mb-6">
            <SalesRepDashboard salesRepId={salesRepId} />
          </div>
        )}

        {/* Stats Cards - Row 1 & 2 combined compact */}
        <div className={cn(
          "grid gap-2 mb-3",
          showFullPulse ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8" : "grid-cols-2"
        )}>
          <Card className="p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">Bookings</span>
              <CalendarDays className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold">{stats.totalBookings}</span>
              {comparePrevYear && stats.yoyBookings !== 0 && (
                <span className={cn(
                  "text-[9px] font-medium px-1 rounded flex items-center",
                  stats.yoyBookings > 0 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                )}>
                  {stats.yoyBookings > 0 ? "+" : ""}{stats.yoyBookings.toFixed(0)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="text-green-600">{stats.confirmedBookings}✓</span>
              <span className="text-yellow-600">{stats.pendingBookings}⏳</span>
            </div>
          </Card>

          <Card className="p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">Cancelled</span>
              <XCircle className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold">{stats.cancelledBookings}</span>
              {comparePrevYear && stats.yoyCancellations !== 0 && (
                <span className={cn(
                  "text-[9px] font-medium px-1 rounded flex items-center",
                  stats.yoyCancellations < 0 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                )}>
                  {stats.yoyCancellations > 0 ? "+" : ""}{stats.yoyCancellations.toFixed(0)}%
                </span>
              )}
            </div>
            <span className="text-[9px] text-muted-foreground">
              {stats.totalBookings > 0 ? `${((stats.cancelledBookings / stats.totalBookings) * 100).toFixed(0)}% rate` : "—"}
            </span>
          </Card>

          {showFullPulse && (
            <>
              <Card className="p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Revenue</span>
                  <span className="text-[10px] text-muted-foreground font-bold">R</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold">R{(stats.totalRevenue / 1000).toFixed(0)}k</span>
                  {comparePrevYear && stats.yoyRevenue !== 0 && (
                    <span className={cn(
                      "text-[9px] font-medium px-1 rounded",
                      stats.yoyRevenue > 0 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    )}>
                      {stats.yoyRevenue > 0 ? "+" : ""}{stats.yoyRevenue.toFixed(0)}%
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground">{stats.confirmedBookings + stats.pendingBookings} active</span>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Occupancy</span>
                  <Percent className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold">{stats.occupancy.toFixed(0)}%</span>
                  {comparePrevYear && stats.yoyOccupancy !== 0 && (
                    <span className={cn(
                      "text-[9px] font-medium px-1 rounded",
                      stats.yoyOccupancy > 0 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    )}>
                      {stats.yoyOccupancy > 0 ? "+" : ""}{stats.yoyOccupancy.toFixed(0)}pp
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground">{stats.bookedNights}/{stats.availableNights} nights</span>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground">ADR</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold">R{stats.adr.toFixed(0)}</span>
                  {comparePrevYear && stats.yoyAdr !== 0 && (
                    <span className={cn(
                      "text-[9px] font-medium px-1 rounded",
                      stats.yoyAdr > 0 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    )}>
                      {stats.yoyAdr > 0 ? "+" : ""}{stats.yoyAdr.toFixed(0)}%
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground">per booking</span>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground">RevPAR</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold">R{stats.revpar.toFixed(0)}</span>
                  {comparePrevYear && stats.yoyRevpar !== 0 && (
                    <span className={cn(
                      "text-[9px] font-medium px-1 rounded",
                      stats.yoyRevpar > 0 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    )}>
                      {stats.yoyRevpar > 0 ? "+" : ""}{stats.yoyRevpar.toFixed(0)}%
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground">{stats.totalRooms}×{stats.daysInPeriod}d</span>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Properties</span>
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                </div>
                <span className="text-lg font-bold">{stats.totalProperties}</span>
                <span className="text-[9px] text-muted-foreground block">{stats.totalRooms} rooms</span>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Nights</span>
                  <BedDouble className="h-3 w-3 text-muted-foreground" />
                </div>
                <span className="text-lg font-bold">{stats.bookedNights}</span>
                <span className="text-[9px] text-muted-foreground block">
                  avg {stats.totalBookings > 0 ? (stats.bookedNights / stats.totalBookings).toFixed(1) : 0}/bkg
                </span>
              </Card>
            </>
          )}
        </div>


        {/* Data Quality Warning - compact */}
        {chartData.some(d => d.isDataGap || d.isInterpolated) && (
          <div className="mb-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 text-xs">
              <XCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-amber-700 dark:text-amber-300">
                {chartData.filter(d => d.isDataGap).length} gaps
                {chartData.some(d => d.isInterpolated) && `, ${chartData.filter(d => d.isInterpolated).length} interpolated`}
              </span>
              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-red-500"></span>gap</span>
              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-amber-500"></span>est</span>
              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-green-500"></span>actual</span>
            </div>
          </div>
        )}

        {/* Charts Row - Bookings & Revenue */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">Bookings{shouldAggregateByMonth && " (Monthly)"}</span>
              {!bookingsLoading && chartData.length > 0 && !chartData.some(d => d.bookings > 0 || d.revenue > 0) && (
                <span className="text-[10px] text-muted-foreground">No live bookings in this period</span>
              )}
            </div>
            <div>
              {bookingsLoading ? (
                <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">Loading...</div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--destructive))' }} tickLine={false} allowDecimals={false} />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0]?.payload;
                        return (
                          <div className="bg-background border border-border rounded-lg p-2 text-xs shadow-lg">
                            <p className="font-medium mb-1">{label}</p>
                            {data?.isDataGap && <p className="text-red-500 font-medium">⚠ Data Gap</p>}
                            {data?.isInterpolated && <p className="text-amber-500 font-medium">~ Interpolated</p>}
                            {payload.map((entry: any, i: number) => (
                              <p key={i} style={{ color: entry.color }}>
                                {entry.name}: {entry.value}
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                      formatter={(value) => <span className="text-xs">{value}</span>}
                    />
                    {/* 95% Confidence interval - outer (lighter) */}
                    <Area yAxisId="left" type="monotone" dataKey="forecastBookingsUpper95" stroke="none" fill="#0ea5e9" fillOpacity={0.08} name="CI 95%" connectNulls={false} />
                    <Area yAxisId="left" type="monotone" dataKey="forecastBookingsLower95" stroke="none" fill="hsl(var(--background))" fillOpacity={1} connectNulls={false} legendType="none" />
                    {/* 80% Confidence interval - inner (darker) */}
                    <Area yAxisId="left" type="monotone" dataKey="forecastBookingsUpper80" stroke="none" fill="#0ea5e9" fillOpacity={0.18} name="CI 80%" connectNulls={false} />
                    <Area yAxisId="left" type="monotone" dataKey="forecastBookingsLower80" stroke="none" fill="hsl(var(--background))" fillOpacity={1} connectNulls={false} legendType="none" />
                    {/* Main data bars - highlight gaps/interpolated */}
                    <Bar 
                      yAxisId="left" 
                      dataKey="bookings" 
                      name="Bookings" 
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={(data) => data?.label && setDrillDownDate(data.label)}
                    >
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-bookings-${index}`} 
                          fill={entry.isDataGap ? "#ef4444" : entry.isInterpolated ? "#fbbf24" : "#22c55e"} 
                        />
                      ))}
                    </Bar>
                    <Bar yAxisId="right" dataKey="cancellations" name="Cancelled" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    {/* 12-period trend (SMA) - solid orange */}
                    <Line yAxisId="left" type="monotone" dataKey="smaBookings" name="Trend (SMA)" stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
                    {/* Previous year comparison - dotted amber */}
                    {comparePrevYear && <Line yAxisId="left" type="monotone" dataKey="prevBookings" name="Prev Year" stroke="#eab308" strokeWidth={2} strokeDasharray="3 3" dot={false} />}
                    {comparePrevYear && <Line yAxisId="right" type="monotone" dataKey="prevCancellations" name="Prev Cancelled" stroke="#f97316" strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.6} />}
                    {/* Seasonal forecast - dashed blue */}
                    <Line yAxisId="left" type="monotone" dataKey="forecastBookings" name="Forecast" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                  No booking data for this period
                </div>
              )}
            </div>
          </Card>

          {/* Revenue Chart */}
          {showFullPulse && (
            <Card className="p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">Revenue{shouldAggregateByMonth && " (Monthly)"}</span>
              </div>
              <div>
                {bookingsLoading ? (
                  <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">Loading...</div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} tickLine={false} tickFormatter={(v) => `R${v}`} />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0]?.payload;
                          return (
                            <div className="bg-background border border-border rounded p-1.5 text-[10px] shadow-lg">
                              <p className="font-medium mb-0.5">{label}</p>
                              {data?.isDataGap && <p className="text-red-500 font-medium">⚠ Gap</p>}
                              {data?.isInterpolated && <p className="text-amber-500 font-medium">~ Est</p>}
                              {payload.map((entry: any, i: number) => (
                                <p key={i} style={{ color: entry.color }}>
                                  {entry.name}: R{Number(entry.value).toLocaleString()}
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "9px", paddingTop: "4px" }} />
                      <Area type="monotone" dataKey="forecastRevenueUpper95" stroke="none" fill="#0ea5e9" fillOpacity={0.08} name="CI 95%" connectNulls={false} />
                      <Area type="monotone" dataKey="forecastRevenueLower95" stroke="none" fill="hsl(var(--background))" fillOpacity={1} connectNulls={false} legendType="none" />
                      <Area type="monotone" dataKey="forecastRevenueUpper80" stroke="none" fill="#0ea5e9" fillOpacity={0.18} name="CI 80%" connectNulls={false} />
                      <Area type="monotone" dataKey="forecastRevenueLower80" stroke="none" fill="hsl(var(--background))" fillOpacity={1} connectNulls={false} legendType="none" />
                      <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]} cursor="pointer" onClick={(data) => data?.label && setDrillDownDate(data.label)}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-revenue-${index}`} fill={entry.isDataGap ? "#ef4444" : entry.isInterpolated ? "#fbbf24" : "#22c55e"} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="smaRevenue" name="Trend" stroke="#f97316" strokeWidth={1.5} dot={false} connectNulls />
                      {comparePrevYear && <Line type="monotone" dataKey="prevRevenue" name="Prev" stroke="#eab308" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />}
                      <Line type="monotone" dataKey="forecastRevenue" name="Forecast" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                    No revenue data
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Bookings Row - Recent & NB Attempts */}
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Recent Bookings - compact */}
          <Card className="p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">
                Recent{drillDownDate && <span className="text-muted-foreground ml-1">— {drillDownDate}</span>}
              </span>
              {drillDownDate && (
                <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => setDrillDownDate(null)}>
                  <XCircle className="h-3 w-3 mr-0.5" />Clear
                </Button>
              )}
            </div>
            <div>
              {(() => {
                let displayBookings = filteredBookings.filter(b => b.status !== "cancelled" && b.status !== "failed");
                if (drillDownDate) {
                  displayBookings = displayBookings.filter(b => {
                    const bookingDate = stayDateOf(b) || new Date();
                    const matchDate = shouldAggregateByMonth
                      ? format(bookingDate, "MMM yyyy") === drillDownDate
                      : format(bookingDate, "MMM d") === drillDownDate;
                    return matchDate;
                  });
                }
                
                return displayBookings.length > 0 ? (
                  <div className="space-y-1">
                    {[...displayBookings]
                      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                      .slice(0, drillDownDate ? 15 : 4)
                      .map((booking) => {
                      const property = properties.find(p => p.id === booking.property_id);
                      return (
                        <div key={booking.id} className="flex items-center justify-between p-1.5 rounded border border-border text-xs">
                          <div>
                            <span className="font-medium">{booking.guest_name}</span>
                            <span className="text-muted-foreground ml-1 text-[10px]">{property?.name || "Unknown"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">R{Number(booking.total_price).toLocaleString()}</span>
                            {(() => {
                              const displayStatus = getBookingDisplayStatus(booking);
                              return (
                                <span className={cn(
                                  "text-[10px] px-1 rounded",
                                  displayStatus.variant === "success" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
                                  displayStatus.variant === "info" && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
                                  displayStatus.variant === "warning" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
                                  displayStatus.variant === "error" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                                )}>
                                  {displayStatus.label}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                    {drillDownDate && displayBookings.length > 15 && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        +{displayBookings.length - 15} more
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-xs text-muted-foreground py-4">
                    {drillDownDate ? `No bookings for ${drillDownDate}` : "No bookings"}
                  </div>
                );
              })()}
            </div>
          </Card>

          {/* NightsBridge Booking Attempts - Intent Tracking (admin only) */}
          {isAdmin && nbSessionStats && (
            <Card className="p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">NB Booking Attempts</span>
                  <TooltipProvider delayDuration={100}>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        <p className="font-medium mb-1">Booking Intent Tracking</p>
                        <p className="text-muted-foreground">
                          Counts users who clicked "Book Now" for NightsBridge properties. 
                          These are <strong>potential bookings</strong>, not confirmed reservations. 
                          Actual booking data requires NightsBridge API access (50+ properties).
                        </p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
              </div>
              
              {/* Total count with MoM */}
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-2xl font-bold">{nbSessionStats.totalThisMonth}</span>
                <span className="text-xs text-muted-foreground">this month</span>
                {nbSessionStats.momChange !== 0 && (
                  <span className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded",
                    nbSessionStats.momChange > 0 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                  )}>
                    {nbSessionStats.momChange > 0 ? "+" : ""}{nbSessionStats.momChange.toFixed(0)}% MoM
                  </span>
                )}
              </div>
              
              {/* Status breakdown */}
              <div className="flex items-center gap-3 text-xs mb-3 pb-2 border-b border-border">
                <span className="flex items-center gap-1 text-yellow-600">
                  <span className="font-medium">{nbSessionStats.pendingThisMonth}</span>
                  <span className="text-muted-foreground">pending ⏳</span>
                </span>
                <span className="flex items-center gap-1 text-green-600">
                  <span className="font-medium">{nbSessionStats.matchedThisMonth}</span>
                  <span className="text-muted-foreground">matched ✓</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-medium text-muted-foreground">{nbSessionStats.expiredThisMonth}</span>
                  <span className="text-muted-foreground">expired ✗</span>
                </span>
              </div>
              
              {/* Property breakdown */}
              {nbSessionStats.propertyBreakdown.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">By Property</span>
                  <div className="mt-1 space-y-0.5">
                    {nbSessionStats.propertyBreakdown.slice(0, 5).map((p) => (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <span className="truncate max-w-[140px]">{p.name}</span>
                        <span className="font-medium">{p.count}</span>
                      </div>
                    ))}
                    {nbSessionStats.propertyBreakdown.length > 5 && (
                      <p className="text-[10px] text-muted-foreground">
                        +{nbSessionStats.propertyBreakdown.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Property Breakdown Pie Charts - compact */}
        {showFullPulse && propertyBreakdown.length > 1 && selectedPropertyId === "all" && (
          <div className="grid gap-3 lg:grid-cols-2 mt-3">
            <Card className="p-2">
              <span className="text-xs font-medium">Revenue by Property</span>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={propertyBreakdown}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? '..' : ''} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {propertyBreakdown.map((_, index) => (
                      <Cell key={`cell-rev-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`R${value.toLocaleString()}`, 'Rev']}
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "4px",
                      fontSize: "10px"
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-2">
              <span className="text-xs font-medium">Bookings by Property</span>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={propertyBreakdown}
                    dataKey="bookings"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? '..' : ''} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {propertyBreakdown.map((_, index) => (
                      <Cell key={`cell-book-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [value, 'Bookings']}
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "4px",
                      fontSize: "10px"
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

      {/* Floating AI Insight Panel */}
      <InsightPanelTrigger 
        onAnalyze={async (prompt) => {
          try {
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-insights`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                prompt,
                dashboardData: {
                  stats,
                  chartData,
                  propertyBreakdown,
                  conversionData: nbSessionStats ? {
                    totalThisMonth: nbSessionStats.totalThisMonth,
                    matchedThisMonth: nbSessionStats.matchedThisMonth,
                    pendingThisMonth: nbSessionStats.pendingThisMonth,
                    expiredThisMonth: nbSessionStats.expiredThisMonth,
                    momChange: nbSessionStats.momChange,
                    conversionRate: nbSessionStats.totalThisMonth > 0
                      ? (nbSessionStats.matchedThisMonth / nbSessionStats.totalThisMonth) * 100
                      : 0,
                  } : undefined,
                },
              }),
            });
            
            if (!response.ok) {
              const data = await response.json();
              if (response.status === 429) {
                toast.error("Rate limit exceeded. Please try again later.");
              } else if (response.status === 402) {
                toast.error("TOBI is temporarily unavailable — credits exhausted.");
              } else {
                toast.error(data.error || "Failed to get TOBI insight");
              }
              return null;
            }
            
            const data = await response.json();
            return data.insight;
          } catch (error) {
            console.error("AI insight error:", error);
            toast.error("Failed to get TOBI insight");
            return null;
          }
        }}
      />
    </AppLayout>
  );
};

export default Dashboard;
