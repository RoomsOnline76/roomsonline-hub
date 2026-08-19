import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, RefreshCw, ChevronsLeft, ChevronsRight, Building2, AlertCircle, Loader2, Cloud, CloudOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BulkRateRuleDialog } from "@/components/BulkRateRuleDialog";
import { BulkAvailabilityRuleDialog } from "@/components/BulkAvailabilityRuleDialog";
import { BulkStopSellDialog } from "@/components/BulkStopSellDialog";
import { BulkMinimumStayDialog } from "@/components/BulkMinimumStayDialog";
import { BulkMaximumStayDialog } from "@/components/BulkMaximumStayDialog";
import { BulkLeadDaysAdvanceDialog } from "@/components/BulkLeadDaysAdvanceDialog";
import { BulkLeadDaysPostDialog } from "@/components/BulkLeadDaysPostDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, subDays } from "date-fns";

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
  is_rol_property?: boolean | null;
  property_type?: string | null;
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
    }[];
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
  cacheVersion?: number;
}

interface CanonicalRoomType {
  id: string;
  name: string;
  category: string | null;
}

type PMSSyncStatus = "idle" | "loading" | "success" | "error" | "not_configured" | "no_property_code";

const restrictionOptions = [
  { id: "stop_sell", label: "Stop Sell", color: "bg-red-500" },
  { id: "min_stay", label: "Min Stay", color: "bg-blue-500" },
  { id: "max_stay", label: "Max Stay", color: "bg-pink-500" },
  { id: "lead_days_advance", label: "Lead Days Advance", color: "bg-yellow-500" },
  { id: "lead_days_post", label: "Lead Days Post", color: "bg-orange-500" },
];

const PMS_SESSION_CACHE_VERSION = 3;

const getRoomDisplayOrder = (name: string) => {
  const normalized = name.trim().toLowerCase();
  const preferredOrder: Record<string, number> = {
    "compact studio": 1,
    "studio": 2,
    "compact one bedroom apartment": 3,
    "one-bedroom apartment": 4,
    "two-bedroom apartment": 5,
  };
  return preferredOrder[normalized] ?? 100;
};

const sortRoomsByDisplayOrder = <T extends { name: string }>(rooms: T[]) =>
  [...rooms].sort((a, b) => {
    const rankDiff = getRoomDisplayOrder(a.name) - getRoomDisplayOrder(b.name);
    return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
  });

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
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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

interface BookingOverlayRow {
  id: string;
  reference: string | null;
  guestName: string;
  status: string;
  channel: string | null;
}

interface BookedCell {
  units: number;
  stays: BookingOverlayRow[];
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
  const [selectedDisplayOptions, setSelectedDisplayOptions] = useState<string[]>([
    "rates",
    "stop_sell",
    "min_stay",
    "max_stay",
    "lead_days_advance",
    "lead_days_post",
  ]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedRateTypes, setSelectedRateTypes] = useState<string[]>([]);
  const [checkedOccupancyRows, setCheckedOccupancyRows] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [roomCategoryMap, setRoomCategoryMap] = useState<Map<string, string>>(new Map());
  const [canonicalRoomTypeMap, setCanonicalRoomTypeMap] = useState<Map<string, CanonicalRoomType>>(new Map());
  const [bookedByRoom, setBookedByRoom] = useState<Map<string, Map<string, BookedCell>>>(new Map());



