import React, { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, ChevronsLeft, ChevronsRight, Building2, AlertCircle, Loader2, Cloud, CloudOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BulkRateRuleDialog } from "@/components/BulkRateRuleDialog";
import { BulkAvailabilityRuleDialog } from "@/components/BulkAvailabilityRuleDialog";
import { BulkStopSellDialog } from "@/components/BulkStopSellDialog";
import { BulkMinimumStayDialog } from "@/components/BulkMinimumStayDialog";
import { BulkMaximumStayDialog } from "@/components/BulkMaximumStayDialog";
import { BulkLeadDaysAdvanceDialog } from "@/components/BulkLeadDaysAdvanceDialog";
import { BulkLeadDaysPostDialog } from "@/components/BulkLeadDaysPostDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from "date-fns";

interface Property {
  id: string;
  name: string;
  amenities: any;
  owner_email: string | null;
  external_system: string | null;
  external_id: string | null;
  benson_property_code: string | null;
  checkfront_property_code: string | null;
  siteminder_property_code: string | null;
}

interface PMSRoomTypeData {
  roomTypeId: string;
  roomTypeName: string;
  availabilityByDate: { [date: string]: number };
  ratesByDate: { 
    [date: string]: { 
      rateTypeId: string;
      rateTypeName: string;
      priceType: string;
      roomAmount: number;
      adultAmounts?: { [key: string]: number };
    }[] 
  };
  restrictionsByDate: {
    [date: string]: {
      minStay?: number;
      maxStay?: number;
      closedToArrival?: boolean;
      closedToDeparture?: boolean;
      stopSell?: boolean;
      leadDaysAdvance?: number;
      leadDaysPost?: number;
    };
  };
}

interface PMSData {
  roomTypes: PMSRoomTypeData[];
  lastSynced: Date | null;
  systemType: string;
}

type PMSSyncStatus = "idle" | "loading" | "success" | "error" | "not_configured" | "no_property_code";

const displayOptions = [
  { id: "stop_sell", label: "Stop Sell", color: "bg-red-500" },
  { id: "rates", label: "Rates", color: "bg-gray-500" },
  { id: "lead_days_advance", label: "Lead Days Advance", color: "bg-yellow-500" },
  { id: "lead_days_post", label: "Lead Days Post", color: "bg-orange-500" },
  { id: "max_stay", label: "Max Stay", color: "bg-pink-500" },
  { id: "min_stay", label: "Min Stay", color: "bg-blue-500" },
];

// South African Public Holidays (including observed days when holiday falls on Sunday)
const getSouthAfricanHolidays = (year: number): { [key: string]: string } => {
  const holidays: { [key: string]: string } = {
    [`${year}-01-01`]: "New Year's Day",
    [`${year}-03-21`]: "Human Rights Day",
    [`${year}-04-27`]: "Freedom Day",
    [`${year}-05-01`]: "Workers' Day",
    [`${year}-06-16`]: "Youth Day",
    [`${year}-08-09`]: "National Women's Day",
    [`${year}-09-24`]: "Heritage Day",
    [`${year}-12-16`]: "Day of Reconciliation",
    [`${year}-12-25`]: "Christmas Day",
    [`${year}-12-26`]: "Day of Goodwill",
  };
  
  // Easter dates (approximate - Good Friday and Family Day)
  // 2024: March 29 (Good Friday), April 1 (Family Day)
  // 2025: April 18 (Good Friday), April 21 (Family Day)
  // 2026: April 3 (Good Friday), April 6 (Family Day)
  const easterDates: { [key: number]: { goodFriday: string; familyDay: string } } = {
    2024: { goodFriday: "2024-03-29", familyDay: "2024-04-01" },
    2025: { goodFriday: "2025-04-18", familyDay: "2025-04-21" },
    2026: { goodFriday: "2026-04-03", familyDay: "2026-04-06" },
    2027: { goodFriday: "2027-03-26", familyDay: "2027-03-29" },
  };
  
  if (easterDates[year]) {
    holidays[easterDates[year].goodFriday] = "Good Friday";
    holidays[easterDates[year].familyDay] = "Family Day";
  }
  
  return holidays;
};

const getHolidayName = (date: Date): string | null => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const holidays = getSouthAfricanHolidays(year);
  return holidays[dateStr] || null;
};

interface AvailabilityData {
  available: number;
  stopSell?: boolean;
  minStay?: number;
  maxStay?: number;
  leadDaysAdvance?: number;
  leadDaysPost?: number;
}

interface RoomData {
  name: string;
  rates: {
    rateType: string;
    mealType: string;
    values: { [date: string]: number };
  }[];
  availability: { [date: string]: number | AvailabilityData };
}

