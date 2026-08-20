import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ArrowLeft, Users, Calendar, Minus, Plus, BedDouble, Utensils, Baby, PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  addMonths, 
  isBefore, 
  startOfDay,
  isAfter,
  isSameDay,
  differenceInDays,
  parseISO
} from "date-fns";
import { DayPicker, DateRange, DayContentProps } from "react-day-picker";

interface AvailabilityData {
  date: string;
  available_units: number;
  rates?: any;
  restrictions?: any;
}

interface RateDetails {
  room_amount?: number;
  adult_amounts?: {
    adultAmount1?: number;
    adultAmount2?: number;
    adultAmount3?: number;
    adultAmount4?: number;
  };
  rate_type_name?: string;
  price_type?: string;
}

interface RoomTypeData {
  allow_children: boolean;
  child_min_age?: number;
  child_max_age?: number;
  allow_teens?: boolean;
  teen_min_age?: number;
  teen_max_age?: number;
  allow_infants?: boolean;
  infant_min_age?: number;
  infant_max_age?: number;
  max_guests?: number;
}

interface RoomAvailabilityCalendarProps {
  propertyId: string;
  propertySlug: string;
  propertyName: string;
  roomName: string;
  roomId: string;
  externalSystem?: string;
}

export default function RoomAvailabilityCalendar({
  propertyId,
  propertySlug,
  propertyName,
  roomName,
  roomId,
  externalSystem,
}: RoomAvailabilityCalendarProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  
  // Initialize dates from URL params if available
  const initialCheckIn = searchParams.get('checkIn');
  const initialCheckOut = searchParams.get('checkOut');
  const initialGuests = parseInt(searchParams.get('guests') || '2', 10);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (initialCheckIn && initialCheckOut) {
      return {
        from: parseISO(initialCheckIn),
        to: parseISO(initialCheckOut)
      };
    }
    return undefined;
  });
  
  const [guests, setGuests] = useState({ adults: initialGuests, children: 0, teens: 0, infants: 0, pets: 0 });
  const isBensonProperty = externalSystem?.toLowerCase() === 'benson';
  const [hoverDate, setHoverDate] = useState<Date | undefined>();
  const [displayedMonth, setDisplayedMonth] = useState<Date>(() => {
    if (initialCheckIn) {
      return startOfMonth(parseISO(initialCheckIn));
    }
    return new Date();
  });
  
  const [availability, setAvailability] = useState<Map<string, AvailabilityData>>(new Map());
  const [roomTypeData, setRoomTypeData] = useState<RoomTypeData | null>(null);
  const [propertyAmenities, setPropertyAmenities] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const autoNavTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to find seasonal rate for a given date
  const findSeasonRate = (dateStr: string, seasons: any[], seasonRates: any[]) => {
    if (!seasons?.length || !seasonRates?.length) return null;
    
    const date = new Date(dateStr);
    for (const season of seasons) {
      const start = new Date(season.startDate || season.start_date);
      const end = new Date(season.endDate || season.end_date);
      if (date >= start && date <= end) {
        // Find rate for this season
        const rate = seasonRates?.find((sr: any) => 
          sr.seasonId === season.id || sr.season_id === season.id
        );
        if (rate?.roomAmount || rate?.room_amount) {
          return { roomAmount: rate.roomAmount || rate.room_amount };
        }
      }
    }
    return null;
  };
  
  // Calculate total guests and check if at max capacity
  const totalGuests = guests.adults + guests.teens + guests.children + guests.infants;
  const maxGuests = roomTypeData?.max_guests || 10;
  const isAtMaxCapacity = totalGuests >= maxGuests;

  useEffect(() => {
    fetchRoomTypeData();
  }, [propertyId, roomId]);

  useEffect(() => {
    fetchAvailability();
  }, [displayedMonth, propertyId, roomId, propertyAmenities, externalSystem]);

  const fetchRoomTypeData = async () => {
    try {
      // First try pms_room_types_cache
      const { data: cacheData } = await supabase
        .from("pms_room_types_cache")
        .select("allow_children, child_min_age, child_max_age, allow_teens, teen_min_age, teen_max_age, allow_infants, infant_min_age, infant_max_age, max_guests")
        .eq("property_id", propertyId)
        .eq("external_room_type_id", roomId)
        .maybeSingle();

      if (cacheData) {
        setRoomTypeData(cacheData);
        return;
      }

      // Fallback: get room data from property amenities
      const { data: propertyData } = await supabase
        .from("public_properties")
        .select("amenities")
        .eq("id", propertyId)
        .single();

      if (propertyData?.amenities) {
        const amenities = propertyData.amenities as any;
        // Store amenities for synthetic availability generation
        setPropertyAmenities(amenities);
        
        const roomTypes = amenities?.room_types || [];
        const room = roomTypes.find((r: any) => 
          String(r.pmsRoomId) === String(roomId) || String(r.id) === String(roomId) || r.name === roomName
        );
        
        if (room) {
          setRoomTypeData({
            allow_children: room.allowChildren ?? room.allow_children ?? true,
            allow_teens: room.allowTeens ?? room.allow_teens ?? true,
            allow_infants: room.allowInfants ?? room.allow_infants ?? true,
            child_min_age: room.childMinAge ?? room.child_min_age,
            child_max_age: room.childMaxAge ?? room.child_max_age,
            teen_min_age: room.teenMinAge ?? room.teen_min_age,
            teen_max_age: room.teenMaxAge ?? room.teen_max_age,
            infant_min_age: room.infantMinAge ?? room.infant_min_age,
            infant_max_age: room.infantMaxAge ?? room.infant_max_age,
            max_guests: room.maxPeople || room.maxGuests || room.max_guests || 10
          });
          return;
        }
      }

      // Final fallback
      setRoomTypeData({ 
        allow_children: true, 
        allow_teens: true, 
        allow_infants: true, 
        max_guests: 10 
      });
    } catch (error) {
      console.error("Error fetching room type data:", error);
      setRoomTypeData({ 
        allow_children: true, 
        allow_teens: true, 
        allow_infants: true, 
        max_guests: 10 
      });
    }
  };

  const fetchAvailability = async () => {
    setLoading(true);
    try {
      // Fetch 3 months of data for smooth navigation
      const monthStart = format(startOfMonth(displayedMonth), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(addMonths(displayedMonth, 2)), "yyyy-MM-dd");

      // For properties without external system (RoomsOnline PMS), generate synthetic availability from wizard data
      // Then merge with manual overrides from property_availability table
      if (!externalSystem || externalSystem === 'none') {
        const wizardRooms = propertyAmenities?.room_types || [];
        const matchedRoom = wizardRooms.find((r: any) => 
          String(r.id) === String(roomId) || 
          String(r.pmsRoomId) === String(roomId) ||
          r.name === roomName
        );
        
        // Resolve base rate: direct on room, or via linkedRateTypes → pms_rate_types
        let baseRate = matchedRoom?.base_rate || matchedRoom?.baseRate || matchedRoom?.daily_rate || matchedRoom?.dailyRate;
        let rateUnit = matchedRoom?.rate_unit || matchedRoom?.rateUnit || 'per_night';
        
        if (!baseRate && matchedRoom?.linkedRateTypes?.length) {
          const pmsRateTypes = propertyAmenities?.pms_rate_types || [];
          for (const linkedId of matchedRoom.linkedRateTypes) {
            const linkedRate = pmsRateTypes.find((rt: any) => rt.id === linkedId);
            if (linkedRate?.baseRate) {
              baseRate = linkedRate.baseRate;
              if (linkedRate.pricingModel === 'per_person') rateUnit = 'per_person';
              break;
            }
          }
          // If linked rate type not found, try any available rate type as fallback
          if (!baseRate && pmsRateTypes.length > 0) {
            const fallbackRate = pmsRateTypes.find((rt: any) => rt.baseRate);
            if (fallbackRate?.baseRate) {
              baseRate = fallbackRate.baseRate;
              if (fallbackRate.pricingModel === 'per_person') rateUnit = 'per_person';
            }
          }
        }
        
        const seasons = propertyAmenities?.seasons || [];
        const seasonRates = propertyAmenities?.season_rates || [];
        
        const availMap = new Map<string, AvailabilityData>();
        const startDate = new Date(monthStart);
        const endDate = new Date(monthEnd);
        
        // Generate base availability for each day in range (all dates available by default)
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateStr = format(d, "yyyy-MM-dd");
          const seasonRate = findSeasonRate(dateStr, seasons, seasonRates);
          const rateForDay = seasonRate?.roomAmount || baseRate;
          
          availMap.set(dateStr, {
            date: dateStr,
            available_units: 99, // Unlimited availability for manual properties
            rates: rateForDay ? [{
              rate_type_id: 'wizard-rate',
              rate_type_name: 'Standard Rate',
              room_amount: rateForDay,
              price_type: rateUnit === 'per_stay' ? 'PerStay' : 'UnitRate',
            }] : undefined,
          });
        }
        
        // Fetch manual availability overrides from property_availability table
        // These are owner-defined blocks and restrictions
        const { data: manualOverrides, error: overridesError } = await supabase
          .from("property_availability")
          .select("*")
          .eq("property_id", propertyId)
          .eq("room_type", roomName)
          .gte("date", monthStart)
          .lte("date", monthEnd);
        
        if (!overridesError && manualOverrides && manualOverrides.length > 0) {
          // Merge manual overrides into the synthetic availability
          for (const override of manualOverrides) {
            const existing = availMap.get(override.date);
            if (existing) {
              availMap.set(override.date, {
                ...existing,
                // If stop_sell or available_units = 0, mark as unavailable
                available_units: override.is_stop_sell ? 0 : (override.available_units ?? existing.available_units),
                restrictions: {
                  minimum_stay: override.minimum_stay,
                  maximum_stay: override.maximum_stay,
                  lead_days_advance: override.lead_days_advance,
                  lead_days_post: override.lead_days_post,
                  stop_sell: override.is_stop_sell,
                },
              });
            }
          }
        }
        
        setAvailability(availMap);
        setLoading(false);
        return;
      }

      // PMS-backed properties: load cache first, then refresh via unified orchestrator
      const livePmsSystems = ['hostfully', 'benson', 'hotelbeds', 'hyperguest'];
      const isLivePms = livePmsSystems.includes(externalSystem?.toLowerCase() || '');

      // 1. Instant: load from pms_availability_cache (try both roomId and roomName)
      let cacheQuery = supabase
        .from("pms_availability_cache")
        .select("date, available_units, rates, restrictions")
        .eq("property_id", propertyId)
        .gte("date", monthStart)
        .lte("date", monthEnd);

      const { data: cacheData } = await cacheQuery;

      // Match cache rows to this room using ID or normalized name
      const normalizedRoomName = roomName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const matchedCache = (cacheData || []).filter((row: any) => {
        const eid = row.external_room_type_id;
        return eid === roomId || eid === normalizedRoomName;
      });

      if (matchedCache.length > 0) {
        const cachedMap = new Map<string, AvailabilityData>();
        matchedCache.forEach((item: any) => cachedMap.set(item.date, item));
        setAvailability(cachedMap);
        setLoading(false);
      }

      // 2. Background: fetch live from unified orchestrator and merge
      if (isLivePms) {
        supabase.functions.invoke("booking-orchestrator-api", {
          body: {
            action: 'fetch_availability',
            property_id: propertyId,
            start_date: monthStart,
            end_date: monthEnd,
          }
        }).then(({ data, error }) => {
          if (error) { console.warn('[RoomCal] Orchestrator error:', error); setLoading(false); return; }
          const responseData = data?.data || data;
          const roomTypes = responseData?.room_types || responseData?.roomTypes || [];
          
          // Find matching room using multiple strategies
          const matchedRoom = roomTypes.find((rt: any) => {
            const rtId = String(rt.room_type_id || rt.roomTypeId || '');
            const rtName = String(rt.room_type_name || rt.roomTypeName || rt.name || '');
            const rtNorm = rtName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            return rtId === roomId || rtNorm === normalizedRoomName || rtName === roomName;
          });
          
          if (matchedRoom) {
            console.log('[RoomCal] Live room matched:', matchedRoom.room_type_name || matchedRoom.roomTypeName);
            const availMap = new Map<string, AvailabilityData>();
            const availArray = matchedRoom.rooms_available_per_night || matchedRoom.availability_per_night || matchedRoom.roomsAvailablePerNight || [];
            const rateTypes = matchedRoom.rate_types || matchedRoom.rateTypes || [];
            
            availArray.forEach((item: any) => {
              const dateStr = item.date;
              const ratesForDate = rateTypes.flatMap((rt: any) => 
                (rt.rates || []).filter((r: any) => r.date === dateStr)
              );
              
              availMap.set(dateStr, {
                date: dateStr,
                available_units: item.available_units ?? item.numberOfRoomsAvailable ?? 0,
                rates: ratesForDate.length > 0 ? ratesForDate : undefined,
                restrictions: item.restrictions,
              });
            });
            
            setAvailability(availMap);
          } else {
            console.warn('[RoomCal] No matching room in orchestrator response for:', roomId, roomName);
          }
          setLoading(false);
        }).catch(() => setLoading(false));
        
        return;
      }

      // Non-live PMS: just use cache (already loaded above)
      if (matchedCache.length === 0) {
        // Fallback: try without room filter
        const { data: allCache } = await supabase
          .from("pms_availability_cache")
          .select("date, available_units, rates, restrictions")
          .eq("property_id", propertyId)
          .eq("external_room_type_id", roomId)
          .gte("date", monthStart)
          .lte("date", monthEnd);

        const availMap = new Map<string, AvailabilityData>();
        allCache?.forEach((item: any) => availMap.set(item.date, item));
        setAvailability(availMap);
      }
    } catch (error) {
      console.error("Error fetching availability:", error);
    } finally {
      setLoading(false);
    }
  };

  const slugifyRoomName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  const handleBackToRoom = () => {
    navigate(`/property/${propertySlug}/room/${slugifyRoomName(roomName)}`);
  };

  // Check if all dates in a range are available
  const isRangeAvailable = (start: Date, end: Date): boolean => {
    const days = eachDayOfInterval({ start, end });
    return days.every(day => isDateAvailable(day));
  };

  // Handle date range selection
  const handleDayClick = (day: Date) => {
    if (isBefore(day, startOfDay(new Date()))) return; // Can't select past dates
    
    // If both dates already selected, reset and start fresh
    if (dateRange?.from && dateRange?.to) {
      // Only allow starting on available dates
      if (!isDateAvailable(day)) {
        setHoverDate(undefined);
        setDateRange(undefined);
        return;
      }
      setHoverDate(undefined);
      setDateRange({ from: day, to: undefined });
      return;
    }
    
    // If no start date, set it (must be available)
    if (!dateRange?.from) {
      if (!isDateAvailable(day)) return;
      setDateRange({ from: day, to: undefined });
      return;
    }
    
    // Second click - lock the range
    const rangeStart = isBefore(day, dateRange.from) ? day : dateRange.from;
    const rangeEnd = isBefore(day, dateRange.from) ? dateRange.from : day;
    
    setDateRange({ from: rangeStart, to: rangeEnd });
    setHoverDate(undefined);
  };

  const handleDayMouseEnter = (day: Date) => {
    if (dateRange?.from && !dateRange?.to) {
      // Allow worm to extend for preview - availability check happens on click
      setHoverDate(day);
    }
  };

  const getDisplayRange = (): DateRange | undefined => {
    if (dateRange?.from && dateRange?.to) {
      return dateRange;
    }
    if (dateRange?.from && hoverDate) {
      if (isAfter(hoverDate, dateRange.from) || isSameDay(hoverDate, dateRange.from)) {
        return { from: dateRange.from, to: hoverDate };
      }
      return { from: hoverDate, to: dateRange.from };
    }
    if (dateRange?.from) {
      return { from: dateRange.from, to: dateRange.from };
    }
    return undefined;
  };

  const displayRange = getDisplayRange();
  const nights = dateRange?.from && dateRange?.to 
    ? differenceInDays(dateRange.to, dateRange.from) 
    : 0;

  // Check if a date is available
  const isDateAvailable = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const availData = availability.get(dateStr);
    return availData && availData.available_units > 0;
  };

  // Get rate for a date (returns lowest rate)
  const getRateForDate = (date: Date): number | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    const availData = availability.get(dateStr);
    if (!availData?.rates) return null;
    
    // rates can be an array or object - handle both
    const ratesArray = Array.isArray(availData.rates) ? availData.rates : [availData.rates];
    
    for (const rate of ratesArray) {
      if (rate.room_amount) return rate.room_amount;
      if (rate.adult_amounts?.adultAmount1) return rate.adult_amounts.adultAmount1;
      if (rate.adult_amounts?.adultAmount2) return rate.adult_amounts.adultAmount2;
    }
    return null;
  };

  // Get full rate details for a date (for tooltip)
  const getRateDetailsForDate = (date: Date): RateDetails | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    const availData = availability.get(dateStr);
    if (!availData?.rates) return null;
    
    const ratesArray = Array.isArray(availData.rates) ? availData.rates : [availData.rates];
    return ratesArray[0] || null;
  };

  // Format rate compactly for display in cell
  const formatCompactRate = (rate: number): string => {
    const rounded = Math.round(rate * 100) / 100;
    if (rounded >= 10000) {
      return `${(rounded / 1000).toFixed(0)}k`;
    }
    if (rounded >= 1000) {
      return `${(rounded / 1000).toFixed(1)}k`.replace('.0k', 'k');
    }
    return rounded.toFixed(2);
  };

  // Custom day content component
  const CustomDayContent = useMemo(() => {
    return function DayContent({ date, displayMonth }: DayContentProps) {
      const dateStr = format(date, "yyyy-MM-dd");
      const availData = availability.get(dateStr);
      const rate = getRateForDate(date);
      const rateDetails = getRateDetailsForDate(date);
      const isAvailable = availData && availData.available_units > 0;
      const isSoldOut = availData && !isAvailable;
      const isPast = isBefore(date, startOfDay(new Date()));
      const hasData = availability.has(dateStr);
      
      // For desktop, show rate in cell with hover tooltip
      const dayContent = (
        <div className="flex flex-col items-center justify-center w-full h-full">
          <span className="text-sm">{date.getDate()}</span>
          {!isMobile && !isPast && hasData && (
            <span className={cn(
              "text-[9px] leading-none mt-0.5",
              isSoldOut ? "text-destructive font-medium" : "text-muted-foreground"
            )}>
              {isSoldOut ? "SOLD" : rate ? formatCompactRate(rate) : "—"}
            </span>
          )}
        </div>
      );

      // Build tooltip content
      const tooltipContent = (
        <div className="space-y-3 text-sm">
          <div className="font-medium border-b pb-2">
            {format(date, "EEE, d MMMM yyyy")}
          </div>
          
          {isPast ? (
            <p className="text-muted-foreground">Past date</p>
          ) : !hasData ? (
            <p className="text-muted-foreground">No availability data</p>
          ) : isSoldOut ? (
            <p className="text-destructive font-medium">Sold Out</p>
          ) : (
            <>
              {/* Occupancy */}
              <div className="flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-muted-foreground" />
                <span>Max {roomTypeData?.max_guests || 2} guests</span>
              </div>

              {/* Child Policy */}
              {roomTypeData && (
                <div className="flex items-start gap-2">
                  <Baby className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    {roomTypeData.allow_children ? (
                      <>Children allowed{roomTypeData.child_min_age != null && roomTypeData.child_max_age != null && ` (${roomTypeData.child_min_age}–${roomTypeData.child_max_age} yrs)`}</>
                    ) : (
                      "Adults only"
                    )}
                  </div>
                </div>
              )}

              {/* Meal Plan */}
              {rateDetails?.rate_type_name && (
                <div className="flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">{rateDetails.rate_type_name}</span>
                </div>
              )}

              {/* Pricing */}
              {rateDetails && (
                <div className="pt-2 border-t space-y-1">
                  <p className="text-xs text-muted-foreground mb-1">Rate per night:</p>
                  {rateDetails.room_amount ? (
                    <div className="flex justify-between">
                      <span>Room rate</span>
                      <span className="font-semibold">R {rateDetails.room_amount.toLocaleString()}</span>
                    </div>
                  ) : rateDetails.adult_amounts && (
                    <>
                      {rateDetails.adult_amounts.adultAmount1 && (
                        <div className="flex justify-between text-xs">
                          <span>1 Adult</span>
                          <span className="font-medium">R {rateDetails.adult_amounts.adultAmount1.toLocaleString()}</span>
                        </div>
                      )}
                      {rateDetails.adult_amounts.adultAmount2 && (
                        <div className="flex justify-between text-xs">
                          <span>2 Adults</span>
                          <span className="font-medium">R {rateDetails.adult_amounts.adultAmount2.toLocaleString()}</span>
                        </div>
                      )}
                      {rateDetails.adult_amounts.adultAmount3 && (
                        <div className="flex justify-between text-xs">
                          <span>3 Adults</span>
                          <span className="font-medium">R {rateDetails.adult_amounts.adultAmount3.toLocaleString()}</span>
                        </div>
                      )}
                      {rateDetails.adult_amounts.adultAmount4 && (
                        <div className="flex justify-between text-xs">
                          <span>4 Adults</span>
                          <span className="font-medium">R {rateDetails.adult_amounts.adultAmount4.toLocaleString()}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      );

      // Wrap in HoverCard for both mobile (tap) and desktop (hover)
      return (
        <HoverCard openDelay={100} closeDelay={50}>
          <HoverCardTrigger asChild>
            <div className="w-full h-full cursor-pointer">
              {dayContent}
            </div>
          </HoverCardTrigger>
          <HoverCardContent 
            side="top" 
            align="center" 
            className="w-56 p-3 z-50"
            sideOffset={5}
          >
            {tooltipContent}
          </HoverCardContent>
        </HoverCard>
      );
    };
  }, [availability, roomTypeData, isMobile]);

  // Check if pets are allowed for this property
  const petsAllowed = useMemo(() => {
    // Check amenities for pets_allowed flag
    return roomTypeData && 'pets_allowed' in roomTypeData ? (roomTypeData as any).pets_allowed : false;
  }, [roomTypeData]);

  const handleProceedToBooking = () => {
    if (dateRange?.from && dateRange?.to) {
      const params = new URLSearchParams({
        checkIn: format(dateRange.from, 'yyyy-MM-dd'),
        checkOut: format(dateRange.to, 'yyyy-MM-dd'),
        guests: String(totalGuests),
        roomTypeId: roomId,
        roomTypeName: roomName,
        adults: String(guests.adults),
        teens: String(guests.teens),
        children: String(guests.children),
        infants: String(guests.infants),
        pets: String(guests.pets),
      });
      navigate(`/booking/${propertySlug}?${params.toString()}`);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBackToRoom}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-sm text-muted-foreground">{propertyName}</p>
              <h1 className="font-display text-xl font-light">{roomName}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8 max-w-5xl mx-auto">
          {/* Calendar Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6">
        <h2 className="font-display text-lg font-light mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Select your dates
        </h2>
                
                {/* Date Display */}
                <div className="flex items-center gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
                  <div className="flex-1 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Check-in</p>
                    <p className="font-semibold">
                      {dateRange?.from ? format(dateRange.from, "EEE, d MMM") : "Select date"}
                    </p>
                  </div>
                  <div className="text-muted-foreground">→</div>
                  <div className="flex-1 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Check-out</p>
                    <p className="font-semibold">
                      {dateRange?.to ? format(dateRange.to, "EEE, d MMM") : "Select date"}
                    </p>
                  </div>
                  {nights > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {nights} night{nights > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                {loading ? (
                  <Skeleton className="h-[320px] w-full" />
                ) : (
                  <div className="overflow-x-auto min-w-0">
                  <DayPicker
                    mode="range"
                    selected={displayRange}
                    onDayClick={handleDayClick}
                    onDayMouseEnter={handleDayMouseEnter}
                    month={displayedMonth}
                    onMonthChange={setDisplayedMonth}
                    numberOfMonths={isMobile ? 1 : 2}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    modifiers={{
                      available: (date) => !isBefore(date, startOfDay(new Date())) && isDateAvailable(date),
                      unavailable: (date) => !isBefore(date, startOfDay(new Date())) && availability.has(format(date, "yyyy-MM-dd")) && !isDateAvailable(date),
                      nodata: (date) => !isBefore(date, startOfDay(new Date())) && !availability.has(format(date, "yyyy-MM-dd")),
                    }}
                    modifiersStyles={{
                      available: { backgroundColor: 'hsl(142 76% 36% / 0.15)' },
                      unavailable: { backgroundColor: 'hsl(0 84% 60% / 0.2)', color: 'hsl(var(--muted-foreground))' },
                      nodata: { backgroundColor: 'hsl(0 84% 60% / 0.2)', color: 'hsl(var(--muted-foreground))' },
                    }}
                    className="pointer-events-auto"
                    classNames={{
                      months: "flex flex-col sm:flex-row gap-4",
                      month: "flex flex-col gap-2",
                      caption: "flex justify-center pt-1 relative items-center",
                      caption_label: "text-sm font-medium",
                      nav: "flex items-center gap-1",
                      nav_button: cn(
                        "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-input hover:bg-accent"
                      ),
                      nav_button_previous: "absolute left-1",
                      nav_button_next: "absolute right-1",
                      table: "w-full border-collapse",
                      head_row: "flex",
                      head_cell: cn(
                        "text-muted-foreground rounded-md font-normal text-[0.8rem] flex-1 text-center",
                        "w-9 sm:w-12" // Wider on desktop for rate display
                      ),
                      row: "flex w-full mt-1",
                      cell: cn(
                        "flex-1 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                        "[&:has([aria-selected].day-range-end)]:rounded-r-md",
                        "[&:has([aria-selected])]:bg-transparent",
                        "first:[&:has([aria-selected])]:rounded-l-md",
                        "last:[&:has([aria-selected])]:rounded-r-md"
                      ),
                      day: cn(
                        "p-0 font-normal mx-auto rounded-md transition-colors",
                        "h-10 w-10 sm:h-12 sm:w-12", // Taller on desktop for rate display
                        "hover:bg-accent/60",
                        "aria-selected:opacity-100"
                      ),
                      day_range_start: "day-range-start rol-stay-start rounded-l-md rounded-r-none z-10",
                      day_range_end: "day-range-end rol-stay-end rounded-r-md rounded-l-none z-10",
                      day_selected: "rol-stay-selected z-10",
                      day_today: "ring-1 ring-inset ring-primary/50",
                      day_outside: "day-outside text-muted-foreground opacity-40",
                      day_disabled: "text-muted-foreground opacity-40 cursor-not-allowed",
                      day_range_middle: "day-range-middle rol-stay-middle rounded-none",
                      day_hidden: "invisible",
                    }}
                    components={{
                      DayContent: CustomDayContent,
                    }}
                  />
                  </div>
                )}

                {/* Legend */}
                <div className="flex gap-6 mt-6 justify-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-status-healthy/20 border border-status-healthy/30" />
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
                    <span>Unavailable / No Data</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Booking Summary */}
          <div>
            <Card className="sticky top-4">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Booking Summary</h3>
                
                {/* Guests */}
                <div className="mb-6 space-y-2">
                  <p className="text-sm text-muted-foreground mb-2">Guests</p>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Adults</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 sm:h-7 sm:w-7"
                        onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
                        disabled={guests.adults <= 1}
                      >
                        <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{guests.adults}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 sm:h-7 sm:w-7"
                        onClick={() => setGuests(g => ({ ...g, adults: g.adults + 1 }))}
                        disabled={isAtMaxCapacity}
                      >
                        <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* For Benson properties: show Teen/Child/Infant separately */}
                  {isBensonProperty ? (
                    <>
                      {/* Teens */}
                      {roomTypeData?.allow_teens && (
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium">Teens</span>
                              {roomTypeData.teen_min_age != null && roomTypeData.teen_max_age != null && (
                                <p className="text-xs text-muted-foreground">
                                  Ages {roomTypeData.teen_min_age}–{roomTypeData.teen_max_age}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, teens: Math.max(0, g.teens - 1) }))}
                              disabled={guests.teens <= 0}
                            >
                              <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{guests.teens}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, teens: g.teens + 1 }))}
                              disabled={isAtMaxCapacity}
                            >
                              <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Children */}
                      {roomTypeData?.allow_children && (
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium">Children</span>
                              {roomTypeData.child_min_age != null && roomTypeData.child_max_age != null && (
                                <p className="text-xs text-muted-foreground">
                                  Ages {roomTypeData.child_min_age}–{roomTypeData.child_max_age}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
                              disabled={guests.children <= 0}
                            >
                              <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{guests.children}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, children: g.children + 1 }))}
                              disabled={isAtMaxCapacity}
                            >
                              <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Infants */}
                      {roomTypeData?.allow_infants && (
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium">Infants</span>
                              {roomTypeData.infant_min_age != null && roomTypeData.infant_max_age != null && (
                                <p className="text-xs text-muted-foreground">
                                  Ages {roomTypeData.infant_min_age}–{roomTypeData.infant_max_age}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, infants: Math.max(0, g.infants - 1) }))}
                              disabled={guests.infants <= 0}
                            >
                              <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{guests.infants}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, infants: g.infants + 1 }))}
                              disabled={isAtMaxCapacity}
                            >
                              <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* For non-Benson properties: show Children, Infants, and Pets */
                    <>
                      {roomTypeData?.allow_children && (
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium">Children</span>
                              {roomTypeData.child_min_age != null && roomTypeData.child_max_age != null && (
                                <p className="text-xs text-muted-foreground">
                                  Ages {roomTypeData.child_min_age}–{roomTypeData.child_max_age}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
                              disabled={guests.children <= 0}
                            >
                              <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{guests.children}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, children: g.children + 1 }))}
                              disabled={isAtMaxCapacity}
                            >
                              <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Infants - for non-Benson properties that allow infants */}
                      {roomTypeData?.allow_infants && (
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Baby className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium">Infants</span>
                              <p className="text-xs text-muted-foreground">Under 2</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, infants: Math.max(0, g.infants - 1) }))}
                              disabled={guests.infants <= 0}
                            >
                              <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{guests.infants}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, infants: g.infants + 1 }))}
                              disabled={isAtMaxCapacity}
                            >
                              <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Pets - for properties that allow pets */}
                      {petsAllowed && (
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <PawPrint className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm font-medium">Pets</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, pets: Math.max(0, g.pets - 1) }))}
                              disabled={guests.pets <= 0}
                            >
                              <Minus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{guests.pets}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 sm:h-7 sm:w-7"
                              onClick={() => setGuests(g => ({ ...g, pets: g.pets + 1 }))}
                            >
                              <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Selected Dates Summary */}
                {dateRange?.from && dateRange?.to && (
                  <div className="mb-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Check-in</span>
                      <span className="font-medium">{format(dateRange.from, "d MMM yyyy")}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Check-out</span>
                      <span className="font-medium">{format(dateRange.to, "d MMM yyyy")}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-primary/20">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-semibold">{nights} night{nights > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                )}

                <Button 
                  className="w-full h-12 sm:h-10 text-base sm:text-sm" 
                  disabled={!dateRange?.from || !dateRange?.to}
                  onClick={handleProceedToBooking}
                >
                  {dateRange?.from && dateRange?.to ? 'Proceed to Booking' : 'Select Dates'}
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-3">
                  You won't be charged yet
                </p>
              </CardContent>
            </Card>

            {/* Back Button */}
            <Button variant="outline" className="w-full h-12 sm:h-10 mt-4" onClick={handleBackToRoom}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Room
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