  const toggleOccupancyRow = (roomName: string, rateTypeId: string, occKey: string) => {
    const key = `${roomName}-${rateTypeId}-${occKey}`;
    setCheckedOccupancyRows((prev) => {
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

  const [pmsData, setPmsData] = useState<PMSData>(() => {
    const propertyId = searchParams.get("property");
    if (propertyId) {
      const cached = sessionStorage.getItem(`pms_data_${propertyId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.cacheVersion !== PMS_SESSION_CACHE_VERSION) {
            sessionStorage.removeItem(`pms_data_${propertyId}`);
            return { roomTypes: [], lastSynced: null, systemType: "" };
          }
          return {
            ...parsed,
            lastSynced: parsed.lastSynced ? new Date(parsed.lastSynced) : null,
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
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.cacheVersion === PMS_SESSION_CACHE_VERSION) return "success";
          sessionStorage.removeItem(`pms_data_${propertyId}`);
        } catch (_) {
          sessionStorage.removeItem(`pms_data_${propertyId}`);
        }
      }
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
          if (parsed.cacheVersion !== PMS_SESSION_CACHE_VERSION) {
            sessionStorage.removeItem(`pms_data_${propertyId}`);
            return null;
          }
          return parsed.lastSynced ? new Date(parsed.lastSynced) : null;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  });

  const selectedPropertyData = properties.find((p) => p.id === selectedProperty);
  const hasAccommodation = selectedPropertyData?.amenities?.offerings?.accommodation === true;
  const hasEventWedding = selectedPropertyData?.amenities?.offerings?.event_wedding === true;
  const hasConference = selectedPropertyData?.amenities?.offerings?.conference === true;

  useEffect(() => {
    checkUserRoleAndFetchProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      fetchRoomTypes(selectedProperty);
      const newUrl = `${window.location.pathname}?property=${selectedProperty}`;
      window.history.replaceState(null, "", newUrl);

      const prop = properties.find((p) => p.id === selectedProperty);
      if (prop?.external_system === "hostfully") {
        fetchRoomCategories(selectedProperty);
      } else {
        setRoomCategoryMap(new Map());
        setCanonicalRoomTypeMap(new Map());
      }
    }
  }, [selectedProperty, properties]);

  useEffect(() => {
    if (canonicalRoomTypeMap.size > 0) {
      setSelectedRoomTypes(Array.from(canonicalRoomTypeMap.values()).map((room) => room.name));
      return;
    }

    if (pmsData.roomTypes.length > 0) {
      setSelectedRoomTypes(pmsData.roomTypes.map((room) => room.roomTypeName));
      return;
    }

    if (roomTypes.length > 0) {
      setSelectedRoomTypes(roomTypes.map((r) => r.name || r));
    }
  }, [roomTypes, pmsData.roomTypes, canonicalRoomTypeMap]);

  const getPmsPropertyCode = useCallback((property: Property | undefined): string | null => {
    if (!property?.external_system) return null;
    switch (property.external_system) {
      case "roomsonline":
        return property.id;
      case "benson":
        return property.benson_property_code;
      case "checkfront":
        return property.checkfront_property_code;
      case "siteminder":
        return property.siteminder_property_code;
      case "hotelbeds":
        return property.hotelbeds_hotel_code;
      case "hostfully":
        return property.hostfully_property_uid || property.external_id;
      case "nightsbridge":
      case "semper":
      case "mews":
      case "opera":
        return property.external_id;
      default:
        return property.external_id;
    }
  }, []);

  const isPmsProperty = !!selectedPropertyData?.external_system;
  const isNativeRolosProperty = selectedPropertyData?.external_system === "roomsonline" && !!selectedPropertyData?.is_rol_property;
  const pmsPropertyCode = getPmsPropertyCode(selectedPropertyData);
  const hasPmsPropertyCode = !!pmsPropertyCode;

  const loadCachedAvailability = useCallback(async (
    propertyId: string,
    startDateStr: string,
    endDateStr: string,
    options?: { allowStale?: boolean }
  ): Promise<PMSRoomTypeData[] | null> => {
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

      const latestFetch = cachedData.reduce((latest, row) => {
        const fetchedAt = new Date(row.fetched_at || row.created_at);
        return fetchedAt > latest ? fetchedAt : latest;
      }, new Date(0));

      const cacheAgeMinutes = (Date.now() - latestFetch.getTime()) / (1000 * 60);
      if (cacheAgeMinutes > 30 && !options?.allowStale) {
        console.log(`Cache is ${Math.round(cacheAgeMinutes)} minutes old, fetching fresh data`);
        return null;
      }

      const earliestCachedDate = cachedData[0]?.date;
      const latestCachedDate = cachedData[cachedData.length - 1]?.date;
      const requiredEndDate = format(subDays(new Date(endDateStr), 1), "yyyy-MM-dd");

      if (!earliestCachedDate || earliestCachedDate > startDateStr) {
        console.log("Cache starts too late, fetching fresh data", { earliestCachedDate, startDateStr });
        return null;
      }

      if (!latestCachedDate || latestCachedDate < requiredEndDate) {
        console.log("Cache does not cover required range, fetching fresh data", {
          latestCachedDate,
          requiredEndDate,
          requestedEndDate: endDateStr,
        });
        return null;
      }

      const roomTypeMap = new Map<string, PMSRoomTypeData>();

      for (const row of cachedData) {
        const roomTypeId = row.external_room_type_id;

        if (!roomTypeMap.has(roomTypeId)) {
          const rawData = row.raw_data as Record<string, any> | null;
          roomTypeMap.set(roomTypeId, {
            roomTypeId,
            roomTypeName: rawData?.roomTypeName || rawData?.room_type_name || rawData?.name || `Room ${roomTypeId}`,
            availabilityByDate: {},
            ratesByDate: {},
            restrictionsByDate: {},
          });
        }

        const roomData = roomTypeMap.get(roomTypeId)!;
        const dateStr = row.date;
        roomData.availabilityByDate[dateStr] = row.available_units ?? 0;

        if (row.rates) {
          if (!roomData.ratesByDate[dateStr]) {
            roomData.ratesByDate[dateStr] = [];
          }

          const rawRates = row.rates as any;
          const ratesArray = Array.isArray(rawRates) ? rawRates : [rawRates];

          for (const rates of ratesArray) {
            if (rates && typeof rates === "object") {
              roomData.ratesByDate[dateStr].push({
                rateTypeId: rates.rate_type_id?.toString() || "per-unit",
                rateTypeName: rates.rate_type_name || "Per Unit Rate",
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

        if (row.restrictions) {
          const restrictionsData = row.restrictions as any;
          const r = Array.isArray(restrictionsData) ? restrictionsData[0] : restrictionsData;
          if (r && typeof r === "object") {
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

    const isBenson = selectedPropertyData.external_system === "benson";
    const isHostfully = selectedPropertyData.external_system === "hostfully";
    const prefersCachedCalendarData = isBenson || isHostfully;

    // Benson calendar sync should only fetch the visible window (+ small buffer)
    // to avoid orchestrator timeouts on large 13-month requests.
    const startDate = new Date(currentDate);
    const endDate = new Date(startDate);

    if (isBenson) {
      const visibleDays = viewMode === "month" ? 31 : 9;
      const bufferDays = viewMode === "month" ? 7 : 3;
      endDate.setDate(endDate.getDate() + visibleDays + bufferDays);
    } else {
      if (viewMode === "month") {
        startDate.setDate(1);
      } else {
        const day = startDate.getDay();
        const diff = day === 6 ? 0 : -(day + 1);
        startDate.setDate(startDate.getDate() + diff);
      }

      endDate.setDate(endDate.getDate() + 395);
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
          cacheVersion: PMS_SESSION_CACHE_VERSION,
        });
        setPmsSyncStatus("success");
        setLastSyncTime(new Date());
        console.log("Using cached PMS data");
        return;
      }
    }

    const transformedRoomsHaveRates = (rooms: PMSRoomTypeData[]) =>
      rooms.some((room) =>
        Object.values(room.ratesByDate).some((dateRates) =>
          dateRates.some((rate) =>
            (rate.roomAmount != null && rate.roomAmount > 0) ||
            (rate.adultAmounts && Object.values(rate.adultAmounts).some((value) => value != null && value > 0)) ||
            (rate.teenAmount != null && rate.teenAmount > 0) ||
            (rate.childAmount != null && rate.childAmount > 0) ||
            (rate.infantAmount != null && rate.infantAmount > 0)
          )
        )
      );

    // Keep long-range calendar views usable while a live refresh runs.
    let staleFallbackApplied = false;

    if (forceRefresh && prefersCachedCalendarData) {
      const staleCachedData = await loadCachedAvailability(selectedPropertyData.id, startDateStr, endDateStr, { allowStale: true });
      if (staleCachedData && staleCachedData.length > 0) {
        setPmsData({
          roomTypes: staleCachedData,
          lastSynced: new Date(),
          systemType: selectedPropertyData.external_system,
          cacheVersion: PMS_SESSION_CACHE_VERSION,
        });
        staleFallbackApplied = transformedRoomsHaveRates(staleCachedData);
      }
    }

    setPmsSyncStatus("loading");
    setPmsSyncError("");

    const applyCalendarData = (roomTypesPayload: any[]) => {
      const transformedData: PMSRoomTypeData[] = [];

      console.log("[Calendar] Raw PMS response:", {
        hasData: true,
        roomTypeCount: roomTypesPayload.length,
        firstRoomSample: roomTypesPayload[0]
          ? {
              id: roomTypesPayload[0].room_type_id,
              name: roomTypesPayload[0].room_type_name,
              rateTypesCount: roomTypesPayload[0].rate_types?.length || 0,
              firstRateType: roomTypesPayload[0].rate_types?.[0],
            }
          : null,
      });

      if (Array.isArray(roomTypesPayload)) {
        for (const roomType of roomTypesPayload) {
          const roomData: PMSRoomTypeData = {
            roomTypeId: (roomType.room_type_id ?? roomType.roomTypeId)?.toString() || "",
            roomTypeName:
              roomType.room_type_name ??
              roomType.roomTypeName ??
              roomType.name ??
              `Room ${roomType.room_type_id ?? roomType.roomTypeId}`,
            availabilityByDate: {},
            ratesByDate: {},
            restrictionsByDate: {},
          };

          const availPerNight =
            roomType.rooms_available_per_night ??
            roomType.roomsAvailablePerNight ??
            roomType.availability_per_night ??
            [];

          if (Array.isArray(availPerNight)) {
            for (const avail of availPerNight) {
              const dateStr = avail.date;
              const restrictionSource = avail.restrictions ?? avail;
              roomData.availabilityByDate[dateStr] = avail.available_units ?? avail.numberOfRoomsAvailable ?? 0;
              roomData.restrictionsByDate[dateStr] = {
                stopSell: restrictionSource.stop_sell ?? restrictionSource.stopSell ?? false,
                minStay: restrictionSource.min_stay ?? restrictionSource.minimumStay ?? restrictionSource.minStay,
                maxStay: restrictionSource.max_stay ?? restrictionSource.maximumStay ?? restrictionSource.maxStay,
                leadDaysAdvance: restrictionSource.lead_days_advance ?? restrictionSource.leadDaysAdvance,
                leadDaysPost: restrictionSource.lead_days_post ?? restrictionSource.leadDaysPost,
                closedToArrival: restrictionSource.closed_to_arrival ?? restrictionSource.closedToArrival ?? false,
                closedToDeparture: restrictionSource.closed_to_departure ?? restrictionSource.closedToDeparture ?? false,
              };
            }
          }

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

                  const adultAmounts: { [key: string]: number } = {};
                  const rawAdultAmounts = rate.adult_amounts ?? {};

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
                    rateTypeName:
                      rateType.rate_type_name ??
                      rateType.name ??
                      `Rate ${rateType.rate_type_id ?? rateType.rateTypeId}`,
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

      console.log("[Calendar] Transformed PMS data:", {
        roomCount: transformedData.length,
        firstRoom: transformedData[0]
          ? {
              id: transformedData[0].roomTypeId,
              name: transformedData[0].roomTypeName,
              ratesCount: Object.keys(transformedData[0].ratesByDate).length,
              sampleRates: transformedData[0].ratesByDate[Object.keys(transformedData[0].ratesByDate)[0]],
            }
          : null,
      });

      setPmsData({
        roomTypes: transformedData,
        lastSynced: new Date(),
        systemType: selectedPropertyData.external_system,
        cacheVersion: PMS_SESSION_CACHE_VERSION,
      });
      setPmsSyncStatus("success");
      setLastSyncTime(new Date());
    };

    const rawPayloadHasRates = (roomTypesPayload: unknown[]) =>
      roomTypesPayload.some((roomType) => {
        const roomRecord = roomType as Record<string, unknown>;
        const rateTypesArray = roomRecord.rate_types ?? roomRecord.rateTypes ?? [];
        return Array.isArray(rateTypesArray) && rateTypesArray.some((rateType) => {
          const rateTypeRecord = rateType as Record<string, unknown>;
          const ratesArray = rateTypeRecord.rates ?? [];
          return Array.isArray(ratesArray) && ratesArray.some((rate) =>
            Number((rate as Record<string, unknown>).room_amount ?? 0) > 0 ||
            Number((rate as Record<string, unknown>).roomAmount ?? 0) > 0 ||
            (Array.isArray((rate as Record<string, unknown>).adult_amounts) &&
              ((rate as Record<string, unknown>).adult_amounts as unknown[]).some((value) => Number(value) > 0))
          );
        });
      });

    const recoverFromCachedCalendarData = async (attempts = 1, delayMs = 0) => {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const recoveredCache = await loadCachedAvailability(
          selectedPropertyData.id,
          startDateStr,
          endDateStr,
          { allowStale: true }
        );

        if (recoveredCache && recoveredCache.length > 0 && transformedRoomsHaveRates(recoveredCache)) {
          setPmsData({
            roomTypes: recoveredCache,
            lastSynced: new Date(),
            systemType: selectedPropertyData.external_system,
            cacheVersion: PMS_SESSION_CACHE_VERSION,
          });
          setPmsSyncStatus("success");
          setLastSyncTime(new Date());
          setPmsSyncError("");
          return true;
        }

        if (attempt < attempts - 1 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return false;
    };

    try {
      const { data, error } = await supabase.functions.invoke("booking-orchestrator-api", {
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
        const errorMessage =
          typeof data.error === "string"
            ? data.error
            : data.error.message || data.error.code || JSON.stringify(data.error);

        if (
          errorMessage.includes("credentials") ||
          errorMessage.includes("not configured") ||
          errorMessage.includes("invalid") ||
          errorMessage.includes("expired") ||
          (typeof data.error === "object" && data.error.code === "AUTH_FAILED")
        ) {
          setPmsSyncStatus("not_configured");
          setPmsSyncError(
            `${selectedPropertyData.external_system} API credentials not configured or expired. Please configure them in Admin > API Keys.`
          );
        } else {
          setPmsSyncStatus("error");
          setPmsSyncError(errorMessage);
        }
        return;
      }

      const responseData = data?.data || data;
      const roomTypesPayload = responseData?.room_types || responseData?.roomTypes || [];
      if (isHostfully && (roomTypesPayload.length <= 1 || !rawPayloadHasRates(roomTypesPayload))) {
        const recovered = await recoverFromCachedCalendarData(10, 2000);
        if (recovered) {
          toast({
            title: "Availability Synced",
            description: "Loaded Hostfully rates and availability from the refreshed calendar cache.",
          });
          return;
        }
        if (staleFallbackApplied) return;
      }

      applyCalendarData(roomTypesPayload);

      toast({
        title: "Availability Synced",
        description: `Successfully fetched data from ${selectedPropertyData.external_system}`,
      });
    } catch (err: any) {
      console.error(`Error fetching ${selectedPropertyData?.external_system} availability:`, err);

      if (prefersCachedCalendarData) {
        const recovered = await recoverFromCachedCalendarData(3, 1500);
        if (recovered) {
          toast({
            title: "Availability Synced",
            description: `Loaded ${selectedPropertyData.external_system} calendar data from refreshed cache.`,
          });
          return;
        }
      }

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

  // Generate synthetic PMS data for non-PMS properties from wizard configuration
  const generateManualPropertyData = useCallback(async (property: Property) => {
    setPmsSyncStatus("loading");
    
    const amenities = property.amenities || {};
    const roomTypes = amenities.room_types || [];
    const seasons = amenities.seasons || [];
    const seasonRates = amenities.season_rates || {};
    const pmsRateTypes = amenities.pms_rate_types || [];
    
    // Generate date range starting from currentDate (today), matching calendar display
    const startDate = new Date(currentDate);
    const endDate = new Date(startDate);
    if (viewMode === "month") {
      // Month view shows 31 days from today
      endDate.setDate(endDate.getDate() + 31);
    } else {
      // Week view shows 7 days from today
      endDate.setDate(endDate.getDate() + 7);
    }
    
    // Fetch manual overrides from property_availability table
    const { data: manualOverrides } = await supabase
      .from("property_availability")
      .select("*")
      .eq("property_id", property.id)
      .gte("date", format(startDate, "yyyy-MM-dd"))
      .lte("date", format(endDate, "yyyy-MM-dd"));
    
    const overridesMap = new Map<string, any>(
      (manualOverrides || []).map(o => [`${o.room_type}-${o.date}`, o])
    );
    
    // Transform each wizard room type into PMS-compatible format
    const transformedRooms: PMSRoomTypeData[] = roomTypes.map((room: any) => {
      const roomId = room.id?.toString() || room.name;
      const linkedRateTypes = room.linkedRateTypes || [];
      
      const availabilityByDate: { [date: string]: number } = {};
      const ratesByDate: { [date: string]: any[] } = {};
      const restrictionsByDate: { [date: string]: any } = {};
      
      // Smart unit detection: whole-property types (holiday house, villa, cottage) = 1 unit
      // For hotels/B&Bs, use explicit units field or numRooms
      const isWholePropertyType = ['self_catering', 'villa', 'cottage', 'holiday_house', 'house', 'holiday'].some(
        type => (room.pmsRoomType || room.name || '').toLowerCase().includes(type) ||
                (property.property_type || '').toLowerCase().includes(type)
      );
      
      // Priority: explicit units field > infer from property type > fallback to 1
      let roomUnits = 1;
      if (room.units !== undefined && room.units !== null) {
        roomUnits = room.units;
      } else if (!isWholePropertyType && room.numRooms) {
        roomUnits = room.numRooms;
      }
      
      const roomMinStay = room.minStay ?? room.minimum_stay ?? null;
      const roomMaxStay = room.maxStay ?? room.maximum_stay ?? null;
      
      // Generate data for each date in range
      const iterDate = new Date(startDate);
      while (iterDate <= endDate) {
        const dateStr = format(iterDate, "yyyy-MM-dd");
        const overrideKey = `${room.name}-${dateStr}`;
        const override = overridesMap.get(overrideKey);
        
        // Availability: use room units as default (not 99), respect overrides
        if (override?.is_stop_sell) {
          availabilityByDate[dateStr] = 0;
        } else {
          availabilityByDate[dateStr] = override?.available_units ?? roomUnits;
        }
        
        // Restrictions: apply room defaults for ALL dates, merge overrides on top
        restrictionsByDate[dateStr] = {
          stopSell: override?.is_stop_sell ?? false,
          minStay: override?.minimum_stay ?? roomMinStay,
          maxStay: override?.maximum_stay ?? roomMaxStay,
          leadDaysAdvance: override?.lead_days_advance ?? null,
          leadDaysPost: override?.lead_days_post ?? null,
        };
        
        // Rates: find applicable season, then look up season rate
        ratesByDate[dateStr] = [];
        
        // If room has linked rate types, use those
        if (linkedRateTypes.length > 0) {
          // Filter to only rate types that actually exist in pmsRateTypes
          const resolvedRateTypes = linkedRateTypes
            .map((id: string) => ({ id, rateType: pmsRateTypes.find((rt: any) => rt.id === id || String(rt.id) === String(id)) }))
            .filter((entry: any) => entry.rateType);
          
          // If none of the linked IDs resolve, show a SINGLE default rate row 
          // using the room's own baseRate — do NOT fall back to all pmsRateTypes
          if (resolvedRateTypes.length > 0) {
            for (const { id: rateTypeId, rateType } of resolvedRateTypes) {
              const baseRate = rateType?.baseRate || room.baseRate || 0;
              
              let rateAmount = baseRate;
              const checkDate = new Date(iterDate);
              
              for (const season of seasons) {
                // Check multi-period seasons first, fall back to top-level from/to
                const periods = season.periods?.length ? season.periods : [{ from: season.from || season.startDate, to: season.to || season.endDate }];
                const inSeason = periods.some((p: any) => {
                  const pStart = new Date(p.from);
                  const pEnd = new Date(p.to);
                  return checkDate >= pStart && checkDate <= pEnd;
                });
                if (inSeason) {
                  const roomSeasonRates = seasonRates[roomId] || seasonRates[room.name] || {};
                  // Key format: ${seasonId}-${rateTypeId} (canonical from SeasonsCalendar)
                  const seasonRate = roomSeasonRates[`${season.id}-${rateTypeId}`] || roomSeasonRates[`${season.id}-Self Catering`] || roomSeasonRates[season.id];
                  
                  if (seasonRate?.roomAmount != null) {
                    rateAmount = seasonRate.roomAmount;
                  } else if (typeof seasonRate === 'number') {
                    rateAmount = seasonRate;
                  }
                  break;
                }
              }
              
              const priceType = rateType?.pricingModel || rateType?.priceType || 'per_room';
              const isPerPersonRate = priceType.toLowerCase().includes('person');
              
              ratesByDate[dateStr].push({
                rateTypeId: rateTypeId,
                rateTypeName: rateType?.name || 'Standard Rate',
                priceType: priceType,
                roomAmount: rateAmount,
                ...(isPerPersonRate ? {
                  adultAmounts: {
                    adultAmount1: rateType?.adult1Rate ?? rateAmount,
                    adultAmount2: rateType?.adult2Rate ?? rateAmount,
                  },
                  teenAmount: rateType?.teenRate ?? 0,
                  childAmount: rateType?.childRate ?? 0,
                  infantAmount: rateType?.infantRate ?? 0,
                } : {}),
              });
            }
          } else {
            // Orphaned linkedRateTypes — find correct rate type by matching room via linkedRoomId or name
            const matchedRateType = pmsRateTypes.find((rt: any) => 
              rt.linkedRoomId === roomId || 
              (rt.name || '').toLowerCase().includes((room.name || '').toLowerCase())
            );
            const baseRate = matchedRateType?.baseRate || room.baseRate || room.base_rate || 0;
            const matchedId = matchedRateType?.id || pmsRateTypes[0]?.id || 'default';
            const orphanPriceType = matchedRateType?.pricingModel || matchedRateType?.priceType || 'per_room';
            const isOrphanPerPerson = orphanPriceType.toLowerCase().includes('person');
            
            // Check for seasonal rate override
            let orphanRateAmount = baseRate;
            const orphanCheckDate = new Date(iterDate);
            for (const season of seasons) {
              const periods = season.periods?.length ? season.periods : [{ from: season.from || season.startDate, to: season.to || season.endDate }];
              const inSeason = periods.some((p: any) => {
                const pStart = new Date(p.from);
                const pEnd = new Date(p.to);
                return orphanCheckDate >= pStart && orphanCheckDate <= pEnd;
              });
              if (inSeason) {
                const roomSeasonRates = seasonRates[roomId] || seasonRates[room.name] || {};
                const seasonRate = roomSeasonRates[`${season.id}-${matchedId}`] || roomSeasonRates[`${season.id}-Self Catering`] || roomSeasonRates[season.id];
                if (seasonRate?.roomAmount != null) {
                  orphanRateAmount = seasonRate.roomAmount;
                } else if (typeof seasonRate === 'number') {
                  orphanRateAmount = seasonRate;
                }
                break;
              }
            }
            
            ratesByDate[dateStr].push({
              rateTypeId: String(matchedId),
              rateTypeName: matchedRateType?.name || room.name || 'Standard Rate',
              priceType: orphanPriceType,
              roomAmount: orphanRateAmount,
              ...(isOrphanPerPerson ? {
                adultAmounts: {
                  adultAmount1: matchedRateType?.adult1Rate ?? orphanRateAmount,
                  adultAmount2: matchedRateType?.adult2Rate ?? orphanRateAmount,
                },
                teenAmount: matchedRateType?.teenRate ?? 0,
                childAmount: matchedRateType?.childRate ?? 0,
                infantAmount: matchedRateType?.infantRate ?? 0,
              } : {}),
            });
          }
        } else {
          // No linked rate types - create a default rate from room's base rate or first pms_rate_type
          const defaultRateType = pmsRateTypes[0];
          const baseRate = room.baseRate || defaultRateType?.baseRate || 0;
          
          // Check for seasonal rate
          let rateAmount = baseRate;
          const checkDate = new Date(iterDate);
          
          for (const season of seasons) {
            const periods = season.periods?.length ? season.periods : [{ from: season.from || season.startDate, to: season.to || season.endDate }];
            const inSeason = periods.some((p: any) => {
              const pStart = new Date(p.from);
              const pEnd = new Date(p.to);
              return checkDate >= pStart && checkDate <= pEnd;
            });
            if (inSeason) {
              const roomSeasonRates = seasonRates[roomId] || seasonRates[room.name] || {};
              const defaultRateId = defaultRateType?.id || 'default';
              // Key format: ${seasonId}-${rateTypeId} (canonical from SeasonsCalendar)
              const seasonRate = roomSeasonRates[`${season.id}-${defaultRateId}`] || roomSeasonRates[`${season.id}-Self Catering`] || roomSeasonRates[season.id];
              
              if (seasonRate?.roomAmount != null) {
                rateAmount = seasonRate.roomAmount;
              } else if (typeof seasonRate === 'number') {
                rateAmount = seasonRate;
              }
              break;
            }
          }
          
          ratesByDate[dateStr].push({
            rateTypeId: defaultRateType?.id || 'default',
            rateTypeName: defaultRateType?.name || 'Standard Rate',
            priceType: defaultRateType?.priceType || 'PER ROOM',
            roomAmount: rateAmount,
          });
        }
        
        iterDate.setDate(iterDate.getDate() + 1);
      }
      
      return {
        roomTypeId: roomId,
        roomTypeName: room.name || `Room ${roomId}`,
        availabilityByDate,
        ratesByDate,
        restrictionsByDate,
      };
    });

    // Native ROL'OS properties: ROL'OS Rate Plans is the sole author of nightly
    // rates, so overlay the resolver's per-night prices (via the orchestrator)
    // instead of relying on legacy wizard/season_rates values.
    const isNativeRolos = property.external_system === "roomsonline" && !!property.is_rol_property;
    if (isNativeRolos) {
      try {
        const { data, error } = await supabase.functions.invoke("booking-orchestrator-api", {
          body: {
            action: "fetch_availability",
            property_id: property.id,
            start_date: format(startDate, "yyyy-MM-dd"),
            end_date: format(endDate, "yyyy-MM-dd"),
          },
        });
        const payload = (data as any)?.data ?? data;
        const liveRoomTypes: any[] = (!error && (data as any)?.success && (payload?.room_types || payload?.roomTypes)) || [];

        const normalise = (value: string) => value.trim().toLowerCase();
        const liveByName = new Map<string, any>();
        for (const rt of liveRoomTypes) {
          const name = rt.room_type_name || rt.roomTypeName || rt.name || "";
          if (name) liveByName.set(normalise(String(name)), rt);
        }

        for (const room of transformedRooms) {
          const live = liveByName.get(normalise(room.roomTypeName));
          if (!live) continue;
          const rateTypes = live.rate_types || live.rateTypes || [];
          for (const rateType of rateTypes) {
            const rateTypeName = rateType.rate_type_name || rateType.rateTypeName || "Standard Rate";
            const rateTypeId = String(rateType.rate_type_id ?? rateType.rateTypeId ?? "rolos-rate");
            for (const rate of rateType.rates || []) {
              const dateStr = rate.date || rate.night_date;
              const amount = Number(rate.room_amount ?? rate.roomAmount ?? 0);
              if (!dateStr || !(amount > 0)) continue;
              room.ratesByDate[dateStr] = [{
                rateTypeId,
                rateTypeName,
                priceType: rateType.price_type ?? rateType.priceType ?? "per_room",
                roomAmount: amount,
              }];
            }
          }
        }
      } catch (err) {
        console.warn("[Calendar] ROL'OS live rate overlay failed", err);
      }
    }

    setPmsData({
      roomTypes: transformedRooms,
      lastSynced: new Date(),
      systemType: 'manual',
      cacheVersion: PMS_SESSION_CACHE_VERSION,
    });
    setPmsSyncStatus("success");
    setLastSyncTime(new Date());
  }, [currentDate, viewMode]);

  // Trigger PMS sync when property changes and data is available
  useEffect(() => {
    // Wait until properties are loaded and we have the selected property in the list
    if (!selectedProperty || properties.length === 0) return;
    
    // Make sure selectedPropertyData is actually found in properties
    const propertyData = properties.find(p => p.id === selectedProperty);
    if (!propertyData) return;
    
    const isPms = !!propertyData.external_system && propertyData.external_system !== 'none';
    const isNativeRolos = propertyData.external_system === 'roomsonline' && !!propertyData.is_rol_property;
    
    if (isPms && !isNativeRolos) {
      // External PMS properties fetch from adapter/cache
      fetchPmsAvailability(false);
    } else {
      // ROL'OS native + manual properties use property overview data
      generateManualPropertyData(propertyData);
    }
  }, [selectedProperty, properties, fetchPmsAvailability, generateManualPropertyData, currentDate, viewMode]);

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
        .in("role", ["admin", "dev", "fearless_leader"]);

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
        .select("id, name, amenities, owner_email, external_system, external_id, benson_property_code, checkfront_property_code, siteminder_property_code, hotelbeds_hotel_code, hostfully_property_uid, is_rol_property, listing_status")
        .is("permanently_deleted_at", null);

      // Admins/devs/fearless leaders see EVERY non-deleted property (active, inactive, draft) for ARI debugging.
      // Owners only see their own active, listed properties.
      if (!adminStatus) {
        query = query.eq("is_active", true).neq("listing_status", "inactive");
        if (email) {
          query = query.eq("owner_email", email);
        }
      }

      const { data, error } = await query.order("name");

      if (error) throw error;

      const accommodationProperties = (data || []).filter((property: any) => {
        // Admins/devs/fearless leaders see ALL active properties (for ARI testing across the system)
        if (adminStatus) return true;
        // Exclude NightsBridge properties for owners (they use iframe-based booking, not calendar sync)
        if (property.external_system === 'nightsbridge') return false;
        // Include any PMS/channel-connected property regardless of offerings flag
        if (property.external_system || property.hostfully_property_uid || property.benson_property_code || property.checkfront_property_code || property.siteminder_property_code || property.hotelbeds_hotel_code) return true;
        // Native/manual properties — include unless accommodation is explicitly false
        return property.amenities?.offerings?.accommodation !== false;
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
          units: matchingRoom?.units ?? matchingRoom?.numRooms ?? 1,
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
        units: room.units ?? room.numRooms ?? 1,
      };
    });
  }, [selectedPropertyData, pmsData]);

  // Safety net: for Hostfully properties, cross-check calendarRoomData against the
  // canonical hostfully_room_types list (loaded into roomCategoryMap). Drops any
  // ghost rows the PMS/cache pipeline may have surfaced (e.g. the "Property" row
  // from a broken mapping) and appends any active room types that were missed by
  // the sync so operators can see the whole property.
  const canonicalRoomData = React.useMemo(() => {
    if (canonicalRoomTypeMap.size === 0) return calendarRoomData;

    const byId = new Map(calendarRoomData.map((room) => [room.pmsRoomTypeId, room]));
    const byName = new Map(calendarRoomData.map((room) => [room.name, room]));

    return sortRoomsByDisplayOrder(Array.from(canonicalRoomTypeMap.values())).map((canonicalRoom) => {
      const existing = byId.get(canonicalRoom.id) || byName.get(canonicalRoom.name);

      if (existing) {
        return {
          ...existing,
          name: canonicalRoom.name,
          pmsRoomTypeId: canonicalRoom.id,
        };
      }

      return {
        name: canonicalRoom.name,
        pmsRoomTypeId: canonicalRoom.id,
        rates: [],
        availability: {} as { [date: string]: number | AvailabilityData },
        allowTeens: true,
        allowChildren: true,
        allowInfants: true,
        minGuests: 1,
        units: 1,
      };
    });
  }, [calendarRoomData, canonicalRoomTypeMap]);


  // Get rate type options from property's saved pms_rate_types (same as Property Form > Room Information > Rate Types)
  const rateTypeOptions = React.useMemo(() => {
    const rateTypes: { id: string; label: string; hasRates: boolean }[] = [];
    const seenNames = new Set<string>();
    
    // Only use property's saved pms_rate_types to match Property Form when they map to actual PMS data.
    if (selectedPropertyData?.amenities?.pms_rate_types) {
      const savedRateTypes = selectedPropertyData.amenities.pms_rate_types as any[];
      savedRateTypes.forEach(rt => {
        const rateTypeId = rt.id || rt.rate_type_id;
        const name = (rt.name || '').trim();
        if (rateTypeId && name && !seenNames.has(name.toLowerCase())) {
          seenNames.add(name.toLowerCase());
          const rtIdStr = String(rateTypeId);
          // Check if this rate type has any rates in the PMS data
          let hasRates = false;
          if (pmsData.roomTypes.length > 0) {
            pmsData.roomTypes.forEach(room => {
              Object.values(room.ratesByDate).forEach(dateRates => {
                dateRates.forEach(rate => {
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
            label: name,
            hasRates
          });
        }
      });
    }
    
    // Fallback: if no usable saved pms_rate_types, build from PMS response data.
    if ((rateTypes.length === 0 || !rateTypes.some((rateType) => rateType.hasRates)) && pmsData.roomTypes.length > 0) {
      const seenRateTypes = new Set<string>();
      pmsData.roomTypes.forEach(room => {
        Object.values(room.ratesByDate).forEach(dateRates => {
          dateRates.forEach(rate => {
            const rateTypeId = rate.rateTypeId ? String(rate.rateTypeId) : null;
            if (rateTypeId && !seenRateTypes.has(rateTypeId)) {
              seenRateTypes.add(rateTypeId);
              const hasValues = (rate.roomAmount != null && rate.roomAmount > 0) || 
                               (rate.adultAmounts && Object.values(rate.adultAmounts).some(v => v != null && v > 0));
              rateTypes.push({
                id: rateTypeId,
                label: rate.rateTypeName || `Rate: ${rateTypeId}`,
                hasRates: hasValues,
              });
            }
          });
        });
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

  // ── Bookings overlay ───────────────────────────────────────────────────────
  // Native ROL'OS availability is published as "open" by the orchestrator, so
  // confirmed/pending stays would otherwise be invisible here. Load the stays
  // for the visible window and key them by unit name so every calendar row can
  // show what is actually sold.
  useEffect(() => {
    let cancelled = false;

    const loadBookings = async () => {
      if (!selectedProperty) {
        setBookedByRoom(new Map());
        return;
      }

      const dayCount = viewMode === "week" ? 9 : 31;
      const windowStart = new Date(currentDate);
      const windowEnd = new Date(currentDate);
      windowEnd.setDate(windowEnd.getDate() + dayCount);
      const startStr = format(windowStart, "yyyy-MM-dd");
      const endStr = format(windowEnd, "yyyy-MM-dd");

      try {
        const [{ data: bookings }, { data: rolosRooms }, { data: hfRooms }] = await Promise.all([
          supabase
            .from("bookings")
            .select("id, rol_reference, guest_name, check_in_date, check_out_date, status, room_type_id, booking_channel, rolos_booking_rooms(room_type_id)")
            .eq("property_id", selectedProperty)
            .neq("status", "cancelled")
            .lt("check_in_date", endStr)
            .gt("check_out_date", startStr),
          supabase.from("rolos_room_types").select("id, name").eq("property_id", selectedProperty),
          supabase
            .from("hostfully_room_types")
            .select("id, name, linked_rolos_id")
            .eq("property_id", selectedProperty),
        ]);

        if (cancelled) return;

        // Any unit identifier (ROL'OS room type id, mirror id) → unit name.
        const nameById = new Map<string, string>();
        (rolosRooms || []).forEach((r) => {
          if (r.id && r.name) nameById.set(String(r.id), String(r.name));
        });
        (hfRooms || []).forEach((r) => {
          if (r.id && r.name) nameById.set(String(r.id), String(r.name));
          if (r.linked_rolos_id && r.name) nameById.set(String(r.linked_rolos_id), String(r.name));
        });

        const next = new Map<string, Map<string, BookedCell>>();
        const addNight = (roomName: string, dateStr: string, booking: BookingOverlayRow) => {
          const key = roomName.trim().toLowerCase();
          if (!next.has(key)) next.set(key, new Map());
          const byDate = next.get(key)!;
          const cell = byDate.get(dateStr) ?? { units: 0, stays: [] };
          if (!cell.stays.some((s) => s.id === booking.id)) {
            cell.units += 1;
            cell.stays.push(booking);
          }
          byDate.set(dateStr, cell);
        };

        (bookings || []).forEach((booking: any) => {
          const roomIds = new Set<string>();
          if (booking.room_type_id) roomIds.add(String(booking.room_type_id));
          (booking.rolos_booking_rooms || []).forEach((row: any) => {
            if (row?.room_type_id) roomIds.add(String(row.room_type_id));
          });

          const overlayRow: BookingOverlayRow = {
            id: booking.id,
            reference: booking.rol_reference || null,
            guestName: booking.guest_name || "Guest",
            status: booking.status || "pending",
            channel: booking.booking_channel || null,
          };

          const names = Array.from(roomIds)
            .map((id) => nameById.get(id))
            .filter(Boolean) as string[];
          if (names.length === 0) return;

          // Nights are [check-in, check-out).
          const cursor = new Date(`${booking.check_in_date}T00:00:00`);
          const last = new Date(`${booking.check_out_date}T00:00:00`);
          while (cursor < last) {
            const ds = format(cursor, "yyyy-MM-dd");
            if (ds >= startStr && ds <= endStr) {
              names.forEach((name) => addNight(name, ds, overlayRow));
            }
            cursor.setDate(cursor.getDate() + 1);
          }
        });

        setBookedByRoom(next);
      } catch (err) {
        console.error("Error loading calendar bookings:", err);
        if (!cancelled) setBookedByRoom(new Map());
      }
    };

    loadBookings();
    return () => {
      cancelled = true;
    };
  }, [selectedProperty, currentDate, viewMode]);

  const getBookedInfo = useCallback(
    (roomName: string, date: Date): BookedCell | null => {
      const byDate = bookedByRoom.get(roomName.trim().toLowerCase());
      if (!byDate) return null;
      return byDate.get(format(date, "yyyy-MM-dd")) ?? null;
    },
    [bookedByRoom],
  );



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

  // Fetch room categories from hostfully_room_types for grouping
  const fetchRoomCategories = async (propertyId: string) => {
    try {
      const { data, error } = await supabase
        .from("hostfully_room_types")
        .select("id, name, property_type")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      
      if (error || !data) return;
      
      const catMap = new Map<string, string>();
      const canonicalMap = new Map<string, CanonicalRoomType>();
      for (const row of sortRoomsByDisplayOrder(data.filter((row) => row.name))) {
        if (row.id && row.name) {
          canonicalMap.set(row.id, {
            id: row.id,
            name: row.name,
            category: row.property_type || null,
          });
        }
        if (row.name && row.property_type) {
          catMap.set(row.name, row.property_type);
        }
      }
      setRoomCategoryMap(catMap);
      setCanonicalRoomTypeMap(canonicalMap);
    } catch (err) {
      console.error("Error fetching room categories:", err);
      setCanonicalRoomTypeMap(new Map());
    }
  };

  // Toggle group expansion
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  // Refresh calendar data after bulk updates (for manual properties, re-fetches from property_availability)
  const refreshCalendarData = useCallback(async () => {
    if (!selectedProperty) return;
    
    const propertyData = properties.find(p => p.id === selectedProperty);
    if (!propertyData) return;
    
    const isPms = !!propertyData.external_system && propertyData.external_system !== 'none';
    
    if (isPms) {
      // For PMS properties, refresh from cache (force = true to get latest)
      await fetchPmsAvailability(true);
    } else {
      // For manual properties, regenerate data from property_availability table
      await generateManualPropertyData(propertyData);
    }
  }, [selectedProperty, properties, fetchPmsAvailability, generateManualPropertyData]);

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
    // Always start from today (currentDate), not start of calendar week
    const startDate = new Date(currentDate);
    
    for (let i = 0; i < 9; i++) { // 9 days starting from today
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const generateMonthDates = () => {
    const dates: Date[] = [];
    // Always start from currentDate (which is today on initial load), not first of month
    const startDate = new Date(currentDate);
    
    // Generate 31 days starting from currentDate
    for (let i = 0; i < 31; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = generateWeekDates();
  const monthDates = generateMonthDates();
  const calendarDates = viewMode === "week" ? weekDates : monthDates;

  // PMS-aware helper to get availability for a room/date
  const getAvailability = (roomName: string, date: Date): { value: number | null; fromPms: boolean } => {
    const dateStr = format(date, "yyyy-MM-dd");
    const booked = getBookedInfo(roomName, date)?.units ?? 0;
    
    // Check PMS data first
    if (pmsData.roomTypes.length > 0) {
      const displayRoom = canonicalRoomData.find((room) => room.name === roomName);
      const pmsRoom = displayRoom?.pmsRoomTypeId
        ? pmsData.roomTypes.find((rt) => rt.roomTypeId === displayRoom.pmsRoomTypeId)
        : pmsData.roomTypes.find((rt) => rt.roomTypeName === roomName);
      
      if (pmsRoom && pmsRoom.availabilityByDate[dateStr] !== undefined) {
        const raw = pmsRoom.availabilityByDate[dateStr];
        // Native ROL'OS units are published as fully open; own stays must reduce it.
        if (typeof raw === "number" && booked > 0) {
          const units = displayRoom?.units ?? 1;
          const base = raw > units ? units : raw;
          return { value: Math.max(0, base - booked), fromPms: true };
        }
        return { value: raw, fromPms: true };
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
      const displayRoom = canonicalRoomData.find((room) => room.name === roomName);
      const pmsRoom = displayRoom?.pmsRoomTypeId
        ? pmsData.roomTypes.find((rt) => rt.roomTypeId === displayRoom.pmsRoomTypeId)
        : pmsData.roomTypes.find((rt) => rt.roomTypeName === roomName);
      
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
      const displayRoom = canonicalRoomData.find((room) => room.name === roomName);
      const pmsRoom = displayRoom?.pmsRoomTypeId
        ? pmsData.roomTypes.find((rt) => rt.roomTypeId === displayRoom.pmsRoomTypeId)
        : pmsData.roomTypes.find((rt) => rt.roomTypeName === roomName);
      
      if (pmsRoom) {
        // Check if we have restrictions for this date
        const restrictions = pmsRoom.restrictionsByDate[dateStr];
        if (restrictions) {
          return {
            stopSell: restrictions.stopSell ?? false,
            minStay: restrictions.minStay ?? null,
            maxStay: restrictions.maxStay ?? null,
            leadDaysAdvance: restrictions.leadDaysAdvance ?? null,
            leadDaysPost: restrictions.leadDaysPost ?? null,
            fromPms: true,
          };
        }
        
        // Room exists but no restrictions for this specific date - return defaults from room data
        return {
          stopSell: false,
          minStay: null,
          maxStay: null,
          leadDaysAdvance: null,
          leadDaysPost: null,
          fromPms: false,
        };
      }
    }
    
    // No matching room found
    return {
      stopSell: false,
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
  const filteredRooms = React.useMemo(
    () => canonicalRoomData.filter((room) => selectedRoomTypes.includes(room.name)),
    [canonicalRoomData, selectedRoomTypes],
  );

  // Group filtered rooms by category for Hostfully properties
  const groupedRooms = React.useMemo(() => {
    if (roomCategoryMap.size === 0) return null; // No grouping needed
    
    const groups = new Map<string, typeof filteredRooms>();
    const ungrouped: typeof filteredRooms = [];
    
    for (const room of filteredRooms) {
      const category = roomCategoryMap.get(room.name);
      if (category) {
        if (!groups.has(category)) {
          groups.set(category, []);
        }
        groups.get(category)!.push(room);
      } else {
        ungrouped.push(room);
      }
    }
    
    const result: { category: string; rooms: typeof filteredRooms }[] = [];
    for (const [category, rooms] of groups) {
      result.push({ category, rooms });
    }
    for (const room of ungrouped) {
      result.push({ category: room.name, rooms: [room] });
    }
    
    return result;
  }, [filteredRooms, roomCategoryMap]);

  // Get aggregated availability for a group across all rooms
  const getGroupAvailability = (rooms: typeof filteredRooms, date: Date): { value: number | null; fromPms: boolean } => {
    let total = 0;
    let hasPms = false;
    let hasAny = false;
    
    for (const room of rooms) {
      const avail = getAvailability(room.name, date);
      if (avail.value !== null) {
        total += avail.value;
        hasAny = true;
        if (avail.fromPms) hasPms = true;
      }
    }
    
    return hasAny ? { value: total, fromPms: hasPms } : { value: null, fromPms: false };
  };

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
                <div className="flex items-center gap-2">
                  {pmsSyncStatus === "loading" && (
                    <StatusIndicator status="syncing" label="Loading..." size="sm" />
                  )}
                  {pmsSyncStatus === "success" && (
                    <Badge variant="secondary" className="flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      <Cloud className="h-3 w-3" />
                      RoomsOnline PMS (Manual Mode)
                    </Badge>
                  )}
                  {pmsSyncStatus === "idle" && (
                    <Badge variant="secondary" className="flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      <CloudOff className="h-3 w-3" />
                      RoomsOnline PMS (Manual Mode)
                    </Badge>
                  )}
                </div>
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

        {selectedPropertyData && !isPmsProperty && pmsSyncStatus === "success" && lastSyncTime && (
          <div className="mb-2 text-xs text-muted-foreground flex items-center gap-1">
            <Cloud className="h-3 w-3 text-amber-600" />
            Manual rates loaded from wizard config: {lastSyncTime.toLocaleTimeString()}
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={loading}
                    className="w-[220px] h-8 text-xs justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedPropertyData?.name || "Select Property"}
                    </span>
                    <ChevronsUpDown className="h-3 w-3 ml-1 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0 bg-popover" align="start">
                  <Command>
                    <CommandInput placeholder="Search properties…" className="h-8 text-xs" />
                    <CommandList>
                      <CommandEmpty>No properties found.</CommandEmpty>
                      <CommandGroup>
                        {properties.map((property) => (
                          <CommandItem
                            key={property.id}
                            value={property.name}
                            onSelect={() => handlePropertyChange(property.id)}
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                "h-3 w-3 mr-2",
                                selectedProperty === property.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {property.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>



              {/* Room Types Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[160px] h-8 text-xs justify-between" disabled={!selectedProperty}>
                    Room Types ({getSelectedCount(selectedRoomTypes, canonicalRoomData.length || pmsData.roomTypes.length || roomTypes.length)})
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2 bg-popover" align="start">
                  <div className="space-y-2">
                    {(canonicalRoomData.length > 0 ? canonicalRoomData.map((room) => ({ name: room.name })) : pmsData.roomTypes.length > 0 ? pmsData.roomTypes.map((room) => ({ name: room.roomTypeName })) : roomTypes).map((room, index) => {
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
                  if (isPmsProperty && !isNativeRolosProperty) {
                    fetchPmsAvailability(true);
                  } else if (selectedPropertyData) {
                    generateManualPropertyData(selectedPropertyData);
                  }
                }}
                disabled={pmsSyncStatus === "loading"}
              >
                {pmsSyncStatus === "loading" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {isPmsProperty && !isNativeRolosProperty ? `Sync ${selectedPropertyData?.external_system || "PMS"}` : "Refresh"}
              </Button>

              {selectedPropertyData?.external_system === "hostfully" && (
                <Button
                  variant="outline"
                  className="gap-1 h-8 text-xs px-2"
                  onClick={async () => {
                    if (!selectedProperty) return;
                    toast({ title: "Repairing Hostfully mapping…", description: "Matching ROL room types to Hostfully units by name." });
                    const { data, error } = await supabase.functions.invoke("hostfully-api", {
                      body: { action: "repair_room_mapping", property_id: selectedProperty },
                    });
                    if (error || data?.error) {
                      toast({
                        title: "Repair failed",
                        description: (data?.error?.message || error?.message || "Unknown error"),
                        variant: "destructive",
                      });
                      return;
                    }
                    const r = data?.data || data;
                    toast({
                      title: "Mapping repaired",
                      description: `Matched ${r?.matched ?? 0}/${r?.total ?? 0} room types. Re-syncing calendar…`,
                    });
                    await fetchPmsAvailability(true);
                  }}
                  disabled={pmsSyncStatus === "loading"}
                  title="Match ROL room types to Hostfully units by name and re-sync"
                >
                  Repair Hostfully mapping
                </Button>
              )}


              <div className="ml-auto flex gap-1">
                <Button variant="default" disabled className="opacity-50 cursor-not-allowed h-8 text-xs px-2">Save</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="default" 
                      className={`gap-1 h-8 text-xs px-2 ${!selectedProperty ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!selectedProperty}
                    >
                      Rules/Bulk
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-popover">
                    <DropdownMenuItem onClick={() => setBulkRateOpen(true)} disabled={isPmsProperty}>
                      Bulk Rate {isPmsProperty && <span className="text-xs text-muted-foreground ml-1">(PMS)</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkAvailabilityOpen(true)} disabled={isPmsProperty}>
                      Bulk Availability {isPmsProperty && <span className="text-xs text-muted-foreground ml-1">(PMS)</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStopSellOpen(true)} disabled={isPmsProperty}>
                      Stop Sell {isPmsProperty && <span className="text-xs text-muted-foreground ml-1">(PMS)</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMinStayOpen(true)} disabled={isPmsProperty}>
                      Minimum Stay {isPmsProperty && <span className="text-xs text-muted-foreground ml-1">(PMS)</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMaxStayOpen(true)} disabled={isPmsProperty}>
                      Maximum Stay {isPmsProperty && <span className="text-xs text-muted-foreground ml-1">(PMS)</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysAdvanceOpen(true)} disabled={isPmsProperty}>
                      Lead Days Advance {isPmsProperty && <span className="text-xs text-muted-foreground ml-1">(PMS)</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysPostOpen(true)} disabled={isPmsProperty}>
                      Lead Days Post {isPmsProperty && <span className="text-xs text-muted-foreground ml-1">(PMS)</span>}
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
                        {(groupedRooms ? groupedRooms : [{ category: '__all__', rooms: filteredRooms }]).map((group) => {
                          const isGrouped = groupedRooms !== null && group.rooms.length > 1;
                          const isExpanded = !isGrouped || expandedGroups.has(group.category);
                          
                          return (
                            <React.Fragment key={`group-${group.category}`}>
                              {/* Group Header Row (only for grouped Hostfully rooms) */}
                              {isGrouped && (
                                <tr 
                                  className="bg-primary/10 dark:bg-primary/20 cursor-pointer hover:bg-primary/15"
                                  onClick={() => toggleGroup(group.category)}
                                >
                                  <td className="border p-1 font-bold text-xs text-primary sticky left-0 bg-primary/10 dark:bg-primary/20 z-10">
                                    <div className="flex items-center gap-1">
                                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                      {group.category} ({group.rooms.length} units)
                                    </div>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const groupAvail = getGroupAvailability(group.rooms, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center ${
                                          isHoliday ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend ? "bg-red-50 dark:bg-red-950/20" 
                                            : "bg-primary/5"
                                        }`}
                                      >
                                        <span className="font-bold text-xs text-primary">{renderCellValue(groupAvail.value, groupAvail.fromPms)}</span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Individual Room Rows (shown when expanded or ungrouped) */}
                              {isExpanded && group.rooms.map((room) => {
                          const filteredRates = room.rates.filter(rate =>
                            selectedRateTypes.includes(String(rate.rateTypeId))
                          );

                          return (
                            <React.Fragment key={room.name}>
                              {/* Room Name Row with Availability - ALWAYS visible */}
                              <tr className="bg-slate-100 dark:bg-slate-800">
                                <td className={`border p-1 font-semibold text-xs text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 ${isGrouped ? 'pl-4' : ''}`}>
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
                                  const showStopSell = selectedDisplayOptions.includes("stop_sell") && restrictions.stopSell === true;
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
                                        {(() => {
                                          const booked = getBookedInfo(room.name, date);
                                          if (!booked || booked.units === 0) return null;
                                          return (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="mt-0.5 w-full truncate rounded bg-primary px-1 text-[9px] font-semibold leading-tight text-primary-foreground">
                                                  {booked.stays[0].guestName}
                                                  {booked.units > 1 ? ` +${booked.units - 1}` : ""}
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <div className="space-y-0.5">
                                                  {booked.stays.map((stay) => (
                                                    <p key={stay.id} className="text-xs">
                                                      {stay.reference ? `${stay.reference} — ` : ""}
                                                      {stay.guestName} ({stay.status}
                                                      {stay.channel ? `, ${stay.channel}` : ""})
                                                    </p>
                                                  ))}
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                          );
                                        })()}

                                        {hasRestrictions && (
                                          <div className="flex flex-col gap-0.5 w-full px-0.5 mt-0.5">
                                            {showStopSell && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={`${getLineClass(stopSellPrev, stopSellNext, "bg-red-500")} min-h-[4px]`} />
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
                                const pt = (rate.priceType || '').toLowerCase();
                                const isPerPerson = pt.includes("person");
                                const isUnitRate = pt.includes("unit") || pt === "unitrate" || pt === "per_room";
                                const priceTypeLabel = isPerPerson ? "PER PERSON" : isUnitRate ? "PER UNIT" : "PER ROOM";
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
                                  const avail = getAvailability(room.name, date);
                                  if (avail.value === null || avail.value <= 0) return null;
                                  
                                  if (occupancyRows.length === 1) {
                                    const rateData = getRate(room.name, rateTypeId, rate.priceType || "PER PERSON", date, occupancyRows[0].key as any);
                                    return rateData.value;
                                  }
                                  
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
                                        const avail = getAvailability(room.name, date);
                                        const hasAvailability = avail.value !== null && avail.value > 0;
                                        const rateData = hasAvailability ? getRate(room.name, rate.rateTypeId || rate.rateType, rate.priceType || "PER ROOM", date, "room") : { value: null, fromPms: false };
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
                                          const avail = getAvailability(room.name, date);
                                          const hasAvailability = avail.value !== null && avail.value > 0;
                                          const rateData = hasAvailability ? getRate(
                                            room.name, 
                                            rate.rateTypeId || rate.rateType, 
                                            rate.priceType || "PER PERSON", 
                                            date, 
                                            occ.key as "1adult" | "2adults" | "teen" | "child" | "infant"
                                          ) : { value: null, fromPms: false };
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
                        {(groupedRooms ? groupedRooms : [{ category: '__all__', rooms: filteredRooms }]).map((group) => {
                          const isGrouped = groupedRooms !== null && group.rooms.length > 1;
                          const isExpanded = !isGrouped || expandedGroups.has(group.category);
                          
                          return (
                            <React.Fragment key={`group-${group.category}`}>
                              {/* Group Header Row (only for grouped Hostfully rooms) */}
                              {isGrouped && (
                                <tr 
                                  className="bg-primary/10 dark:bg-primary/20 cursor-pointer hover:bg-primary/15"
                                  onClick={() => toggleGroup(group.category)}
                                >
                                  <td className="border p-1 font-bold text-xs text-primary sticky left-0 bg-primary/10 dark:bg-primary/20 z-10">
                                    <div className="flex items-center gap-1">
                                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                      {group.category} ({group.rooms.length} units)
                                    </div>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    const groupAvail = getGroupAvailability(group.rooms, date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center ${
                                          isHoliday ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend ? "bg-red-50 dark:bg-red-950/20" 
                                            : "bg-primary/5"
                                        }`}
                                      >
                                        <span className="font-bold text-xs text-primary">{renderCellValue(groupAvail.value, groupAvail.fromPms)}</span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                              {/* Individual Room Rows */}
                              {isExpanded && group.rooms.map((room) => {
                          const filteredRates = room.rates.filter(rate =>
                            selectedRateTypes.includes(String(rate.rateTypeId))
                          );

                          return (
                            <React.Fragment key={room.name}>
                              {/* Room Name Row with Availability - ALWAYS visible */}
                              <tr className="bg-slate-100 dark:bg-slate-800">
                                <td className={`border p-1 font-semibold text-xs text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 ${isGrouped ? 'pl-4' : ''}`}>
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
                                  const showStopSell = selectedDisplayOptions.includes("stop_sell") && restrictions.stopSell === true;
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
                                        {(() => {
                                          const booked = getBookedInfo(room.name, date);
                                          if (!booked || booked.units === 0) return null;
                                          return (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="mt-0.5 w-full truncate rounded bg-primary px-1 text-[9px] font-semibold leading-tight text-primary-foreground">
                                                  {booked.stays[0].guestName}
                                                  {booked.units > 1 ? ` +${booked.units - 1}` : ""}
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <div className="space-y-0.5">
                                                  {booked.stays.map((stay) => (
                                                    <p key={stay.id} className="text-xs">
                                                      {stay.reference ? `${stay.reference} — ` : ""}
                                                      {stay.guestName} ({stay.status}
                                                      {stay.channel ? `, ${stay.channel}` : ""})
                                                    </p>
                                                  ))}
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                          );
                                        })()}

                                        {hasRestrictions && (
                                          <div className="flex flex-col gap-0.5 w-full px-0.5 mt-0.5">
                                            {showStopSell && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div className={`${getLineClass(stopSellPrev, stopSellNext, "bg-red-500")} min-h-[4px]`} />
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
                                const pt = (rate.priceType || '').toLowerCase();
                                const isPerPerson = pt.includes("person");
                                const isUnitRate = pt.includes("unit") || pt === "unitrate" || pt === "per_room";
                                const priceTypeLabel = isPerPerson ? "PER PERSON" : isUnitRate ? "PER UNIT" : "PER ROOM";
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
                                  const avail = getAvailability(room.name, date);
                                  if (avail.value === null || avail.value <= 0) return null;
                                  
                                  if (occupancyRows.length === 1) {
                                    const rateData = getRate(room.name, rateTypeId, rate.priceType || "PER PERSON", date, occupancyRows[0].key as any);
                                    return rateData.value;
                                  }
                                  
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
                                        const avail = getAvailability(room.name, date);
                                        const hasAvailability = avail.value !== null && avail.value > 0;
                                        const rateData = hasAvailability ? getRate(room.name, rate.rateTypeId || rate.rateType, rate.priceType || "PER ROOM", date, "room") : { value: null, fromPms: false };
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
                                          const avail = getAvailability(room.name, date);
                                          const hasAvailability = avail.value !== null && avail.value > 0;
                                          const rateData = hasAvailability ? getRate(
                                            room.name, 
                                            rate.rateTypeId || rate.rateType, 
                                            rate.priceType || "PER PERSON", 
                                            date, 
                                            occ.key as "1adult" | "2adults" | "teen" | "child" | "infant"
                                          ) : { value: null, fromPms: false };
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

      <BulkRateRuleDialog 
        open={bulkRateOpen} 
        onOpenChange={setBulkRateOpen}
        propertyId={selectedProperty}
        propertyName={selectedPropertyData?.name}
        roomTypes={canonicalRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId, units: r.units || 1 }))}
        onRuleCreated={refreshCalendarData}
      />
      <BulkAvailabilityRuleDialog 
        open={bulkAvailabilityOpen} 
        onOpenChange={setBulkAvailabilityOpen}
        propertyId={selectedProperty}
        propertyName={selectedPropertyData?.name}
        roomTypes={canonicalRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId, units: r.units || 1 }))}
        onRuleCreated={refreshCalendarData}
      />
      <BulkStopSellDialog 
        open={stopSellOpen} 
        onOpenChange={setStopSellOpen}
        propertyId={selectedProperty}
        propertyName={selectedPropertyData?.name}
        roomTypes={canonicalRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId, units: r.units || 1 }))}
        onRuleCreated={refreshCalendarData}
      />
      <BulkMinimumStayDialog 
        open={minStayOpen} 
        onOpenChange={setMinStayOpen}
        propertyId={selectedProperty}
        propertyName={selectedPropertyData?.name}
        roomTypes={canonicalRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId, units: r.units || 1 }))}
        onRuleCreated={refreshCalendarData}
      />
      <BulkMaximumStayDialog 
        open={maxStayOpen} 
        onOpenChange={setMaxStayOpen}
        propertyId={selectedProperty}
        propertyName={selectedPropertyData?.name}
        roomTypes={canonicalRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId, units: r.units || 1 }))}
        onRuleCreated={refreshCalendarData}
      />
      <BulkLeadDaysAdvanceDialog 
        open={leadDaysAdvanceOpen} 
        onOpenChange={setLeadDaysAdvanceOpen}
        propertyId={selectedProperty}
        propertyName={selectedPropertyData?.name}
        roomTypes={canonicalRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId, units: r.units || 1 }))}
        onRuleCreated={refreshCalendarData}
      />
      <BulkLeadDaysPostDialog 
        open={leadDaysPostOpen} 
        onOpenChange={setLeadDaysPostOpen}
        propertyId={selectedProperty}
        propertyName={selectedPropertyData?.name}
        roomTypes={canonicalRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId, units: r.units || 1 }))}
        onRuleCreated={refreshCalendarData}
      />
    </AppLayout>
  );
};

export default CalendarAccommodation;