const CalendarAccommodation = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>(searchParams.get("property") || "");
const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bulkRateOpen, setBulkRateOpen] = useState(false);
  const [bulkAvailabilityOpen, setBulkAvailabilityOpen] = useState(false);
  const [stopSellOpen, setStopSellOpen] = useState(false);
  const [minStayOpen, setMinStayOpen] = useState(false);
  const [maxStayOpen, setMaxStayOpen] = useState(false);
  const [leadDaysAdvanceOpen, setLeadDaysAdvanceOpen] = useState(false);
  const [leadDaysPostOpen, setLeadDaysPostOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  // Multi-select states - all true by default
  const [selectedDisplayOptions, setSelectedDisplayOptions] = useState<string[]>(
    displayOptions.map(o => o.id)
  );
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedMealTypes, setSelectedMealTypes] = useState<string[]>([]);

  // PMS sync state
  const [pmsData, setPmsData] = useState<PMSData>({ roomTypes: [], lastSynced: null, systemType: "" });
  const [pmsSyncStatus, setPmsSyncStatus] = useState<PMSSyncStatus>("idle");
  const [pmsSyncError, setPmsSyncError] = useState<string>("");
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const selectedPropertyData = properties.find(p => p.id === selectedProperty);
  const hasAccommodation = selectedPropertyData?.amenities?.offerings?.accommodation === true;
  const hasEventWedding = selectedPropertyData?.amenities?.offerings?.event_wedding === true;
  const hasConference = selectedPropertyData?.amenities?.offerings?.conference === true;

  // Get meal types from property amenities
  const mealTypeOptions = React.useMemo(() => {
    if (!selectedPropertyData?.amenities?.meal_types) return [];
    const mealTypes = selectedPropertyData.amenities.meal_types as string[];
    return mealTypes.map(mt => ({
      id: mt.toLowerCase().replace(/ /g, "_"),
      label: mt
    }));
  }, [selectedPropertyData]);

  useEffect(() => {
    checkUserRoleAndFetchProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      fetchRoomTypes(selectedProperty);
      setSearchParams({ property: selectedProperty });
    }
  }, [selectedProperty]);

  // Set all room types selected when roomTypes changes
  useEffect(() => {
    if (roomTypes.length > 0) {
      setSelectedRoomTypes(roomTypes.map(r => r.name || r));
    }
  }, [roomTypes]);

  // Set all meal types selected when mealTypeOptions changes
  useEffect(() => {
    if (mealTypeOptions.length > 0) {
      setSelectedMealTypes(mealTypeOptions.map(m => m.id));
    }
  }, [mealTypeOptions.length]);

  // PMS-agnostic: get property code based on connected system
  const getPmsPropertyCode = useCallback((property: Property | undefined): string | null => {
    if (!property?.external_system) return null;
    switch (property.external_system) {
      case "benson": return property.benson_property_code;
      case "checkfront": return property.checkfront_property_code;
      case "siteminder": return property.siteminder_property_code;
      case "nightsbridge": return property.external_id;
      case "semper": return property.external_id;
      case "mews": return property.external_id;
      case "opera": return property.external_id;
      default: return property.external_id; // Fallback to external_id for other systems
    }
  }, []);

  const isPmsProperty = !!selectedPropertyData?.external_system;
  const pmsPropertyCode = getPmsPropertyCode(selectedPropertyData);
  const hasPmsPropertyCode = !!pmsPropertyCode;

  // Fetch PMS availability (system-agnostic)
  const fetchPmsAvailability = useCallback(async () => {
    if (!selectedPropertyData?.external_system) {
      setPmsSyncStatus("idle");
      return;
    }

    if (!hasPmsPropertyCode) {
      setPmsSyncStatus("no_property_code");
      setPmsSyncError(`No ${selectedPropertyData.external_system} property code configured`);
      return;
    }

    setPmsSyncStatus("loading");
    setPmsSyncError("");

    try {
      // Calculate date range based on current view
      const startDate = new Date(currentDate);
      if (viewMode === "month") {
        startDate.setDate(1);
      } else {
        const day = startDate.getDay();
        const diff = day === 6 ? 0 : -(day + 1);
        startDate.setDate(startDate.getDate() + diff);
      }

      const endDate = new Date(startDate);
      if (viewMode === "month") {
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
      } else {
        endDate.setDate(endDate.getDate() + 8);
      }

      // Route to appropriate edge function based on PMS
      const edgeFunction = `${selectedPropertyData.external_system}-api`;
      
      const { data, error } = await supabase.functions.invoke(edgeFunction, {
        body: {
          action: "fetch_availability",
          property_id: selectedPropertyData.id,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to fetch availability");
      }

      if (data?.error) {
        if (data.error.includes("credentials") || data.error.includes("not configured")) {
          setPmsSyncStatus("not_configured");
          setPmsSyncError(`${selectedPropertyData.external_system} API credentials not configured. Please configure them in Admin > API Keys.`);
        } else {
          setPmsSyncStatus("error");
          setPmsSyncError(data.error);
        }
        return;
      }

      // Transform Benson/PMS data into unified format
      const transformedData: PMSRoomTypeData[] = [];
      
      if (data?.roomTypes && Array.isArray(data.roomTypes)) {
        for (const roomType of data.roomTypes) {
          const roomData: PMSRoomTypeData = {
            roomTypeId: roomType.roomTypeId?.toString() || "",
            roomTypeName: roomType.roomTypeName || roomType.name || `Room ${roomType.roomTypeId}`,
            availabilityByDate: {},
            ratesByDate: {},
            restrictionsByDate: {},
          };

          // Map availability per night
          if (roomType.roomsAvailablePerNight && Array.isArray(roomType.roomsAvailablePerNight)) {
            for (const avail of roomType.roomsAvailablePerNight) {
              const dateStr = avail.date;
              roomData.availabilityByDate[dateStr] = avail.numberOfRoomsAvailable ?? 0;
              
              // Map restrictions if present
              if (avail.blockedRooms || avail.restrictions) {
                roomData.restrictionsByDate[dateStr] = {
                  stopSell: avail.stopSell || false,
                  minStay: avail.minimumStay,
                  maxStay: avail.maximumStay,
                  closedToArrival: avail.closedToArrival || false,
                  closedToDeparture: avail.closedToDeparture || false,
                };
              }
            }
          }

          // Map rates
          if (roomType.rateTypes && Array.isArray(roomType.rateTypes)) {
            for (const rateType of roomType.rateTypes) {
              if (rateType.rates && Array.isArray(rateType.rates)) {
                for (const rate of rateType.rates) {
                  const dateStr = rate.date;
                  if (!roomData.ratesByDate[dateStr]) {
                    roomData.ratesByDate[dateStr] = [];
                  }
                  roomData.ratesByDate[dateStr].push({
                    rateTypeId: rateType.rateTypeId?.toString() || "",
                    rateTypeName: rateType.name || `Rate ${rateType.rateTypeId}`,
                    priceType: rateType.priceType || "UnitRate",
                    roomAmount: rate.roomAmount || 0,
                    adultAmounts: rate.adultAmount1 ? {
                      adultAmount1: rate.adultAmount1,
                      adultAmount2: rate.adultAmount2,
                      adultAmount3: rate.adultAmount3,
                      adultAmount4: rate.adultAmount4,
                    } : undefined,
                  });
                }
              }
            }
          }

          transformedData.push(roomData);
        }
      }

      setPmsData({
        roomTypes: transformedData,
        lastSynced: new Date(),
        systemType: selectedPropertyData.external_system,
      });
      setPmsSyncStatus("success");
      setLastSyncTime(new Date());

      toast({
        title: "Availability Synced",
        description: `Successfully fetched data from ${selectedPropertyData.external_system}`,
      });
    } catch (err: any) {
      console.error(`Error fetching ${selectedPropertyData?.external_system} availability:`, err);
      setPmsSyncStatus("error");
      setPmsSyncError(err.message || "Failed to fetch availability");
      toast({
        title: "Sync Failed",
        description: err.message || "Failed to fetch availability",
        variant: "destructive",
      });
    }
  }, [selectedPropertyData, hasPmsPropertyCode, currentDate, viewMode, toast]);

  // Trigger PMS sync when property or date changes
  useEffect(() => {
    if (selectedProperty && isPmsProperty) {
      fetchPmsAvailability();
    } else {
      setPmsSyncStatus("idle");
      setPmsData({ roomTypes: [], lastSynced: null, systemType: "" });
    }
  }, [selectedProperty, currentDate, viewMode, isPmsProperty]);

  const checkUserRoleAndFetchProperties = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      const adminStatus = !!roleData;
      setIsAdmin(adminStatus);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();

      const email = profileData?.email || "";
      setUserEmail(email);

      await fetchProperties(adminStatus, email);
    } catch (error) {
      console.error("Error checking user role:", error);
      toast({
        title: "Error",
        description: "Failed to verify user permissions",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const fetchProperties = async (adminStatus: boolean, email: string) => {
    try {
      let query = supabase
        .from("properties")
        .select("id, name, amenities, owner_email, external_system, external_id, benson_property_code, checkfront_property_code, siteminder_property_code")
        .eq("is_active", true);

      if (!adminStatus && email) {
        query = query.eq("owner_email", email);
      }

      const { data, error } = await query.order("name");

      if (error) throw error;

      const accommodationProperties = (data || []).filter((property: any) => {
        return property.amenities?.offerings?.accommodation === true;
      });

      setProperties(accommodationProperties);

      const urlProperty = searchParams.get("property");
      if (urlProperty && accommodationProperties.find((p: Property) => p.id === urlProperty)) {
        setSelectedProperty(urlProperty);
      }
    } catch (error) {
      console.error("Error fetching properties:", error);
      toast({
        title: "Error",
        description: "Failed to load properties",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Build dynamic room data from property's room types and meal types
  const calendarRoomData = React.useMemo(() => {
    if (!selectedPropertyData?.amenities?.room_types) return [];
    
    const propRoomTypes = selectedPropertyData.amenities.room_types as any[] || [];
    const propMealTypes = selectedPropertyData.amenities.meal_types as string[] || [];
    
    return propRoomTypes.map(room => ({
      name: room.name || "Unnamed Room",
      rates: propMealTypes.map(mealType => ({
        rateType: room.rateType || "Standard",
        mealType: mealType,
        values: {} as { [date: string]: number }
      })),
      availability: {} as { [date: string]: number | AvailabilityData }
    }));
  }, [selectedPropertyData]);

  const fetchRoomTypes = async (propertyId: string) => {
    try {
      // Room types are now derived from selectedPropertyData.amenities.room_types
      // This function triggers a re-render which will recalculate calendarRoomData
      const property = properties.find(p => p.id === propertyId);
      if (property?.amenities?.room_types) {
        const roomTypesFromProperty = property.amenities.room_types as any[];
        setRoomTypes(roomTypesFromProperty.map(r => ({ name: r.name || "Unnamed Room" })));
      } else {
        setRoomTypes([]);
      }
    } catch (error) {
      console.error("Error fetching room types:", error);
      setRoomTypes([]);
    }
  };

  const handlePropertyChange = (propertyId: string) => {
    setSelectedProperty(propertyId);
  };

  const navigateToTab = (tab: string) => {
    const params = selectedProperty ? `?property=${selectedProperty}` : "";
    if (tab === "event") {
      navigate(`/admin/calendar/event-wedding${params}`);
    } else if (tab === "conference") {
      navigate(`/admin/calendar/conference${params}`);
    }
  };

  const toggleDisplayOption = (optionId: string) => {
    setSelectedDisplayOptions(prev =>
      prev.includes(optionId)
        ? prev.filter(id => id !== optionId)
        : [...prev, optionId]
    );
  };

  const toggleRoomType = (roomName: string) => {
    setSelectedRoomTypes(prev =>
      prev.includes(roomName)
        ? prev.filter(name => name !== roomName)
        : [...prev, roomName]
    );
  };

  const toggleMealType = (mealId: string) => {
    setSelectedMealTypes(prev =>
      prev.includes(mealId)
        ? prev.filter(id => id !== mealId)
        : [...prev, mealId]
    );
  };


  const goToPrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") newDate.setDate(newDate.getDate() + 7);
    else newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const goToStart = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "month") newDate.setMonth(newDate.getMonth() - 6);
    else newDate.setDate(newDate.getDate() - 28);
    setCurrentDate(newDate);
  };

  const goToEnd = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "month") newDate.setMonth(newDate.getMonth() + 6);
    else newDate.setDate(newDate.getDate() + 28);
    setCurrentDate(newDate);
  };

  const generateMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    return days;
  };

  const generateWeekDates = () => {
    const dates: Date[] = [];
    const startOfWeek = new Date(currentDate);
    // Start from Saturday
    const day = startOfWeek.getDay();
    const diff = day === 6 ? 0 : -(day + 1);
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    
    for (let i = 0; i < 9; i++) { // 9 days for the grid view
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const generateMonthDates = () => {
    const dates: Date[] = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(new Date(year, month, day));
    }
    return dates;
  };

  const weekDates = generateWeekDates();
  const monthDates = generateMonthDates();
  const calendarDates = viewMode === "week" ? weekDates : monthDates;

  // PMS-aware helper to get availability for a room/date
  const getAvailability = (roomName: string, date: Date): { value: number | null; fromPms: boolean } => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    // Check PMS data first
    if (pmsData.roomTypes.length > 0) {
      // Try to find matching room by name
      const pmsRoom = pmsData.roomTypes.find(rt => 
        rt.roomTypeName.toLowerCase().includes(roomName.toLowerCase()) ||
        roomName.toLowerCase().includes(rt.roomTypeName.toLowerCase())
      );
      
      if (pmsRoom && pmsRoom.availabilityByDate[dateStr] !== undefined) {
        return { value: pmsRoom.availabilityByDate[dateStr], fromPms: true };
      }
    }
    
    // No PMS data available - return null (values will be shown as "—")
    return { value: null, fromPms: false };
  };

  // PMS-aware helper to get rate for a room/rateType/date
  const getRate = (roomName: string, rateType: string, date: Date): { value: number | null; fromPms: boolean } => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    // Check PMS data first
    if (pmsData.roomTypes.length > 0) {
      const pmsRoom = pmsData.roomTypes.find(rt => 
        rt.roomTypeName.toLowerCase().includes(roomName.toLowerCase()) ||
        roomName.toLowerCase().includes(rt.roomTypeName.toLowerCase())
      );
      
      if (pmsRoom && pmsRoom.ratesByDate[dateStr]) {
        const matchingRate = pmsRoom.ratesByDate[dateStr].find(r =>
          r.rateTypeName.toLowerCase().includes(rateType.toLowerCase()) ||
          r.priceType.toLowerCase().includes(rateType.toLowerCase()) ||
          rateType.toLowerCase().includes(r.priceType.toLowerCase())
        );
        
        if (matchingRate) {
          return { value: matchingRate.roomAmount || 0, fromPms: true };
        }
      }
    }
    
    // No PMS data available - return null (values will be shown as "—")
    return { value: null, fromPms: false };
  };

  // PMS-aware helper to get restrictions for a room/date
  const getRestrictions = (roomName: string, date: Date): { 
    stopSell: boolean | null; 
    minStay: number | null; 
    maxStay: number | null;
    leadDaysAdvance: number | null;
    leadDaysPost: number | null;
    fromPms: boolean 
  } => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    if (pmsData.roomTypes.length > 0) {
      const pmsRoom = pmsData.roomTypes.find(rt => 
        rt.roomTypeName.toLowerCase().includes(roomName.toLowerCase()) ||
        roomName.toLowerCase().includes(rt.roomTypeName.toLowerCase())
      );
      
      if (pmsRoom && pmsRoom.restrictionsByDate[dateStr]) {
        const r = pmsRoom.restrictionsByDate[dateStr];
        return {
          stopSell: r.stopSell ?? null,
          minStay: r.minStay ?? null,
          maxStay: r.maxStay ?? null,
          leadDaysAdvance: r.leadDaysAdvance ?? null,
          leadDaysPost: r.leadDaysPost ?? null,
          fromPms: true,
        };
      }
    }
    
    // No PMS data available
    return { stopSell: null, minStay: null, maxStay: null, leadDaysAdvance: null, leadDaysPost: null, fromPms: false };
  };

  // Render cell value with indicator for missing data
  const renderCellValue = (value: number | null, fromPms: boolean, suffix?: string) => {
    if (value === null) {
      return (
        <span className="text-muted-foreground/50 italic">—</span>
      );
    }
    return (
      <span className={fromPms ? "text-foreground" : "text-muted-foreground"}>
        {value.toLocaleString()}{suffix || ""}
      </span>
    );
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const formatDayHeader = (date: Date) => {
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      month: months[date.getMonth()],
    };
  };

  // Filter rooms based on selected room types (using dynamic property data)
  const filteredRooms = calendarRoomData.filter(room => 
    selectedRoomTypes.includes(room.name)
  );

  // Filter rates based on selected meal types (convert meal type string to ID format)
  const getMealTypeId = (mealType: string) => {
    // Convert meal type to consistent ID format
    return mealType.toLowerCase().replace(/ /g, "_");
  };

  const getSelectedCount = (selected: string[], total: number) => {
    return selected.length === total ? "All" : `${selected.length}/${total}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Property Indicator */}
        {selectedPropertyData && (
          <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <span className="text-sm text-muted-foreground">Currently managing:</span>
              <h2 className="text-lg font-semibold text-primary">{selectedPropertyData.name}</h2>
            </div>
            <div className="ml-auto flex gap-2 items-center">
              {isPmsProperty && (
                <div className="flex items-center gap-2">
                  {pmsSyncStatus === "loading" && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Syncing...
                    </Badge>
                  )}
                  {pmsSyncStatus === "success" && (
                    <Badge variant="default" className="flex items-center gap-1 bg-green-600">
                      <Cloud className="h-3 w-3" />
                      {selectedPropertyData.external_system?.toUpperCase()} Connected
                    </Badge>
                  )}
                  {pmsSyncStatus === "not_configured" && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <CloudOff className="h-3 w-3" />
                      {selectedPropertyData.external_system?.toUpperCase()} Not Configured
                    </Badge>
                  )}
                  {pmsSyncStatus === "no_property_code" && (
                    <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 text-yellow-600">
                      <AlertCircle className="h-3 w-3" />
                      No Property Code
                    </Badge>
                  )}
                  {pmsSyncStatus === "error" && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Sync Error
                    </Badge>
                  )}
                  {pmsSyncStatus === "idle" && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <CloudOff className="h-3 w-3" />
                      No PMS
                    </Badge>
                  )}
                </div>
              )}
              {!isPmsProperty && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <CloudOff className="h-3 w-3" />
                  No PMS Connected
                </Badge>
              )}
              <Badge variant="default">Accommodation</Badge>
              {hasEventWedding && <Badge variant="outline">Event/Wedding</Badge>}
              {hasConference && <Badge variant="outline">Conference</Badge>}
            </div>
          </div>
        )}

        {/* PMS Status Alert */}
        {selectedPropertyData && isPmsProperty && pmsSyncStatus === "not_configured" && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{selectedPropertyData.external_system?.toUpperCase()} API Not Configured</AlertTitle>
            <AlertDescription>
              {pmsSyncError || `Please configure ${selectedPropertyData.external_system} API credentials in Admin → API Keys to enable real-time availability sync.`}
            </AlertDescription>
          </Alert>
        )}

        {selectedPropertyData && isPmsProperty && pmsSyncStatus === "no_property_code" && (
          <Alert className="mb-4 border-yellow-500">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-600">Missing Property Code</AlertTitle>
            <AlertDescription>
              This property is connected to {selectedPropertyData.external_system} but doesn't have a Property Code configured. Please add it in the property settings.
            </AlertDescription>
          </Alert>
        )}

        {selectedPropertyData && isPmsProperty && pmsSyncStatus === "success" && lastSyncTime && (
          <div className="mb-4 text-sm text-muted-foreground flex items-center gap-2">
            <Cloud className="h-4 w-4 text-green-600" />
            Last synced from {selectedPropertyData.external_system}: {lastSyncTime.toLocaleTimeString()}
          </div>
        )}

        {/* Tabs */}
        <Tabs value="accommodation" className="mb-6">
          <TabsList className="grid w-full max-w-md" style={{ gridTemplateColumns: `repeat(${1 + (hasEventWedding ? 1 : 0) + (hasConference ? 1 : 0)}, 1fr)` }}>
            <TabsTrigger value="accommodation">Accommodation</TabsTrigger>
            {hasEventWedding && (
              <TabsTrigger value="event" onClick={() => navigateToTab("event")}>
                Event/Wedding
              </TabsTrigger>
            )}
            {hasConference && (
              <TabsTrigger value="conference" onClick={() => navigateToTab("conference")}>
                Conference
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Calendar</h1>
        </div>

        <Card>
          <CardContent className="p-6">
            {/* Filters and Actions */}
            <div className="flex flex-wrap gap-4 mb-6">
              <Select value={selectedProperty} onValueChange={handlePropertyChange} disabled={loading}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>


              {/* Room Types Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between" disabled={!selectedProperty}>
                    Room Types ({getSelectedCount(selectedRoomTypes, roomTypes.length)})
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2 bg-popover" align="start">
                  <div className="space-y-2">
                    {roomTypes.map((room, index) => {
                      const roomName = room.name || room;
                      return (
                        <div key={index} className="flex items-center space-x-2">
                          <Checkbox
                            id={`room-${index}`}
                            checked={selectedRoomTypes.includes(roomName)}
                            onCheckedChange={() => toggleRoomType(roomName)}
                          />
                          <label htmlFor={`room-${index}`} className="text-sm cursor-pointer flex-1">
                            {roomName}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Meal Types Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between">
                    Meal Types ({getSelectedCount(selectedMealTypes, mealTypeOptions.length)})
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2 bg-popover" align="start">
                  <div className="space-y-2">
                    {mealTypeOptions.map((meal) => (
                      <div key={meal.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={meal.id}
                          checked={selectedMealTypes.includes(meal.id)}
                          onCheckedChange={() => toggleMealType(meal.id)}
                        />
                        <label htmlFor={meal.id} className="text-sm cursor-pointer flex-1">
                          {meal.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Button 
                variant="default" 
                className="gap-2"
                onClick={() => {
                  if (isPmsProperty) {
                    fetchPmsAvailability();
                  }
                }}
                disabled={pmsSyncStatus === "loading"}
              >
                {pmsSyncStatus === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isPmsProperty ? `Sync ${selectedPropertyData?.external_system || "PMS"}` : "Refresh"}
              </Button>

              <div className="ml-auto flex gap-2">
                <Button variant="default">Save</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" className="gap-2">
                      Rules/Bulk Updates
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-popover">
                    <DropdownMenuItem onClick={() => setBulkRateOpen(true)}>
                      Bulk Rate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkAvailabilityOpen(true)}>
                      Bulk Availability
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStopSellOpen(true)}>
                      Stop Sell
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMinStayOpen(true)}>
                      Minimum Stay
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMaxStayOpen(true)}>
                      Maximum Stay
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysAdvanceOpen(true)}>
                      Lead Days Advance
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysPostOpen(true)}>
                      Lead Days Post
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* No Property Selected Message */}
            {!selectedProperty && (
              <div className="text-center py-8 text-muted-foreground">
                Select a property to begin.
              </div>
            )}

            {/* Calendar Section */}
            {selectedProperty && (
              <>
                {/* Calendar Navigation */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={goToStart}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToPrevious}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-lg font-semibold min-w-[150px] text-center">
                      {currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <Button variant="outline" size="icon" onClick={goToNext}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToEnd}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={goToToday}>
                      Today
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={viewMode === "week" ? "default" : "outline"}
                      onClick={() => setViewMode("week")}
                    >
                      Week
                    </Button>
                    <Button
                      variant={viewMode === "month" ? "default" : "outline"}
                      onClick={() => setViewMode("month")}
                    >
                      Month
                    </Button>
                  </div>
                </div>

                {/* Display Options as colored checkboxes */}
                <div className="flex flex-wrap gap-4 mb-6">
                  {displayOptions.map((option) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`legend-${option.id}`}
                        checked={selectedDisplayOptions.includes(option.id)}
                        onCheckedChange={() => toggleDisplayOption(option.id)}
                        className={`${option.color} border-0 data-[state=checked]:${option.color} data-[state=checked]:text-white`}
                      />
                      <label htmlFor={`legend-${option.id}`} className="text-sm cursor-pointer">
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <TooltipProvider>
                {viewMode === "week" && (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full border-collapse min-w-[800px]">
                      {/* Date Header Row */}
                      <thead>
                        <tr>
                          <th className="border bg-muted/50 p-2 min-w-[200px] sticky left-0 bg-background z-10"></th>
                          {calendarDates.map((date, index) => {
                            const header = formatDayHeader(date);
                            const weekend = isWeekend(date);
                            const holidayName = getHolidayName(date);
                            const isHoliday = !!holidayName;
                            const isTodayDate = isToday(date);
                            
                            const headerContent = (
                              <th
                                key={index}
                                className={`border p-2 text-center min-w-[80px] ${
                                  isTodayDate
                                    ? "bg-primary/20 dark:bg-primary/30 ring-2 ring-primary ring-inset"
                                    : isHoliday 
                                      ? "bg-green-100 dark:bg-green-950/30" 
                                      : weekend 
                                        ? "bg-red-50 dark:bg-red-950/20" 
                                        : "bg-muted/50"
                                }`}
                              >
                                <div className={`text-xs font-semibold ${
                                  isTodayDate
                                    ? "text-primary"
                                    : isHoliday 
                                      ? "text-green-700 dark:text-green-400" 
                                      : weekend 
                                        ? "text-red-600" 
                                        : "text-muted-foreground"
                                }`}>
                                  {header.day}
                                </div>
                                <div className={`text-lg font-bold ${
                                  isTodayDate
                                    ? "text-primary"
                                    : isHoliday 
                                      ? "text-green-700 dark:text-green-400" 
                                      : weekend 
                                        ? "text-red-600" 
                                        : ""
                                }`}>
                                  {header.date}
                                </div>
                                <div className={`text-xs ${
                                  isTodayDate
                                    ? "text-primary"
                                    : isHoliday 
                                      ? "text-green-700 dark:text-green-400" 
                                      : weekend 
                                        ? "text-red-600" 
                                        : "text-muted-foreground"
                                }`}>
                                  {header.month}
                                </div>
                                {isTodayDate && (
                                  <div className="text-[10px] font-semibold text-primary mt-1">TODAY</div>
                                )}
                              </th>
                            );
                            
                            return isHoliday ? (
                              <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                  {headerContent}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-semibold">{holidayName}</p>
                                  <p className="text-xs text-muted-foreground">SA Public Holiday</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : headerContent;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRooms.map((room) => {
                          const filteredRates = room.rates.filter(rate =>
                            selectedMealTypes.includes(getMealTypeId(rate.mealType))
                          );
                          
                          if (filteredRates.length === 0 && !selectedDisplayOptions.includes("rates")) {
                            return null;
                          }

                          return (
                            <React.Fragment key={room.name}>
                              {/* Room Name Row with Availability */}
                              <tr className="bg-slate-100 dark:bg-slate-800">
                                <td className="border p-2 font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                                  {room.name}
                                </td>
                                {calendarDates.map((date, index) => {
                                  const weekend = isWeekend(date);
                                  const isHoliday = !!getHolidayName(date);
                                  const avail = getAvailability(room.name, date);
                                  return (
                                    <td
                                      key={index}
                                      className={`border p-2 text-center font-semibold ${
                                        isHoliday 
                                          ? "bg-green-100 dark:bg-green-950/30" 
                                          : weekend 
                                            ? "bg-red-50 dark:bg-red-950/20" 
                                            : ""
                                      }`}
                                    >
                                      {renderCellValue(avail.value, avail.fromPms)}
                                    </td>
                                  );
                                })}
                              </tr>
                              {/* Rate Rows */}
                              {selectedDisplayOptions.includes("rates") && filteredRates.map((rate, rateIndex) => (
                                <tr key={`${room.name}-${rateIndex}`}>
                                  <td className="border p-2 pl-4 text-sm text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-foreground">{rate.rateType}</span>
                                    <span className="mx-1">-</span>
                                    <span>{rate.mealType}</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const rateData = getRate(room.name, rate.rateType, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-2 text-center text-sm ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(rateData.value, rateData.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                              {/* Stop Sell Row */}
                              {selectedDisplayOptions.includes("stop_sell") && (
                                <tr>
                                  <td className="border p-2 pl-4 text-sm text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-red-600 font-medium">Stop Sell</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-2 text-center text-sm ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {restrictions.stopSell === null ? (
                                          <span className="text-muted-foreground/50 italic">—</span>
                                        ) : restrictions.stopSell ? (
                                          <span className="text-red-600 font-bold">✕</span>
                                        ) : (
                                          <span className="text-green-600">✓</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Min Stay Row */}
                              {selectedDisplayOptions.includes("min_stay") && (
                                <tr>
                                  <td className="border p-2 pl-4 text-sm text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-blue-600 font-medium">Min Stay</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-2 text-center text-sm ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(restrictions.minStay, restrictions.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Max Stay Row */}
                              {selectedDisplayOptions.includes("max_stay") && (
                                <tr>
                                  <td className="border p-2 pl-4 text-sm text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-pink-600 font-medium">Max Stay</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-2 text-center text-sm ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(restrictions.maxStay, restrictions.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Lead Days Advance Row */}
                              {selectedDisplayOptions.includes("lead_days_advance") && (
                                <tr>
                                  <td className="border p-2 pl-4 text-sm text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-yellow-600 font-medium">Lead Days Adv</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-2 text-center text-sm ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(restrictions.leadDaysAdvance, restrictions.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Lead Days Post Row */}
                              {selectedDisplayOptions.includes("lead_days_post") && (
                                <tr>
                                  <td className="border p-2 pl-4 text-sm text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-orange-600 font-medium">Lead Days Post</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-2 text-center text-sm ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(restrictions.leadDaysPost, restrictions.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {viewMode === "month" && (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full border-collapse">
                      {/* Date Header Row */}
                      <thead>
                        <tr>
                          <th className="border bg-muted/50 p-2 min-w-[200px] sticky left-0 bg-background z-10"></th>
                          {calendarDates.map((date, index) => {
                            const header = formatDayHeader(date);
                            const weekend = isWeekend(date);
                            const holidayName = getHolidayName(date);
                            const isHoliday = !!holidayName;
                            const isTodayDate = isToday(date);
                            
                            const headerContent = (
                              <th
                                key={index}
                                className={`border p-1 text-center min-w-[50px] ${
                                  isTodayDate
                                    ? "bg-primary/20 dark:bg-primary/30 ring-2 ring-primary ring-inset"
                                    : isHoliday 
                                      ? "bg-green-100 dark:bg-green-950/30" 
                                      : weekend 
                                        ? "bg-red-50 dark:bg-red-950/20" 
                                        : "bg-muted/50"
                                }`}
                              >
                                <div className={`text-xs font-semibold ${
                                  isTodayDate
                                    ? "text-primary"
                                    : isHoliday 
                                      ? "text-green-700 dark:text-green-400" 
                                      : weekend 
                                        ? "text-red-600" 
                                        : "text-muted-foreground"
                                }`}>
                                  {header.day}
                                </div>
                                <div className={`text-sm font-bold ${
                                  isTodayDate
                                    ? "text-primary"
                                    : isHoliday 
                                      ? "text-green-700 dark:text-green-400" 
                                      : weekend 
                                        ? "text-red-600" 
                                        : ""
                                }`}>
                                  {header.date}
                                </div>
                              </th>
                            );
                            
                            return isHoliday ? (
                              <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                  {headerContent}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-semibold">{holidayName}</p>
                                  <p className="text-xs text-muted-foreground">SA Public Holiday</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : isTodayDate ? (
                              <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                  {headerContent}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-semibold">Today</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : headerContent;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRooms.map((room) => {
                          const filteredRates = room.rates.filter(rate =>
                            selectedMealTypes.includes(getMealTypeId(rate.mealType))
                          );
                          
                          if (filteredRates.length === 0 && !selectedDisplayOptions.includes("rates")) {
                            return null;
                          }

                          return (
                            <React.Fragment key={room.name}>
                              {/* Room Name Row with Availability */}
                              <tr className="bg-slate-100 dark:bg-slate-800">
                                <td className="border p-2 font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                                  {room.name}
                                </td>
                                {calendarDates.map((date, index) => {
                                  const weekend = isWeekend(date);
                                  const isHoliday = !!getHolidayName(date);
                                  const avail = getAvailability(room.name, date);
                                  return (
                                    <td
                                      key={index}
                                      className={`border p-1 text-center text-sm font-semibold ${
                                        isHoliday 
                                          ? "bg-green-100 dark:bg-green-950/30" 
                                          : weekend 
                                            ? "bg-red-50 dark:bg-red-950/20" 
                                            : ""
                                      }`}
                                    >
                                      {renderCellValue(avail.value, avail.fromPms)}
                                    </td>
                                  );
                                })}
                              </tr>
                              {/* Rate Rows */}
                              {selectedDisplayOptions.includes("rates") && filteredRates.map((rate, rateIndex) => (
                                <tr key={`${room.name}-${rateIndex}`}>
                                  <td className="border p-1 pl-4 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-foreground">{rate.rateType}</span>
                                    <span className="mx-1">-</span>
                                    <span>{rate.mealType}</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const rateData = getRate(room.name, rate.rateType, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center text-xs ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(rateData.value, rateData.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                              {/* Stop Sell Row */}
                              {selectedDisplayOptions.includes("stop_sell") && (
                                <tr>
                                  <td className="border p-1 pl-4 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-red-600 font-medium">Stop Sell</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center text-xs ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {restrictions.stopSell === null ? (
                                          <span className="text-muted-foreground/50 italic">—</span>
                                        ) : restrictions.stopSell ? (
                                          <span className="text-red-600 font-bold">✕</span>
                                        ) : (
                                          <span className="text-green-600">✓</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Min Stay Row */}
                              {selectedDisplayOptions.includes("min_stay") && (
                                <tr>
                                  <td className="border p-1 pl-4 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-blue-600 font-medium">Min Stay</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center text-xs ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(restrictions.minStay, restrictions.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Max Stay Row */}
                              {selectedDisplayOptions.includes("max_stay") && (
                                <tr>
                                  <td className="border p-1 pl-4 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-pink-600 font-medium">Max Stay</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center text-xs ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(restrictions.maxStay, restrictions.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Lead Days Advance Row */}
                              {selectedDisplayOptions.includes("lead_days_advance") && (
                                <tr>
                                  <td className="border p-1 pl-4 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-yellow-600 font-medium">Lead Days Adv</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center text-xs ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(restrictions.leadDaysAdvance, restrictions.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Lead Days Post Row */}
                              {selectedDisplayOptions.includes("lead_days_post") && (
                                <tr>
                                  <td className="border p-1 pl-4 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-orange-600 font-medium">Lead Days Post</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const restrictions = getRestrictions(room.name, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center text-xs ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {renderCellValue(restrictions.leadDaysPost, restrictions.fromPms)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                </TooltipProvider>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <BulkRateRuleDialog open={bulkRateOpen} onOpenChange={setBulkRateOpen} />
      <BulkAvailabilityRuleDialog open={bulkAvailabilityOpen} onOpenChange={setBulkAvailabilityOpen} />
      <BulkStopSellDialog open={stopSellOpen} onOpenChange={setStopSellOpen} />
      <BulkMinimumStayDialog open={minStayOpen} onOpenChange={setMinStayOpen} />
      <BulkMaximumStayDialog open={maxStayOpen} onOpenChange={setMaxStayOpen} />
      <BulkLeadDaysAdvanceDialog open={leadDaysAdvanceOpen} onOpenChange={setLeadDaysAdvanceOpen} />
      <BulkLeadDaysPostDialog open={leadDaysPostOpen} onOpenChange={setLeadDaysPostOpen} />
    </div>
  );
};

export default CalendarAccommodation;
