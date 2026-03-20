import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { Calendar, Users, Home, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FormattedPrice } from "@/components/FormattedPrice";
import { GuestCountStepper } from "./GuestCountStepper";
import { BottomSheetDatePicker } from "./BottomSheetDatePicker";
import { supabase } from "@/integrations/supabase/client";
import { useItinerary } from "@/contexts/ItineraryContext";
import { useMobileBooking } from "@/contexts/MobileBookingContext";

interface RoomType {
  id: string;
  name: string;
  maxPeople?: number;
  maxAdults?: number;
  pmsRoomId?: string;
  images?: string[];
  description?: string;
}

interface QuickBookDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertySlug: string;
  propertyName: string;
  propertyImage?: string;
  externalSystem?: string;
  roomTypes: RoomType[];
  defaultRoomId?: string;
}

interface GuestCounts {
  adults: number;
  children: number;
  infants: number;
}

interface AvailabilityData {
  date: string;
  available_units: number;
  rates?: any[];
}

export function QuickBookDrawer({
  open,
  onOpenChange,
  propertyId,
  propertySlug,
  propertyName,
  propertyImage,
  externalSystem,
  roomTypes,
  defaultRoomId,
}: QuickBookDrawerProps) {
  const navigate = useNavigate();
  const { addStay } = useItinerary();
  
  // Import MobileBookingContext to read dates selected on PropertyShowcase
  const { state: mobileBookingState, setDates: setMobileBookingDates } = useMobileBooking();
  
  // State
  const [selectedRoomId, setSelectedRoomId] = useState<string>(defaultRoomId || "");
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [guests, setGuests] = useState<GuestCounts>({ adults: 2, children: 0, infants: 0 });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [guestPickerExpanded, setGuestPickerExpanded] = useState(false);
  
  // Availability & pricing
  const [availability, setAvailability] = useState<Map<string, AvailabilityData>>(new Map());
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [propertyAmenities, setPropertyAmenities] = useState<any>(null);

  // Sync dates from MobileBookingContext whenever drawer opens
  // This ensures dates selected in FloatingDateGuestPicker carry through
  useEffect(() => {
    if (open) {
      if (mobileBookingState.checkIn) {
        setCheckIn(new Date(mobileBookingState.checkIn));
      }
      if (mobileBookingState.checkOut) {
        setCheckOut(new Date(mobileBookingState.checkOut));
      }
    }
  }, [open, mobileBookingState.checkIn, mobileBookingState.checkOut]);

  // Auto-select room if only one
  useEffect(() => {
    if (roomTypes.length === 1 && !selectedRoomId) {
      setSelectedRoomId(roomTypes[0].id);
    }
  }, [roomTypes, selectedRoomId]);

  // Fetch availability when room or dates change
  useEffect(() => {
    if (selectedRoomId && open) {
      fetchAvailability();
    }
  }, [selectedRoomId, open]);

  // Calculate estimated price when dates change
  useEffect(() => {
    if (checkIn && checkOut && (availability.size > 0 || propertyAmenities)) {
      calculateEstimatedPrice();
    } else {
      setEstimatedPrice(null);
    }
  }, [checkIn, checkOut, availability, selectedRoomId, propertyAmenities]);

  // Fetch property amenities for rate calculation
  useEffect(() => {
    if (open && (!externalSystem || externalSystem === 'none')) {
      fetchPropertyAmenities();
    }
  }, [open, propertyId, externalSystem]);

  const fetchPropertyAmenities = async () => {
    const { data } = await supabase
      .from("properties")
      .select("amenities")
      .eq("id", propertyId)
      .maybeSingle();
    
    if (data?.amenities) {
      setPropertyAmenities(data.amenities);
    }
  };

  const fetchAvailability = async () => {
    if (!selectedRoomId) return;
    setLoadingAvailability(true);
    
    try {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 395); // 13 months

      const selectedRoom = roomTypes.find(r => r.id === selectedRoomId);
      const roomPmsId = selectedRoom?.pmsRoomId || selectedRoomId;
      
      // Helper to slugify room name for fallback matching
      const slugifyRoomName = (name: string) => 
        name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const slugifiedName = selectedRoom?.name ? slugifyRoomName(selectedRoom.name) : null;

      // For manual properties (no PMS), fetch from property_availability
      if (!externalSystem || externalSystem === 'none') {
        const { data } = await supabase
          .from("property_availability")
          .select("date, available_units, is_stop_sell, room_type")
          .eq("property_id", propertyId)
          .gte("date", format(today, "yyyy-MM-dd"))
          .lte("date", format(endDate, "yyyy-MM-dd"));
        
        if (data) {
          const availMap = new Map<string, AvailabilityData>();
          const roomName = selectedRoom?.name || "";
          
          data.forEach((item) => {
            // Match by room name
            if (!item.room_type || item.room_type === roomName) {
              // If stop sell or no units, mark as unavailable
              const isAvailable = !item.is_stop_sell && item.available_units > 0;
              availMap.set(item.date, {
                date: item.date,
                available_units: isAvailable ? item.available_units : 0,
                rates: undefined, // Rates come from property amenities
              });
            }
          });
          setAvailability(availMap);
        }
        return;
      }

      // Fetch from appropriate source based on PMS
      if (externalSystem === 'hostfully') {
        const { data } = await supabase.functions.invoke("hostfully-api", {
          body: {
            action: 'fetch_availability',
            property_id: propertyId,
            start_date: format(today, "yyyy-MM-dd"),
            end_date: format(endDate, "yyyy-MM-dd"),
          }
        });
        
        if (data?.success && data?.data?.room_types) {
          const matchedRoom = data.data.room_types.find((rt: any) => 
            rt.room_type_id === roomPmsId || rt.id === selectedRoomId
          );
          
          if (matchedRoom) {
            const availMap = new Map<string, AvailabilityData>();
            const availArray = matchedRoom.availability_per_night || [];
            const rateTypes = matchedRoom.rate_types || [];
            
            availArray.forEach((item: any) => {
              const ratesForDate = rateTypes.flatMap((rt: any) => 
                (rt.rates || []).filter((r: any) => r.date === item.date)
              );
              
              availMap.set(item.date, {
                date: item.date,
                available_units: item.available_units,
                rates: ratesForDate.length > 0 ? ratesForDate : undefined,
              });
            });
            
            setAvailability(availMap);
          }
        }
      } else {
        // Default: fetch from cache - try primary ID first
        let { data } = await supabase
          .from("pms_availability_cache")
          .select("date, available_units, rates")
          .eq("property_id", propertyId)
          .eq("external_room_type_id", roomPmsId)
          .gte("date", format(today, "yyyy-MM-dd"))
          .lte("date", format(endDate, "yyyy-MM-dd"));

        // If no data and we have a slugified name to try
        if ((!data || data.length === 0) && slugifiedName && slugifiedName !== roomPmsId) {
          const { data: slugData } = await supabase
            .from("pms_availability_cache")
            .select("date, available_units, rates")
            .eq("property_id", propertyId)
            .eq("external_room_type_id", slugifiedName)
            .gte("date", format(today, "yyyy-MM-dd"))
            .lte("date", format(endDate, "yyyy-MM-dd"));
          
          data = slugData;
        }

        if (data) {
          const availMap = new Map<string, AvailabilityData>();
          data.forEach((item) => {
            availMap.set(item.date, item as AvailabilityData);
          });
          setAvailability(availMap);
        }
      }
    } catch (error) {
      console.error("Error fetching availability:", error);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const calculateEstimatedPrice = () => {
    if (!checkIn || !checkOut) return;
    
    let total = 0;
    let currentDate = new Date(checkIn);
    const selectedRoom = roomTypes.find(r => r.id === selectedRoomId);
    
    // For manual properties, use rates from property amenities
    if ((!externalSystem || externalSystem === 'none') && propertyAmenities) {
      const roomData = propertyAmenities.room_types?.find((rt: any) => 
        String(rt.id) === String(selectedRoomId) || rt.name === selectedRoom?.name
      );
      const linkedRateTypeId = roomData?.linkedRateTypes?.[0];
      const rateType = propertyAmenities.pms_rate_types?.find((rt: any) => rt.id === linkedRateTypeId);
      const baseRate = rateType?.baseRate || roomData?.baseRate || 0;
      
      // Check season rates
      const seasonRates = propertyAmenities.season_rates || {};
      
      while (currentDate < checkOut) {
        const dateStr = format(currentDate, "yyyy-MM-dd");
        const availData = availability.get(dateStr);
        
        // For manual properties: no record means available (only blocked dates are stored)
        // Check if date is explicitly blocked
        if (availData && availData.available_units === 0) {
          setEstimatedPrice(null);
          return; // Date is blocked
        }
        
        // Try to find season rate for this date
        let nightRate = baseRate;
        const seasons = propertyAmenities.seasons || [];
        for (const season of seasons) {
          if (dateStr >= season.from && dateStr <= season.to) {
            const seasonRateKey = `${roomData?.id || selectedRoomId}-${linkedRateTypeId}`;
            const seasonRateData = seasonRates[season.id]?.[seasonRateKey];
            if (seasonRateData?.roomAmount) {
              nightRate = seasonRateData.roomAmount;
            }
            break;
          }
        }
        
        total += nightRate;
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      setEstimatedPrice(total > 0 ? total : null);
      return;
    }
    
    // For PMS properties, use rates from availability data
    while (currentDate < checkOut) {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      const availData = availability.get(dateStr);
      
      if (availData?.rates) {
        const ratesArray = Array.isArray(availData.rates) ? availData.rates : [availData.rates];
        for (const rate of ratesArray) {
          if (rate.room_amount) {
            total += rate.room_amount;
            break;
          }
          if (rate.adult_amounts?.adultAmount1) {
            total += rate.adult_amounts.adultAmount1 * guests.adults;
            break;
          }
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    setEstimatedPrice(total > 0 ? total : null);
  };

  const handleDatesChange = (newCheckIn: Date, newCheckOut: Date) => {
    setCheckIn(newCheckIn);
    setCheckOut(newCheckOut);
    // Sync back to MobileBookingContext for consistency across components
    setMobileBookingDates(format(newCheckIn, "yyyy-MM-dd"), format(newCheckOut, "yyyy-MM-dd"));
  };

  const handleGuestChange = (field: keyof GuestCounts, value: number) => {
    setGuests(prev => ({ ...prev, [field]: value }));
  };

  const handleContinueToCheckout = () => {
    if (!checkIn || !checkOut || !selectedRoomId) return;
    
    const selectedRoom = roomTypes.find(r => r.id === selectedRoomId);
    const nights = differenceInDays(checkOut, checkIn);
    
    // Add to itinerary context
    addStay({
      property_id: propertyId,
      property_name: propertyName,
      property_slug: propertySlug,
      property_image: propertyImage || "",
      external_system: externalSystem || "",
      dates: {
        check_in: format(checkIn, "yyyy-MM-dd"),
        check_out: format(checkOut, "yyyy-MM-dd"),
      },
      rooms: [{
        room_type_id: selectedRoomId,
        room_type_name: selectedRoom?.name || "",
        quantity: 1,
        rate_per_night: estimatedPrice ? estimatedPrice / nights : 0,
        total_price: estimatedPrice || 0,
      }],
      guests,
      price_breakdown: {
        subtotal: estimatedPrice || 0,
        fees: [],
        taxes: [],
        total: estimatedPrice || 0,
      },
      availability_status: 'available',
      nights,
    });
    
    onOpenChange(false);
    // Route directly to journey checkout (unified flow, skip legacy /booking route)
    navigate('/journey/checkout');
  };

  const nights = checkIn && checkOut ? differenceInDays(checkOut, checkIn) : 0;
  const selectedRoom = roomTypes.find(r => r.id === selectedRoomId);
  const maxGuests = selectedRoom?.maxPeople || selectedRoom?.maxAdults || 10;
  const totalGuests = guests.adults + guests.children + guests.infants;
  const isValid = checkIn && checkOut && selectedRoomId && nights > 0;

  // Build availability map for date picker
  // For manual properties, synthesize availability for all 90 days (blocked dates are sparse)
  const datePickerAvailability = useMemo(() => {
    const map = new Map<string, { available: boolean; rate?: number }>();
    
    // For manual properties, get base rate from amenities
    let baseRate: number | undefined;
    let roomData: any = null;
    let linkedRateTypeId: string | undefined;
    
    if ((!externalSystem || externalSystem === 'none') && propertyAmenities) {
      roomData = propertyAmenities.room_types?.find((rt: any) => 
        String(rt.id) === String(selectedRoomId) || rt.name === selectedRoom?.name
      );
      linkedRateTypeId = roomData?.linkedRateTypes?.[0];
      const rateType = propertyAmenities.pms_rate_types?.find((rt: any) => rt.id === linkedRateTypeId);
      baseRate = rateType?.baseRate || roomData?.baseRate;
    }
    
    // For manual properties, synthesize availability for all dates in the next 13 months
    // Dates without explicit records are assumed available (only blocked dates are stored)
    if ((!externalSystem || externalSystem === 'none') && baseRate) {
      const today = new Date();
      const seasons = propertyAmenities?.seasons || [];
      const seasonRates = propertyAmenities?.season_rates || {};
      
      for (let i = 0; i < 395; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = format(date, "yyyy-MM-dd");
        
        // Check if we have explicit availability data for this date (blocked dates)
        const explicitData = availability.get(dateStr);
        const isBlocked = explicitData && explicitData.available_units === 0;
        
        // Calculate rate for this date (check for season rates)
        let dayRate = baseRate;
        for (const season of seasons) {
          if (dateStr >= season.from && dateStr <= season.to) {
            const seasonRateKey = `${roomData?.id || selectedRoomId}-${linkedRateTypeId}`;
            const seasonRateData = seasonRates[season.id]?.[seasonRateKey];
            if (seasonRateData?.roomAmount) {
              dayRate = seasonRateData.roomAmount;
            }
            break;
          }
        }
        
        map.set(dateStr, {
          available: !isBlocked,
          rate: dayRate,
        });
      }
      return map;
    }
    
    // For PMS properties, use the fetched data as-is
    availability.forEach((data, date) => {
      const ratesArray = Array.isArray(data.rates) ? data.rates : data.rates ? [data.rates] : [];
      const pmsRate = ratesArray[0]?.room_amount || ratesArray[0]?.adult_amounts?.adultAmount1;
      
      map.set(date, {
        available: data.available_units > 0,
        rate: pmsRate || baseRate,
      });
    });
    
    return map;
  }, [availability, propertyAmenities, externalSystem, selectedRoomId, selectedRoom]);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="font-serif text-xl tracking-tight">
              Book Your Stay
            </DrawerTitle>
            <p className="text-sm text-muted-foreground">
              {propertyName}
            </p>
          </DrawerHeader>

          <div className="px-4 py-3 space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Room Selection (if multiple rooms) */}
            {roomTypes.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  Select Room
                </Label>
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger className="w-full h-12">
                    <SelectValue placeholder="Choose a room type" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{room.name}</span>
                          {room.maxPeople && (
                            <span className="text-xs text-muted-foreground">
                              Max {room.maxPeople} guests
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Single room display */}
            {roomTypes.length === 1 && selectedRoom && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Home className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">{selectedRoom.name}</p>
                  {selectedRoom.maxPeople && (
                    <p className="text-xs text-muted-foreground">
                      Up to {selectedRoom.maxPeople} guests
                    </p>
                  )}
                </div>
                <Check className="h-4 w-4 text-primary ml-auto" />
              </div>
            )}

            {/* Dates Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Dates
              </Label>
              <button
                onClick={() => setDatePickerOpen(true)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl",
                  "border border-border/60 transition-all duration-200",
                  "hover:border-primary/50 hover:bg-primary/5",
                  checkIn && checkOut && "bg-primary/5 border-primary/30"
                )}
              >
                <span className={cn(
                  "text-sm",
                  !checkIn && "text-muted-foreground"
                )}>
                  {checkIn && checkOut
                    ? `${format(checkIn, "MMM d")} – ${format(checkOut, "MMM d, yyyy")}`
                    : "Select check-in & check-out"
                  }
                </span>
                {nights > 0 && (
                  <span className="text-sm font-medium text-primary">
                    {nights} night{nights !== 1 ? "s" : ""}
                  </span>
                )}
              </button>
            </div>

            {/* Guests Selection */}
            <div className="space-y-2">
              <button
                onClick={() => setGuestPickerExpanded(!guestPickerExpanded)}
                className="w-full flex items-center justify-between"
              >
                <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                  <Users className="h-4 w-4 text-primary" />
                  Guests
                </Label>
                <span className="text-sm text-muted-foreground">
                  {guests.adults} adult{guests.adults !== 1 ? "s" : ""}
                  {guests.children > 0 && `, ${guests.children} child${guests.children !== 1 ? "ren" : ""}`}
                  {guests.infants > 0 && `, ${guests.infants} infant${guests.infants !== 1 ? "s" : ""}`}
                </span>
              </button>
              
              {guestPickerExpanded && (
                <div className="pt-2 space-y-1 animate-in slide-in-from-top-2 duration-200">
                  <GuestCountStepper
                    label="Adults"
                    sublabel="Ages 13+"
                    value={guests.adults}
                    min={1}
                    max={Math.min(maxGuests, 10)}
                    onChange={(v) => handleGuestChange("adults", v)}
                  />
                  <GuestCountStepper
                    label="Children"
                    sublabel="Ages 2-12"
                    value={guests.children}
                    min={0}
                    max={Math.min(maxGuests - guests.adults, 6)}
                    onChange={(v) => handleGuestChange("children", v)}
                  />
                  <GuestCountStepper
                    label="Infants"
                    sublabel="Under 2"
                    value={guests.infants}
                    min={0}
                    max={4}
                    onChange={(v) => handleGuestChange("infants", v)}
                  />
                  {totalGuests >= maxGuests && (
                    <p className="text-xs text-amber-600 pt-2">
                      Maximum {maxGuests} guests for this room
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Price Estimate */}
            {isValid && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Estimated total</span>
                  {loadingAvailability ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : estimatedPrice ? (
                    <span className="text-lg font-semibold">
                      <FormattedPrice amount={estimatedPrice} />
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Price on request</span>
                  )}
                </div>
                {nights > 0 && estimatedPrice && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <FormattedPrice amount={estimatedPrice / nights} /> avg/night × {nights} nights
                  </p>
                )}
              </div>
            )}
          </div>

          <DrawerFooter className="pt-2">
            <Button
              onClick={handleContinueToCheckout}
              disabled={!isValid}
              className="w-full h-12 text-base font-medium gap-2"
            >
              Continue to Checkout
              <ArrowRight className="h-4 w-4" />
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Date Picker Sheet */}
      <BottomSheetDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        checkIn={checkIn}
        checkOut={checkOut}
        onDatesChange={handleDatesChange}
        availabilityMap={datePickerAvailability}
      />
    </>
  );
}
