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
      teenAmount?: number;
      childAmount?: number;
      infantAmount?: number;
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

// Restriction display options with colored indicators
const restrictionOptions = [
  { id: "stop_sell", label: "Stop Sell", color: "bg-red-500" },
  { id: "min_stay", label: "Min Stay", color: "bg-blue-500" },
  { id: "max_stay", label: "Max Stay", color: "bg-pink-500" },
  { id: "lead_days_advance", label: "Lead Days Advance", color: "bg-yellow-500" },
  { id: "lead_days_post", label: "Lead Days Post", color: "bg-orange-500" },
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

  // Multi-select states - Rates and all restrictions enabled by default
  // IDs must match restrictionOptions: stop_sell, min_stay, max_stay, lead_days_advance, lead_days_post
  const [selectedDisplayOptions, setSelectedDisplayOptions] = useState<string[]>(
    ["rates", "stop_sell", "min_stay", "max_stay", "lead_days_advance", "lead_days_post"]
  );
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedRateTypes, setSelectedRateTypes] = useState<string[]>([]);
  
  // Track checked occupancy rows for per-person rates: key = "roomName-rateTypeId-occKey"
  const [checkedOccupancyRows, setCheckedOccupancyRows] = useState<Set<string>>(new Set());
  
  const toggleOccupancyRow = (roomName: string, rateTypeId: string, occKey: string) => {
    const key = `${roomName}-${rateTypeId}-${occKey}`;
    setCheckedOccupancyRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  
  const isOccupancyRowChecked = (roomName: string, rateTypeId: string, occKey: string) => {
    return checkedOccupancyRows.has(`${roomName}-${rateTypeId}-${occKey}`);
  };
  // PMS sync state - initialize from sessionStorage if available
  const [pmsData, setPmsData] = useState<PMSData>(() => {
    const propertyId = searchParams.get("property");
    if (propertyId) {
      const cached = sessionStorage.getItem(`pms_data_${propertyId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          return {
            ...parsed,
            lastSynced: parsed.lastSynced ? new Date(parsed.lastSynced) : null
          };
        } catch (e) {
          console.error("Failed to parse cached PMS data:", e);
        }
      }
    }
    return { roomTypes: [], lastSynced: null, systemType: "" };
  });
  const [pmsSyncStatus, setPmsSyncStatus] = useState<PMSSyncStatus>(() => {
    const propertyId = searchParams.get("property");
    if (propertyId) {
      const cached = sessionStorage.getItem(`pms_data_${propertyId}`);
      if (cached) return "success";
    }
    return "idle";
  });
  const [pmsSyncError, setPmsSyncError] = useState<string>("");
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => {
    const propertyId = searchParams.get("property");
    if (propertyId) {
      const cached = sessionStorage.getItem(`pms_data_${propertyId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          return parsed.lastSynced ? new Date(parsed.lastSynced) : null;
        } catch (e) {}
      }
    }
    return null;
  });

  const selectedPropertyData = properties.find(p => p.id === selectedProperty);
  const hasAccommodation = selectedPropertyData?.amenities?.offerings?.accommodation === true;
  const hasEventWedding = selectedPropertyData?.amenities?.offerings?.event_wedding === true;
  const hasConference = selectedPropertyData?.amenities?.offerings?.conference === true;

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

  // Load cached PMS availability from database
  const loadCachedAvailability = useCallback(async (propertyId: string, startDateStr: string, endDateStr: string): Promise<PMSRoomTypeData[] | null> => {
    try {
      const { data: cachedData, error } = await supabase
        .from("pms_availability_cache")
        .select("*")
        .eq("property_id", propertyId)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .order("date");
      
      if (error || !cachedData || cachedData.length === 0) {
        return null;
      }

      // Check if cache is fresh (within last 30 minutes)
      const latestFetch = cachedData.reduce((latest, row) => {
        const fetchedAt = new Date(row.fetched_at || row.created_at);
        return fetchedAt > latest ? fetchedAt : latest;
      }, new Date(0));
      
      const cacheAgeMinutes = (Date.now() - latestFetch.getTime()) / (1000 * 60);
      if (cacheAgeMinutes > 30) {
        console.log(`Cache is ${Math.round(cacheAgeMinutes)} minutes old, fetching fresh data`);
        return null; // Cache is stale
      }

      // Group cached data by room type
      const roomTypeMap = new Map<string, PMSRoomTypeData>();
      
      for (const row of cachedData) {
        const roomTypeId = row.external_room_type_id;
        
        if (!roomTypeMap.has(roomTypeId)) {
          const rawData = row.raw_data as Record<string, any> | null;
          roomTypeMap.set(roomTypeId, {
            roomTypeId,
            roomTypeName: rawData?.roomTypeName || `Room ${roomTypeId}`,
            availabilityByDate: {},
            ratesByDate: {},
            restrictionsByDate: {},
          });
        }
        
        const roomData = roomTypeMap.get(roomTypeId)!;
        const dateStr = row.date;
        
        // Map availability
        roomData.availabilityByDate[dateStr] = row.available_units ?? 0;
        
        // Map rates if present - handle both array and single object formats
        if (row.rates) {
          if (!roomData.ratesByDate[dateStr]) {
            roomData.ratesByDate[dateStr] = [];
          }
          
          // Handle array format (new) or single object format (legacy)
          const rawRates = row.rates as any;
          const ratesArray = Array.isArray(rawRates) ? rawRates : [rawRates];
          
          for (const rates of ratesArray) {
            if (rates && typeof rates === 'object') {
              roomData.ratesByDate[dateStr].push({
                rateTypeId: rates.rate_type_id?.toString() || "",
                rateTypeName: rates.rate_type_name || "Standard",
                priceType: rates.price_type || "UnitRate",
                roomAmount: rates.room_amount || 0,
                adultAmounts: rates.adult_amounts,
                teenAmount: rates.teen_amount,
                childAmount: rates.child_amount,
                infantAmount: rates.infant_amount,
              });
            }
          }
        }
        
        // Map restrictions if present
        if (row.restrictions && Array.isArray(row.restrictions) && row.restrictions.length > 0) {
          roomData.restrictionsByDate[dateStr] = {
            stopSell: false,
            closedToArrival: false,
            closedToDeparture: false,
          };
        }
      }

      const result = Array.from(roomTypeMap.values());
      console.log(`Loaded ${result.length} room types from cache with ${cachedData.length} date entries`);
      return result;
    } catch (err) {
      console.error("Error loading cached availability:", err);
      return null;
    }
  }, []);

  // Fetch PMS availability (system-agnostic)
  const fetchPmsAvailability = useCallback(async (forceRefresh = false) => {
    if (!selectedPropertyData?.external_system) {
      setPmsSyncStatus("idle");
      return;
    }

    if (!hasPmsPropertyCode) {
      setPmsSyncStatus("no_property_code");
      setPmsSyncError(`No ${selectedPropertyData.external_system} property code configured`);
      return;
    }

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

    const startDateStr = format(startDate, "yyyy-MM-dd");
    const endDateStr = format(endDate, "yyyy-MM-dd");

    // Try to load from cache first (unless forcing refresh)
    if (!forceRefresh) {
      setPmsSyncStatus("loading");
      const cachedData = await loadCachedAvailability(selectedPropertyData.id, startDateStr, endDateStr);
      
      if (cachedData && cachedData.length > 0) {
        setPmsData({
          roomTypes: cachedData,
          lastSynced: new Date(),
          systemType: selectedPropertyData.external_system,
        });
        setPmsSyncStatus("success");
        setLastSyncTime(new Date());
        console.log("Using cached PMS data");
        return;
      }
    }

    setPmsSyncStatus("loading");
    setPmsSyncError("");

    try {
      // Route to appropriate edge function based on PMS
      const edgeFunction = `${selectedPropertyData.external_system}-api`;
      
      const { data, error } = await supabase.functions.invoke(edgeFunction, {
        body: {
          action: "fetch_availability",
          property_id: selectedPropertyData.id,
          start_date: startDateStr,
          end_date: endDateStr,
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
                    teenAmount: rate.teenAmount,
                    childAmount: rate.childAmount,
                    infantAmount: rate.infantAmount,
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
  }, [selectedPropertyData, hasPmsPropertyCode, currentDate, viewMode, toast, loadCachedAvailability]);

  // Persist PMS data to sessionStorage when it changes
  useEffect(() => {
    if (selectedProperty && pmsData.roomTypes.length > 0) {
      sessionStorage.setItem(`pms_data_${selectedProperty}`, JSON.stringify(pmsData));
    }
  }, [selectedProperty, pmsData]);

  // Trigger PMS sync when property changes and data is available
  useEffect(() => {
    // Wait until properties are loaded and we have the selected property in the list
    if (!selectedProperty || properties.length === 0) return;
    
    // Make sure selectedPropertyData is actually found in properties
    const propertyData = properties.find(p => p.id === selectedProperty);
    if (!propertyData) return;
    
    const isPms = !!propertyData.external_system;
    
    if (isPms) {
      // Always fetch on property change - the function will handle caching
      fetchPmsAvailability(false);
    } else {
      // Clear data for non-PMS properties
      setPmsSyncStatus("idle");
      setPmsData({ roomTypes: [], lastSynced: null, systemType: "" });
      sessionStorage.removeItem(`pms_data_${selectedProperty}`);
    }
  }, [selectedProperty, properties, fetchPmsAvailability]);

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

  // Build dynamic room data from PMS data or property's room types
  const calendarRoomData = React.useMemo(() => {
    // If we have PMS data, use that as the source of truth
    if (pmsData.roomTypes.length > 0) {
      return pmsData.roomTypes.map(pmsRoom => {
        // Build rates from PMS rate types - one row per unique rate type
        const rates: { rateType: string; rateTypeName: string; rateTypeId: string; mealType: string; priceType: string; values: { [date: string]: number } }[] = [];
        
        // Collect all unique rate types from all dates
        const rateTypesMap = new Map<string, { rateTypeId: string; rateTypeName: string; priceType: string }>();
        
        Object.values(pmsRoom.ratesByDate).forEach(dateRates => {
          dateRates.forEach(rate => {
            const key = String(rate.rateTypeId);
            if (!rateTypesMap.has(key)) {
              rateTypesMap.set(key, {
                rateTypeId: key,
                rateTypeName: rate.rateTypeName,
                priceType: rate.priceType,
              });
            }
          });
        });
        
        // Create rate row for each rate type
        rateTypesMap.forEach(rateInfo => {
          // Determine display rate type based on price type (for display column)
          let displayRateType = rateInfo.priceType || "UnitRate";
          const priceTypeUpper = displayRateType.toUpperCase();
          if (priceTypeUpper === "PER ROOM" || priceTypeUpper === "PERROOM") {
            displayRateType = "UnitRate";
          } else if (priceTypeUpper === "PER PERSON" || priceTypeUpper === "PERPERSON") {
            displayRateType = "PerPersonRate";
          } else if (priceTypeUpper === "SINGLE" || priceTypeUpper === "SINGLERATE") {
            displayRateType = "SingleRate";
          }
          
          // Extract meal type from rate type name
          let mealType = "Standard"; // Default
          const rateName = rateInfo.rateTypeName.toLowerCase();
          if (rateName.includes("room only") || rateName.includes("roomonly")) {
            mealType = "Room Only";
          } else if (rateName.includes("self catering") || rateName.includes("selfcatering") || rateName.includes("self-catering")) {
            mealType = "SelfCatering";
          } else if (rateName.includes("all inclusive") || rateName.includes("allinclusive") || rateName.includes("all-inclusive")) {
            mealType = "All Inclusive";
          } else if (rateName.includes("dinner") && rateName.includes("breakfast")) {
            mealType = "DBB";
          } else if (rateName.includes("full board")) {
            mealType = "Full Board";
          } else if (rateName.includes("half board")) {
            mealType = "Half Board";
          } else if (rateName.includes("bed & breakfast") || rateName.includes("bed and breakfast") || rateName.includes("b&b") || rateName.includes("breakfast")) {
            mealType = "Breakfast";
          } else if (rateName.includes("dinner")) {
            mealType = "Dinner";
          }
          
          rates.push({
            rateType: displayRateType,
            rateTypeName: rateInfo.rateTypeName, // Actual rate type name from PMS
            rateTypeId: rateInfo.rateTypeId,
            mealType: mealType,
            priceType: rateInfo.priceType,
            values: {}
          });
        });
        
        // If no rate types found, add a placeholder
        if (rates.length === 0) {
          rates.push({
            rateType: "UnitRate",
            rateTypeName: "Standard Rate",
            rateTypeId: "default",
            mealType: "Standard",
            priceType: "PER ROOM",
            values: {}
          });
        }
        
        // Get room settings from property amenities
        const propRoomTypes = selectedPropertyData?.amenities?.room_types as any[] || [];
        const matchingRoom = propRoomTypes.find(r => 
          r.pms_id?.toString() === pmsRoom.roomTypeId || 
          r.name === pmsRoom.roomTypeName
        );
        
        return {
          name: pmsRoom.roomTypeName,
          pmsRoomTypeId: pmsRoom.roomTypeId,
          rates,
          availability: pmsRoom.availabilityByDate,
          allowTeens: matchingRoom?.allowTeens ?? true,
          allowChildren: matchingRoom?.allowChildren ?? true,
          allowInfants: matchingRoom?.allowInfants ?? true,
          minGuests: matchingRoom?.minGuests ?? 1,
        };
      });
    }
    
    // Fallback: use property amenities if no PMS data
    if (!selectedPropertyData?.amenities?.room_types) return [];
    
    const propRoomTypes = selectedPropertyData.amenities.room_types as any[] || [];
    
    return propRoomTypes.map(room => {
      const rates: { rateType: string; rateTypeName: string; rateTypeId: string; mealType: string; priceType: string; values: { [date: string]: number } }[] = [];
      
      if (room.rate_info && Array.isArray(room.rate_info)) {
        room.rate_info.forEach((rateInfo: any) => {
          const rateName = rateInfo.name || room.rateType || "Standard";
          const mealTypes = rateInfo.mealTypes || [];
          
          mealTypes.forEach((mealType: string) => {
            rates.push({
              rateType: rateName,
              rateTypeName: rateName,
              rateTypeId: rateInfo.id?.toString() || Date.now().toString(),
              mealType: mealType,
              priceType: rateInfo.priceType || "PER ROOM",
              values: {} as { [date: string]: number }
            });
          });
        });
      }
      
      if (rates.length === 0 && room.rateType) {
        const propMealTypes = selectedPropertyData.amenities.meal_types as string[] || [];
        propMealTypes.forEach((mealType: string) => {
          rates.push({
            rateType: room.rateType,
            rateTypeName: room.rateType,
            rateTypeId: "default",
            mealType: mealType,
            priceType: "PER ROOM",
            values: {} as { [date: string]: number }
          });
        });
      }
      
      return {
        name: room.name || "Unnamed Room",
        pmsRoomTypeId: room.pms_id?.toString() || "",
        rates,
        availability: {} as { [date: string]: number | AvailabilityData },
        allowTeens: room.allowTeens ?? true,
        allowChildren: room.allowChildren ?? true,
        allowInfants: room.allowInfants ?? true,
        minGuests: room.minGuests ?? 1,
      };
    });
  }, [selectedPropertyData, pmsData]);

  // Get rate type options from property's saved pms_rate_types (same as Property Form > Room Information > Rate Types)
  const rateTypeOptions = React.useMemo(() => {
    const rateTypes: { id: string; label: string; hasRates: boolean }[] = [];
    
    // Only use property's saved pms_rate_types to match Property Form
    if (selectedPropertyData?.amenities?.pms_rate_types) {
      const savedRateTypes = selectedPropertyData.amenities.pms_rate_types as any[];
      savedRateTypes.forEach(rt => {
        if (rt.id && rt.name) {
          const rtIdStr = String(rt.id);
          // Check if this rate type has any rates in the PMS data
          let hasRates = false;
          if (pmsData.roomTypes.length > 0) {
            pmsData.roomTypes.forEach(room => {
              Object.values(room.ratesByDate).forEach(dateRates => {
                dateRates.forEach(rate => {
                  // Compare as strings to avoid type mismatch
                  if (String(rate.rateTypeId) === rtIdStr) {
                    const hasValues = (rate.roomAmount != null && rate.roomAmount > 0) || 
                                     (rate.adultAmounts && Object.values(rate.adultAmounts).some(v => v != null && v > 0)) ||
                                     (rate.teenAmount != null && rate.teenAmount > 0) ||
                                     (rate.childAmount != null && rate.childAmount > 0) ||
                                     (rate.infantAmount != null && rate.infantAmount > 0);
                    if (hasValues) hasRates = true;
                  }
                });
              });
            });
          }
          
          rateTypes.push({
            id: rtIdStr,
            label: rt.name,
            hasRates
          });
        }
      });
    }
    
    return rateTypes;
  }, [pmsData, selectedPropertyData]);

  // Set only rate types with data as selected when rateTypeOptions changes
  useEffect(() => {
    if (rateTypeOptions.length > 0) {
      // Only auto-select rate types that have rates
      setSelectedRateTypes(rateTypeOptions.filter(r => r.hasRates).map(r => r.id));
    }
  }, [rateTypeOptions]);

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

  const toggleRateType = (rateTypeId: string) => {
    setSelectedRateTypes(prev =>
      prev.includes(rateTypeId)
        ? prev.filter(id => id !== rateTypeId)
        : [...prev, rateTypeId]
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
      // Try exact match first, then fuzzy match
      const pmsRoom = pmsData.roomTypes.find(rt => 
        rt.roomTypeName === roomName
      ) || pmsData.roomTypes.find(rt => 
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

  // PMS-aware helper to get rate for a room/rateType/date with occupancy support
  const getRate = (
    roomName: string, 
    rateTypeId: string, 
    priceType: string, 
    date: Date, 
    occupancyType?: "room" | "1adult" | "2adults" | "teen" | "child" | "infant"
  ): { value: number | null; fromPms: boolean } => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    // Check PMS data first
    if (pmsData.roomTypes.length > 0) {
      const pmsRoom = pmsData.roomTypes.find(rt => 
        rt.roomTypeName === roomName
      ) || pmsData.roomTypes.find(rt => 
        rt.roomTypeName.toLowerCase().includes(roomName.toLowerCase()) ||
        roomName.toLowerCase().includes(rt.roomTypeName.toLowerCase())
      );
      
      if (pmsRoom && pmsRoom.ratesByDate[dateStr]) {
        // Find by rate type ID first
        let matchingRate = pmsRoom.ratesByDate[dateStr].find(r => r.rateTypeId === rateTypeId);
        
        // Fallback: find by price type
        if (!matchingRate) {
          const normalizedPriceType = priceType === "UnitRate" ? "PER ROOM" : 
                                      priceType === "PerPersonRate" ? "PER PERSON" : 
                                      priceType === "SingleRate" ? "PER PERSON" : priceType;
          
          matchingRate = pmsRoom.ratesByDate[dateStr].find(r => {
            const rPriceType = r.priceType?.toUpperCase() || "";
            return rPriceType === normalizedPriceType.toUpperCase();
          });
        }
        
          if (matchingRate) {
          const isPerPerson = matchingRate.priceType?.toUpperCase().includes("PERSON");
          
          // If occupancy type specified, return the specific amount
          if (occupancyType && isPerPerson) {
            switch (occupancyType) {
              case "1adult":
                return { value: matchingRate.adultAmounts?.adultAmount1 ?? null, fromPms: true };
              case "2adults":
                return { value: matchingRate.adultAmounts?.adultAmount2 ?? null, fromPms: true };
              case "teen":
                return { value: matchingRate.teenAmount ?? null, fromPms: true };
              case "child":
                return { value: matchingRate.childAmount ?? null, fromPms: true };
              case "infant":
                return { value: matchingRate.infantAmount ?? null, fromPms: true };
              case "room":
                return { value: matchingRate.roomAmount ?? null, fromPms: true };
            }
          }
          
          // For PER ROOM or no occupancy type specified
          if (!isPerPerson || occupancyType === "room") {
            return { value: matchingRate.roomAmount || 0, fromPms: true };
          }
          
          // Default for per-person: show adult amount 1
          if (isPerPerson && matchingRate.adultAmounts) {
            return { value: matchingRate.adultAmounts.adultAmount1 || matchingRate.adultAmounts.adultAmount2 || 0, fromPms: true };
          }
          
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
    
    // TEMP TEST DATA: Generate random restrictions based on date hash for testing display
    const dayOfMonth = date.getDate();
    const monthOffset = date.getMonth();
    const hash = (dayOfMonth * 7 + monthOffset * 13) % 31;
    
    // Generate varied restrictions on different dates for testing
    const testRestrictions = {
      stopSell: hash % 7 === 0 ? true : null, // ~14% of days
      minStay: hash % 3 === 0 ? (2 + (hash % 5)) : null, // ~33% of days, values 2-6
      maxStay: hash % 4 === 1 ? (7 + (hash % 7)) : null, // ~25% of days, values 7-13
      leadDaysAdvance: hash % 5 === 2 ? (1 + (hash % 3)) : null, // ~20% of days, values 1-3
      leadDaysPost: hash % 6 === 3 ? (hash % 4) : null, // ~17% of days, values 0-3
      fromPms: false,
    };
    
    return testRestrictions;
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

              {/* Rate Types Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between">
                    Rate Types ({getSelectedCount(selectedRateTypes, rateTypeOptions.length)})
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-2 bg-popover" align="start">
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {rateTypeOptions.map((rateType) => (
                      <div key={rateType.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`rate-${rateType.id}`}
                          checked={selectedRateTypes.includes(rateType.id)}
                          onCheckedChange={() => toggleRateType(rateType.id)}
                        />
                        <label htmlFor={`rate-${rateType.id}`} className="text-sm cursor-pointer flex-1">
                          {rateType.label}
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
                    fetchPmsAvailability(true); // Force fresh fetch from PMS
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

                {/* Display Options with colored indicator legend */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                  <span className="text-sm font-medium text-muted-foreground">Show:</span>
                  {/* Rates toggle */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="legend-rates"
                      checked={selectedDisplayOptions.includes("rates")}
                      onCheckedChange={() => toggleDisplayOption("rates")}
                    />
                    <label htmlFor="legend-rates" className="text-sm cursor-pointer font-medium">
                      Rates
                    </label>
                  </div>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-xs text-muted-foreground">Restrictions:</span>
                  {/* Restriction options with colored checkboxes */}
                  {restrictionOptions.map((option) => {
                    const colorMap: Record<string, string> = {
                      "bg-red-500": "#ef4444",
                      "bg-blue-500": "#3b82f6",
                      "bg-pink-500": "#ec4899",
                      "bg-yellow-500": "#eab308",
                      "bg-orange-500": "#f97316",
                    };
                    const bgColor = colorMap[option.color] || "#6b7280";
                    const isChecked = selectedDisplayOptions.includes(option.id);
                    
                    return (
                      <div key={option.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`legend-${option.id}`}
                          checked={isChecked}
                          onCheckedChange={() => toggleDisplayOption(option.id)}
                          className="border-0"
                          style={{ 
                            backgroundColor: bgColor,
                            color: "white"
                          }}
                        />
                        <label htmlFor={`legend-${option.id}`} className="text-sm cursor-pointer">
                          {option.label}
                        </label>
                      </div>
                    );
                  })}
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
                            selectedRateTypes.includes(String(rate.rateTypeId))
                          );

                          return (
                            <React.Fragment key={room.name}>
                              {/* Room Name Row with Availability - ALWAYS visible */}
                              <tr className="bg-slate-100 dark:bg-slate-800">
                                <td className="border p-2 font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                                  {room.name}
                                </td>
                                {calendarDates.map((date, index) => {
                                  const weekend = isWeekend(date);
                                  const isHoliday = !!getHolidayName(date);
                                  const avail = getAvailability(room.name, date);
                                  const restrictions = getRestrictions(room.name, date);
                                  
                                  // Get previous and next day restrictions to determine line continuity
                                  const prevDate = index > 0 ? calendarDates[index - 1] : null;
                                  const nextDate = index < calendarDates.length - 1 ? calendarDates[index + 1] : null;
                                  const prevRestrictions = prevDate ? getRestrictions(room.name, prevDate) : null;
                                  const nextRestrictions = nextDate ? getRestrictions(room.name, nextDate) : null;
                                  
                                  // Determine which restriction indicators to show
                                  const showStopSell = selectedDisplayOptions.includes("stop_sell") && restrictions.stopSell;
                                  const showMinStay = selectedDisplayOptions.includes("min_stay") && restrictions.minStay !== null && restrictions.minStay > 0;
                                  const showMaxStay = selectedDisplayOptions.includes("max_stay") && restrictions.maxStay !== null && restrictions.maxStay > 0;
                                  const showLeadAdv = selectedDisplayOptions.includes("lead_days_advance") && restrictions.leadDaysAdvance !== null && restrictions.leadDaysAdvance > 0;
                                  const showLeadPost = selectedDisplayOptions.includes("lead_days_post") && restrictions.leadDaysPost !== null && restrictions.leadDaysPost > 0;
                                  const hasRestrictions = showStopSell || showMinStay || showMaxStay || showLeadAdv || showLeadPost;
                                  
                                  // Helper to get rounded corners based on continuity
                                  const getLineClass = (
                                    hasPrev: boolean,
                                    hasNext: boolean,
                                    baseColor: string
                                  ) => {
                                    const rounded = hasPrev && hasNext ? "" : hasPrev ? "rounded-r-full" : hasNext ? "rounded-l-full" : "rounded-full";
                                    return `h-1.5 flex-1 ${baseColor} ${rounded}`;
                                  };
                                  
                                  // Check continuity for each restriction type (with same value for min/max stay)
                                  const stopSellPrev = prevRestrictions?.stopSell === true;
                                  const stopSellNext = nextRestrictions?.stopSell === true;
                                  const minStayPrev = prevRestrictions?.minStay === restrictions.minStay && prevRestrictions?.minStay && prevRestrictions.minStay > 0;
                                  const minStayNext = nextRestrictions?.minStay === restrictions.minStay && nextRestrictions?.minStay && nextRestrictions.minStay > 0;
                                  const maxStayPrev = prevRestrictions?.maxStay === restrictions.maxStay && prevRestrictions?.maxStay && prevRestrictions.maxStay > 0;
                                  const maxStayNext = nextRestrictions?.maxStay === restrictions.maxStay && nextRestrictions?.maxStay && nextRestrictions.maxStay > 0;
                                  const leadAdvPrev = prevRestrictions?.leadDaysAdvance === restrictions.leadDaysAdvance && prevRestrictions?.leadDaysAdvance && prevRestrictions.leadDaysAdvance > 0;
                                  const leadAdvNext = nextRestrictions?.leadDaysAdvance === restrictions.leadDaysAdvance && nextRestrictions?.leadDaysAdvance && nextRestrictions.leadDaysAdvance > 0;
                                  const leadPostPrev = prevRestrictions?.leadDaysPost === restrictions.leadDaysPost && prevRestrictions?.leadDaysPost && prevRestrictions.leadDaysPost > 0;
                                  const leadPostNext = nextRestrictions?.leadDaysPost === restrictions.leadDaysPost && nextRestrictions?.leadDaysPost && nextRestrictions.leadDaysPost > 0;
                                  
                                  return (
                                    <td
                                      key={index}
                                      className={`border p-1 text-center ${
                                        isHoliday 
                                          ? "bg-green-100 dark:bg-green-950/30" 
                                          : weekend 
                                            ? "bg-red-50 dark:bg-red-950/20" 
                                            : ""
                                      }`}
                                    >
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="font-semibold">{renderCellValue(avail.value, avail.fromPms)}</span>
                                        {hasRestrictions && (
                                          <div className="flex flex-col gap-0.5 w-full px-0">
                                            {showStopSell && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={getLineClass(stopSellPrev, stopSellNext, "bg-red-500")} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Stop Sell Active</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {showMinStay && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={`${getLineClass(minStayPrev, minStayNext, "bg-blue-500")} flex items-center justify-center`}>
                                                    <span className="text-[8px] text-white font-bold leading-none">{restrictions.minStay}</span>
                                                  </div>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Min Stay: {restrictions.minStay} nights</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {showMaxStay && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={`${getLineClass(maxStayPrev, maxStayNext, "bg-pink-500")} flex items-center justify-center`}>
                                                    <span className="text-[8px] text-white font-bold leading-none">{restrictions.maxStay}</span>
                                                  </div>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Max Stay: {restrictions.maxStay} nights</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {showLeadAdv && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={getLineClass(leadAdvPrev, leadAdvNext, "bg-yellow-500")} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Lead Days Advance: {restrictions.leadDaysAdvance}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {showLeadPost && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={getLineClass(leadPostPrev, leadPostNext, "bg-orange-500")} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Lead Days Post: {restrictions.leadDaysPost}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                              {/* Rate Rows - Now with PER ROOM / PER PERSON structure */}
                              {selectedDisplayOptions.includes("rates") && filteredRates.map((rate, rateIndex) => {
                                const isPerPerson = rate.priceType?.toUpperCase().includes("PERSON");
                                const priceTypeLabel = isPerPerson ? "PER PERSON" : "PER ROOM";
                                const rateLabel = `${rate.rateTypeName || rate.rateType} ${priceTypeLabel}`;
                                
                                // Occupancy sub-rows for PER PERSON rates - filter based on room settings
                                const occupancyRows = isPerPerson ? [
                                  { key: "1adult", label: "1 Adult", show: (room.minGuests ?? 1) <= 1 },
                                  { key: "2adults", label: "2 Adults", show: true },
                                  { key: "teen", label: "Teen", show: room.allowTeens !== false },
                                  { key: "child", label: "Child", show: room.allowChildren !== false },
                                  { key: "infant", label: "Infant", show: room.allowInfants !== false },
                                ].filter(row => row.show) : [];
                                
                                const showCheckboxes = occupancyRows.length > 1;
                                const rateTypeId = rate.rateTypeId || rate.rateType;
                                
                                // Calculate sum for header row based on checked rows (or single row if only one)
                                const getHeaderSum = (date: Date) => {
                                  if (!isPerPerson) return null;
                                  
                                  if (occupancyRows.length === 1) {
                                    // Only one row - show its rate directly
                                    const rateData = getRate(room.name, rateTypeId, rate.priceType || "PER PERSON", date, occupancyRows[0].key as any);
                                    return rateData.value;
                                  }
                                  
                                  // Sum checked rows
                                  let sum = 0;
                                  let hasChecked = false;
                                  occupancyRows.forEach(occ => {
                                    if (isOccupancyRowChecked(room.name, rateTypeId, occ.key)) {
                                      const rateData = getRate(room.name, rateTypeId, rate.priceType || "PER PERSON", date, occ.key as any);
                                      if (rateData.value != null) {
                                        sum += rateData.value;
                                        hasChecked = true;
                                      }
                                    }
                                  });
                                  return hasChecked ? sum : null;
                                };
                                
                                return (
                                  <React.Fragment key={`${room.name}-rate-${rateIndex}`}>
                                    {/* Rate Type Header Row */}
                                    <tr>
                                      <td className="border p-2 pl-4 text-sm sticky left-0 bg-background z-10">
                                        <span className="text-foreground font-medium">{rateLabel}</span>
                                      </td>
                                      {!isPerPerson && calendarDates.map((date, index) => {
                                        const weekend = isWeekend(date);
                                        const isHoliday = !!getHolidayName(date);
                                        const rateData = getRate(room.name, rate.rateTypeId || rate.rateType, rate.priceType || "PER ROOM", date, "room");
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
                                      {isPerPerson && calendarDates.map((date, index) => {
                                        const weekend = isWeekend(date);
                                        const isHoliday = !!getHolidayName(date);
                                        const headerSum = getHeaderSum(date);
                                        return (
                                          <td
                                            key={index}
                                            className={`border p-2 text-center text-sm font-medium ${
                                              isHoliday 
                                                ? "bg-green-100 dark:bg-green-950/30" 
                                                : weekend 
                                                  ? "bg-red-50 dark:bg-red-950/20" 
                                                  : ""
                                            } ${headerSum != null ? "text-primary" : "text-muted-foreground"}`}
                                          >
                                            {headerSum != null ? headerSum.toLocaleString() : "—"}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                    {/* Occupancy Sub-Rows for PER PERSON */}
                                    {isPerPerson && occupancyRows.map(occ => (
                                      <tr key={`${room.name}-rate-${rateIndex}-${occ.key}`}>
                                        <td className="border p-2 pl-6 text-sm text-muted-foreground sticky left-0 bg-background z-10">
                                          <div className="flex items-center gap-2">
                                            {showCheckboxes && (
                                              <Checkbox 
                                                checked={isOccupancyRowChecked(room.name, rateTypeId, occ.key)}
                                                onCheckedChange={() => toggleOccupancyRow(room.name, rateTypeId, occ.key)}
                                                className="h-4 w-4"
                                              />
                                            )}
                                            <span>{occ.label}</span>
                                          </div>
                                        </td>
                                        {calendarDates.map((date, index) => {
                                          const weekend = isWeekend(date);
                                          const isHoliday = !!getHolidayName(date);
                                          const rateData = getRate(
                                            room.name, 
                                            rate.rateTypeId || rate.rateType, 
                                            rate.priceType || "PER PERSON", 
                                            date, 
                                            occ.key as "1adult" | "2adults" | "teen" | "child" | "infant"
                                          );
                                          const isChecked = isOccupancyRowChecked(room.name, rateTypeId, occ.key);
                                          return (
                                            <td
                                              key={index}
                                              className={`border p-2 text-center text-sm ${
                                                isHoliday 
                                                  ? "bg-green-100 dark:bg-green-950/30" 
                                                  : weekend 
                                                    ? "bg-red-50 dark:bg-red-950/20" 
                                                    : ""
                                              } ${isChecked ? "bg-primary/10" : ""}`}
                                            >
                                              {renderCellValue(rateData.value, rateData.fromPms)}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
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
                            selectedRateTypes.includes(String(rate.rateTypeId))
                          );

                          return (
                            <React.Fragment key={room.name}>
                              {/* Room Name Row with Availability - ALWAYS visible */}
                              <tr className="bg-slate-100 dark:bg-slate-800">
                                <td className="border p-2 font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                                  {room.name}
                                </td>
                                {calendarDates.map((date, index) => {
                                  const weekend = isWeekend(date);
                                  const isHoliday = !!getHolidayName(date);
                                  const avail = getAvailability(room.name, date);
                                  const restrictions = getRestrictions(room.name, date);
                                  
                                  // Get previous and next day restrictions to determine line continuity
                                  const prevDate = index > 0 ? calendarDates[index - 1] : null;
                                  const nextDate = index < calendarDates.length - 1 ? calendarDates[index + 1] : null;
                                  const prevRestrictions = prevDate ? getRestrictions(room.name, prevDate) : null;
                                  const nextRestrictions = nextDate ? getRestrictions(room.name, nextDate) : null;
                                  
                                  // Determine which restriction indicators to show
                                  const showStopSell = selectedDisplayOptions.includes("stop_sell") && restrictions.stopSell;
                                  const showMinStay = selectedDisplayOptions.includes("min_stay") && restrictions.minStay !== null && restrictions.minStay > 0;
                                  const showMaxStay = selectedDisplayOptions.includes("max_stay") && restrictions.maxStay !== null && restrictions.maxStay > 0;
                                  const showLeadAdv = selectedDisplayOptions.includes("lead_days_advance") && restrictions.leadDaysAdvance !== null && restrictions.leadDaysAdvance > 0;
                                  const showLeadPost = selectedDisplayOptions.includes("lead_days_post") && restrictions.leadDaysPost !== null && restrictions.leadDaysPost > 0;
                                  const hasRestrictions = showStopSell || showMinStay || showMaxStay || showLeadAdv || showLeadPost;
                                  
                                  // Helper to get rounded corners based on continuity
                                  const getLineClass = (
                                    hasPrev: boolean,
                                    hasNext: boolean,
                                    baseColor: string
                                  ) => {
                                    const rounded = hasPrev && hasNext ? "" : hasPrev ? "rounded-r-full" : hasNext ? "rounded-l-full" : "rounded-full";
                                    return `h-1 flex-1 ${baseColor} ${rounded}`;
                                  };
                                  
                                  // Check continuity for each restriction type
                                  const stopSellPrev = prevRestrictions?.stopSell === true;
                                  const stopSellNext = nextRestrictions?.stopSell === true;
                                  const minStayPrev = prevRestrictions?.minStay === restrictions.minStay && prevRestrictions?.minStay && prevRestrictions.minStay > 0;
                                  const minStayNext = nextRestrictions?.minStay === restrictions.minStay && nextRestrictions?.minStay && nextRestrictions.minStay > 0;
                                  const maxStayPrev = prevRestrictions?.maxStay === restrictions.maxStay && prevRestrictions?.maxStay && prevRestrictions.maxStay > 0;
                                  const maxStayNext = nextRestrictions?.maxStay === restrictions.maxStay && nextRestrictions?.maxStay && nextRestrictions.maxStay > 0;
                                  const leadAdvPrev = prevRestrictions?.leadDaysAdvance === restrictions.leadDaysAdvance && prevRestrictions?.leadDaysAdvance && prevRestrictions.leadDaysAdvance > 0;
                                  const leadAdvNext = nextRestrictions?.leadDaysAdvance === restrictions.leadDaysAdvance && nextRestrictions?.leadDaysAdvance && nextRestrictions.leadDaysAdvance > 0;
                                  const leadPostPrev = prevRestrictions?.leadDaysPost === restrictions.leadDaysPost && prevRestrictions?.leadDaysPost && prevRestrictions.leadDaysPost > 0;
                                  const leadPostNext = nextRestrictions?.leadDaysPost === restrictions.leadDaysPost && nextRestrictions?.leadDaysPost && nextRestrictions.leadDaysPost > 0;
                                  
                                  return (
                                    <td
                                      key={index}
                                      className={`border p-1 text-center ${
                                        isHoliday 
                                          ? "bg-green-100 dark:bg-green-950/30" 
                                          : weekend 
                                            ? "bg-red-50 dark:bg-red-950/20" 
                                            : ""
                                      }`}
                                    >
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="font-semibold text-sm">{renderCellValue(avail.value, avail.fromPms)}</span>
                                        {hasRestrictions && (
                                          <div className="flex flex-col gap-0.5 w-full px-0">
                                            {showStopSell && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={getLineClass(stopSellPrev, stopSellNext, "bg-red-500")} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Stop Sell Active</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {showMinStay && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={getLineClass(minStayPrev, minStayNext, "bg-blue-500")} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Min Stay: {restrictions.minStay}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {showMaxStay && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={getLineClass(maxStayPrev, maxStayNext, "bg-pink-500")} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Max Stay: {restrictions.maxStay}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {showLeadAdv && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={getLineClass(leadAdvPrev, leadAdvNext, "bg-yellow-500")} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Lead Advance: {restrictions.leadDaysAdvance}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {showLeadPost && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={getLineClass(leadPostPrev, leadPostNext, "bg-orange-500")} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="text-xs font-medium">Lead Post: {restrictions.leadDaysPost}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                              {/* Rate Rows - Now with PER ROOM / PER PERSON structure */}
                              {selectedDisplayOptions.includes("rates") && filteredRates.map((rate, rateIndex) => {
                                const isPerPerson = rate.priceType?.toUpperCase().includes("PERSON");
                                const priceTypeLabel = isPerPerson ? "PER PERSON" : "PER ROOM";
                                const rateLabel = `${rate.rateTypeName || rate.rateType} ${priceTypeLabel}`;
                                
                                // Occupancy sub-rows for PER PERSON rates - filter based on room settings
                                const occupancyRows = isPerPerson ? [
                                  { key: "1adult", label: "1 Adult", show: (room.minGuests ?? 1) <= 1 },
                                  { key: "2adults", label: "2 Adults", show: true },
                                  { key: "teen", label: "Teen", show: room.allowTeens !== false },
                                  { key: "child", label: "Child", show: room.allowChildren !== false },
                                  { key: "infant", label: "Infant", show: room.allowInfants !== false },
                                ].filter(row => row.show) : [];
                                
                                const showCheckboxes = occupancyRows.length > 1;
                                const rateTypeId = rate.rateTypeId || rate.rateType;
                                
                                // Calculate sum for header row based on checked rows (or single row if only one)
                                const getHeaderSum = (date: Date) => {
                                  if (!isPerPerson) return null;
                                  
                                  if (occupancyRows.length === 1) {
                                    // Only one row - show its rate directly
                                    const rateData = getRate(room.name, rateTypeId, rate.priceType || "PER PERSON", date, occupancyRows[0].key as any);
                                    return rateData.value;
                                  }
                                  
                                  // Sum checked rows
                                  let sum = 0;
                                  let hasChecked = false;
                                  occupancyRows.forEach(occ => {
                                    if (isOccupancyRowChecked(room.name, rateTypeId, occ.key)) {
                                      const rateData = getRate(room.name, rateTypeId, rate.priceType || "PER PERSON", date, occ.key as any);
                                      if (rateData.value != null) {
                                        sum += rateData.value;
                                        hasChecked = true;
                                      }
                                    }
                                  });
                                  return hasChecked ? sum : null;
                                };
                                
                                return (
                                  <React.Fragment key={`${room.name}-rate-${rateIndex}`}>
                                    {/* Rate Type Header Row */}
                                    <tr>
                                      <td className="border p-1 pl-4 text-xs sticky left-0 bg-background z-10">
                                        <span className="text-foreground font-medium">{rateLabel}</span>
                                      </td>
                                      {!isPerPerson && calendarDates.map((date, index) => {
                                        const weekend = isWeekend(date);
                                        const isHoliday = !!getHolidayName(date);
                                        const rateData = getRate(room.name, rate.rateTypeId || rate.rateType, rate.priceType || "PER ROOM", date, "room");
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
                                      {isPerPerson && calendarDates.map((date, index) => {
                                        const weekend = isWeekend(date);
                                        const isHoliday = !!getHolidayName(date);
                                        const headerSum = getHeaderSum(date);
                                        return (
                                          <td
                                            key={index}
                                            className={`border p-1 text-center text-xs font-medium ${
                                              isHoliday 
                                                ? "bg-green-100 dark:bg-green-950/30" 
                                                : weekend 
                                                  ? "bg-red-50 dark:bg-red-950/20" 
                                                  : ""
                                            } ${headerSum != null ? "text-primary" : "text-muted-foreground"}`}
                                          >
                                            {headerSum != null ? headerSum.toLocaleString() : "—"}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                    {/* Occupancy Sub-Rows for PER PERSON */}
                                    {isPerPerson && occupancyRows.map(occ => (
                                      <tr key={`${room.name}-rate-${rateIndex}-${occ.key}`}>
                                        <td className="border p-1 pl-6 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                                          <div className="flex items-center gap-1">
                                            {showCheckboxes && (
                                              <Checkbox 
                                                checked={isOccupancyRowChecked(room.name, rateTypeId, occ.key)}
                                                onCheckedChange={() => toggleOccupancyRow(room.name, rateTypeId, occ.key)}
                                                className="h-3 w-3"
                                              />
                                            )}
                                            <span>{occ.label}</span>
                                          </div>
                                        </td>
                                        {calendarDates.map((date, index) => {
                                          const weekend = isWeekend(date);
                                          const isHoliday = !!getHolidayName(date);
                                          const rateData = getRate(
                                            room.name, 
                                            rate.rateTypeId || rate.rateType, 
                                            rate.priceType || "PER PERSON", 
                                            date, 
                                            occ.key as "1adult" | "2adults" | "teen" | "child" | "infant"
                                          );
                                          const isChecked = isOccupancyRowChecked(room.name, rateTypeId, occ.key);
                                          return (
                                            <td
                                              key={index}
                                              className={`border p-1 text-center text-xs ${
                                                isHoliday 
                                                  ? "bg-green-100 dark:bg-green-950/30" 
                                                  : weekend 
                                                    ? "bg-red-50 dark:bg-red-950/20" 
                                                    : ""
                                              } ${isChecked ? "bg-primary/10" : ""}`}
                                            >
                                              {renderCellValue(rateData.value, rateData.fromPms)}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
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
