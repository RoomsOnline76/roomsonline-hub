import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusIndicator } from "@/components/ui/status-indicator";
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
  hotelbeds_hotel_code: string | null;
  hostfully_property_uid: string | null;
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
      // Update URL without navigation using window.history
      const newUrl = `${window.location.pathname}?property=${selectedProperty}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [selectedProperty, properties]);

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
      case "hotelbeds": return property.hotelbeds_hotel_code;
      case "hostfully": return property.hostfully_property_uid || property.external_id;
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
        
        // Map restrictions if present - extract from restrictions JSON
        if (row.restrictions) {
          const restrictionsData = row.restrictions as any;
          // Handle both array and object formats
          const r = Array.isArray(restrictionsData) ? restrictionsData[0] : restrictionsData;
          if (r && typeof r === 'object') {
            roomData.restrictionsByDate[dateStr] = {
              stopSell: r.stop_sell ?? r.stopSell ?? false,
              minStay: r.min_stay ?? r.minStay ?? null,
              maxStay: r.max_stay ?? r.maxStay ?? null,
              leadDaysAdvance: r.lead_days_advance ?? r.leadDaysAdvance ?? null,
              leadDaysPost: r.lead_days_post ?? r.leadDaysPost ?? null,
              closedToArrival: r.closed_to_arrival ?? r.closedToArrival ?? false,
              closedToDeparture: r.closed_to_departure ?? r.closedToDeparture ?? false,
            };
          }
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
          propertyUid: pmsPropertyCode,
          startDate: startDateStr,
          endDate: endDateStr,
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

      // Transform PMS data into unified format
      const transformedData: PMSRoomTypeData[] = [];
      
      // Unwrap adapter contract response format (data is nested in data.data)
      const responseData = data?.data || data;
      const roomTypes = responseData?.room_types || responseData?.roomTypes || [];
      
      // Debug logging for rate types
      console.log('[Calendar] Raw PMS response:', {
        hasData: !!data,
        hasDataData: !!data?.data,
        roomTypeCount: roomTypes.length,
        firstRoomSample: roomTypes[0] ? {
          id: roomTypes[0].room_type_id,
          name: roomTypes[0].room_type_name,
          rateTypesCount: roomTypes[0].rate_types?.length || 0,
          firstRateType: roomTypes[0].rate_types?.[0],
        } : null,
      });
      
      if (Array.isArray(roomTypes)) {
        for (const roomType of roomTypes) {
          const roomData: PMSRoomTypeData = {
            // Handle both snake_case (contract) and camelCase (legacy) formats
            roomTypeId: (roomType.room_type_id ?? roomType.roomTypeId)?.toString() || "",
            roomTypeName: roomType.room_type_name ?? roomType.roomTypeName ?? roomType.name ?? `Room ${roomType.room_type_id ?? roomType.roomTypeId}`,
            availabilityByDate: {},
            ratesByDate: {},
            restrictionsByDate: {},
          };

          // Map availability per night - handle both formats
          const availPerNight = roomType.rooms_available_per_night ?? roomType.roomsAvailablePerNight ?? [];
          if (Array.isArray(availPerNight)) {
            for (const avail of availPerNight) {
              const dateStr = avail.date;
              roomData.availabilityByDate[dateStr] = avail.available_units ?? avail.numberOfRoomsAvailable ?? 0;
              
              // Map restrictions if present
              roomData.restrictionsByDate[dateStr] = {
                stopSell: avail.stop_sell ?? avail.stopSell ?? false,
                minStay: avail.min_stay ?? avail.minimumStay ?? avail.minStay,
                maxStay: avail.max_stay ?? avail.maximumStay ?? avail.maxStay,
                leadDaysAdvance: avail.lead_days_advance ?? avail.leadDaysAdvance,
                leadDaysPost: avail.lead_days_post ?? avail.leadDaysPost,
                closedToArrival: avail.closed_to_arrival ?? avail.closedToArrival ?? false,
                closedToDeparture: avail.closed_to_departure ?? avail.closedToDeparture ?? false,
              };
            }
          }

          // Map rates - handle both formats
          const rateTypesArray = roomType.rate_types ?? roomType.rateTypes ?? [];
          if (Array.isArray(rateTypesArray)) {
            for (const rateType of rateTypesArray) {
              const ratesArray = rateType.rates ?? [];
              if (Array.isArray(ratesArray)) {
                for (const rate of ratesArray) {
                  const dateStr = rate.date;
                  if (!roomData.ratesByDate[dateStr]) {
                    roomData.ratesByDate[dateStr] = [];
                  }
                  
                  // Build adult amounts from either format
                  const adultAmounts: { [key: string]: number } = {};
                  const rawAdultAmounts = rate.adult_amounts ?? {};
                  
                  // Handle snake_case (adult_amount_1, adult_amount_2, etc.)
                  for (let i = 1; i <= 10; i++) {
                    const snakeKey = `adult_amount_${i}`;
                    const camelKey = `adultAmount${i}`;
                    const value = rawAdultAmounts[snakeKey] ?? rawAdultAmounts[camelKey] ?? rate[camelKey];
                    if (value !== undefined && value !== null) {
                      adultAmounts[camelKey] = value;
                    }
                  }
                  
                  roomData.ratesByDate[dateStr].push({
                    rateTypeId: (rateType.rate_type_id ?? rateType.rateTypeId)?.toString() || "",
                    rateTypeName: rateType.rate_type_name ?? rateType.name ?? `Rate ${rateType.rate_type_id ?? rateType.rateTypeId}`,
                    priceType: rateType.price_type ?? rateType.priceType ?? "UnitRate",
                    roomAmount: rate.room_amount ?? rate.roomAmount ?? 0,
                    adultAmounts: Object.keys(adultAmounts).length > 0 ? adultAmounts : undefined,
                    teenAmount: rate.teen_amount ?? rate.teenAmount,
                    childAmount: rate.child_amount ?? rate.childAmount,
                    infantAmount: rate.infant_amount ?? rate.infantAmount,
                  });
                }
              }
            }
          }

          transformedData.push(roomData);
        }
      }
      
      // Debug logging for transformed data
      console.log('[Calendar] Transformed PMS data:', {
        roomCount: transformedData.length,
        firstRoom: transformedData[0] ? {
          id: transformedData[0].roomTypeId,
          name: transformedData[0].roomTypeName,
          ratesCount: Object.keys(transformedData[0].ratesByDate).length,
          sampleRates: transformedData[0].ratesByDate[Object.keys(transformedData[0].ratesByDate)[0]],
        } : null,
      });

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
        .in("role", ["admin", "dev"]);

      const adminStatus = roleData && roleData.length > 0;
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
        .select("id, name, amenities, owner_email, external_system, external_id, benson_property_code, checkfront_property_code, siteminder_property_code, hotelbeds_hotel_code, hostfully_property_uid")
        .eq("is_active", true);

      if (!adminStatus && email) {
        query = query.eq("owner_email", email);
      }

      const { data, error } = await query.order("name");

      if (error) throw error;

      const accommodationProperties = (data || []).filter((property: any) => {
        // Exclude NightsBridge properties (they use iframe-based booking, not calendar sync)
        if (property.external_system === 'nightsbridge') return false;
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
        const rateTypeId = rt.id || rt.rate_type_id;
        if (rateTypeId && rt.name) {
          const rtIdStr = String(rateTypeId);
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
    
    // No restrictions available
    return {
      stopSell: null,
      minStay: null,
      maxStay: null,
      leadDaysAdvance: null,
      leadDaysPost: null,
      fromPms: false,
    };
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
    <AppLayout>
      <PageHeader
        title="Calendar"
        subtitle={selectedPropertyData ? selectedPropertyData.name : "Select a property"}
      />
        {selectedPropertyData && (
          <div className="mb-2 p-2 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Managing:</span>
              <h2 className="text-sm font-semibold text-primary">{selectedPropertyData.name}</h2>
            </div>
            <div className="ml-auto flex gap-2 items-center">
              {isPmsProperty && (
                <div className="flex items-center gap-2">
                  {pmsSyncStatus === "loading" && (
                    <StatusIndicator status="syncing" label="Syncing..." size="sm" />
                  )}
                  {pmsSyncStatus === "success" && (
                    <StatusIndicator 
                      status="healthy" 
                      label={`${selectedPropertyData.external_system?.toUpperCase()} Connected`} 
                      size="sm" 
                    />
                  )}
                  {pmsSyncStatus === "not_configured" && (
                    <StatusIndicator 
                      status="error" 
                      label={`${selectedPropertyData.external_system?.toUpperCase()} Not Configured`} 
                      size="sm" 
                    />
                  )}
                  {pmsSyncStatus === "no_property_code" && (
                    <StatusIndicator status="warning" label="No Property Code" size="sm" />
                  )}
                  {pmsSyncStatus === "error" && (
                    <StatusIndicator status="error" label="Sync Error" size="sm" />
                  )}
                  {pmsSyncStatus === "idle" && (
                    <StatusIndicator status="stale" label="No PMS" size="sm" />
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
          <Alert variant="destructive" className="mb-2 py-2">
            <AlertCircle className="h-3 w-3" />
            <AlertTitle className="text-xs">{selectedPropertyData.external_system?.toUpperCase()} API Not Configured</AlertTitle>
            <AlertDescription className="text-xs">
              {pmsSyncError || `Configure ${selectedPropertyData.external_system} API credentials in Admin → API Keys.`}
            </AlertDescription>
          </Alert>
        )}

        {selectedPropertyData && isPmsProperty && pmsSyncStatus === "no_property_code" && (
          <Alert className="mb-2 py-2 border-yellow-500">
            <AlertCircle className="h-3 w-3 text-yellow-600" />
            <AlertTitle className="text-xs text-yellow-600">Missing Property Code</AlertTitle>
            <AlertDescription className="text-xs">
              Add Property Code in property settings for {selectedPropertyData.external_system}.
            </AlertDescription>
          </Alert>
        )}

        {selectedPropertyData && isPmsProperty && pmsSyncStatus === "success" && lastSyncTime && (
          <div className="mb-2 text-xs text-muted-foreground flex items-center gap-1">
            <Cloud className="h-3 w-3 text-green-600" />
            Synced from {selectedPropertyData.external_system}: {lastSyncTime.toLocaleTimeString()}
          </div>
        )}

        {/* Tabs */}
        <Tabs value="accommodation" className="mb-3">
          <TabsList className="grid w-full max-w-md h-8" style={{ gridTemplateColumns: `repeat(${1 + (hasEventWedding ? 1 : 0) + (hasConference ? 1 : 0)}, 1fr)` }}>
            <TabsTrigger value="accommodation" className="text-xs py-1">Accommodation</TabsTrigger>
            {hasEventWedding && (
              <TabsTrigger value="event" onClick={() => navigateToTab("event")} className="text-xs py-1">
                Event/Wedding
              </TabsTrigger>
            )}
            {hasConference && (
              <TabsTrigger value="conference" onClick={() => navigateToTab("conference")} className="text-xs py-1">
                Conference
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* Header */}
        <div className="mb-2">
          <h1 className="text-xl font-bold">Calendar</h1>
        </div>

        <Card>
          <CardContent className="p-3">
            {/* Filters and Actions */}
            <div className="flex flex-wrap gap-2 mb-3">
              <Select value={selectedProperty} onValueChange={handlePropertyChange} disabled={loading}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
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
                  <Button variant="outline" className="w-[160px] h-8 text-xs justify-between" disabled={!selectedProperty}>
                    Room Types ({getSelectedCount(selectedRoomTypes, roomTypes.length)})
                    <ChevronDown className="h-3 w-3 ml-1" />
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
                  <Button variant="outline" className="w-[160px] h-8 text-xs justify-between">
                    Rate Types ({getSelectedCount(selectedRateTypes, rateTypeOptions.length)})
                    <ChevronDown className="h-3 w-3 ml-1" />
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
                className="gap-1 h-8 text-xs px-2"
                onClick={() => {
                  if (isPmsProperty) {
                    fetchPmsAvailability(true);
                  }
                }}
                disabled={pmsSyncStatus === "loading"}
              >
                {pmsSyncStatus === "loading" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {isPmsProperty ? `Sync ${selectedPropertyData?.external_system || "PMS"}` : "Refresh"}
              </Button>

              <div className="ml-auto flex gap-1">
                <Button variant="default" disabled className="opacity-50 cursor-not-allowed h-8 text-xs px-2">Save</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" disabled className="gap-1 opacity-50 cursor-not-allowed h-8 text-xs px-2">
                      Rules/Bulk
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-popover">
                    <DropdownMenuItem onClick={() => setBulkRateOpen(true)} disabled>
                      Bulk Rate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkAvailabilityOpen(true)} disabled>
                      Bulk Availability
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStopSellOpen(true)} disabled>
                      Stop Sell
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMinStayOpen(true)} disabled>
                      Minimum Stay
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMaxStayOpen(true)} disabled>
                      Maximum Stay
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysAdvanceOpen(true)} disabled>
                      Lead Days Advance
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysPostOpen(true)} disabled>
                      Lead Days Post
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* No Property Selected Message */}
            {!selectedProperty && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Select a property to begin.
              </div>
            )}

            {/* Calendar Section */}
            {selectedProperty && (
              <>
                {/* Calendar Navigation */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={goToStart} className="h-7 w-7">
                      <ChevronsLeft className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToPrevious} className="h-7 w-7">
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="text-sm font-semibold min-w-[130px] text-center">
                      {currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                    <Button variant="outline" size="icon" onClick={goToNext} className="h-7 w-7">
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToEnd} className="h-7 w-7">
                      <ChevronsRight className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" onClick={goToToday} className="h-7 text-xs px-2">
                      Today
                    </Button>
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant={viewMode === "week" ? "default" : "outline"}
                      onClick={() => setViewMode("week")}
                      className="h-7 text-xs px-2"
                    >
                      Week
                    </Button>
                    <Button
                      variant={viewMode === "month" ? "default" : "outline"}
                      onClick={() => setViewMode("month")}
                      className="h-7 text-xs px-2"
                    >
                      Month
                    </Button>
                  </div>
                </div>

                {/* Display Options with colored indicator legend */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-muted-foreground">Show:</span>
                  {/* Rates toggle */}
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="legend-rates"
                      checked={selectedDisplayOptions.includes("rates")}
                      onCheckedChange={() => toggleDisplayOption("rates")}
                      className="h-3 w-3"
                    />
                    <label htmlFor="legend-rates" className="text-xs cursor-pointer font-medium">
                      Rates
                    </label>
                  </div>
                  <span className="text-muted-foreground text-xs">|</span>
                  <span className="text-[10px] text-muted-foreground">Restrictions:</span>
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
                      <div key={option.id} className="flex items-center gap-1">
                        <Checkbox
                          id={`legend-${option.id}`}
                          checked={isChecked}
                          onCheckedChange={() => toggleDisplayOption(option.id)}
                          className="border-0 h-3 w-3"
                          style={{ 
                            backgroundColor: bgColor,
                            color: "white"
                          }}
                        />
                        <label htmlFor={`legend-${option.id}`} className="text-xs cursor-pointer">
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
                          <th className="border bg-muted/50 p-1 min-w-[150px] sticky left-0 bg-background z-10"></th>
                          {calendarDates.map((date, index) => {
                            const header = formatDayHeader(date);
                            const weekend = isWeekend(date);
                            const holidayName = getHolidayName(date);
                            const isHoliday = !!holidayName;
                            const isTodayDate = isToday(date);
                            
                            const headerContent = (
                              <th
                                key={index}
                                className={`border p-1 text-center min-w-[60px] ${
                                  isTodayDate
                                    ? "bg-primary/20 dark:bg-primary/30 ring-1 ring-primary ring-inset"
                                    : isHoliday 
                                      ? "bg-green-100 dark:bg-green-950/30" 
                                      : weekend 
                                        ? "bg-red-50 dark:bg-red-950/20" 
                                        : "bg-muted/50"
                                }`}
                              >
                                <div className={`text-[10px] font-semibold ${
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
                                <div className={`text-[10px] ${
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
                                  <div className="text-[8px] font-semibold text-primary">TODAY</div>
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
                                <td className="border p-1 font-semibold text-xs text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
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
                                      <div className="flex flex-col items-center">
                                        <span className="font-semibold text-xs">{renderCellValue(avail.value, avail.fromPms)}</span>
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
                                      <td className="border p-1 pl-3 text-xs sticky left-0 bg-background z-10">
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
                                        <td className="border p-1 pl-4 text-xs text-muted-foreground sticky left-0 bg-background z-10">
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

                {viewMode === "month" && (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full border-collapse">
                      {/* Date Header Row */}
                      <thead>
                        <tr>
                          <th className="border bg-muted/50 p-1 min-w-[150px] sticky left-0 bg-background z-10"></th>
                          {calendarDates.map((date, index) => {
                            const header = formatDayHeader(date);
                            const weekend = isWeekend(date);
                            const holidayName = getHolidayName(date);
                            const isHoliday = !!holidayName;
                            const isTodayDate = isToday(date);
                            
                            const headerContent = (
                              <th
                                key={index}
                                className={`border p-0.5 text-center min-w-[40px] ${
                                  isTodayDate
                                    ? "bg-primary/20 dark:bg-primary/30 ring-1 ring-primary ring-inset"
                                    : isHoliday 
                                      ? "bg-green-100 dark:bg-green-950/30" 
                                      : weekend 
                                        ? "bg-red-50 dark:bg-red-950/20" 
                                        : "bg-muted/50"
                                }`}
                              >
                                <div className={`text-[9px] font-semibold ${
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
                                <div className={`text-xs font-bold ${
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
                                <td className="border p-1 font-semibold text-xs text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
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
                                      <div className="flex flex-col items-center">
                                        <span className="font-semibold text-xs">{renderCellValue(avail.value, avail.fromPms)}</span>
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

      <BulkRateRuleDialog open={bulkRateOpen} onOpenChange={setBulkRateOpen} />
      <BulkAvailabilityRuleDialog open={bulkAvailabilityOpen} onOpenChange={setBulkAvailabilityOpen} />
      <BulkStopSellDialog open={stopSellOpen} onOpenChange={setStopSellOpen} />
      <BulkMinimumStayDialog open={minStayOpen} onOpenChange={setMinStayOpen} />
      <BulkMaximumStayDialog open={maxStayOpen} onOpenChange={setMaxStayOpen} />
      <BulkLeadDaysAdvanceDialog open={leadDaysAdvanceOpen} onOpenChange={setLeadDaysAdvanceOpen} />
      <BulkLeadDaysPostDialog open={leadDaysPostOpen} onOpenChange={setLeadDaysPostOpen} />
    </AppLayout>
  );
};

export default CalendarAccommodation;
